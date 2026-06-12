// Types and utility functions used across the app

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: "admin" | "user" | "guest";
  createdAt: string;
}

export interface Booking {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  date: string;
  timeSlot: string;
  duration?: number;
  accessCode: string;
  status: "confirmed" | "cancelled" | "completed";
  courtNumber: number;
  createdAt: string;
  bookedByAdmin?: string;
  // Payment verification fields
  paymentStatus?: "pending" | "approved" | "rejected";
  paymentMethod?: "qr" | "cash";
  paymentProofPath?: string;
  paymentRejectionNote?: string;
  totalAmount?: number;
  pricePerHour?: number;
  paymentSubmittedAt?: string;
  approvedAt?: string;
  accessCodeActive?: boolean;
}

// Available Time Slots
export const TIME_SLOTS: string[] = [
  "6:00 AM – 7:00 AM",
  "7:00 AM – 8:00 AM",
  "8:00 AM – 9:00 AM",
  "9:00 AM – 10:00 AM",
  "10:00 AM – 11:00 AM",
  "11:00 AM – 12:00 PM",
  "12:00 PM – 1:00 PM",
  "1:00 PM – 2:00 PM",
  "2:00 PM – 3:00 PM",
  "3:00 PM – 4:00 PM",
  "4:00 PM – 5:00 PM",
  "5:00 PM – 6:00 PM",
  "6:00 PM – 7:00 PM",
  "7:00 PM – 8:00 PM",
  "8:00 PM – 9:00 PM",
  "9:00 PM – 10:00 PM",
];

// Generate a unique 4-digit access code
export function generateAccessCode(existingCodes: string[]): string {
  let code: string;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (existingCodes.includes(code));
  return code;
}

// Format date to display format (long form: "9 May 2026")
export function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Format YYYY-MM-DD → DD/MM/YYYY for table cells and compact displays
export function fmtDate(dateStr: string): string {
  if (!dateStr) return "—";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

// --- Time slot parsing helpers ---

// Parse start hour from time slot ("6:00 AM – 7:00 AM" → 6, "2:00 PM – 3:00 PM" → 14)
export function parseTimeSlotToStartHour(timeSlot: string): number | null {
  const match = timeSlot.match(/(\d+):00\s+(AM|PM)/i);
  if (!match) return null;
  
  let hour = parseInt(match[1]);
  const period = match[2].toUpperCase();
  
  // Convert to 24-hour format
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  
  return hour;
}

// Parse end hour from time slot
export function parseTimeSlotToEndHour(timeSlot: string): number | null {
  // Split by em dash or regular dash
  const parts = timeSlot.split(/\s+[-–]\s+/);
  if (parts.length < 2) return null;
  
  const endPart = parts[1];
  const match = endPart.match(/(\d+):00\s+(AM|PM)/i);
  if (!match) return null;
  
  let hour = parseInt(match[1]);
  const period = match[2].toUpperCase();
  
  // Convert to 24-hour format
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  
  return hour;
}

// Build full time slot string for multi-hour bookings
// e.g. "10:00 AM – 11:00 AM" + 4 hours → "10:00 AM - 2:00 PM"
export function getFullTimeSlotString(startTimeSlot: string, durationHours: number): string {
  // Get start hour from the time slot
  const startHour = parseTimeSlotToStartHour(startTimeSlot);
  if (startHour === null) return startTimeSlot;

  // Extract the start time string (before the dash)
  const startTimeStr = startTimeSlot.split(/\s+[-–]\s+/)[0];

  // Calculate end hour
  const endHour = startHour + durationHours;

  // Convert end hour back to 12-hour format with AM/PM
  let endHourDisplay = endHour;
  let endPeriod = "AM";

  if (endHour >= 12) {
    endPeriod = "PM";
    if (endHour > 12) endHourDisplay = endHour - 12;
    if (endHour === 12) endHourDisplay = 12;
  } else {
    endHourDisplay = endHour;
  }

  const endTimeStr = `${endHourDisplay}:00 ${endPeriod}`;

  return `${startTimeStr} - ${endTimeStr}`;
}

// Check if a 1-hour slot falls within a booking's time range
export function isSlotWithinBookingRange(slot: string, bookingTimeSlot: string): boolean {
  const slotStart = parseTimeSlotToStartHour(slot);
  const bookingStart = parseTimeSlotToStartHour(bookingTimeSlot);
  const bookingEnd = parseTimeSlotToEndHour(bookingTimeSlot);
  
  if (slotStart === null || bookingStart === null || bookingEnd === null) {
    return false;
  }
  
  // A slot is within range if it starts inside the booking window
  return slotStart >= bookingStart && slotStart < bookingEnd;
}

// Max duration allowed based on start time (court closes at 10 PM, max 4h)
export function getMaxDurationForStartTime(startTimeSlot: string): number {
  const startHour = parseTimeSlotToStartHour(startTimeSlot);
  if (startHour === null) return 1;
  
  const CLOSING_HOUR = 22;
  const MAX_BOOKING_HOURS = 4;
  const hoursUntilClose = CLOSING_HOUR - startHour;
  
  return Math.max(1, Math.min(MAX_BOOKING_HOURS, hoursUntilClose));
}

// Check if duration would go past closing time
export function isValidDurationForClosingTime(startTimeSlot: string, duration: number): boolean {
  const startHour = parseTimeSlotToStartHour(startTimeSlot);
  if (startHour === null) return true;
  
  const CLOSING_HOUR = 22;
  const endHour = startHour + duration;
  
  return endHour <= CLOSING_HOUR;
}

// Convert backend booking (snake_case) to frontend format (camelCase)
export function convertBackendBooking(backendBooking: any): Booking {
  return {
    id: backendBooking.id,
    userId: backendBooking.user_id,
    userName: backendBooking.user_name,
    userEmail: backendBooking.user_email,
    date: backendBooking.date,
    timeSlot: backendBooking.time_slot,
    duration: backendBooking.duration,
    accessCode: backendBooking.access_code || "",
    status: backendBooking.status,
    courtNumber: backendBooking.court_number,
    createdAt: backendBooking.created_at || new Date().toISOString().split("T")[0],
    bookedByAdmin: backendBooking.booked_by || undefined,
    // Payment verification fields
    paymentStatus: backendBooking.payment_status || undefined,
    paymentMethod: backendBooking.payment_method || undefined,
    paymentProofPath: backendBooking.payment_proof_path || undefined,
    paymentRejectionNote: backendBooking.rejection_note || undefined,
    totalAmount: backendBooking.total_amount != null ? Number(backendBooking.total_amount) : undefined,
    pricePerHour: backendBooking.price_per_hour != null ? Number(backendBooking.price_per_hour) : undefined,
    paymentSubmittedAt: backendBooking.payment_submitted_at || undefined,
    approvedAt: backendBooking.approved_at || undefined,
    accessCodeActive: backendBooking.access_code_active === 1 || backendBooking.access_code_active === true,
  };
}

// Check if a time slot is in the past for a given date (YYYY-MM-DD format)
// A slot is only past when its END time has passed (e.g. 11:00 AM - 12:00 PM is bookable until 12:00 PM)
export function isSlotInPast(dateStr: string, slot: string): boolean {
  if (!dateStr) return false;
  const now = new Date();
  const selDate = new Date(dateStr + "T00:00:00");
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (selDate > today) return false; // Future date — not past
  if (selDate < today) return true;  // Past date — all slots are past

  // Same day — slot is past only if the end hour has passed
  const startHour = parseTimeSlotToStartHour(slot);
  if (startHour === null) return false;
  const endHour = startHour + 1; // Each slot is 1 hour
  return endHour <= now.getHours();
}
