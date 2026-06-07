/**
 * ============================================================
 * DEMO DATA SEEDING SCRIPT FOR PICKLEBALL BOOKING SYSTEM
 * ============================================================
 * This script properly hashes demo credentials and inserts them
 * into the database. Run this AFTER database-setup.sql
 * 
 * USER ID GENERATION:
 * - Demo users are assigned sequential IDs: USR001, USR002
 * - New users registered via API will automatically get USR003, USR004, etc.
 * - The backend uses database transaction for concurrency-safe ID generation
 * - All future user registrations will continue from the highest existing ID
 * 
 * Usage:
 *   node seed-demo-data.js
 * 
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

/**
 * Hash a password using bcrypt
 */
async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

/**
 * Seed demo users with properly hashed passwords
 */
async function seedDemoUsers() {
  const conn = await pool.getConnection();
  
  try {
    // Demo user credentials with new password requirements met
    const demoUsers = [
      {
        id: 'USR001',
        name: 'Admin',
        email: 'admin@pickleball.com',
        password: 'AdminPass123',
        phone: '555-0001',
        role: 'admin'
      },
      {
        id: 'USR002',
        name: 'User',
        email: 'user@pickleball.com',
        password: 'UserPass123',
        phone: '555-0002',
        role: 'user'
      }
    ];

    console.log('🔐 Hashing demo passwords...');
    for (const user of demoUsers) {
      user.hashedPassword = await hashPassword(user.password);
    }

    console.log('💾 Seeding demo users into database...');
    for (const user of demoUsers) {
      try {
        await conn.execute(
          'INSERT INTO users (id, name, email, password, phone, role) VALUES (?, ?, ?, ?, ?, ?)',
          [user.id, user.name, user.email, user.hashedPassword, user.phone, user.role]
        );
        console.log(`  ✓ Created ${user.role}: ${user.email}`);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          console.log(`  ⚠ User already exists: ${user.email} (updating password)`);
          await conn.execute(
            'UPDATE users SET password = ? WHERE email = ?',
            [user.hashedPassword, user.email]
          );
        } else {
          throw err;
        }
      }
    }

    console.log('\n✅ Demo users seeded successfully!\n');
    console.log('Demo Credentials:');
    console.log('  Admin:  admin@pickleball.com / AdminPass123');
    console.log('  User:   user@pickleball.com / UserPass123');
    console.log('\n');

  } catch (err) {
    console.error('❌ Error seeding demo users:', err.message);
    process.exit(1);
  } finally {
    conn.release();
    pool.end();
  }
}

// Run the seed script
seedDemoUsers();
