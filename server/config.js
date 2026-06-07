// App configuration

export const CONFIG = {
  // Server
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Database
  DB: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pickleball_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  },
  
  // CORS
  CORS_ORIGINS: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174', // Alternative Vite port
    'http://127.0.0.1:5174',
    'http://localhost:3000', // Fallback for local
    'http://127.0.0.1:3000',
  ],
  
  // JWT
  JWT_SECRET: process.env.JWT_SECRET || null, // REQUIRED
  JWT_EXPIRATION: process.env.JWT_EXPIRATION || '7d',
  
  // Booking System
  BOOKING: {
    MIN_DURATION: 1,
    MAX_DURATION: 4, // Max hours per booking
    OPENING_HOUR: 6, // 6 AM
    CLOSING_HOUR: 22, // 10 PM (22:00)
    AVAILABLE_COURTS: 2, // Court 1 and 2
    ACCESS_CODE_LENGTH: 4, // 4-digit numeric codes (0000-9999)
  },
  
  // Validation
  VALIDATION: {
    PASSWORD_MIN_LENGTH: 8,
    PASSWORD_PATTERN: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, // Uppercase, lowercase, digit
    EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    PHONE_PATTERN: /^[\d\-\+\(\) ]*$/, // Allows digits, spaces, dash, plus, parentheses
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 100,
  },
  
  // Pagination
  PAGINATION: {
    DEFAULT_LIMIT: 50,
    MAX_LIMIT: 200,
    DEFAULT_OFFSET: 0,
  },
  
  // Security
  BCRYPT_ROUNDS: 10,
  REQUEST_TIMEOUT_MS: 60000,
  IOT_DEVICE_KEY: process.env.IOT_DEVICE_KEY || 'pickleball-iot-prototype-key',
  
  // Feature Flags
  FEATURES: {
    REQUIRE_AUTH_FOR_BOOKINGS: true,
    VALIDATE_COURT_EXISTS: true,
    USE_TRANSACTIONS: true,
  },
};

// Check required env vars on startup
export function validateConfig() {
  if (!CONFIG.JWT_SECRET) {
    throw new Error(
      'FATAL: JWT_SECRET environment variable is required. ' +
      'Set it in .env file before starting server.'
    );
  }
  
  if (CONFIG.NODE_ENV === 'production' && CONFIG.DB.password === '') {
    throw new Error(
      'FATAL: Database password is empty in production. ' +
      'Set DB_PASSWORD in .env file.'
    );
  }
}

export default CONFIG;
