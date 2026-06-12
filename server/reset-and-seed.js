/**
 * ============================================================
 * DATABASE RESET & SEED SCRIPT
 * ============================================================
 * Clears all data from the database and re-seeds demo users.
 * Useful for development and testing.
 * 
 * Usage:
 *   node reset-and-seed.js
 * ============================================================
 */

import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pickleball_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function resetAndSeed() {
  const conn = await pool.getConnection();

  try {
    console.log('🗑️  Clearing all data...');

    await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
    await conn.execute('DELETE FROM bookings');
    await conn.execute('DELETE FROM court_status');
    await conn.execute('DELETE FROM users');
    await conn.execute('SET FOREIGN_KEY_CHECKS = 1');

    console.log('   ✓ All tables cleared');

    // Re-seed court_status
    await conn.execute(
      'INSERT INTO court_status (court_number, occupied, last_updated) VALUES (1, FALSE, NOW()), (2, FALSE, NOW()) ON DUPLICATE KEY UPDATE occupied = FALSE'
    );
    console.log('   ✓ Court status reset');

    // Seed demo users
    const demoUsers = [
      { id: 'USR001', name: 'Admin', email: 'admin@pickleball.com', password: 'AdminPass123', phone: '555-0001', role: 'admin' },
      { id: 'USR002', name: 'User', email: 'user@pickleball.com', password: 'UserPass123', phone: '555-0002', role: 'user' }
    ];

    console.log('\n🔐 Hashing passwords & seeding users...');
    for (const user of demoUsers) {
      const hashed = await bcrypt.hash(user.password, 10);
      await conn.execute(
        'INSERT INTO users (id, name, email, password, phone, role) VALUES (?, ?, ?, ?, ?, ?)',
        [user.id, user.name, user.email, hashed, user.phone, user.role]
      );
      console.log(`   ✓ ${user.role}: ${user.email}`);
    }

    console.log('\n✅ Database reset and seeded successfully!\n');
    console.log('Demo Credentials:');
    console.log('  Admin:  admin@pickleball.com / AdminPass123');
    console.log('  User:   user@pickleball.com / UserPass123\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    conn.release();
    pool.end();
  }
}

resetAndSeed();
