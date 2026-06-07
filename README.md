# Pickleball Booking System Integration with Internet of Things (IoT)

A full-stack web application with IoT integration for managing pickleball court reservations. Users book courts online and receive a 4-digit access code, which they enter on a physical keypad (ESP32) at the court gate to unlock entry.

Built as a Final Year Project (FYP) to demonstrate full-stack development combined with IoT hardware.

## Features

- Court booking with date, time slot, duration, and court selection
- Unique 4-digit access code generated per booking for IoT gate entry
- JWT authentication with bcrypt password hashing
- Admin dashboard - manage bookings, users, payments, analytics, IoT gate controls
- User dashboard - book courts, upload payment proof, view history, cancel bookings (30-min policy)
- Payment workflow - QR/cash payment proof upload, admin approval/rejection, bulk approve/reject
- Admin-configurable per-court hourly pricing
- Guest booking support (admin creates on behalf of walk-ins)
- Admin can register additional admin accounts
- Court occupancy grid showing real-time availability
- Booking analytics with daily/weekly charts
- Bulk booking and user management (bulk delete, bulk approve/reject)
- Self-service account deletion with confirmation flow
- ESP32 firmware for keypad + servo gate + PIR occupancy sensor
- Responsive layout for mobile and desktop

## Tech Stack

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Recharts, Sonner  
**Backend:** Node.js, Express, MySQL2, bcrypt, jsonwebtoken  
**Database:** MySQL (XAMPP)  
**IoT:** ESP32, 3×4 matrix keypad, SG90 servo, HC-SR501 PIR sensor

## Project Structure

```
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── App.tsx                   # SPA router, page state
│   │   ├── config.ts                 # API base URL, auth helpers
│   │   ├── components/
│   │   │   ├── AdminDashboard.tsx
│   │   │   ├── UserDashboard.tsx
│   │   │   ├── GuestDashboard.tsx
│   │   │   ├── BookingModal.tsx      # 3-step booking flow
│   │   │   ├── PaymentModal.tsx      # Payment proof upload
│   │   │   ├── ManagePayments.tsx    # Admin payment review
│   │   │   ├── CourtPricingSettings.tsx  # Admin pricing config
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── LandingPage.tsx
│   │   │   ├── EditProfileModal.tsx
│   │   │   ├── ConfirmModal.tsx
│   │   │   ├── GuestBookingModal.tsx
│   │   │   ├── RegisterAdminModal.tsx
│   │   │   ├── DeleteAccountConfirmationModal.tsx
│   │   │   └── ui/
│   │   │       └── ErrorBoundary.tsx
│   │   └── data/
│   │       └── mockData.ts          # Interfaces, time slot helpers
│   ├── styles/
│   │   ├── pickleball.css           # Main stylesheet
│   │   ├── index.css
│   │   ├── fonts.css
│   │   └── tailwind.css
│   └── __tests__/
│       ├── mockData.test.ts         # Unit tests — time slots, booking logic
│       └── iot-integration.test.ts  # Integration tests — IoT API endpoints
│
├── server/
│   ├── server.js                    # Express API (37 endpoints)
│   ├── config.js                    # App config
│   ├── security.js                  # Rate limiting, validators
│   ├── database-setup.sql           # MySQL schema
│   ├── demo-data.sql                # Ready-to-import demo data for phpMyAdmin
│   ├── seed-demo-data.js            # Demo user seeder (Node script)
│   └── reset-and-seed.js            # Dev reset script
│
└── firmware/
    └── pickleball_gate_controller.ino  # ESP32 gate controller
```

## Setup

### 1. Database

1. Start MySQL in XAMPP
2. Open phpMyAdmin → SQL tab
3. Paste and run `server/database-setup.sql` to create all tables
4. Paste and run `server/demo-data.sql` to import demo accounts and sample bookings

### 2. Backend

```bash
cd server
cp .env.example .env   # fill in your DB and JWT values
npm install
npm start              # starts on port 5000
```

### 3. Frontend

```bash
npm install
npm run dev               # starts on port 5173
```

### 4. ESP32 (optional)

Open `firmware/pickleball_gate_controller.ino` in Arduino IDE, update WiFi credentials and API URL, then upload to an ESP32 Dev Module.

## How It Works

1. User logs in and books a court (picks date, time, duration, court number)
2. Backend checks for time slot conflicts, generates a unique 4-digit code
3. User gets the code displayed on screen
4. At the court, user enters the code on the ESP32 keypad
5. ESP32 calls `GET /api/iot/verify?code=XXXX` — if the code matches a confirmed booking for the current time, the servo unlocks the gate
6. PIR sensor reports court occupancy back to the admin dashboard

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@pickleball.com | AdminPass123 |
| User | user@pickleball.com | UserPass123 |

## Testing

```bash
npm test    # unit tests (time slot parsing, overlap detection, access code generation, etc.)
```

IoT integration tests (`iot-integration.test.ts`) require the backend server to be running on port 5000.

## License

FYP Project — Pickleball Booking System Integration with Internet of Things (IoT) © 2026
