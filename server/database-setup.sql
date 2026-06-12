-- ============================================================
-- PICKLEBALL BOOKING SYSTEM - DATABASE SETUP SCRIPT
-- For: XAMPP MySQL (phpMyAdmin)
-- ============================================================
-- 
-- HOW TO USE:
-- 1. Open XAMPP Control Panel and start Apache + MySQL
-- 2. Go to http://localhost/phpmyadmin
-- 3. Click "SQL" tab
-- 4. Copy and paste the entire contents of this file
-- 5. Click "Go" to execute
--
-- ============================================================

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS `pickleball_db`;
USE `pickleball_db`;

-- ============================================================
-- TABLE: users
-- Stores all user accounts (admin, regular users)
-- ============================================================
CREATE TABLE `users` (
  `id` VARCHAR(50) PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(20),
  `role` ENUM('admin', 'user', 'staff') DEFAULT 'user',
  `is_active` BOOLEAN DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_email` (`email`),
  INDEX `idx_role` (`role`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: bookings
-- Stores court booking records with multi-hour support
-- ============================================================
CREATE TABLE `bookings` (
  `id` VARCHAR(50) PRIMARY KEY,
  `user_id` VARCHAR(50),
  `user_name` VARCHAR(100) NOT NULL,
  `user_email` VARCHAR(100) NOT NULL,
  `date` VARCHAR(50) NOT NULL COMMENT 'Format: "10 May 2026"',
  `start_hour` INT NOT NULL COMMENT 'Hour when booking starts (0-23)',
  `duration` INT NOT NULL COMMENT 'Number of hours booked (1-16)',
  `time_slot` VARCHAR(100) NOT NULL COMMENT 'Display format: "6:00 AM - 9:00 AM"',
  `access_code` VARCHAR(10) NOT NULL UNIQUE,
  `court_number` INT NOT NULL,
  `booked_by` VARCHAR(100) DEFAULT NULL COMMENT 'Admin name if booked by admin on behalf of guest',
  `status` ENUM('confirmed', 'cancelled', 'completed') DEFAULT 'confirmed',
  -- Payment verification fields
  `payment_status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `payment_method` ENUM('qr', 'cash') NOT NULL DEFAULT 'qr',
  `payment_proof_path` TEXT DEFAULT NULL COMMENT 'Relative path to uploaded proof image',
  `total_amount` DECIMAL(10,2) DEFAULT 0.00,
  `price_per_hour` DECIMAL(10,2) DEFAULT 8.00,
  `payment_submitted_at` DATETIME DEFAULT NULL,
  `approved_by_admin_id` VARCHAR(50) DEFAULT NULL,
  `approved_at` DATETIME DEFAULT NULL,
  `access_code_active` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = active (payment approved), 0 = inactive',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_date_court` (`date`, `court_number`),
  INDEX `idx_status` (`status`),
  INDEX `idx_payment_status` (`payment_status`),
  INDEX `idx_access_code` (`access_code`),
  INDEX `idx_start_hour` (`start_hour`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: court_status
-- Tracks real-time occupancy from IoT PIR sensors
-- ============================================================
CREATE TABLE `court_status` (
  `court_number` INT PRIMARY KEY,
  `occupied` BOOLEAN DEFAULT 0 COMMENT '1 = occupied, 0 = empty',
  `last_updated` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_occupied` (`occupied`),
  INDEX `idx_last_updated` (`last_updated`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- NOTE: Demo users will be seeded by seed-demo-data.js 
-- This properly hashes passwords using bcrypt
-- Run: node seed-demo-data.js AFTER this setup script
-- ============================================================

-- ============================================================
-- TABLE: court_pricing
-- Stores per-court hourly pricing (admin configurable)
-- ============================================================
CREATE TABLE IF NOT EXISTS `court_pricing` (
  `court_number` INT PRIMARY KEY,
  `price_per_hour` DECIMAL(10,2) NOT NULL DEFAULT 8.00,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default pricing for 2 courts
INSERT INTO `court_pricing` (`court_number`, `price_per_hour`) VALUES
  (1, 8.00),
  (2, 8.00)
ON DUPLICATE KEY UPDATE `price_per_hour` = VALUES(`price_per_hour`);

-- ============================================================
-- SAMPLE DATA: Court status (2 courts)
-- ============================================================
INSERT INTO `court_status` (`court_number`, `occupied`, `last_updated`)
VALUES 
  (1, 0, NOW()),
  (2, 0, NOW());
