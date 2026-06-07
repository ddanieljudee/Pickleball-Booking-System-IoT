// Security helpers — rate limiting, input validation, access codes

// Generate a random 4-digit access code (0000-9999)
export function generateAccessCode() {
  // Generate random 4-digit number: 0000 to 9999
  const randomNumber = Math.floor(Math.random() * 10000);
  // Pad with zeros to ensure exactly 4 digits (e.g., 5 becomes 0005)
  return randomNumber.toString().padStart(4, '0');
}

// In-memory rate limiter
class RateLimiter {
  constructor() {
    this.store = new Map(); // key -> { count, resetTime }
    this.windowMs = 15 * 60 * 1000; // 15 minute window
    this.maxRequests = 100; // Max 100 requests per window
    
    // Cleanup expired entries every 5 minutes
    this._cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  destroy() {
    clearInterval(this._cleanupInterval);
  }

  check(key, limit = this.maxRequests) {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetTime) {
      // First request or window expired
      this.store.set(key, { count: 1, resetTime: now + this.windowMs });
      return { allowed: true, remaining: limit - 1, resetTime: now + this.windowMs };
    }

    if (entry.count >= limit) {
      // Rate limit exceeded
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime,
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      };
    }

    entry.count++;
    return { allowed: true, remaining: limit - entry.count, resetTime: entry.resetTime };
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  reset(key) {
    this.store.delete(key);
  }
}

export const rateLimiter = new RateLimiter();

// Rate limiting middleware
export function rateLimit(maxRequests = 100, windowMs = 15 * 60 * 1000) {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress || 'unknown';
    const result = rateLimiter.check(key, maxRequests);

    // Set response headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

    if (!result.allowed) {
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        message: `Rate limit exceeded. Reset in ${result.retryAfter} seconds.`,
        retryAfter: result.retryAfter,
      });
    }

    next();
  };
}

// Input validators
export const Validators = {
  isValidEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email) && email.length <= 100;
  },

  isValidPassword(password) {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return regex.test(password);
  },

  isValidPhone(phone) {
    const regex = /^[\d\-\s\+\(\)]{10,}$/;
    return regex.test(phone.replace(/\s/g, ''));
  },

  isValidAccessCode(code) {
    const regex = /^\d{4}$/;
    return regex.test(code);
  },

  isValidDate(dateStr) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const parts = dateStr.trim().split(' ');
    
    if (parts.length !== 3) return false;
    
    const day = parseInt(parts[0]);
    const month = parts[1];
    const year = parseInt(parts[2]);
    
    if (isNaN(day) || isNaN(year)) return false;
    if (day < 1 || day > 31) return false;
    if (!months.includes(month)) return false;
    if (year < new Date().getFullYear()) return false;
    
    return true;
  },

  isValidHour(hour) {
    return Number.isInteger(hour) && hour >= 0 && hour <= 23;
  },

  isValidDuration(duration) {
    return Number.isInteger(duration) && duration >= 1 && duration <= 4;
  },

  isValidCourt(courtNumber) {
    return Number.isInteger(courtNumber) && courtNumber >= 1 && courtNumber <= 2;
  },
};

// Sanitization
export const Sanitizers = {
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input
      .replace(/[<>]/g, '') // Only strip angle brackets (XSS vectors)
      .trim()
      .substring(0, 255); // Limit length
  },

  sanitizeEmail(email) {
    return email.toLowerCase().trim().substring(0, 100);
  },
};

// Security event logging (redacts sensitive fields)
export function logSecurityEvent(eventType, details, severity = 'info') {
  const timestamp = new Date().toISOString();
  const safeDetails = {
    ...details,
    // Never log passwords, tokens, etc
    password: details.password ? '***REDACTED***' : undefined,
    token: details.token ? '***REDACTED***' : undefined,
  };

  console.log(`[${severity.toUpperCase()}] [${timestamp}] ${eventType}`, safeDetails);


}
