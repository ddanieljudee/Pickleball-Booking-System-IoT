import { describe, it, expect, beforeAll } from 'vitest';

const API = 'http://localhost:5000';

// Helper to make requests
async function api(method: string, path: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${API}${path}`, opts);
}

async function apiAuth(method: string, path: string, token: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${API}${path}`, opts);
}

let adminToken = '';

// ============================================================
// IOT INTEGRATION TESTS
// ============================================================

describe('IoT Integration Tests', () => {

  // --- Server Health ---
  describe('Server Health', () => {
    it('server is reachable', async () => {
      const res = await api('GET', '/api/health');
      expect(res.status).toBe(200);
    });
  });

  // --- Gate Status Polling (what ESP32 does every 2s) ---
  describe('GET /api/iot/gate/status', () => {
    it('returns gate status for court 1 (default)', async () => {
      const res = await api('GET', '/api/iot/gate/status');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('gate');
      expect(data.gate).toHaveProperty('locked');
      expect(typeof data.gate.locked).toBe('boolean');
      expect(data.gate).toHaveProperty('updatedAt');
    });

    it('returns gate status for court 1 with query param', async () => {
      const res = await api('GET', '/api/iot/gate/status?court=1');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.gate).toHaveProperty('locked');
    });

    it('returns gate status for court 2', async () => {
      const res = await api('GET', '/api/iot/gate/status?court=2');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.gate).toHaveProperty('locked');
    });

    it('defaults to court 1 for invalid court number', async () => {
      const res = await api('GET', '/api/iot/gate/status?court=99');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.gate).toHaveProperty('locked');
    });
  });

  // --- Gate Sync (what ESP32 calls after keypad toggle) ---
  describe('POST /api/iot/gate/sync', () => {
    it('syncs court 1 to unlocked', async () => {
      const res = await api('POST', '/api/iot/gate/sync', {
        courtNumber: 1,
        locked: false,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.gate.locked).toBe(false);
      expect(data.message).toContain('Court 1');
    });

    it('gate status poll reflects synced state', async () => {
      // After syncing to unlocked, poll should show unlocked
      const res = await api('GET', '/api/iot/gate/status?court=1');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.gate.locked).toBe(false);
    });

    it('syncs court 1 back to locked', async () => {
      const res = await api('POST', '/api/iot/gate/sync', {
        courtNumber: 1,
        locked: true,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.gate.locked).toBe(true);
    });

    it('syncs court 2 to unlocked', async () => {
      const res = await api('POST', '/api/iot/gate/sync', {
        courtNumber: 2,
        locked: false,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.gate.locked).toBe(false);
    });

    it('rejects invalid court number', async () => {
      const res = await api('POST', '/api/iot/gate/sync', {
        courtNumber: 5,
        locked: true,
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Invalid court');
    });

    it('rejects missing locked state', async () => {
      const res = await api('POST', '/api/iot/gate/sync', {
        courtNumber: 1,
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('locked');
    });

    it('rejects non-boolean locked value', async () => {
      const res = await api('POST', '/api/iot/gate/sync', {
        courtNumber: 1,
        locked: 'yes',
      });
      expect(res.status).toBe(400);
    });
  });

  // --- Full Keypad Flow Simulation ---
  describe('Keypad Toggle Flow (simulates ESP32 behavior)', () => {
    it('step 1: gate starts locked', async () => {
      // Reset to locked
      await api('POST', '/api/iot/gate/sync', { courtNumber: 1, locked: true });
      const res = await api('GET', '/api/iot/gate/status?court=1');
      const data = await res.json();
      expect(data.gate.locked).toBe(true);
    });

    it('step 2: keypad unlocks → sync to backend', async () => {
      // ESP32 toggles gate and syncs
      const res = await api('POST', '/api/iot/gate/sync', {
        courtNumber: 1,
        locked: false,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.gate.locked).toBe(false);
    });

    it('step 3: next poll sees unlocked (no auto-lock)', async () => {
      // Simulates the ESP32 polling after cooldown — should still be unlocked
      const res = await api('GET', '/api/iot/gate/status?court=1');
      const data = await res.json();
      expect(data.gate.locked).toBe(false);
    });

    it('step 4: keypad locks again → sync to backend', async () => {
      const res = await api('POST', '/api/iot/gate/sync', {
        courtNumber: 1,
        locked: true,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.gate.locked).toBe(true);
    });

    it('step 5: poll confirms locked', async () => {
      const res = await api('GET', '/api/iot/gate/status?court=1');
      const data = await res.json();
      expect(data.gate.locked).toBe(true);
    });
  });

  // --- Admin Gate Control ---
  describe('POST /api/iot/gate/control (admin)', () => {
    beforeAll(async () => {
      // Login as admin to get token
      const res = await api('POST', '/api/auth/login', {
        email: 'admin@pb.com',
        password: 'admin123',
      });
      if (res.ok) {
        const data = await res.json();
        adminToken = data.token;
      }
    });

    it('rejects unauthenticated requests', async () => {
      const res = await api('POST', '/api/iot/gate/control', {
        action: 'unlock',
        courtNumber: 1,
      });
      expect(res.status).toBe(401);
    });

    it('admin can unlock court 1', async () => {
      if (!adminToken) return; // Skip if no admin account
      const res = await apiAuth('POST', '/api/iot/gate/control', adminToken, {
        action: 'unlock',
        courtNumber: 1,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.gate.locked).toBe(false);
    });

    it('admin unlock is reflected in gate poll', async () => {
      if (!adminToken) return;
      const res = await api('GET', '/api/iot/gate/status?court=1');
      const data = await res.json();
      expect(data.gate.locked).toBe(false);
    });

    it('admin can lock court 1', async () => {
      if (!adminToken) return;
      const res = await apiAuth('POST', '/api/iot/gate/control', adminToken, {
        action: 'lock',
        courtNumber: 1,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.gate.locked).toBe(true);
    });

    it('rejects invalid action', async () => {
      if (!adminToken) return;
      const res = await apiAuth('POST', '/api/iot/gate/control', adminToken, {
        action: 'toggle',
        courtNumber: 1,
      });
      expect(res.status).toBe(400);
    });
  });

  // --- Verify Endpoint (keypad code validation) ---
  describe('GET /api/iot/verify', () => {
    it('rejects missing code parameter', async () => {
      const res = await api('GET', '/api/iot/verify');
      // Should return 400 or 404 depending on implementation
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects invalid code with unlock:false', async () => {
      const res = await api('GET', '/api/iot/verify?code=0000');
      const data = await res.json();
      expect(data.unlock).toBe(false);
    });

    it('returns JSON response', async () => {
      const res = await api('GET', '/api/iot/verify?code=1234');
      const contentType = res.headers.get('content-type');
      expect(contentType).toContain('application/json');
    });
  });

  // --- Race Condition Test ---
  describe('Race Condition Prevention', () => {
    it('sync then immediate poll returns correct state', async () => {
      // Sync to unlocked
      const syncRes = await api('POST', '/api/iot/gate/sync', {
        courtNumber: 1,
        locked: false,
      });
      expect(syncRes.status).toBe(200);

      // Immediately poll (simulating worst-case timing)
      const pollRes = await api('GET', '/api/iot/gate/status?court=1');
      const data = await pollRes.json();
      expect(data.gate.locked).toBe(false); // Must NOT be locked
    });

    it('rapid sync toggle maintains consistency', async () => {
      // Unlock
      await api('POST', '/api/iot/gate/sync', { courtNumber: 1, locked: false });
      // Lock
      await api('POST', '/api/iot/gate/sync', { courtNumber: 1, locked: true });
      // Unlock
      await api('POST', '/api/iot/gate/sync', { courtNumber: 1, locked: false });

      const res = await api('GET', '/api/iot/gate/status?court=1');
      const data = await res.json();
      expect(data.gate.locked).toBe(false); // Last sync was unlock
    });

    it('admin control after keypad sync works correctly', async () => {
      // Keypad unlocks
      await api('POST', '/api/iot/gate/sync', { courtNumber: 1, locked: false });

      // Admin locks
      if (adminToken) {
        const res = await apiAuth('POST', '/api/iot/gate/control', adminToken, {
          action: 'lock',
          courtNumber: 1,
        });
        expect(res.status).toBe(200);

        // Poll should show locked (admin overrides keypad)
        const pollRes = await api('GET', '/api/iot/gate/status?court=1');
        const data = await pollRes.json();
        expect(data.gate.locked).toBe(true);
      }
    });
  });
});
