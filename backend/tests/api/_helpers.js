// Shared helpers for the API route tests (vitest `api` project).
//
// These tests hit the REAL Express app served by the Functions emulator over
// HTTP — the same boundary the browser talks to — rather than importing the TS
// app (which would need a build + admin-SDK init). They run under
// `firebase emulators:exec --only auth,database,firestore,storage,functions`
// after seed-emulator.cjs has created the admin/groom/driver accounts.
//
// Node 22 provides global fetch.

import { beforeAll } from "vitest";

export const API = process.env.E2E_API_BASE || "http://127.0.0.1:5001/dawa-aa793/us-central1/api";

export const CREDS = {
  admin: { username: "admin", password: "Admin1234" },
  groom: { username: "groom", password: "Groom1234" },
  driver: { username: "driver", password: "Driver1234" },
};

/** Thin fetch wrapper: returns { status, json } (json=null on empty/non-JSON). */
export async function api(method, path, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty / non-JSON body */
  }
  return { status: res.status, json };
}

/** Decode a JWT payload (base64url) — no verification, just to read claims. */
function decodeJwt(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(part, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

export async function login(username, password) {
  const { status, json } = await api("POST", "/auth/login", { body: { username, password } });
  if (status !== 200 || !json?.idToken) {
    throw new Error(`login failed for ${username}: ${status} ${JSON.stringify(json)}`);
  }
  // /auth/login returns only { idToken, refreshToken, expiresIn }; the uid +
  // custom claims (role, username) live INSIDE the ID token, so decode them.
  const claims = decodeJwt(json.idToken);
  return { ...json, uid: claims.user_id || claims.sub, role: claims.role, username: claims.username, claims };
}

// Per-file session cache. Each test FILE re-logs in (modules don't share state),
// which is cheap against the emulator.
let _sessions = null;
export async function sessions() {
  if (_sessions) return _sessions;
  const [admin, groom, driver] = await Promise.all([
    login(CREDS.admin.username, CREDS.admin.password),
    login(CREDS.groom.username, CREDS.groom.password),
    login(CREDS.driver.username, CREDS.driver.password),
  ]);
  _sessions = { admin, groom, driver };
  return _sessions;
}

/** Guard: skip the whole file with a clear message if the emulator/API is down. */
export function requireEmulator() {
  beforeAll(async () => {
    try {
      const res = await fetch(`${API}/health`);
      if (!res.ok) throw new Error(`/health ${res.status}`);
    } catch (err) {
      throw new Error(
        `Functions emulator not reachable at ${API}. Run the API tests via ` +
          `\`npm run test:api\` (emulators:exec + seed). Underlying: ${String(err)}`,
      );
    }
  });
}
