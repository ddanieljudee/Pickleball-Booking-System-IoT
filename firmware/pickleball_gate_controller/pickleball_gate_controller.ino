/**
 * ============================================================
 * PICKLEBALL COURT GATE CONTROLLER — ESP32 FIRMWARE
 * ============================================================
 * 
 * Hardware:
 *   - ESP32 Dev Module (WiFi-enabled microcontroller)
 *   - 3×4 Matrix Keypad (code entry)
 *   - SG90 Servo Motor (gate latch control)
 *   - HC-SR501 PIR Sensor (occupancy detection)
 * 
 * Workflow:
 *   1. User enters 4-digit access code on keypad
 *   2. ESP32 sends HTTP GET /api/iot/verify?code=XXXX to backend
 *   3. If backend returns { unlock: true } → servo toggles gate (lock/unlock)
 *   4. PIR sensor continuously monitors court occupancy
 *   5. ESP32 sends POST /api/iot/occupancy with occupancy data
 * 
 * Dependencies (install via Arduino Library Manager):
 *   - Keypad by Mark Stanley (v3.1.1+)
 *   - ESP32Servo by Kevin Harrington (v3.0.5+)
 *   - WiFi (built-in with ESP32 board package)
 *   - HTTPClient (built-in with ESP32 board package)
 *   - ArduinoJson by Benoit Blanchon (v7.x)
 * 
 * Board Setup:
 *   - Board Manager → Install "esp32" by Espressif Systems
 *   - Select Board: "ESP32 Dev Module"
 *   - Upload Speed: 115200
 * 
 * ============================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Keypad.h>
#include <ESP32Servo.h>

// ============================================================
// CONFIGURATION — Update these values for your environment
// ============================================================

// WiFi credentials
const char* WIFI_SSID = "DanielESP32";
const char* WIFI_PASS = "password123456";

// Backend API server (use your PC's local IP on the same network)
// Find your IP: Windows → ipconfig
const char* API_BASE_URL = "http://172.20.10.9:5000";
const char* IOT_DEVICE_KEY = "pickleball-iot-prototype-key";

// Court number this ESP32 controls (1 or 2)
const int COURT_NUMBER = 1;


// ============================================================
// PIN ASSIGNMENTS
// ============================================================

// Servo motor (gate latch)
const int SERVO_PIN = 18;

// PIR motion sensor
const int PIR_PIN = 4;


// ============================================================
// KEYPAD CONFIGURATION — 3×4 Matrix Keypad
// ============================================================
const byte ROWS = 4;
const byte COLS = 3;

char keys[ROWS][COLS] = {
  {'1', '2', '3'},
  {'4', '5', '6'},
  {'7', '8', '9'},
  {'*', '0', '#'}
};

// Keypad row and column pin connections to ESP32
byte rowPins[ROWS] = {13, 12, 14, 27};  // R1, R2, R3, R4
byte colPins[COLS] = {26, 25, 33};       // C1, C2, C3

Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// ============================================================
// GLOBAL VARIABLES
// ============================================================

Servo gateServo;

// Access code input buffer
String inputCode = "";
const int CODE_LENGTH = 4;

// Gate servo angles
const int SERVO_LOCKED_ANGLE = 0;        // Servo angle when locked
const int SERVO_UNLOCKED_ANGLE = 90;     // Servo angle when unlocked

// PIR occupancy reporting
unsigned long lastOccupancyReport = 0;
const unsigned long OCCUPANCY_REPORT_INTERVAL = 10000;  // Report every 10 seconds
bool lastOccupancyState = false;

// PIR debounce — requires sustained motion before triggering "occupied"
unsigned long pirHighStart = 0;
const unsigned long PIR_DEBOUNCE_MS = 2000;  // Must detect motion for 2 seconds before reporting occupied
bool pirDebounced = false;

// Set to true to see PIR state changes in Serial Monitor (for testing only)
const bool PIR_DEBUG = false;

// WiFi reconnection
unsigned long lastWifiCheck = 0;
const unsigned long WIFI_CHECK_INTERVAL = 30000;  // Check WiFi every 30 seconds


// Gate command polling (admin lock/unlock from web UI)
unsigned long lastGatePoll = 0;
const unsigned long GATE_POLL_INTERVAL = 2000;  // Poll every 2 seconds
bool currentGateLocked = true;  // Track current servo state

// Sync state: blocks gate polling until backend confirms the keypad toggle
bool syncPending = false;
unsigned long lastSyncAttempt = 0;
const unsigned long SYNC_RETRY_INTERVAL = 2000;  // Retry sync every 2 seconds

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("========================================");
  Serial.println("  Pickleball Gate Controller v1.0");
  Serial.println("  Court: " + String(COURT_NUMBER));
  Serial.println("========================================");

  // Initialize pins
  pinMode(PIR_PIN, INPUT);

  // Initialize servo
  gateServo.attach(SERVO_PIN);
  gateServo.write(SERVO_LOCKED_ANGLE);
  Serial.println("[SERVO] Gate locked at " + String(SERVO_LOCKED_ANGLE) + " degrees");

  // Connect to WiFi
  connectWiFi();

  Serial.println("[READY] Waiting for keypad input...");
  Serial.println("  Enter 4-digit code then press #");
}

// ============================================================
// MAIN LOOP
// ============================================================
void loop() {
  // 1. Handle keypad input
  handleKeypad();

  // 2. Retry pending sync if previous attempt failed
  handleSyncRetry();

  // 3. Poll backend for admin gate commands (lock/unlock)
  handleGateCommandPoll();

  // 4. Report PIR occupancy at intervals
  handleOccupancyReporting();

  // 5. Auto-reconnect WiFi if disconnected
  handleWiFiReconnect();

}

// ============================================================
// KEYPAD HANDLING
// ============================================================
void handleKeypad() {
  char key = keypad.getKey();
  
  if (key) {
    if (key == '#') {
      // Submit code
      if (inputCode.length() == CODE_LENGTH) {
        verifyAccessCode(inputCode);
      } else {
        denyAccess();
      }
      inputCode = "";  // Reset input buffer
    } else if (key == '*') {
      // Clear input
      inputCode = "";
      Serial.println("[KEYPAD] Input cleared");
    } else if (inputCode.length() < CODE_LENGTH) {
      // Append digit
      inputCode += key;
      Serial.println("[KEYPAD] Input: " + inputCode + " (" + String(inputCode.length()) + "/" + String(CODE_LENGTH) + ")");
    }
  }
}

// ============================================================
// ACCESS CODE VERIFICATION (HTTP Call to Backend)
// ============================================================
void verifyAccessCode(String code) {
  if (WiFi.status() != WL_CONNECTED) {
    denyAccess();
    return;
  }

  HTTPClient http;
  String url = String(API_BASE_URL) + "/api/iot/verify?code=" + code;

  http.begin(url);
  http.addHeader("X-IoT-Key", IOT_DEVICE_KEY);
  http.setTimeout(5000);
  
  int httpCode = http.GET();
  
  if (httpCode == 200) {
    String payload = http.getString();

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, payload);
    
    if (!error) {
      bool unlock = doc["unlock"] | false;
      
      if (unlock) {
        grantAccess();
      } else {
        denyAccess();
      }
    } else {
      denyAccess();
    }
  } else {
    denyAccess();
  }
  
  http.end();
}

// ============================================================
// GATE CONTROL
// ============================================================
void grantAccess() {
  Serial.println("Access Granted");
  
  // Toggle gate state
  if (currentGateLocked) {
    gateServo.write(SERVO_UNLOCKED_ANGLE);
    currentGateLocked = false;
  } else {
    gateServo.write(SERVO_LOCKED_ANGLE);
    currentGateLocked = true;
  }

  // Block gate polling until sync is confirmed
  syncPending = true;
  lastSyncAttempt = 0;  // Force immediate first attempt

  // Try to sync immediately
  syncGateState();
}

void denyAccess() {
  Serial.println("Access Denied");
}

// Sync local gate state to backend after keypad toggle
void syncGateState() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[SYNC] WiFi not connected, will retry");
    return;
  }

  HTTPClient http;
  String url = String(API_BASE_URL) + "/api/iot/gate/sync";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-IoT-Key", IOT_DEVICE_KEY);
  http.setTimeout(5000);

  JsonDocument doc;
  doc["courtNumber"] = COURT_NUMBER;
  doc["locked"] = currentGateLocked;

  String payload;
  serializeJson(doc, payload);

  Serial.println("[SYNC] Sending: " + payload);

  int httpCode = http.POST(payload);

  if (httpCode == 200) {
    String response = http.getString();
    Serial.println("[SYNC] Success (200): " + response);
    syncPending = false;  // Backend confirmed — safe to resume polling
  } else {
    Serial.println("[SYNC] Failed with HTTP " + String(httpCode) + ", will retry");
  }

  lastSyncAttempt = millis();
  http.end();
}

// Retry sync if previous attempt failed
void handleSyncRetry() {
  if (!syncPending) return;
  if (millis() - lastSyncAttempt < SYNC_RETRY_INTERVAL) return;

  Serial.println("[SYNC] Retrying...");
  syncGateState();
}

// ============================================================
// GATE COMMAND POLLING (Admin Lock/Unlock from Web UI)
// ============================================================
void handleGateCommandPoll() {
  if (millis() - lastGatePoll < GATE_POLL_INTERVAL) {
    return;
  }
  lastGatePoll = millis();

  // Block polling entirely while a keypad sync is pending
  if (syncPending) {
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  HTTPClient http;
  String url = String(API_BASE_URL) + "/api/iot/gate/status";

  http.begin(url);
  http.addHeader("X-IoT-Key", IOT_DEVICE_KEY);
  http.setTimeout(3000);

  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (!error) {
      bool shouldBeLocked = doc["gate"]["locked"] | true;

      // Only actuate servo if state changed
      if (shouldBeLocked && !currentGateLocked) {
        Serial.println("[GATE CMD] Admin LOCKED gate");
        gateServo.write(SERVO_LOCKED_ANGLE);
        currentGateLocked = true;
        Serial.println("[SERVO] Gate LOCKED at " + String(SERVO_LOCKED_ANGLE) + " degrees");
      } else if (!shouldBeLocked && currentGateLocked) {
        Serial.println("[GATE CMD] Admin UNLOCKED gate");
        gateServo.write(SERVO_UNLOCKED_ANGLE);
        currentGateLocked = false;
        Serial.println("[SERVO] Gate UNLOCKED at " + String(SERVO_UNLOCKED_ANGLE) + " degrees");
      }
    }
  }

  http.end();
}

// ============================================================
// PIR OCCUPANCY REPORTING
// ============================================================
void handleOccupancyReporting() {
  bool rawReading = digitalRead(PIR_PIN) == HIGH;

  // Software debounce: require sustained HIGH for PIR_DEBOUNCE_MS
  if (rawReading) {
    if (pirHighStart == 0) {
      pirHighStart = millis();  // Start timing
    }
    // Only consider "occupied" after sustained motion
    if (!pirDebounced && (millis() - pirHighStart >= PIR_DEBOUNCE_MS)) {
      pirDebounced = true;
    }
  } else {
    pirHighStart = 0;
    pirDebounced = false;
  }

  bool occupied = pirDebounced;

  // Report immediately on state change
  if (occupied != lastOccupancyState) {
    lastOccupancyState = occupied;

    if (PIR_DEBUG) {
      Serial.println(occupied
        ? "[PIR DEBUG] Motion CONFIRMED — reporting OCCUPIED"
        : "[PIR DEBUG] Motion STOPPED — reporting AVAILABLE");
    }

    reportOccupancy(occupied);
    lastOccupancyReport = millis();
    return;
  }

  // Periodic heartbeat report to keep UI in sync
  if (millis() - lastOccupancyReport >= OCCUPANCY_REPORT_INTERVAL) {
    lastOccupancyReport = millis();
    reportOccupancy(occupied);
  }
}

void reportOccupancy(bool occupied) {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  HTTPClient http;
  String url = String(API_BASE_URL) + "/api/iot/occupancy";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-IoT-Key", IOT_DEVICE_KEY);
  http.setTimeout(3000);

  // Build JSON payload
  JsonDocument doc;
  doc["courtNumber"] = COURT_NUMBER;
  doc["occupied"] = occupied;
  doc["timestamp"] = millis();
  
  String payload;
  serializeJson(doc, payload);
  
  http.POST(payload);
  http.end();
}

// ============================================================
// WiFi MANAGEMENT
// ============================================================
void connectWiFi() {
  Serial.print("[WiFi] Connecting to " + String(WIFI_SSID));
  
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("[WiFi] Connected!");
    Serial.println("[WiFi] IP: " + WiFi.localIP().toString());
    Serial.println("[WiFi] Signal: " + String(WiFi.RSSI()) + " dBm");
  } else {
    Serial.println();
    Serial.println("[WiFi] FAILED to connect after " + String(attempts) + " attempts");
    Serial.println("[WiFi] Will retry in background...");
  }
}

void handleWiFiReconnect() {
  if (millis() - lastWifiCheck < WIFI_CHECK_INTERVAL) {
    return;
  }
  lastWifiCheck = millis();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Reconnecting...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
