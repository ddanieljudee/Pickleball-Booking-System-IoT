# Pickleball Booking System Integration with Internet of Things (IoT)

A full-stack web application with IoT integration for managing pickleball court reservations.

Users can book courts online and receive a unique 4-digit access code, which is used at the physical court gate via an ESP32-based keypad system to grant entry.

This project was developed as a Final Year Project (FYP), demonstrating full-stack development, authentication systems, real-time booking logic, and IoT hardware integration.

---

## 📌 Features

### User Features
- Court booking with date, time slot, duration, and court selection  
- Unique 4-digit access code for gate entry  
- View booking history and status  
- Upload payment proof (QR / cash)  
- Cancel bookings (30-minute cancellation policy)  

### Admin Features
- Admin dashboard for managing bookings, users, and payments  
- Approve / reject payments (including bulk actions)  
- Guest booking support (walk-in customers)  
- Create additional admin accounts  
- Configure hourly court pricing  
- View booking analytics (daily & weekly charts)  
- Real-time court occupancy tracking  

### Authentication & Security
- JWT-based authentication  
- Password hashing using bcrypt  
- Role-based access control (User / Admin)  
- Secure account deletion with confirmation flow  

### IoT Integration
- ESP32-based gate controller  
- 3×4 matrix keypad for code entry  
- SG90 servo motor for gate unlocking  
- HC-SR501 PIR sensor for occupancy detection  
- API-based access code verification  

---

## 🧰 Tech Stack

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Recharts, Sonner  
**Backend:** Node.js, Express.js, MySQL2, bcrypt, jsonwebtoken  
**Database:** MySQL (XAMPP)  
**IoT Hardware:** ESP32, 3×4 keypad, SG90 servo motor, HC-SR501 PIR sensor  

---

## 📁 Project Structure

```
pickleball-booking-system/
│
├── src/                          # Frontend (React + TypeScript)
│   ├── app/
│   │   ├── components/           # UI components (Admin, User, Modals)
│   │   ├── data/                # Mock data & helpers
│   │   ├── styles/              # CSS / Tailwind styles
│   │   └── __tests__/           # Frontend unit & integration tests
│   │
│   ├── main.tsx                 # App entry point
│   └── index.html
│
├── server/                      # Backend (Node.js + Express)
│   ├── server.js                # Main API server
│   ├── config.js                # Configuration settings
│   ├── security.js              # Auth, validation, rate limiting
│   │
│   ├── database-setup.sql       # Database schema
│   ├── demo-data.sql            # Sample data for testing
│   ├── seed-demo-data.js        # Seeder script
│   └── reset-and-seed.js        # Dev utility script
│
├── firmware/                    # IoT (ESP32)
│   └── pickleball_gate_controller.ino
│
├── INSTALLATION.md              # Full setup guide
├── README.md                    # Project overview
└── package.json                 # Frontend dependencies
```

---

📌 Full setup instructions:

👉 [Installation Guide](INSTALLATION.pdf)

---

## 👤 Demo Accounts

| Role  | Email                 | Password      |
|-------|-----------------------|---------------|
| Admin | admin@pickleball.com  | AdminPass123  |
| User  | user@pickleball.com   | UserPass123   |

---

## ⚙️ System Workflow

1. User books a court (date, time, duration, court selection)  
2. System checks availability and generates a unique 4-digit access code  
3. User receives the access code after successful booking  
4. At the court gate, user enters the code using the ESP32 keypad  
5. ESP32 sends a verification request to the backend API  
6. If the code is valid and within the booking time, the servo motor unlocks the gate  
7. PIR sensor detects occupancy and updates the admin dashboard  

---

## 📄 License

This project was developed as part of a Final Year Project (FYP).

Copyright © 2026  
Pickleball Booking System Integration with Internet of Things (IoT)  
All rights reserved.
