import { describe, it, expect } from 'vitest';
import {
  parseTimeSlotToStartHour,
  parseTimeSlotToEndHour,
  getFullTimeSlotString,
  isSlotWithinBookingRange,
  getMaxDurationForStartTime,
  isValidDurationForClosingTime,
  generateAccessCode,
  convertBackendBooking,
  formatDateDisplay,
  TIME_SLOTS,
} from '../app/data/mockData';

// ============================================================
// TIME SLOT PARSING TESTS
// ============================================================
describe('parseTimeSlotToStartHour', () => {
  it('parses AM time slot correctly', () => {
    expect(parseTimeSlotToStartHour('6:00 AM – 7:00 AM')).toBe(6);
    expect(parseTimeSlotToStartHour('9:00 AM – 10:00 AM')).toBe(9);
    expect(parseTimeSlotToStartHour('11:00 AM – 12:00 PM')).toBe(11);
  });

  it('parses PM time slot correctly', () => {
    expect(parseTimeSlotToStartHour('2:00 PM – 3:00 PM')).toBe(14);
    expect(parseTimeSlotToStartHour('6:00 PM – 7:00 PM')).toBe(18);
    expect(parseTimeSlotToStartHour('9:00 PM – 10:00 PM')).toBe(21);
  });

  it('handles 12 PM (noon) correctly', () => {
    expect(parseTimeSlotToStartHour('12:00 PM – 1:00 PM')).toBe(12);
  });

  it('returns null for invalid input', () => {
    expect(parseTimeSlotToStartHour('invalid')).toBeNull();
    expect(parseTimeSlotToStartHour('')).toBeNull();
  });
});

describe('parseTimeSlotToEndHour', () => {
  it('parses end hour from single-hour slot', () => {
    expect(parseTimeSlotToEndHour('6:00 AM – 7:00 AM')).toBe(7);
    expect(parseTimeSlotToEndHour('9:00 PM – 10:00 PM')).toBe(22);
  });

  it('parses end hour from multi-hour slot', () => {
    expect(parseTimeSlotToEndHour('6:00 AM - 10:00 AM')).toBe(10);
    expect(parseTimeSlotToEndHour('2:00 PM - 6:00 PM')).toBe(18);
  });

  it('handles noon crossing correctly', () => {
    expect(parseTimeSlotToEndHour('11:00 AM - 1:00 PM')).toBe(13);
  });

  it('returns null for invalid input', () => {
    expect(parseTimeSlotToEndHour('invalid')).toBeNull();
  });
});

// ============================================================
// MULTI-HOUR TIME SLOT STRING GENERATION
// ============================================================
describe('getFullTimeSlotString', () => {
  it('generates correct 1-hour slot (no change)', () => {
    const result = getFullTimeSlotString('6:00 AM – 7:00 AM', 1);
    expect(result).toBe('6:00 AM - 7:00 AM');
  });

  it('generates correct 2-hour slot', () => {
    const result = getFullTimeSlotString('6:00 AM – 7:00 AM', 2);
    expect(result).toBe('6:00 AM - 8:00 AM');
  });

  it('generates correct 4-hour slot', () => {
    const result = getFullTimeSlotString('6:00 AM – 7:00 AM', 4);
    expect(result).toBe('6:00 AM - 10:00 AM');
  });

  it('handles AM to PM crossing', () => {
    const result = getFullTimeSlotString('10:00 AM – 11:00 AM', 4);
    expect(result).toBe('10:00 AM - 2:00 PM');
  });

  it('handles PM time slots', () => {
    const result = getFullTimeSlotString('6:00 PM – 7:00 PM', 4);
    expect(result).toBe('6:00 PM - 10:00 PM');
  });

  it('handles noon correctly', () => {
    const result = getFullTimeSlotString('11:00 AM – 12:00 PM', 2);
    expect(result).toBe('11:00 AM - 1:00 PM');
  });
});

// ============================================================
// BOOKING OVERLAP DETECTION
// ============================================================
describe('isSlotWithinBookingRange', () => {
  it('detects slot within a multi-hour booking', () => {
    // Booking: 6 PM - 9 PM → 7 PM should be within range
    expect(isSlotWithinBookingRange('7:00 PM – 8:00 PM', '6:00 PM - 9:00 PM')).toBe(true);
    expect(isSlotWithinBookingRange('8:00 PM – 9:00 PM', '6:00 PM - 9:00 PM')).toBe(true);
  });

  it('detects the first slot of a booking', () => {
    expect(isSlotWithinBookingRange('6:00 PM – 7:00 PM', '6:00 PM - 9:00 PM')).toBe(true);
  });

  it('rejects slot outside booking range', () => {
    // 9 PM is the end hour, so 9 PM slot is NOT within (it starts at end)
    expect(isSlotWithinBookingRange('9:00 PM – 10:00 PM', '6:00 PM - 9:00 PM')).toBe(false);
    // 5 PM is before the booking
    expect(isSlotWithinBookingRange('5:00 PM – 6:00 PM', '6:00 PM - 9:00 PM')).toBe(false);
  });

  it('handles single-hour booking correctly', () => {
    expect(isSlotWithinBookingRange('6:00 AM – 7:00 AM', '6:00 AM - 7:00 AM')).toBe(true);
    expect(isSlotWithinBookingRange('7:00 AM – 8:00 AM', '6:00 AM - 7:00 AM')).toBe(false);
  });

  it('returns false for invalid input', () => {
    expect(isSlotWithinBookingRange('invalid', '6:00 PM - 9:00 PM')).toBe(false);
    expect(isSlotWithinBookingRange('6:00 PM – 7:00 PM', 'invalid')).toBe(false);
  });
});

// ============================================================
// MAXIMUM DURATION CALCULATION
// ============================================================
describe('getMaxDurationForStartTime', () => {
  it('returns 4 when starting early enough', () => {
    expect(getMaxDurationForStartTime('6:00 AM – 7:00 AM')).toBe(4);
    expect(getMaxDurationForStartTime('2:00 PM – 3:00 PM')).toBe(4);
    expect(getMaxDurationForStartTime('6:00 PM – 7:00 PM')).toBe(4);
  });

  it('limits duration near closing time (10 PM)', () => {
    // Starting at 9 PM → max 1 hour (until 10 PM)
    expect(getMaxDurationForStartTime('9:00 PM – 10:00 PM')).toBe(1);
    // Starting at 8 PM → max 2 hours (until 10 PM)
    expect(getMaxDurationForStartTime('8:00 PM – 9:00 PM')).toBe(2);
    // Starting at 7 PM → max 3 hours (until 10 PM)
    expect(getMaxDurationForStartTime('7:00 PM – 8:00 PM')).toBe(3);
  });

  it('returns at least 1 for any valid slot', () => {
    for (const slot of TIME_SLOTS) {
      expect(getMaxDurationForStartTime(slot)).toBeGreaterThanOrEqual(1);
    }
  });
});

// ============================================================
// CLOSING TIME VALIDATION
// ============================================================
describe('isValidDurationForClosingTime', () => {
  it('accepts valid durations', () => {
    expect(isValidDurationForClosingTime('6:00 AM – 7:00 AM', 4)).toBe(true);
    expect(isValidDurationForClosingTime('6:00 PM – 7:00 PM', 4)).toBe(true);
    expect(isValidDurationForClosingTime('9:00 PM – 10:00 PM', 1)).toBe(true);
  });

  it('rejects durations exceeding closing time', () => {
    expect(isValidDurationForClosingTime('9:00 PM – 10:00 PM', 2)).toBe(false);
    expect(isValidDurationForClosingTime('8:00 PM – 9:00 PM', 3)).toBe(false);
  });

  it('allows exactly until closing time', () => {
    // 8 PM + 2 hours = 10 PM exactly → valid
    expect(isValidDurationForClosingTime('8:00 PM – 9:00 PM', 2)).toBe(true);
  });
});

// ============================================================
// ACCESS CODE GENERATION
// ============================================================
describe('generateAccessCode', () => {
  it('generates a 4-digit string', () => {
    const code = generateAccessCode([]);
    expect(code).toHaveLength(4);
    expect(/^\d{4}$/.test(code)).toBe(true);
  });

  it('generates unique codes (not in existing list)', () => {
    const existing = ['1234', '5678', '9012'];
    const code = generateAccessCode(existing);
    expect(existing).not.toContain(code);
  });

  it('generates different codes on multiple calls', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      codes.add(generateAccessCode([]));
    }
    // With random generation, 20 calls should produce at least 2 unique codes
    expect(codes.size).toBeGreaterThan(1);
  });
});

// ============================================================
// BACKEND BOOKING CONVERSION
// ============================================================
describe('convertBackendBooking', () => {
  it('converts snake_case backend format to camelCase frontend format', () => {
    const backendBooking = {
      id: 'BK123456789',
      user_id: 'USR001',
      user_name: 'User',
      user_email: 'john@test.com',
      date: '10 May 2026',
      time_slot: '6:00 AM - 10:00 AM',
      duration: 4,
      access_code: '1234',
      status: 'confirmed',
      court_number: 1,
      created_at: '2026-05-10T00:00:00.000Z',
    };

    const result = convertBackendBooking(backendBooking);

    expect(result.id).toBe('BK123456789');
    expect(result.userId).toBe('USR001');
    expect(result.userName).toBe('User');
    expect(result.userEmail).toBe('john@test.com');
    expect(result.date).toBe('10 May 2026');
    expect(result.timeSlot).toBe('6:00 AM - 10:00 AM');
    expect(result.duration).toBe(4);
    expect(result.accessCode).toBe('1234');
    expect(result.status).toBe('confirmed');
    expect(result.courtNumber).toBe(1);
    expect(result.createdAt).toBe('2026-05-10T00:00:00.000Z');
  });

  it('handles missing created_at with fallback', () => {
    const backendBooking = {
      id: 'BK999',
      user_id: 'USR001',
      user_name: 'Test',
      user_email: 'test@test.com',
      date: '1 Jan 2026',
      time_slot: '6:00 AM - 7:00 AM',
      duration: 1,
      access_code: '0001',
      status: 'confirmed',
      court_number: 2,
      // No created_at field
    };

    const result = convertBackendBooking(backendBooking);
    // Should default to today's date string
    expect(result.createdAt).toBeDefined();
    expect(result.createdAt.length).toBeGreaterThan(0);
  });
});

// ============================================================
// TIME SLOTS CONFIGURATION
// ============================================================
describe('TIME_SLOTS', () => {
  it('has 16 slots from 6 AM to 10 PM', () => {
    expect(TIME_SLOTS).toHaveLength(16);
  });

  it('starts at 6:00 AM', () => {
    expect(TIME_SLOTS[0]).toContain('6:00 AM');
  });

  it('ends at 10:00 PM', () => {
    expect(TIME_SLOTS[TIME_SLOTS.length - 1]).toContain('10:00 PM');
  });

  it('each slot covers exactly 1 hour', () => {
    for (const slot of TIME_SLOTS) {
      const start = parseTimeSlotToStartHour(slot);
      const end = parseTimeSlotToEndHour(slot);
      expect(start).not.toBeNull();
      expect(end).not.toBeNull();
      expect(end! - start!).toBe(1);
    }
  });

  it('slots are consecutive with no gaps', () => {
    for (let i = 0; i < TIME_SLOTS.length - 1; i++) {
      const currentEnd = parseTimeSlotToEndHour(TIME_SLOTS[i]);
      const nextStart = parseTimeSlotToStartHour(TIME_SLOTS[i + 1]);
      expect(currentEnd).toBe(nextStart);
    }
  });
});
