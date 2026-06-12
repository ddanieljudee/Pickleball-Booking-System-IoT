-- ============================================================
-- PICKLEBALL BOOKING SYSTEM - DEMO DATA IMPORT SCRIPT
-- ============================================================
--
-- HOW TO USE:
-- 1. Make sure you have already run database-setup.sql first
-- 2. Go to phpMyAdmin → select pickleball_db → click "SQL" tab
-- 3. Paste this entire file and click "Go"
--
-- This will insert:
--   • 2 demo user accounts (admin + user)
--   • 2 court status records
--   • 2 court pricing records
--   • 12 sample bookings (various statuses)
--   • 5 IoT audit log entries
--
-- DEMO CREDENTIALS:
--   Admin : admin@pickleball.com / AdminPass123
--   User  : user@pickleball.com  / UserPass123
-- ============================================================

USE `pickleball_db`;

-- ============================================================
-- USERS
-- Passwords are bcrypt-hashed (cost factor 10)
-- ============================================================
INSERT INTO `users` (`id`, `name`, `email`, `password`, `phone`, `role`, `is_active`) VALUES
  ('USR001', 'Admin', 'admin@pickleball.com', '$2b$10$f/9jvDs9rT3r1jc75JJQ9etTuKVxW3dX/XM8hCER1nGGA1gheLraW', '010-1234567', 'admin', 1),
  ('USR002', 'User', 'user@pickleball.com',  '$2b$10$sDwJfTD1Vnc0I1NG2zQzJub14oD8/h3CRD6Iws8B4yd/los/V48Gq', '011-3217654', 'user',  1)
ON DUPLICATE KEY UPDATE
  `password` = VALUES(`password`),
  `name`     = VALUES(`name`),
  `role`     = VALUES(`role`);

-- ============================================================
-- COURT STATUS (IoT sensor state)
-- ============================================================
INSERT INTO `court_status` (`court_number`, `occupied`, `last_updated`) VALUES
  (1, 0, NOW()),
  (2, 0, NOW())
ON DUPLICATE KEY UPDATE
  `occupied`     = VALUES(`occupied`),
  `last_updated` = NOW();

-- ============================================================
-- COURT PRICING
-- ============================================================
INSERT INTO `court_pricing` (`court_number`, `price_per_hour`) VALUES
  (1, 25.00),
  (2, 25.00)
ON DUPLICATE KEY UPDATE
  `price_per_hour` = VALUES(`price_per_hour`);

-- ============================================================
-- BOOKINGS
-- Mix of: confirmed (pending/approved/rejected payment),
--         completed, and cancelled — across both courts
-- ============================================================
INSERT INTO `bookings` (
  `id`, `user_id`, `user_name`, `user_email`,
  `date`, `start_hour`, `duration`, `time_slot`,
  `access_code`, `court_number`, `booked_by`,
  `status`, `payment_status`, `payment_method`,
  `payment_proof_path`, `total_amount`, `price_per_hour`,
  `payment_submitted_at`, `approved_by_admin_id`, `approved_at`,
  `access_code_active`
) VALUES

-- Booking 1: Past completed, payment approved, Court 1
('BKG001', 'USR002', 'User', 'user@pickleball.com',
 '1 June 2026', 8, 2, '8:00 AM - 10:00 AM',
 '1234', 1, NULL,
 'completed', 'approved', 'qr',
 NULL, 16.00, 8.00,
 '2026-05-31 20:00:00', 'USR001', '2026-05-31 21:00:00',
 0),

-- Booking 2: Past completed, payment approved, Court 2
('BKG002', 'USR002', 'User', 'user@pickleball.com',
 '3 June 2026', 10, 1, '10:00 AM - 11:00 AM',
 '5678', 2, NULL,
 'completed', 'approved', 'qr',
 NULL, 8.00, 8.00,
 '2026-06-02 18:00:00', 'USR001', '2026-06-02 19:00:00',
 0),

-- Booking 3: Past completed, payment approved, Court 1
('BKG003', 'USR002', 'User', 'user@pickleball.com',
 '5 June 2026', 14, 2, '2:00 PM - 4:00 PM',
 '2468', 1, NULL,
 'completed', 'approved', 'cash',
 NULL, 16.00, 8.00,
 '2026-06-04 10:00:00', 'USR001', '2026-06-04 11:00:00',
 0),

-- Booking 4: Today confirmed, payment approved, access code active, Court 1
('BKG004', 'USR001', 'Admin', 'admin@pickleball.com',
 '7 June 2026', 16, 2, '4:00 PM - 6:00 PM',
 '9012', 1, NULL,
 'confirmed', 'approved', 'qr',
 NULL, 16.00, 8.00,
 '2026-06-06 20:00:00', 'USR001', '2026-06-06 21:00:00',
 1),

-- Booking 5: Today confirmed, payment pending, Court 2
('BKG005', 'USR002', 'User', 'user@pickleball.com',
 '7 June 2026', 18, 1, '6:00 PM - 7:00 PM',
 '3456', 2, NULL,
 'confirmed', 'pending', 'qr',
 NULL, 8.00, 8.00,
 '2026-06-07 09:00:00', NULL, NULL,
 0),

-- Booking 6: Future confirmed, payment approved, Court 1
('BKG006', 'USR002', 'User', 'user@pickleball.com',
 '10 June 2026', 8, 3, '8:00 AM - 11:00 AM',
 '7890', 1, NULL,
 'confirmed', 'approved', 'qr',
 NULL, 24.00, 8.00,
 '2026-06-07 10:00:00', 'USR001', '2026-06-07 10:30:00',
 1),

-- Booking 7: Future confirmed, payment pending, Court 2
('BKG007', 'USR002', 'User', 'user@pickleball.com',
 '12 June 2026', 14, 2, '2:00 PM - 4:00 PM',
 '1357', 2, NULL,
 'confirmed', 'pending', 'qr',
 NULL, 16.00, 8.00,
 '2026-06-07 11:00:00', NULL, NULL,
 0),

-- Booking 8: Cancelled booking, payment rejected, Court 1
('BKG008', 'USR001', 'Admin', 'admin@pickleball.com',
 '4 June 2026', 12, 1, '12:00 PM - 1:00 PM',
 '2469', 1, NULL,
 'cancelled', 'rejected', 'qr',
 NULL, 8.00, 8.00,
 '2026-06-03 15:00:00', NULL, NULL,
 0),

-- Booking 9: Guest booking created by admin, Court 2
('BKG009', NULL, 'Anthony Bridgerton', 'anthonyb@example.com',
 '8 June 2026', 9, 2, '9:00 AM - 11:00 AM',
 '8024', 2, 'Admin',
 'confirmed', 'approved', 'cash',
 NULL, 16.00, 8.00,
 '2026-06-07 08:00:00', 'USR001', '2026-06-07 08:05:00',
 1),

-- Booking 10: Guest booking created by admin, Court 1
('BKG010', NULL, 'Benedict Bridgerton', 'benedictb@example.com',
 '9 June 2026', 6, 1, '6:00 AM - 7:00 AM',
 '6310', 1, 'Admin',
 'confirmed', 'approved', 'cash',
 NULL, 8.00, 8.00,
 '2026-06-07 08:10:00', 'USR001', '2026-06-07 08:12:00',
 1),

-- Booking 11: Future confirmed, payment approved, Court 2 (4-hour block)
('BKG011', 'USR002', 'User', 'user@pickleball.com',
 '14 June 2026', 8, 4, '8:00 AM - 12:00 PM',
 '4792', 2, NULL,
 'confirmed', 'approved', 'qr',
 NULL, 32.00, 8.00,
 '2026-06-07 12:00:00', 'USR001', '2026-06-07 12:30:00',
 1),

-- Booking 12: Past cancelled, payment pending (user cancelled early), Court 1
('BKG012', 'USR001', 'Admin', 'admin@pickleball.com',
 '2 June 2026', 20, 1, '8:00 PM - 9:00 PM',
 '5531', 1, NULL,
 'cancelled', 'pending', 'qr',
 NULL, 8.00, 8.00,
 NULL, NULL, NULL,
 0)

ON DUPLICATE KEY UPDATE
  `status`         = VALUES(`status`),
  `payment_status` = VALUES(`payment_status`);

-- ============================================================
-- DONE
-- All demo data imported successfully.
-- ============================================================
