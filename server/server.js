import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env file at the very start
dotenv.config({ path: path.join(__dirname, '.env') });

// Verify JWT_SECRET is loaded
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required. Set it in .env file before starting server.');
  process.exit(1);
}

// Now dynamically import modules that depend on .env variables
const express = (await import('express')).default;
const cors = (await import('cors')).default;
const mysql = (await import('mysql2/promise')).default;
const bcrypt = (await import('bcrypt')).default;
const jwt = (await import('jsonwebtoken')).default;
const multer = (await import('multer')).default;
const fs = (await import('fs')).default;
const { CONFIG, validateConfig } = await import('./config.js');
const {
  generateAccessCode,
  rateLimit,
  rateLimiter,
  Validators,
  Sanitizers,
  logSecurityEvent
} = await import('./security.js');

// Validate configuration
try {
  validateConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = express();
const PORT = CONFIG.PORT;

// --- Middleware ---

// CORS - allow frontend origins
app.use(cors({
  origin: CONFIG.CORS_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-IoT-Key']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function parseBearerToken(req) {
  const authHeader = req.headers['authorization'];
  return authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;
}

// --- File upload setup (multer for payment proofs) ---
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) { fs.mkdirSync(uploadsDir, { recursive: true }); }
const paymentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `payment_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`);
  }
});
const paymentUpload = multer({
  storage: paymentStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only images (JPG, PNG, WEBP) and PDF files are allowed'));
    }
  }
});
app.use('/uploads', express.static(uploadsDir));

async function validateUploadedPaymentProof(file) {
  if (!file) return false;

  const ext = path.extname(file.originalname).toLowerCase();
  const allowedMimeTypes = {
    '.jpg': ['image/jpeg', 'image/pjpeg'],
    '.jpeg': ['image/jpeg', 'image/pjpeg'],
    '.png': ['image/png', 'image/x-png'],
    '.webp': ['image/webp'],
    '.pdf': ['application/pdf', 'application/x-pdf'],
  };

  if (!allowedMimeTypes[ext]?.includes(file.mimetype)) {
    return false;
  }

  const fileBuffer = await fs.promises.readFile(file.path);
  const header = fileBuffer.subarray(0, 12);
  const asciiHeader = header.toString('ascii');

  if ((ext === '.jpg' || ext === '.jpeg') && header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
    return true;
  }

  if (ext === '.png' && header.length >= 8) {
    const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    return pngSignature.every((value, index) => header[index] === value);
  }

  if (ext === '.webp') {
    return asciiHeader.startsWith('RIFF') && header.toString('ascii', 8, 12) === 'WEBP';
  }

  if (ext === '.pdf') {
    return asciiHeader.startsWith('%PDF-');
  }

  return false;
}

function rejectInvalidPaymentProof(file, res) {
  if (file?.path) {
    fs.unlink(file.path, () => {});
  }

  return res.status(400).json({
    error: 'Invalid payment proof file. Upload a real JPG, PNG, WEBP, or PDF document.',
  });
}

// Request timeout
app.use((req, res, next) => {
  req.setTimeout(CONFIG.REQUEST_TIMEOUT_MS);
  res.setTimeout(CONFIG.REQUEST_TIMEOUT_MS);
  next();
});

// --- JWT Auth ---

// Verify JWT token from Authorization header
const verifyToken = (req, res, next) => {
  const token = parseBearerToken(req);

  if (!token) {
    return res.status(401).json({ error: 'No authentication token provided' });
  }

  jwt.verify(token, CONFIG.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user; // Attach user info to request
    next();
  });
};

// Check admin role
const verifyAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Check resource ownership (own resource or admin)
const verifyResourceOwnership = (resourceUserId) => {
  return (req, res, next) => {
    if (req.user.id !== resourceUserId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You do not have permission to access this resource' });
    }
    next();
  };
};

const verifyIotDeviceOrAdmin = (req, res, next) => {
  const iotKey = req.headers['x-iot-key'];
  if (iotKey && iotKey === CONFIG.IOT_DEVICE_KEY) {
    req.iotDevice = true;
    return next();
  }

  const token = parseBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'IoT device key or admin token is required' });
  }

  jwt.verify(token, CONFIG.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user = user;
    next();
  });
};

// --- MySQL Pool ---

const pool = mysql.createPool(CONFIG.DB);

// Test database connection on startup
pool.getConnection()
  .then(conn => {
    console.log('✓ MySQL Database connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('✗ MySQL Connection Error:', err.message);
    console.error('  Make sure XAMPP MySQL is running and database "' + CONFIG.DB.database + '" exists.');
    process.exit(1); // Exit on connection failure
  });

// --- Helpers ---

// Check if a time slot is available (no overlap with existing bookings)
async function isTimeSlotAvailable(courtNumber, date, startHour, duration) {
  const requestedEnd = startHour + duration;
  
  const [overlaps] = await pool.query(
    `SELECT COUNT(*) as count FROM bookings 
     WHERE court_number = ? AND date = ? AND status != 'cancelled'
     AND start_hour < ? AND (start_hour + duration) > ?`,
    [courtNumber, date, requestedEnd, startHour]
  );

  return overlaps[0].count === 0; // true if no overlaps found
}

// Parse time slot string to 24h hour ("6:00 AM – 7:00 AM" → 6)
function parseTimeSlotToHour(timeSlot) {
  const match = timeSlot.match(/(\d+):00\s?(AM|PM)/i);
  if (!match) return null;
  
  let hour = parseInt(match[1]);
  const period = match[2].toUpperCase();
  
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  
  return hour;
}



async function hashPassword(password) {
  return bcrypt.hash(password, CONFIG.BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    CONFIG.JWT_SECRET,
    { expiresIn: CONFIG.JWT_EXPIRATION }
  );
}

function validateUserInput(data) {
  const errors = [];
  
  if (data.email && !CONFIG.VALIDATION.EMAIL_PATTERN.test(data.email)) {
    errors.push('Invalid email format');
  }
  
  if (data.name) {
    if (data.name.length < CONFIG.VALIDATION.NAME_MIN_LENGTH) {
      errors.push(`Name must be at least ${CONFIG.VALIDATION.NAME_MIN_LENGTH} characters`);
    }
    if (data.name.length > CONFIG.VALIDATION.NAME_MAX_LENGTH) {
      errors.push(`Name must not exceed ${CONFIG.VALIDATION.NAME_MAX_LENGTH} characters`);
    }
  }
  
  if (data.password && !CONFIG.VALIDATION.PASSWORD_PATTERN.test(data.password)) {
    errors.push(`Password must be at least ${CONFIG.VALIDATION.PASSWORD_MIN_LENGTH} characters with uppercase, lowercase, and number`);
  }
  
  if (data.phone && !CONFIG.VALIDATION.PHONE_PATTERN.test(data.phone)) {
    errors.push('Invalid phone format');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Generate next sequential user ID (USR001, USR002, etc.) with locking
async function generateNextUserId() {
  const conn = await pool.getConnection();
  try {
    // Use transaction to ensure consistency under concurrent access
    await conn.beginTransaction();
    
    // Lock row to prevent duplicate IDs under concurrent access
    const [results] = await conn.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(id, 4) AS UNSIGNED)), 0) as max_num 
       FROM users 
       WHERE id LIKE 'USR%' 
       FOR UPDATE`
    );
    
    const maxNum = parseInt(results[0]?.max_num || '0', 10);
    const nextNum = maxNum + 1;
    const nextId = `USR${String(nextNum).padStart(3, '0')}`;
    
    await conn.commit();
    
    return nextId;
  } catch (err) {
    await conn.rollback();
    throw new Error(`Failed to generate User ID: ${err.message}`);
  } finally {
    conn.release();
  }
}

// --- Auth Routes ---

// POST /api/login
app.post('/api/login', rateLimit(20, 15 * 60 * 1000), async (req, res) => {
  const { email, password } = req.body;

  // Input validation
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (!Validators.isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Sanitize inputs
  const sanitizedEmail = Sanitizers.sanitizeEmail(email);

  try {
    const [users] = await pool.query(
      'SELECT id, name, email, password, role, phone, created_at FROM users WHERE email = ?',
      [sanitizedEmail]
    );

    if (users.length === 0) {
      logSecurityEvent('LOGIN_FAILED_USER_NOT_FOUND', { email: sanitizedEmail, ip: req.ip }, 'warning');
      return res.status(401).json({ error: 'Account not registered. Please register first.' });
    }

    const user = users[0];
    const passwordMatch = await verifyPassword(password, user.password);

    if (!passwordMatch) {
      logSecurityEvent('LOGIN_FAILED_WRONG_PASSWORD', { email: sanitizedEmail, ip: req.ip }, 'warning');
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    // Generate JWT token
    const token = generateToken(user);

    logSecurityEvent('LOGIN_SUCCESS', { userId: user.id, email: sanitizedEmail, ip: req.ip }, 'info');

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        created_at: user.created_at
      }
    });
  } catch (err) {
    logSecurityEvent('LOGIN_ERROR', { email: sanitizedEmail, error: err.message, ip: req.ip }, 'error');
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/register
app.post('/api/register', async (req, res) => {
  const { name, email, password, phone = '' } = req.body;

  // Validate required fields
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  // Trim inputs
  const trimmedName = name.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedPhone = phone.trim();

  // Validate inputs
  const validation = validateUserInput({
    name: trimmedName,
    email: trimmedEmail,
    password,
    phone: trimmedPhone
  });

  if (!validation.valid) {
    return res.status(400).json({ 
      error: validation.errors[0],
      errors: validation.errors
    });
  }

  try {
    // Hash password before storing
    const hashedPassword = await hashPassword(password);

    const conn = await pool.getConnection();
    try {
      // Generate sequential User ID with concurrency safety
      const userId = await generateNextUserId();
      
      await conn.execute(
        'INSERT INTO users (id, name, email, password, phone, role) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, trimmedName, trimmedEmail, hashedPassword, trimmedPhone, 'user']
      );

      // Generate token for automatic login
      const token = generateToken({ id: userId, email: trimmedEmail, role: 'user' });

      res.status(201).json({
        message: 'Registration successful',
        token,
        user: {
          id: userId,
          name: trimmedName,
          email: trimmedEmail,
          role: 'user',
          phone: trimmedPhone
        }
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('POST /api/register error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Email already registered' });
    } else {
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

// --- User Routes ---

// GET /api/users
app.get('/api/users', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, name, email, role, phone, created_at FROM users ORDER BY name'
    );
    res.json(users);
  } catch (err) {
    console.error('GET /api/users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/users/:userId
app.get('/api/users/:userId', verifyToken, async (req, res) => {
  const { userId } = req.params;

  if (req.user.role !== 'admin' && req.user.id !== userId) {
    return res.status(403).json({ error: 'You do not have permission to access this user' });
  }

  try {
    const [users] = await pool.query(
      'SELECT id, name, email, role, phone, created_at FROM users WHERE id = ?',
      [userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(users[0]);
  } catch (err) {
    console.error('GET /api/users/:userId error:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /api/users (admin only)
app.post('/api/users', verifyToken, verifyAdmin, async (req, res) => {
  const { name, email, password, role = 'user', phone = '' } = req.body;

  // Validate required fields
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields: name, email, password' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Validate password strength
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters with uppercase, lowercase, and number'
    });
  }

  // Validate role
  if (!['admin', 'user', 'guest'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    // Hash password before storing
    const hashedPassword = await hashPassword(password);

    const conn = await pool.getConnection();
    try {
      // Generate sequential User ID with concurrency safety
      const userId = await generateNextUserId();
      
      await conn.execute(
        'INSERT INTO users (id, name, email, password, role, phone) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, name.trim(), email.trim(), hashedPassword, role, phone.trim()]
      );
      
      res.status(201).json({
        message: 'User created successfully',
        user: {
          id: userId,
          name: name.trim(),
          email: email.trim(),
          role,
          phone: phone.trim()
        }
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('POST /api/users error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Email already registered' });
    } else {
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
});

// PUT /api/users/:userId
app.put('/api/users/:userId', verifyToken, async (req, res) => {
  const { name, email, phone } = req.body;
  const { userId } = req.params;

  // Authorization: can only update own profile or if admin
  if (req.user.id !== userId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Cannot modify other users profiles' });
  }

  if (!name && !email && !phone) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  try {
    const conn = await pool.getConnection();
    
    try {
      // Check if user is admin
      const [users] = await conn.query(
        'SELECT role FROM users WHERE id = ?',
        [userId]
      );

      if (users.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Admins can edit their own profile, but other admins cannot be edited by non-self
      if (users[0].role === 'admin' && req.user.id !== userId) {
        return res.status(403).json({ error: 'Cannot modify other Admin accounts' });
      }

      const updates = [];
      const values = [];

      if (name) {
        updates.push('name = ?');
        values.push(name.trim());
      }
      if (email) {
        updates.push('email = ?');
        values.push(email.trim());
      }
      if (phone) {
        updates.push('phone = ?');
        values.push(phone.trim());
      }

      values.push(userId);

      const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
      await conn.execute(query, values);

      res.json({ message: 'User updated successfully' });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('PUT /api/users/:userId error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Email already in use' });
    } else {
      res.status(500).json({ error: 'Failed to update user' });
    }
  }
});

// DELETE /api/users/:userId (admin only, can't delete admins)
app.delete('/api/users/:userId', verifyToken, verifyAdmin, async (req, res) => {
  const { userId } = req.params;

  try {
    const conn = await pool.getConnection();
    
    try {
      // Start transaction for atomic deletion
      await conn.beginTransaction();

      try {
        // Check if user exists and is not admin
        const [users] = await conn.query(
          'SELECT role, name, email FROM users WHERE id = ?',
          [userId]
        );

        if (users.length === 0) {
          await conn.rollback();
          return res.status(404).json({ error: 'User not found' });
        }

        if (users[0].role === 'admin') {
          await conn.rollback();
          return res.status(403).json({ error: 'Cannot delete Admin accounts' });
        }

        const userName = users[0].name;
        const userEmail = users[0].email;

        // Step 1: Delete all bookings for this user (releases time slots)
        const [deleteResult] = await conn.execute(
          'DELETE FROM bookings WHERE user_id = ?',
          [userId]
        );
        const bookingsDeleted = deleteResult.affectedRows;

        // Step 2: Delete the user record
        await conn.execute(
          'DELETE FROM users WHERE id = ?',
          [userId]
        );

        // Commit transaction
        await conn.commit();

        res.json({ 
          message: 'User deleted and all associated bookings removed',
          details: {
            userId,
            userName,
            userEmail,
            bookingsDeleted,
            accountPermanentlyRemoved: true
          }
        });
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('DELETE /api/users/:userId error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// POST /api/users/:userId/delete-account (self-delete)
app.post('/api/users/:userId/delete-account', verifyToken, async (req, res) => {
  const { userId } = req.params;

  // Authorization: Users can only delete their own account (or admins can delete any non-admin account)
  if (req.user.id !== userId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only delete your own account' });
  }

  try {
    const conn = await pool.getConnection();
    
    try {
      // Begin transaction for atomic deletion
      await conn.beginTransaction();

      try {
        // Verify user exists and check if admin
        const [users] = await conn.query(
          'SELECT role, name, email FROM users WHERE id = ?',
          [userId]
        );

        if (users.length === 0) {
          await conn.rollback();
          return res.status(404).json({ error: 'User not found' });
        }

        // Prevent deletion of OTHER admin accounts (self-deletion is allowed)
        if (users[0].role === 'admin' && req.user.id !== userId) {
          await conn.rollback();
          return res.status(403).json({ error: 'Cannot delete other admin accounts' });
        }

        const userName = users[0].name;
        const userEmail = users[0].email;

        // Step 1: Delete all bookings for this user (full cleanup)
        await conn.execute(
          'DELETE FROM bookings WHERE user_id = ?',
          [userId]
        );

        // Step 2: Delete the user record
        await conn.execute(
          'DELETE FROM users WHERE id = ?',
          [userId]
        );

        // Commit transaction
        await conn.commit();

        res.json({ 
          message: 'Account deleted successfully',
          details: {
            userId,
            userName,
            userEmail,
            bookingsDeleted: true,
            accountPermanentlyRemoved: true
          }
        });
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('POST /api/users/:userId/delete-account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// --- Booking Routes ---

// GET /api/bookings/public — limited data for slot availability only
app.get('/api/bookings/public', async (req, res) => {
  try {
    let limit = parseInt(req.query.limit) || CONFIG.PAGINATION.DEFAULT_LIMIT;
    let offset = parseInt(req.query.offset) || CONFIG.PAGINATION.DEFAULT_OFFSET;

    if (limit > CONFIG.PAGINATION.MAX_LIMIT) limit = CONFIG.PAGINATION.MAX_LIMIT;
    if (limit < 1) limit = 1;
    if (offset < 0) offset = 0;

    const [bookings] = await pool.query(
      `SELECT id, date, start_hour, duration, time_slot, court_number, status
       FROM bookings
       WHERE status != 'cancelled'
       ORDER BY date DESC, start_hour DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM bookings WHERE status != \'cancelled\''
    );

    res.json({
      data: bookings,
      pagination: {
        limit,
        offset,
        total: countResult[0].total,
      }
    });
  } catch (err) {
    console.error('GET /api/bookings/public error:', err);
    res.status(500).json({ error: 'Failed to fetch booking availability' });
  }
});

// GET /api/bookings/mine — current user bookings only
app.get('/api/bookings/mine', verifyToken, async (req, res) => {
  try {
    const [bookings] = await pool.query(
      `SELECT 
        b.id, b.user_id, COALESCE(u.name, b.user_name) AS user_name, COALESCE(u.email, b.user_email) AS user_email,
        b.date, b.start_hour, b.duration, b.time_slot, b.access_code,
        b.court_number, b.booked_by, b.status, b.created_at,
        b.payment_status, b.payment_method, b.payment_proof_path,
        b.total_amount, b.price_per_hour, b.payment_submitted_at,
        b.approved_at, b.access_code_active, b.rejection_note
       FROM bookings b
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.user_id = ?
       ORDER BY b.date DESC, b.start_hour DESC`,
      [req.user.id]
    );

    const maskedBookings = bookings.map(b => ({
      ...b,
      access_code: b.access_code_active ? b.access_code : null
    }));

    res.json({ data: maskedBookings });
  } catch (err) {
    console.error('GET /api/bookings/mine error:', err);
    res.status(500).json({ error: 'Failed to fetch your bookings' });
  }
});

// GET /api/bookings
app.get('/api/bookings', verifyToken, verifyAdmin, async (req, res) => {
  try {
    let limit = parseInt(req.query.limit) || CONFIG.PAGINATION.DEFAULT_LIMIT;
    let offset = parseInt(req.query.offset) || CONFIG.PAGINATION.DEFAULT_OFFSET;

    // Validate and constrain pagination
    if (limit > CONFIG.PAGINATION.MAX_LIMIT) limit = CONFIG.PAGINATION.MAX_LIMIT;
    if (limit < 1) limit = 1;
    if (offset < 0) offset = 0;

    const [bookings] = await pool.query(
      `SELECT 
        b.id, b.user_id, COALESCE(u.name, b.user_name) AS user_name, COALESCE(u.email, b.user_email) AS user_email,
        b.date, b.start_hour, b.duration, b.time_slot, b.access_code,
        b.court_number, b.booked_by, b.status, b.created_at,
        b.payment_status, b.payment_method, b.payment_proof_path,
        b.total_amount, b.price_per_hour, b.payment_submitted_at,
        b.approved_at, b.access_code_active, b.rejection_note
       FROM bookings b
       LEFT JOIN users u ON b.user_id = u.id
       ORDER BY b.date DESC, b.start_hour DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // Get total count for pagination
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM bookings'
    );

    // Mask access_code for bookings that are not yet approved
    const maskedBookings = bookings.map(b => ({
      ...b,
      access_code: b.access_code_active ? b.access_code : null
    }));

    res.json({
      data: maskedBookings,
      pagination: {
        limit,
        offset,
        total: countResult[0].total
      }
    });
  } catch (err) {
    console.error('GET /api/bookings error:', err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// GET /api/bookings/:bookingId
app.get('/api/bookings/:bookingId', verifyToken, async (req, res) => {
  try {
    const [bookings] = await pool.query(
      `SELECT 
        b.id, b.user_id, COALESCE(u.name, b.user_name) AS user_name, COALESCE(u.email, b.user_email) AS user_email,
        b.date, b.start_hour, b.duration, b.time_slot, b.access_code,
        b.court_number, b.booked_by, b.status, b.created_at,
        b.payment_status, b.payment_method, b.payment_proof_path,
        b.total_amount, b.price_per_hour, b.payment_submitted_at,
        b.approved_at, b.access_code_active, b.rejection_note
       FROM bookings b
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.id = ?`,
      [req.params.bookingId]
    );

    if (bookings.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const b = bookings[0];

    if (req.user.role !== 'admin' && req.user.id !== b.user_id) {
      return res.status(403).json({ error: 'You do not have permission to access this booking' });
    }

    res.json({ ...b, access_code: b.access_code_active ? b.access_code : null });
  } catch (err) {
    console.error('GET /api/bookings/:bookingId error:', err);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

// POST /api/guest/bookings — create guest booking (no authentication required)
app.post('/api/guest/bookings', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  const { userName, userEmail, date, timeSlot, duration, courtNumber } = req.body;

  if (!date || !timeSlot || !duration || !courtNumber || !userName || !userEmail) {
    return res.status(400).json({ error: 'Missing required fields: userName, userEmail, date, timeSlot, duration, courtNumber' });
  }

  const trimmedUserName = (userName || '').trim();
  const trimmedUserEmail = (userEmail || '').trim().toLowerCase();
  const trimmedDate = date.trim();
  const trimmedTimeSlot = timeSlot.trim();

  if (!Validators.isValidEmail(trimmedUserEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (courtNumber < 1 || courtNumber > CONFIG.BOOKING.AVAILABLE_COURTS || !Number.isInteger(courtNumber)) {
    return res.status(400).json({ error: `Invalid court number. Available courts: 1-${CONFIG.BOOKING.AVAILABLE_COURTS}` });
  }

  const durationNum = parseInt(duration);
  if (durationNum < CONFIG.BOOKING.MIN_DURATION || durationNum > CONFIG.BOOKING.MAX_DURATION) {
    return res.status(400).json({ error: `Duration must be between ${CONFIG.BOOKING.MIN_DURATION} and ${CONFIG.BOOKING.MAX_DURATION} hours` });
  }

  try {
    const startHour = parseTimeSlotToHour(trimmedTimeSlot);
    if (startHour === null) {
      return res.status(400).json({ error: 'Invalid time slot format' });
    }

    if (startHour < CONFIG.BOOKING.OPENING_HOUR || startHour >= CONFIG.BOOKING.CLOSING_HOUR) {
      return res.status(400).json({ error: `Booking must be within ${CONFIG.BOOKING.OPENING_HOUR}:00 AM and ${CONFIG.BOOKING.CLOSING_HOUR}:00 (10 PM)` });
    }

    if (startHour + durationNum > CONFIG.BOOKING.CLOSING_HOUR) {
      return res.status(400).json({ error: `Booking would exceed closing time at ${CONFIG.BOOKING.CLOSING_HOUR}:00 (10 PM)` });
    }

    const conn = await pool.getConnection();
    try {
      const available = await isTimeSlotAvailable(courtNumber, trimmedDate, startHour, durationNum);
      if (!available) {
        return res.status(409).json({ error: 'Time slot unavailable - overlaps with existing booking. Please select another time.' });
      }

      const bookingId = `BK${Date.now()}`;

      let accessCode;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 50;

      while (!isUnique && attempts < maxAttempts) {
        accessCode = generateAccessCode();
        const [existingCode] = await conn.query('SELECT id FROM bookings WHERE access_code = ?', [accessCode]);
        isUnique = existingCode.length === 0;
        attempts++;
      }

      if (!isUnique) {
        return res.status(500).json({ error: 'Failed to generate unique access code. Please try again.' });
      }

      await conn.execute(
        `INSERT INTO bookings 
        (id, user_id, user_name, user_email, date, start_hour, duration, 
         time_slot, access_code, court_number, status, payment_status, access_code_active, created_at)
        VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'pending', 0, NOW())`,
        [bookingId, trimmedUserName, trimmedUserEmail, trimmedDate, startHour, durationNum,
         trimmedTimeSlot, accessCode, courtNumber]
      );

      res.status(201).json({
        message: 'Guest booking created successfully',
        id: bookingId,
        booking: {
          id: bookingId,
          user_id: null,
          userId: null,
          userName: trimmedUserName,
          userEmail: trimmedUserEmail,
          user_name: trimmedUserName,
          user_email: trimmedUserEmail,
          date: trimmedDate,
          timeSlot: trimmedTimeSlot,
          time_slot: trimmedTimeSlot,
          duration: durationNum,
          access_code: null,
          accessCode: null,
          court_number: courtNumber,
          courtNumber: courtNumber,
          status: 'confirmed',
          payment_status: 'pending',
          paymentStatus: 'pending',
          access_code_active: 0,
          accessCodeActive: false,
        }
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('POST /api/guest/bookings error:', err);
    res.status(500).json({ error: 'Failed to create guest booking' });
  }
});

// POST /api/guest/bookings/:bookingId/payment — submit proof for a guest booking (no auth required)
app.post('/api/guest/bookings/:bookingId/payment', rateLimit(5, 15 * 60 * 1000), paymentUpload.single('proof'), async (req, res) => {
  const { bookingId } = req.params;
  const { paymentMethod } = req.body;

  if (!['qr'].includes(paymentMethod)) {
    return res.status(400).json({ error: 'Guest payment must use qr method' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Payment proof file is required' });
  }

  if (!(await validateUploadedPaymentProof(req.file))) {
    return rejectInvalidPaymentProof(req.file, res);
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, duration, court_number FROM bookings WHERE id = ? AND user_id IS NULL',
      [bookingId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Guest booking not found' });
    }
    const booking = rows[0];

    const [pricing] = await pool.query(
      'SELECT price_per_hour FROM court_pricing WHERE court_number = ?',
      [booking.court_number]
    );
    const pricePerHour = pricing.length > 0 ? parseFloat(pricing[0].price_per_hour) : 8.00;
    const totalAmount = pricePerHour * booking.duration;

    await pool.query(
      `UPDATE bookings SET payment_status='pending', payment_method='qr',
        payment_proof_path=?, payment_submitted_at=NOW(),
        total_amount=?, price_per_hour=?
       WHERE id=?`,
      [req.file.filename, totalAmount, pricePerHour, bookingId]
    );
    return res.json({ message: 'Payment proof submitted', paymentStatus: 'pending' });
  } catch (err) {
    console.error('POST /api/guest/bookings/:id/payment error:', err);
    if (req.file) { fs.unlink(req.file.path, () => {}); }
    res.status(500).json({ error: 'Failed to submit payment' });
  }
});

// POST /api/bookings — create booking with access code
app.post('/api/bookings', verifyToken, async (req, res) => {
  const { userId: bodyUserId, userName, userEmail, date, timeSlot, duration, courtNumber, bookedBy } = req.body;

  // Use body userId if provided; if explicitly null (admin guest booking), keep null
  const userId = bodyUserId === null ? null : (bodyUserId || req.user.id);

  // Validate required fields (userId is optional for admin manual bookings)
  if (!date || !timeSlot || !duration || !courtNumber || !userName) {
    return res.status(400).json({ error: 'Missing required fields: date, timeSlot, duration, courtNumber, userName' });
  }

  // Trim string inputs
  const trimmedUserName = (userName || '').trim();
  const trimmedUserEmail = (userEmail || '').trim().toLowerCase();
  const trimmedDate = date.trim();
  const trimmedTimeSlot = timeSlot.trim();

  // Validate court number
  if (courtNumber < 1 || courtNumber > CONFIG.BOOKING.AVAILABLE_COURTS || !Number.isInteger(courtNumber)) {
    return res.status(400).json({ 
      error: `Invalid court number. Available courts: 1-${CONFIG.BOOKING.AVAILABLE_COURTS}`
    });
  }

  // Validate duration
  const durationNum = parseInt(duration);
  if (durationNum < CONFIG.BOOKING.MIN_DURATION || durationNum > CONFIG.BOOKING.MAX_DURATION) {
    return res.status(400).json({ 
      error: `Duration must be between ${CONFIG.BOOKING.MIN_DURATION} and ${CONFIG.BOOKING.MAX_DURATION} hours`
    });
  }

  try {
    const startHour = parseTimeSlotToHour(trimmedTimeSlot);
    if (startHour === null) {
      return res.status(400).json({ error: 'Invalid time slot format' });
    }

    // Validate start time within operating hours
    if (startHour < CONFIG.BOOKING.OPENING_HOUR || startHour >= CONFIG.BOOKING.CLOSING_HOUR) {
      return res.status(400).json({ 
        error: `Booking must be within ${CONFIG.BOOKING.OPENING_HOUR}:00 AM and ${CONFIG.BOOKING.CLOSING_HOUR}:00 (10 PM)`
      });
    }

    // Validate booking doesn't exceed closing time
    if (startHour + durationNum > CONFIG.BOOKING.CLOSING_HOUR) {
      return res.status(400).json({ 
        error: `Booking would exceed closing time at ${CONFIG.BOOKING.CLOSING_HOUR}:00 (10 PM)`
      });
    }

    const conn = await pool.getConnection();
    try {
      // OPTIONAL: Verify user exists (if userId provided)
      if (userId) {
        const [users] = await conn.query('SELECT id FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
          return res.status(404).json({ error: 'User not found' });
        }
      }

      // CRITICAL: Check if entire time range is available
      const available = await isTimeSlotAvailable(courtNumber, trimmedDate, startHour, durationNum);
      if (!available) {
        return res.status(409).json({ 
          error: 'Time slot unavailable - overlaps with existing booking. Please select another time.'
        });
      }

      const bookingId = `BK${Date.now()}`;
      
      // Generate unique 4-digit access code (0000-9999)
      // Retry logic ensures we get a unique code
      let accessCode;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 50;
      
      while (!isUnique && attempts < maxAttempts) {
        accessCode = generateAccessCode();
        const [existingCode] = await conn.query(
          'SELECT id FROM bookings WHERE access_code = ?',
          [accessCode]
        );
        isUnique = existingCode.length === 0;
        attempts++;
      }
      
      if (!isUnique) {
        return res.status(500).json({ 
          error: 'Failed to generate unique access code. Please try again.' 
        });
      }

      // Create booking (userId is null for admin-created guest bookings)
      const trimmedBookedBy = bookedBy ? bookedBy.trim() : null;
      const [result] = await conn.execute(
        `INSERT INTO bookings 
         (id, user_id, user_name, user_email, date, start_hour, duration, 
          time_slot, access_code, court_number, booked_by, status, payment_status, access_code_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'pending', 0, NOW())`,
        [bookingId, userId || null, trimmedUserName, trimmedUserEmail, trimmedDate, startHour, durationNum, 
         trimmedTimeSlot, accessCode, courtNumber, trimmedBookedBy]
      );

      const shouldExposeCode = req.user.role === 'admin';

      res.status(201).json({
        message: 'Booking created successfully',
        id: bookingId,
        booking: {
          id: bookingId,
          user_id: userId || null,
          userId: userId || null,
          userName: trimmedUserName,
          userEmail: trimmedUserEmail,
          user_name: trimmedUserName,
          user_email: trimmedUserEmail,
          date: trimmedDate,
          timeSlot: trimmedTimeSlot,
          time_slot: trimmedTimeSlot,
          duration: durationNum,
          access_code: shouldExposeCode ? accessCode : null,
          accessCode: shouldExposeCode ? accessCode : null,
          court_number: courtNumber,
          courtNumber: courtNumber,
          booked_by: trimmedBookedBy,
          bookedBy: trimmedBookedBy,
          status: 'confirmed',
          payment_status: 'pending',
          paymentStatus: 'pending',
          access_code_active: 0,
          accessCodeActive: false,
        }
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('POST /api/bookings error:', err);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// PUT /api/bookings/:bookingId
app.put('/api/bookings/:bookingId', verifyToken, async (req, res) => {
  const { bookingId } = req.params;
  const { status, date, timeSlot, duration, courtNumber } = req.body;

  // Determine if this is a status-only update or a detail edit
  const isStatusUpdate = status && !date && !timeSlot && !duration && !courtNumber;
  const isDetailEdit = date || timeSlot || duration || courtNumber;

  if (!isStatusUpdate && !isDetailEdit) {
    return res.status(400).json({ error: 'No valid fields provided for update' });
  }

  // Validate status if provided
  if (status && !['confirmed', 'cancelled', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be "confirmed", "cancelled", or "completed"' });
  }

  // Validate courtNumber if provided
  if (courtNumber !== undefined && ![1, 2].includes(Number(courtNumber))) {
    return res.status(400).json({ error: 'Invalid court number. Must be 1 or 2' });
  }

  // Validate duration if provided
  if (duration !== undefined && (Number(duration) < 1 || Number(duration) > 4)) {
    return res.status(400).json({ error: 'Invalid duration. Must be between 1 and 4 hours' });
  }

  try {
    const conn = await pool.getConnection();
    try {
      // Get booking to check ownership
      const [bookings] = await conn.query(
        'SELECT user_id, status, date, time_slot, court_number, duration FROM bookings WHERE id = ?',
        [bookingId]
      );

      if (bookings.length === 0) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      const booking = bookings[0];

      // Check authorization: user can only modify own bookings, admins can modify any
      if (req.user.id !== booking.user_id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'You do not have permission to modify this booking' });
      }

      // For status-only updates, validate transitions
      if (isStatusUpdate) {
        const currentStatus = booking.status;
        const validTransitions = {
          'confirmed': ['cancelled', 'completed'],
          'cancelled': [],
          'completed': [],
        };

        if (!validTransitions[currentStatus] || !validTransitions[currentStatus].includes(status)) {
          return res.status(400).json({ 
            error: `Cannot transition from "${currentStatus}" to "${status}"` 
          });
        }

        await conn.execute(
          'UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?',
          [status, bookingId]
        );

        return res.json({ 
          message: 'Booking updated successfully',
          booking: { id: bookingId, status }
        });
      }

      // For detail edits, only allow editing confirmed bookings
      if (booking.status !== 'confirmed') {
        return res.status(400).json({ error: 'Only confirmed bookings can be edited' });
      }

      // Conflict check: ensure no overlapping booking exists for the target date/court/time
      const checkDate = date || booking.date;
      const checkCourt = courtNumber ? Number(courtNumber) : booking.court_number;
      const checkDuration = duration ? Number(duration) : (booking.duration || 1);
      let checkStartHour = booking.start_hour;

      // Parse start_hour from the new or existing timeSlot
      const slotToParse = timeSlot || booking.time_slot;
      const hourMatchCheck = slotToParse.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (hourMatchCheck) {
        let h = parseInt(hourMatchCheck[1]);
        const ap = hourMatchCheck[3].toUpperCase();
        if (ap === 'PM' && h !== 12) h += 12;
        if (ap === 'AM' && h === 12) h = 0;
        checkStartHour = h;
      }

      const checkEndHour = checkStartHour + checkDuration;

      const [conflicts] = await conn.query(
        `SELECT id FROM bookings 
         WHERE date = ? AND court_number = ? AND id != ? AND status = 'confirmed'
         AND start_hour < ? AND (start_hour + duration) > ?`,
        [checkDate, checkCourt, bookingId, checkEndHour, checkStartHour]
      );

      if (conflicts.length > 0) {
        return res.status(409).json({ error: 'Time slot conflict: another booking already exists for this court and time.' });
      }

      // Build UPDATE query dynamically based on provided fields
      const updates = [];
      const values = [];

      if (date) {
        updates.push('date = ?');
        values.push(date);
      }
      if (timeSlot) {
        updates.push('time_slot = ?');
        values.push(timeSlot);
        updates.push('start_hour = ?');
        values.push(checkStartHour);
      }
      if (duration) {
        updates.push('duration = ?');
        values.push(Number(duration));
      }
      if (courtNumber) {
        updates.push('court_number = ?');
        values.push(Number(courtNumber));
      }

      updates.push('updated_at = NOW()');
      values.push(bookingId);

      await conn.execute(
        `UPDATE bookings SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      res.json({ 
        message: 'Booking updated successfully',
        booking: { id: bookingId, date, timeSlot, duration, courtNumber }
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('PUT /api/bookings/:bookingId error:', err);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// DELETE /api/bookings/:bookingId (30-min cancellation policy for users)
app.delete('/api/bookings/:bookingId', verifyToken, async (req, res) => {
  const { bookingId } = req.params;

  try {
    const conn = await pool.getConnection();
    try {
      const [bookings] = await conn.query(
        'SELECT user_id, date, time_slot, start_hour FROM bookings WHERE id = ?',
        [bookingId]
      );

      if (bookings.length === 0) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      const booking = bookings[0];

      // Check authorization: user owns booking or is admin
      if (req.user.id !== booking.user_id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'You do not have permission to delete this booking' });
      }

      // 30-minute cancellation policy enforcement (skip for admins)
      if (req.user.role !== 'admin') {
        try {
          // Parse the booking date and time to check 30-minute rule
          const dateStr = booking.date;
          const timeSlot = booking.time_slot || '';
          
          // Try to extract start time from timeSlot (e.g. "6:00 PM – 7:00 PM")
          const startTimeMatch = timeSlot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)/i);
          
          let bookingDateTime = null;
          
          if (startTimeMatch) {
            let hour = parseInt(startTimeMatch[1]);
            const minutes = parseInt(startTimeMatch[2]);
            const ampm = startTimeMatch[3].toUpperCase();
            if (ampm === 'PM' && hour !== 12) hour += 12;
            if (ampm === 'AM' && hour === 12) hour = 0;
            
            // Try to parse date - support formats like "9 April 2026" and "2026-04-09"
            const bookingDate = new Date(dateStr);
            if (!isNaN(bookingDate.getTime())) {
              bookingDate.setHours(hour, minutes, 0, 0);
              bookingDateTime = bookingDate.getTime();
            }
          } else if (booking.start_hour !== undefined && booking.start_hour !== null) {
            // Fallback: use start_hour column directly
            const bookingDate = new Date(dateStr);
            if (!isNaN(bookingDate.getTime())) {
              bookingDate.setHours(booking.start_hour, 0, 0, 0);
              bookingDateTime = bookingDate.getTime();
            }
          }

          if (bookingDateTime !== null) {
            const now = Date.now();
            const diffMinutes = (bookingDateTime - now) / 1000 / 60;

            if (diffMinutes < 0) {
              return res.status(403).json({ 
                error: 'This booking has already started or passed and cannot be cancelled.' 
              });
            }

            if (diffMinutes < 30) {
              const minsLeft = Math.ceil(diffMinutes);
              return res.status(403).json({ 
                error: `Cancellation not allowed — your booking starts in ${minsLeft} minute${minsLeft !== 1 ? 's' : ''}. Our policy requires at least 30 minutes notice before the booking start time.`
              });
            }
          }
        } catch (parseErr) {
          // If date parsing fails, log but allow deletion (fail-open for parsing errors only)
          console.warn('Could not parse booking date/time for cancellation policy check:', parseErr.message);
        }
      }

      // Permanently delete the booking record from database
      await conn.execute(
        'DELETE FROM bookings WHERE id = ?',
        [bookingId]
      );

      res.json({ 
        message: 'Booking deleted successfully',
        details: {
          bookingId,
          permanentlyRemoved: true
        }
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('DELETE /api/bookings/:bookingId error:', err);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// POST /api/bookings/bulk-delete — admin only, delete multiple bookings at once
app.post('/api/bookings/bulk-delete', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }
  if (!ids.every(id => typeof id === 'string' && id.length > 0)) {
    return res.status(400).json({ error: 'All ids must be non-empty strings' });
  }
  try {
    const placeholders = ids.map(() => '?').join(', ');
    const [result] = await pool.query(`DELETE FROM bookings WHERE id IN (${placeholders})`, ids);
    res.json({ message: 'Bookings deleted', count: result.affectedRows });
  } catch (err) {
    console.error('POST /api/bookings/bulk-delete error:', err);
    res.status(500).json({ error: 'Failed to delete bookings' });
  }
});

// POST /api/users/bulk-delete — admin only, delete multiple non-admin users and their bookings
app.post('/api/users/bulk-delete', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }
  if (!ids.every(id => typeof id === 'string' && id.length > 0)) {
    return res.status(400).json({ error: 'All ids must be non-empty strings' });
  }
  try {
    const placeholders = ids.map(() => '?').join(', ');
    // Only delete non-admin users
    const [eligibleRows] = await pool.query(
      `SELECT id FROM users WHERE id IN (${placeholders}) AND role != 'admin'`, ids
    );
    const safeIds = eligibleRows.map(u => u.id);
    if (safeIds.length === 0) {
      return res.json({ message: 'No eligible users to delete', count: 0 });
    }
    const safePh = safeIds.map(() => '?').join(', ');
    await pool.query(`DELETE FROM bookings WHERE user_id IN (${safePh})`, safeIds);
    const [result] = await pool.query(`DELETE FROM users WHERE id IN (${safePh})`, safeIds);
    res.json({ message: 'Users deleted', count: result.affectedRows });
  } catch (err) {
    console.error('POST /api/users/bulk-delete error:', err);
    res.status(500).json({ error: 'Failed to delete users' });
  }
});

// POST /api/payments/bulk-approve — admin only, approve multiple pending payments
app.post('/api/payments/bulk-approve', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }
  if (!ids.every(id => typeof id === 'string' && id.length > 0)) {
    return res.status(400).json({ error: 'All ids must be non-empty strings' });
  }
  try {
    const placeholders = ids.map(() => '?').join(', ');
    const [result] = await pool.query(
      `UPDATE bookings SET payment_status='approved', access_code_active=1,
        approved_by_admin_id=?, approved_at=NOW()
       WHERE id IN (${placeholders}) AND payment_status='pending'`,
      [req.user.id, ...ids]
    );
    res.json({ message: 'Payments approved', count: result.affectedRows });
  } catch (err) {
    console.error('POST /api/payments/bulk-approve error:', err);
    res.status(500).json({ error: 'Failed to approve payments' });
  }
});

// POST /api/payments/bulk-reject — admin only, reject multiple pending payments
app.post('/api/payments/bulk-reject', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }
  if (!ids.every(id => typeof id === 'string' && id.length > 0)) {
    return res.status(400).json({ error: 'All ids must be non-empty strings' });
  }
  try {
    const placeholders = ids.map(() => '?').join(', ');
    const [result] = await pool.query(
      `UPDATE bookings SET payment_status='rejected', access_code_active=0
       WHERE id IN (${placeholders}) AND payment_status='pending'`,
      ids
    );
    res.json({ message: 'Payments rejected', count: result.affectedRows });
  } catch (err) {
    console.error('POST /api/payments/bulk-reject error:', err);
    res.status(500).json({ error: 'Failed to reject payments' });
  }
});

// --- IoT Endpoints ---

// GET /api/iot/verify — keypad code verification (rate limited)
app.get('/api/iot/verify', verifyIotDeviceOrAdmin, async (req, res) => {
  const { code } = req.query;

  if (!code) {
    logSecurityEvent('IOT_VERIFY_MISSING_CODE', { ip: req.ip }, 'warning');
    return res.status(400).json({ unlock: false, error: 'Missing code parameter' });
  }

  // Validate code format
  if (!Validators.isValidAccessCode(code)) {
    logSecurityEvent('IOT_VERIFY_INVALID_FORMAT', { code: code.substring(0, 4) + '***', ip: req.ip }, 'warning');
    return res.status(400).json({ unlock: false, error: 'Invalid code format' });
  }

  try {
    const now = new Date();
    const today = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const currentHour = now.getHours();

    // Find booking with this access code for today
    const [bookings] = await pool.query(
    `SELECT id, start_hour, duration FROM bookings 
       WHERE access_code = ? AND date = ? AND status = 'confirmed' AND access_code_active = 1`,
      [code, today]
    );

    if (bookings.length === 0) {
      logSecurityEvent('IOT_VERIFY_NO_BOOKING', { code: code.substring(0, 4) + '***', date: today, ip: req.ip }, 'warning');
      return res.json({ unlock: false, message: 'No valid booking found for this code' });
    }

    const { start_hour, duration } = bookings[0];
    const endHour = start_hour + duration;

    // Check if current time falls within booking window
    const isValidTime = currentHour >= start_hour && currentHour < endHour;

    if (isValidTime) {
      logSecurityEvent('IOT_VERIFY_SUCCESS', { bookingId: bookings[0].id, ip: req.ip }, 'info');
    } else {
      logSecurityEvent('IOT_VERIFY_OUTSIDE_WINDOW', { 
        currentHour, 
        bookingWindow: `${start_hour}-${endHour}`, 
        ip: req.ip 
      }, 'warning');
    }

    res.json({
      unlock: isValidTime,
      message: isValidTime ? 'Access granted' : 'Outside booking time window',
      bookingWindow: `${start_hour}:00 - ${endHour}:00`
    });
  } catch (err) {
    logSecurityEvent('IOT_VERIFY_ERROR', { error: err.message, ip: req.ip }, 'error');
    res.status(500).json({ unlock: false, error: 'Verification failed' });
  }
});

// POST /api/iot/occupancy — receive PIR sensor data
app.post('/api/iot/occupancy', verifyIotDeviceOrAdmin, async (req, res) => {
  const { courtNumber, occupied } = req.body;

  if (courtNumber === undefined || occupied === undefined) {
    return res.status(400).json({ error: 'Missing courtNumber or occupied field' });
  }

  const courtNum = Number(courtNumber);
  if (!Number.isInteger(courtNum) || courtNum < 1 || courtNum > CONFIG.BOOKING.AVAILABLE_COURTS) {
    return res.status(400).json({ error: `Invalid court number. Available courts: 1-${CONFIG.BOOKING.AVAILABLE_COURTS}` });
  }

  try {
    const conn = await pool.getConnection();
    try {
      // Update or insert court status
      await conn.execute(
        `INSERT INTO court_status (court_number, occupied, last_updated)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE occupied = ?, last_updated = NOW()`,
        [courtNum, occupied ? 1 : 0, occupied ? 1 : 0]
      );

      res.json({ 
        message: 'Court status updated',
        courtNumber: courtNum,
        occupied
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('POST /api/iot/occupancy error:', err);
    res.status(500).json({ error: 'Failed to update occupancy' });
  }
});

// GET /api/iot/occupancy
app.get('/api/iot/occupancy', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const [statuses] = await pool.query(
      'SELECT court_number, occupied, last_updated FROM court_status ORDER BY court_number'
    );

    const occupancy = {};
    statuses.forEach(status => {
      occupancy[status.court_number] = status.occupied === 1;
    });

    res.json({ occupancy });
  } catch (err) {
    console.error('GET /api/iot/occupancy error:', err);
    res.status(500).json({ error: 'Failed to fetch occupancy status' });
  }
});

// --- IoT Gate Control ---

// In-memory gate state per court (persists while server is running)
// Court 1: physically connected to ESP32 — ESP32 polls this
// Court 2: UI-only for prototype — no ESP32 connected
let gateStates = {
  1: { locked: true, updatedAt: new Date().toISOString() },
  2: { locked: true, updatedAt: new Date().toISOString() }
};

// POST /api/iot/gate/control — Admin sets gate lock/unlock
app.post('/api/iot/gate/control', verifyToken, verifyAdmin, (req, res) => {
  const { action, courtNumber } = req.body;
  const court = courtNumber || 1;

  if (action !== 'lock' && action !== 'unlock') {
    return res.status(400).json({ error: 'Invalid action. Use "lock" or "unlock".' });
  }

  if (court !== 1 && court !== 2) {
    return res.status(400).json({ error: 'Invalid court number.' });
  }

  gateStates[court] = {
    locked: action === 'lock',
    updatedAt: new Date().toISOString()
  };

  console.log(`[IoT] Court ${court} gate ${action}ed by admin at ${gateStates[court].updatedAt}`);
  res.json({ message: `Court ${court} gate ${action}ed`, gate: gateStates[court] });
});

// GET /api/iot/gate/status — ESP32 polls this (reads Court 1 only)
app.get('/api/iot/gate/status', verifyIotDeviceOrAdmin, (req, res) => {
  const court = parseInt(req.query.court) || 1;
  res.json({ gate: gateStates[court] || gateStates[1] });
});

// POST /api/iot/gate/sync — ESP32 syncs its local gate state to backend (after keypad toggle)
app.post('/api/iot/gate/sync', verifyIotDeviceOrAdmin, (req, res) => {
  const { courtNumber, locked } = req.body;
  const court = courtNumber || 1;

  console.log(`[IoT Sync] Received sync request: court=${court}, locked=${locked}`);

  if (court !== 1 && court !== 2) {
    return res.status(400).json({ error: 'Invalid court number.' });
  }

  if (typeof locked !== 'boolean') {
    return res.status(400).json({ error: 'Missing locked state.' });
  }

  gateStates[court] = {
    locked: locked,
    updatedAt: new Date().toISOString()
  };

  console.log(`[IoT Sync] Court ${court} gate synced to ${locked ? 'LOCKED' : 'UNLOCKED'} at ${gateStates[court].updatedAt}`);
  res.json({ message: `Court ${court} gate synced`, gate: gateStates[court] });
});

// --- Stats / Reports ---

// GET /api/stats/bookings (admin only)
app.get('/api/stats/bookings', verifyToken, verifyAdmin, async (req, res) => {
  try {
    // --- Daily stats (current week: Monday through Sunday) ---
    const [dailyRows] = await pool.query(`
      SELECT 
        DAYNAME(created_at) AS day_name,
        DAYOFWEEK(created_at) AS day_num,
        COUNT(*) AS bookings
      FROM bookings
      WHERE status != 'cancelled'
        AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)
      GROUP BY DAYNAME(created_at), DAYOFWEEK(created_at)
      ORDER BY day_num
    `);

    // Build a complete Mon-Sun array (fill missing days with 0)
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayAbbrev = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dailyStats = dayOrder.map((dayName, i) => {
      const found = dailyRows.find(r => r.day_name === dayName);
      return { day: dayAbbrev[i], bookings: found ? Number(found.bookings) : 0 };
    });

    // --- Weekly stats (current month: Week 1-4/5) ---
    const [weeklyRows] = await pool.query(`
      SELECT 
        CEIL(DAY(created_at) / 7) AS week_num,
        COUNT(*) AS bookings
      FROM bookings
      WHERE status != 'cancelled'
        AND MONTH(created_at) = MONTH(CURDATE())
        AND YEAR(created_at) = YEAR(CURDATE())
      GROUP BY week_num
      ORDER BY week_num
    `);

    // Build Week 1-4 array (fill missing weeks with 0)
    const weeklyStats = [1, 2, 3, 4].map(w => {
      const found = weeklyRows.find(r => Number(r.week_num) === w);
      return { week: `Week ${w}`, bookings: found ? Number(found.bookings) : 0 };
    });

    // --- Summary stats ---
    const totalThisWeek = dailyStats.reduce((s, d) => s + d.bookings, 0);
    const dailyAvg = Math.round(totalThisWeek / 7);
    const peakDay = dailyStats.reduce((max, d) => d.bookings > max.bookings ? d : max, dailyStats[0]);

    // Court utilization: (booked hours this week) / (total available hours this week)
    // Available: 2 courts x 16 hours/day (6AM-10PM) x 7 days = 224 slots
    const [utilizationRows] = await pool.query(`
      SELECT COALESCE(SUM(duration), 0) AS total_hours
      FROM bookings
      WHERE status != 'cancelled'
        AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)
    `);
    const bookedHours = Number(utilizationRows[0].total_hours);
    const totalAvailableHours = 2 * 16 * 7; // 2 courts, 16h/day, 7 days
    const utilization = totalAvailableHours > 0
      ? Math.round((bookedHours / totalAvailableHours) * 100)
      : 0;

    res.json({
      daily: dailyStats,
      weekly: weeklyStats,
      summary: {
        totalThisWeek,
        dailyAvg,
        peakDay: peakDay.day,
        utilization: `${utilization}%`
      }
    });
  } catch (err) {
    console.error('Error fetching booking stats:', err);
    res.status(500).json({ error: 'Failed to fetch booking statistics' });
  }
});

// --- Health Check ---

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Pickleball Booking System API is running',
    database: 'connected',
    environment: CONFIG.NODE_ENV || 'production',
    port: CONFIG.PORT
  });
});

// 404 handler — REMOVED from here, moved to after all routes

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server

// --- Court Pricing endpoints ---

// GET /api/court-pricing (public)
app.get('/api/court-pricing', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT court_number, price_per_hour FROM court_pricing ORDER BY court_number');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/court-pricing error:', err);
    res.status(500).json({ error: 'Failed to fetch court pricing' });
  }
});

// PUT /api/court-pricing (admin only)
app.put('/api/court-pricing', verifyToken, verifyAdmin, async (req, res) => {
  const { courtNumber, pricePerHour } = req.body;
  const courtNum = parseInt(courtNumber);
  const price = parseFloat(pricePerHour);
  if (isNaN(courtNum) || courtNum < 1 || courtNum > 2) {
    return res.status(400).json({ error: 'Invalid court number' });
  }
  if (isNaN(price) || price < 0 || price > 9999) {
    return res.status(400).json({ error: 'Invalid price. Must be between 0 and 9999' });
  }
  try {
    await pool.query(
      `INSERT INTO court_pricing (court_number, price_per_hour) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE price_per_hour = VALUES(price_per_hour), updated_at = CURRENT_TIMESTAMP`,
      [courtNum, price]
    );
    res.json({ message: 'Pricing updated', courtNumber: courtNum, pricePerHour: price });
  } catch (err) {
    console.error('PUT /api/court-pricing error:', err);
    res.status(500).json({ error: 'Failed to update pricing' });
  }
});

// GET /api/payment-settings (public — shown to users in PaymentModal)
app.get('/api/payment-settings', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT setting_key, setting_value FROM payment_settings');
    const settings = {};
    for (const row of rows) settings[row.setting_key] = row.setting_value;
    res.json({
      bankName: settings['bank_name'] || '',
      accountHolderName: settings['account_holder_name'] || '',
      accountNumber: settings['account_number'] || '',
    });
  } catch (err) {
    console.error('GET /api/payment-settings error:', err);
    res.status(500).json({ error: 'Failed to fetch payment settings' });
  }
});

// PUT /api/payment-settings (admin only)
app.put('/api/payment-settings', verifyToken, verifyAdmin, async (req, res) => {
  const { bankName, accountHolderName, accountNumber } = req.body;
  const updates = [
    ['bank_name', (bankName || '').trim()],
    ['account_holder_name', (accountHolderName || '').trim()],
    ['account_number', (accountNumber || '').trim()],
  ];
  try {
    for (const [key, value] of updates) {
      await pool.query(
        `INSERT INTO payment_settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, value]
      );
    }
    res.json({ message: 'Payment settings updated' });
  } catch (err) {
    console.error('PUT /api/payment-settings error:', err);
    res.status(500).json({ error: 'Failed to update payment settings' });
  }
});

// POST /api/bookings/:bookingId/payment — submit payment proof or record cash
app.post('/api/bookings/:bookingId/payment', verifyToken, paymentUpload.single('proof'), async (req, res) => {
  const { bookingId } = req.params;
  const { paymentMethod } = req.body;

  try {
    const [rows] = await pool.query(
      `SELECT * FROM bookings WHERE id = ?`,
      [bookingId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const booking = rows[0];

    // Only allow own booking or admin
    if (req.user.role !== 'admin' && req.user.id !== booking.user_id) {
      return res.status(403).json({ error: 'Not authorised to submit payment for this booking' });
    }

    if (paymentMethod === 'cash') {
      // Cash: admin only, auto-approve
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Cash payment can only be recorded by an admin' });
      }
      await pool.query(
        `UPDATE bookings SET payment_status='approved', payment_method='cash',
          access_code_active=1, approved_by_admin_id=?, approved_at=NOW(),
          payment_submitted_at=NOW()
         WHERE id=?`,
        [req.user.id, bookingId]
      );
      return res.json({ message: 'Cash payment recorded', paymentStatus: 'approved' });
    }

    // QR: requires proof file
    if (!req.file) {
      return res.status(400).json({ error: 'Payment proof file is required for QR payment' });
    }

    if (!(await validateUploadedPaymentProof(req.file))) {
      return rejectInvalidPaymentProof(req.file, res);
    }

    // Fetch court pricing
    const [pricing] = await pool.query('SELECT price_per_hour FROM court_pricing WHERE court_number = ?', [booking.court_number]);
    const pricePerHour = pricing.length > 0 ? parseFloat(pricing[0].price_per_hour) : 8.00;
    const totalAmount = pricePerHour * booking.duration;

    await pool.query(
      `UPDATE bookings SET payment_status='pending', payment_method='qr',
        payment_proof_path=?, payment_submitted_at=NOW(),
        total_amount=?, price_per_hour=?
       WHERE id=?`,
      [req.file.filename, totalAmount, pricePerHour, bookingId]
    );
    return res.json({ message: 'Payment proof submitted', paymentStatus: 'pending' });

  } catch (err) {
    console.error('POST /api/bookings/:id/payment error:', err);
    // Clean up uploaded file if DB update failed
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    res.status(500).json({ error: 'Failed to submit payment' });
  }
});

// GET /api/payments (admin) — all bookings with payment info, pending first
app.get('/api/payments', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.id, COALESCE(u.name, b.user_name) AS user_name,
              COALESCE(u.email, b.user_email) AS user_email,
              b.date, b.time_slot, b.court_number, b.duration,
              b.payment_status, b.payment_method, b.payment_proof_path,
              b.total_amount, b.payment_submitted_at, b.approved_at,
              b.access_code_active,
              IF(b.access_code_active = 1, b.access_code, NULL) AS access_code,
              adm.name AS approver_name
       FROM bookings b
       LEFT JOIN users u ON b.user_id = u.id
       LEFT JOIN users adm ON b.approved_by_admin_id = adm.id
       WHERE b.payment_status IS NOT NULL
       ORDER BY FIELD(b.payment_status,'pending','approved','rejected'), b.payment_submitted_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/payments error:', err);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// PUT /api/payments/:bookingId/approve (admin)
app.put('/api/payments/:bookingId/approve', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE bookings SET payment_status='approved', access_code_active=1,
        approved_by_admin_id=?, approved_at=NOW()
       WHERE id=?`,
      [req.user.id, req.params.bookingId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    // Fetch booking details for email simulation
    const [rows] = await pool.query(
      `SELECT COALESCE(u.name, b.user_name) AS user_name,
              COALESCE(u.email, b.user_email) AS user_email,
              b.access_code, b.date, b.time_slot, b.court_number, b.user_id
       FROM bookings b LEFT JOIN users u ON b.user_id = u.id WHERE b.id = ?`,
      [req.params.bookingId]
    );
    const info = rows[0] || {};
    res.json({
      message: 'Payment approved',
      bookingId: req.params.bookingId,
      accessCode: info.access_code,
      userEmail: info.user_email,
      userName: info.user_name,
      isGuest: !info.user_id,
      emailSimulation: {
        sent: true,
        to: info.user_email,
        subject: 'Pickleball Booking – Payment Approved & Access Code',
        body: `Hi ${info.user_name}, your payment has been approved. Your access code is: ${info.access_code}. Valid on ${info.date} during ${info.time_slot} at Court ${info.court_number}.`
      }
    });
  } catch (err) {
    console.error('PUT /api/payments/:id/approve error:', err);
    res.status(500).json({ error: 'Failed to approve payment' });
  }
});

// PUT /api/payments/:bookingId/reject (admin)
app.put('/api/payments/:bookingId/reject', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const note = (req.body.note || '').trim();
    const [result] = await pool.query(
      `UPDATE bookings SET payment_status='rejected', access_code_active=0, rejection_note=? WHERE id=?`,
      [note || null, req.params.bookingId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const [rows] = await pool.query(
      `SELECT COALESCE(u.name, b.user_name) AS user_name,
              COALESCE(u.email, b.user_email) AS user_email, b.user_id
       FROM bookings b LEFT JOIN users u ON b.user_id = u.id WHERE b.id = ?`,
      [req.params.bookingId]
    );
    const info = rows[0] || {};
    res.json({
      message: 'Payment rejected',
      bookingId: req.params.bookingId,
      userEmail: info.user_email,
      userName: info.user_name,
      isGuest: !info.user_id,
      emailSimulation: {
        sent: true,
        to: info.user_email,
        subject: 'Pickleball Booking – Payment Rejected',
        body: `Hi ${info.user_name}, your payment proof was rejected. Please re-upload a valid payment screenshot.`
      }
    });
  } catch (err) {
    console.error('PUT /api/payments/:id/reject error:', err);
    res.status(500).json({ error: 'Failed to reject payment' });
  }
});

// 404 handler — must be after all routes
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, async () => {
  // Auto-migrate: add booked_by column if it doesn't exist
  try {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'booked_by'`
    );
    if (cols.length === 0) {
      await pool.query(`ALTER TABLE bookings ADD COLUMN booked_by VARCHAR(100) DEFAULT NULL AFTER court_number`);
      console.log('  ✓ Migration: added booked_by column to bookings table');
    }
  } catch (err) {
    console.warn('  ⚠ Migration warning (booked_by column):', err.message);
  }

  // Auto-migrate: payment columns
  const paymentCols = [
    `ADD COLUMN IF NOT EXISTS payment_status ENUM('pending','approved','rejected') DEFAULT 'pending' AFTER booked_by`,
    `ADD COLUMN IF NOT EXISTS payment_method ENUM('qr','cash') DEFAULT 'qr' AFTER payment_status`,
    `ADD COLUMN IF NOT EXISTS payment_proof_path TEXT AFTER payment_method`,
    `ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2) AFTER payment_proof_path`,
    `ADD COLUMN IF NOT EXISTS price_per_hour DECIMAL(10,2) AFTER total_amount`,
    `ADD COLUMN IF NOT EXISTS payment_submitted_at DATETIME AFTER price_per_hour`,
    `ADD COLUMN IF NOT EXISTS approved_by_admin_id VARCHAR(50) AFTER payment_submitted_at`,
    `ADD COLUMN IF NOT EXISTS approved_at DATETIME AFTER approved_by_admin_id`,
    `ADD COLUMN IF NOT EXISTS access_code_active TINYINT(1) DEFAULT 0 AFTER approved_at`,
    `ADD COLUMN IF NOT EXISTS rejection_note TEXT AFTER access_code_active`,
  ];
  for (const colDef of paymentCols) {
    try {
      await pool.query(`ALTER TABLE bookings ${colDef}`);
    } catch (err) {
      if (!err.message.includes('Duplicate column')) {
        console.warn('  ⚠ Migration warning (payment column):', err.message);
      }
    }
  }

  // Grandfather existing confirmed bookings: mark as approved + active
  try {
    await pool.query(
      `UPDATE bookings SET payment_status='approved', access_code_active=1
       WHERE status='confirmed' AND access_code_active=0 AND payment_status='pending' AND payment_submitted_at IS NULL`
    );
    console.log('  ✓ Migration: grandfathered legacy confirmed bookings as approved');
  } catch (err) {
    console.warn('  ⚠ Migration warning (grandfather):', err.message);
  }

  // Auto-migrate: court_pricing table
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS court_pricing (
        court_number INT PRIMARY KEY,
        price_per_hour DECIMAL(10,2) DEFAULT 8.00,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`
    );
    await pool.query(
      `INSERT IGNORE INTO court_pricing (court_number, price_per_hour) VALUES (1, 8.00), (2, 8.00)`
    );
    console.log('  ✓ Migration: court_pricing table ready');
  } catch (err) {
    console.warn('  ⚠ Migration warning (court_pricing):', err.message);
  }

  // Auto-migrate: payment_settings table
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS payment_settings (
        setting_key VARCHAR(100) PRIMARY KEY,
        setting_value TEXT NOT NULL DEFAULT ''
      )`
    );
    // Insert defaults if not present
    await pool.query(
      `INSERT IGNORE INTO payment_settings (setting_key, setting_value) VALUES
        ('bank_name', ''),
        ('account_holder_name', ''),
        ('account_number', '')`
    );
    console.log('  ✓ Migration: payment_settings table ready');
  } catch (err) {
    console.warn('  ⚠ Migration warning (payment_settings):', err.message);
  }

  console.log(`
╔════════════════════════════════════════════════════════════╗
║   Pickleball Booking System - Backend Server               ║
╚════════════════════════════════════════════════════════════╝
  
  🎾 Server running at http://localhost:${PORT}
  📊 Database: pickleball_db (XAMPP MySQL)
  🌐 CORS enabled for http://localhost:5173 (Vite frontend)
  
  ✓ Health check: http://localhost:${PORT}/api/health
  ✓ API ready for bookings, users, and IoT endpoints
  
  To stop: Press Ctrl+C
  `);
});

// Graceful shutdown
const shutdown = () => {
  console.log('\nShutting down gracefully...');
  rateLimiter.destroy();
  pool.end().then(() => {
    console.log('Database pool closed.');
    process.exit(0);
  }).catch(() => process.exit(1));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
