// @vitest-environment node
//
// Handler-behaviour tests for routes/users.ts, driven over real HTTP against the
// REAL usersRouter. Two things are stubbed:
//   - requireAuth (maps a fake bearer token -> claims), same as invitesAuthz.ts
//   - userStore (the data-access seam) -> the in-memory adapter
// Because the user domain now talks to Firebase only through UserStore, this
// exercises the actual authorization, validation, the username/phone-index +
// custom-claims invariant, self-modification guards, and response shapes with NO
// emulator. Before the seam existed these handlers 500'd at getDatabase()/
// getAuth(), so this behaviour was untestable in the unit env.
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import express from "express";
import type { Server } from "node:http";
import { inMemoryUserStore } from "./support/inMemoryUserStore";

const { CLAIMS, STORE, SEND } = vi.hoisted(() => {
  // Skip the in-memory per-uid rate limiter (read at module load in rateLimit.ts).
  process.env.FUNCTIONS_EMULATOR = "true";
  return {
    CLAIMS: {
      "admin-token": { uid: "admin-uid", role: "admin", username: "admin" },
      "groom-token": { uid: "groom-uid", role: "groom", username: "groom" },
      "driver-token": { uid: "driver-uid", role: "driver", username: "driver" },
    } as Record<string, Record<string, unknown>>,
    STORE: { current: null as ReturnType<typeof inMemoryUserStore>["store"] | null },
    // Controllable double for the WhatsApp credentials sender.
    SEND: {
      result: { delivered: true } as { delivered: boolean; error?: string },
      calls: [] as Array<Record<string, unknown>>,
    },
  };
});

// Stub ONLY requireAuth — requireAdmin / role gates stay real.
vi.mock("../../functions/src/api/middleware/auth", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../functions/src/api/middleware/auth")
    >();
  return {
    ...actual,
    requireAuth: (req: any, res: any, next: () => void) => {
      const header: string = req.headers?.authorization ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      const claims = CLAIMS[token];
      if (!claims) {
        res.status(401).json({ error: "unauthenticated" });
        return;
      }
      req.caller = { uid: claims.uid, claims };
      next();
    },
  };
});

// Replace the UserStore seam with the in-memory adapter (delegated at call time).
vi.mock("../../functions/src/api/stores/userStore", () => {
  const d = (m: string) => (...a: unknown[]) => (STORE.current as any)[m](...a);
  return {
    userStore: {
      listUsers: d("listUsers"),
      listGroomProfiles: d("listGroomProfiles"),
      readUser: d("readUser"),
      readUsernameOwner: d("readUsernameOwner"),
      readPhoneOwner: d("readPhoneOwner"),
      applyUpdates: d("applyUpdates"),
      patchUserFields: d("patchUserFields"),
      setUserRole: d("setUserRole"),
      setGroomProfile: d("setGroomProfile"),
      removeGroomProfile: d("removeGroomProfile"),
      authCreateUser: d("authCreateUser"),
      authSetClaims: d("authSetClaims"),
      authUpdateUser: d("authUpdateUser"),
      authDeleteUser: d("authDeleteUser"),
      authGetUser: d("authGetUser"),
      authRevokeTokens: d("authRevokeTokens"),
      readGeneratedPassword: d("readGeneratedPassword"),
    },
  };
});

// Stub the WhatsApp credentials sender — delivery outcome is set per test via
// SEND.result; every call is recorded so tests can assert phone/lang/username.
vi.mock("../../functions/src/api/services/credentialsDelivery", () => ({
  sendCredentialsWhatsApp: async (args: Record<string, unknown>) => {
    SEND.calls.push(args);
    return SEND.result;
  },
}));

import { usersRouter } from "../../functions/src/api/routes/users";
import {
  isEncryptedField,
  decryptField,
} from "../../functions/src/api/passwordCrypto";

let server: Server;
let baseUrl: string;
let mem: ReturnType<typeof inMemoryUserStore>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/users", usersRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  mem = inMemoryUserStore({
    users: {
      u1: { username: "ali", role: "groom", phoneE164: "+972501111111" },
      "admin-uid": { username: "admin", role: "admin" },
      "admin2-uid": { username: "admin2", role: "admin" },
    },
    usernameIndex: { ali: "u1", admin: "admin-uid", admin2: "admin2-uid" },
    phoneIndex: { "972501111111": "u1" },
    authUsers: {
      u1: { uid: "u1", customClaims: { role: "groom", username: "ali" } },
      "admin-uid": { uid: "admin-uid", customClaims: { role: "admin", username: "admin" } },
      "admin2-uid": { uid: "admin2-uid", customClaims: { role: "admin", username: "admin2" } },
    },
  });
  STORE.current = mem.store;
  SEND.result = { delivered: true };
  SEND.calls.length = 0;
});

async function req(method: string, path: string, token: string | null, body?: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  return { status: res.status, json };
}

// Groom/driver creation: NO password (server-generated). Admin creation keeps one.
const NEW_USER = {
  username: "Sara",
  role: "groom",
  phoneE164: "+972502222222",
};
const NEW_ADMIN = {
  username: "Boss",
  password: "Abcd1234",
  role: "admin",
};

describe("POST /users — create (groom/driver: generated password)", () => {
  it("creates a groom: profile + indices + claims + mustChangePassword + encrypted temp password", async () => {
    const { status, json } = await req("POST", "/users", "admin-token", { ...NEW_USER });
    expect(status).toBe(200);
    const uid = json.uid;
    expect(uid).toBeTruthy();
    expect(mem.rtdb.users[uid].username).toBe("sara"); // lowercased
    expect(mem.rtdb.users[uid].createdBy).toBe("admin-uid");
    expect(mem.rtdb.users[uid].mustChangePassword).toBe(true);
    expect(mem.rtdb.usernameIndex.sara).toBe(uid);
    expect(mem.rtdb.phoneIndex["972502222222"]).toBe(uid);
    expect(mem.authUsers[uid].customClaims).toEqual({ role: "groom", username: "sara" });
    // Temp password stored as an enc:v1 envelope that decrypts to the Auth password.
    const stored = mem.rtdb.generatedPasswords[uid];
    expect(isEncryptedField(stored.password)).toBe(true);
    expect(decryptField(stored.password)).toBe(mem.authUsers[uid].password);
  });

  it("delivered send → credentials has no plaintext; sender got phone/lang/username", async () => {
    SEND.result = { delivered: true };
    const { json } = await req("POST", "/users", "admin-token", { ...NEW_USER, lang: "he" });
    expect(json.credentials).toEqual({ delivered: true });
    expect(json.credentials.password).toBeUndefined();
    expect(SEND.calls).toHaveLength(1);
    expect(SEND.calls[0].phoneE164).toBe("+972502222222");
    expect(SEND.calls[0].lang).toBe("he");
    expect(SEND.calls[0].username).toBe("sara");
  });

  it("failed send → show-once fallback: plaintext returned, matches the Auth password", async () => {
    SEND.result = { delivered: false, error: "send_failed" };
    const { json } = await req("POST", "/users", "admin-token", { ...NEW_USER });
    expect(json.credentials.delivered).toBe(false);
    expect(json.credentials.deliveryError).toBe("send_failed");
    expect(json.credentials.password).toBe(mem.authUsers[json.uid].password);
  });

  it("no phone → send skipped, no_phone fallback with plaintext", async () => {
    const { username, role } = NEW_USER;
    const { status, json } = await req("POST", "/users", "admin-token", { username, role });
    expect(status).toBe(200);
    expect(SEND.calls).toHaveLength(0);
    expect(json.credentials.delivered).toBe(false);
    expect(json.credentials.deliveryError).toBe("no_phone");
    expect(json.credentials.password).toBe(mem.authUsers[json.uid].password);
    expect(mem.rtdb.users[json.uid].phoneE164).toBeUndefined();
    expect(Object.values(mem.rtdb.phoneIndex)).not.toContain(json.uid);
  });

  it("generated password satisfies the strength policy (16 chars)", async () => {
    SEND.result = { delivered: false, error: "send_failed" };
    const { json } = await req("POST", "/users", "admin-token", { ...NEW_USER });
    const pw: string = json.credentials.password;
    expect(pw).toHaveLength(16);
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/[0-9]/);
  });

  it("rejects a supplied password for groom/driver (400 password_not_allowed)", async () => {
    const { status, json } = await req("POST", "/users", "admin-token", { ...NEW_USER, password: "Abcd1234" });
    expect(status).toBe(400);
    expect(json.error).toBe("password_not_allowed");
  });

  it("rejects an invalid lang (400)", async () => {
    const { status, json } = await req("POST", "/users", "admin-token", { ...NEW_USER, lang: "en" });
    expect(status).toBe(400);
    expect(json.error).toBe("invalid_lang");
  });

  it("defaults feature flags (attendance/photographer ON, boarding-pass OFF)", async () => {
    const { json } = await req("POST", "/users", "admin-token", { ...NEW_USER });
    const u = mem.rtdb.users[json.uid];
    expect(u.canSeeAttendance).toBe(true);
    expect(u.canUsePhotographer).toBe(true);
    expect(u.canUseBoardingPass).toBe(false);
  });

  it("a groom is rejected with admins_only", async () => {
    const { status, json } = await req("POST", "/users", "groom-token", { ...NEW_USER });
    expect(status).toBe(403);
    expect(json.error).toBe("admins_only");
  });

  it("rejects an invalid username (400)", async () => {
    const { status, json } = await req("POST", "/users", "admin-token", {});
    expect(status).toBe(400);
    expect(json.error).toBe("invalid_username");
  });

  it("rejects a taken username (409)", async () => {
    const { status, json } = await req("POST", "/users", "admin-token", { ...NEW_USER, username: "ali" });
    expect(status).toBe(409);
    expect(json.error).toBe("username_taken");
  });

  it("rejects a taken phone (409)", async () => {
    const { status, json } = await req("POST", "/users", "admin-token", { ...NEW_USER, phoneE164: "+972501111111" });
    expect(status).toBe(409);
    expect(json.error).toBe("phone_taken");
  });

  it("treats an empty-string phoneE164 as absent (no phone)", async () => {
    const { status, json } = await req("POST", "/users", "admin-token", { ...NEW_USER, phoneE164: "" });
    expect(status).toBe(200);
    const uid = json.uid;
    expect(mem.rtdb.users[uid].phoneE164).toBeUndefined();
    expect(Object.values(mem.rtdb.phoneIndex)).not.toContain(uid);
    expect(mem.authUsers[uid].phoneNumber).toBeUndefined();
  });
});

describe("POST /users — create (admin role: manual password, unchanged)", () => {
  it("creates an admin with the typed password; no forced change, no stored temp password", async () => {
    const { status, json } = await req("POST", "/users", "admin-token", { ...NEW_ADMIN });
    expect(status).toBe(200);
    const uid = json.uid;
    expect(mem.authUsers[uid].password).toBe("Abcd1234");
    expect(mem.rtdb.users[uid].mustChangePassword).toBeUndefined();
    expect(mem.rtdb.generatedPasswords?.[uid]).toBeUndefined();
    expect(json.credentials).toBeUndefined();
    expect(SEND.calls).toHaveLength(0);
  });

  it("rejects a weak password (400)", async () => {
    const { status, json } = await req("POST", "/users", "admin-token", { ...NEW_ADMIN, password: "weak" });
    expect(status).toBe(400);
    expect(json.error).toBe("weak_password");
  });
});

describe("POST /users/:uid/reset-password — regenerate & resend", () => {
  it("resets a groom: new generated Auth password, tokens revoked, flag re-armed, envelope stored", async () => {
    SEND.result = { delivered: true };
    const before = mem.authUsers.u1.password;
    const { status, json } = await req("POST", "/users/u1/reset-password", "admin-token", {});
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.credentials).toEqual({ delivered: true });
    expect(mem.authUsers.u1.password).toBeTruthy();
    expect(mem.authUsers.u1.password).not.toBe(before);
    expect(mem.revoked).toContain("u1");
    expect(mem.rtdb.users.u1.mustChangePassword).toBe(true);
    expect(decryptField(mem.rtdb.generatedPasswords.u1.password)).toBe(mem.authUsers.u1.password);
    expect(SEND.calls[0].phoneE164).toBe("+972501111111");
    expect(SEND.calls[0].lang).toBe("ar"); // default
    expect(SEND.calls[0].username).toBe("ali");
  });

  it("failed delivery → plaintext in the response (show-once fallback)", async () => {
    SEND.result = { delivered: false, error: "daily_cap" };
    const { json } = await req("POST", "/users/u1/reset-password", "admin-token", { lang: "he" });
    expect(json.credentials.delivered).toBe(false);
    expect(json.credentials.deliveryError).toBe("daily_cap");
    expect(json.credentials.password).toBe(mem.authUsers.u1.password);
    expect(SEND.calls[0].lang).toBe("he");
  });

  it("rejects an admin target (409 use_manual_password)", async () => {
    const { status, json } = await req("POST", "/users/admin2-uid/reset-password", "admin-token", {});
    expect(status).toBe(409);
    expect(json.error).toBe("use_manual_password");
  });

  it("blocks self-reset (409) and 404s a ghost", async () => {
    const self = await req("POST", "/users/admin-uid/reset-password", "admin-token", {});
    expect(self.status).toBe(409);
    expect(self.json.error).toBe("cannot_self_set");
    const ghost = await req("POST", "/users/ghost/reset-password", "admin-token", {});
    expect(ghost.status).toBe(404);
    expect(ghost.json.error).toBe("not_found");
  });

  it("rejects an invalid lang (400) and a non-admin caller (403)", async () => {
    const bad = await req("POST", "/users/u1/reset-password", "admin-token", { lang: "en" });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toBe("invalid_lang");
    const groom = await req("POST", "/users/u1/reset-password", "groom-token", {});
    expect(groom.status).toBe(403);
    expect(groom.json.error).toBe("admins_only");
  });
});

describe("GET /users/:uid/temp-password — audited re-reveal", () => {
  it("404s when no temp password is stored", async () => {
    const { status, json } = await req("GET", "/users/u1/temp-password", "admin-token");
    expect(status).toBe(404);
    expect(json.error).toBe("not_found");
  });

  it("decrypts and returns the stored envelope after a create", async () => {
    SEND.result = { delivered: true };
    const created = await req("POST", "/users", "admin-token", { ...NEW_USER });
    const uid = created.json.uid;
    const { status, json } = await req("GET", `/users/${uid}/temp-password`, "admin-token");
    expect(status).toBe(200);
    expect(json.password).toBe(mem.authUsers[uid].password);
    expect(json.createdAt).toEqual(expect.any(Number));
  });

  it("passes a legacy plaintext entry through as-is", async () => {
    mem.rtdb.generatedPasswords = { u1: { password: "Legacy1234", createdAt: 123 } };
    const { status, json } = await req("GET", "/users/u1/temp-password", "admin-token");
    expect(status).toBe(200);
    expect(json.password).toBe("Legacy1234");
  });

  it("a non-admin caller is rejected (403)", async () => {
    const { status, json } = await req("GET", "/users/u1/temp-password", "groom-token");
    expect(status).toBe(403);
    expect(json.error).toBe("admins_only");
  });
});

describe("PUT /users/:uid — update", () => {
  it("renames the username: swaps index, updates Auth email + claims", async () => {
    const { status, json } = await req("PUT", "/users/u1", "admin-token", { username: "Ahmad" });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mem.rtdb.users.u1.username).toBe("ahmad");
    expect(mem.rtdb.usernameIndex.ali).toBeUndefined();
    expect(mem.rtdb.usernameIndex.ahmad).toBe("u1");
    expect(mem.authUsers.u1.email).toBe("ahmad@dawa.local");
    expect(mem.authUsers.u1.customClaims).toEqual({ role: "groom", username: "ahmad" });
  });

  it("returns 404 for a missing user", async () => {
    const { status, json } = await req("PUT", "/users/ghost", "admin-token", { role: "admin" });
    expect(status).toBe(404);
    expect(json.error).toBe("not_found");
  });

  it("blocks an admin demoting themselves (409)", async () => {
    const { status, json } = await req("PUT", "/users/admin-uid", "admin-token", { role: "groom" });
    expect(status).toBe(409);
    expect(json.error).toBe("cannot_self_demote");
  });

  it("demoting another admin to groom re-arms mustChangePassword (invariant)", async () => {
    // A user moved into groom/driver carried an admin-chosen, never-forced
    // password; force a first-login change so the generated-password invariant
    // holds across role transitions.
    const { status } = await req("PUT", "/users/admin2-uid", "admin-token", { role: "groom" });
    expect(status).toBe(200);
    expect(mem.rtdb.users["admin2-uid"].role).toBe("groom");
    expect(mem.rtdb.users["admin2-uid"].mustChangePassword).toBe(true);
  });

  it("promoting a groom to admin does NOT set mustChangePassword", async () => {
    const { status } = await req("PUT", "/users/u1", "admin-token", { role: "admin" });
    expect(status).toBe(200);
    expect(mem.rtdb.users.u1.role).toBe("admin");
    expect(mem.rtdb.users.u1.mustChangePassword).toBeUndefined();
  });

  it("rejects a username already taken by someone else (409)", async () => {
    const { status, json } = await req("PUT", "/users/u1", "admin-token", { username: "admin" });
    expect(status).toBe(409);
    expect(json.error).toBe("username_taken");
  });

  it("a groom is rejected with admins_only", async () => {
    const { status, json } = await req("PUT", "/users/u1", "groom-token", { displayName: "x" });
    expect(status).toBe(403);
    expect(json.error).toBe("admins_only");
  });
});

describe("DELETE /users/:uid — delete", () => {
  it("tears down profile + indices and the groom subtrees", async () => {
    const { status } = await req("DELETE", "/users/u1", "admin-token");
    expect(status).toBe(200);
    expect(mem.rtdb.users.u1).toBeUndefined();
    expect(mem.rtdb.usernameIndex.ali).toBeUndefined();
    expect(mem.rtdb.phoneIndex["972501111111"]).toBeUndefined();
    expect(mem.authUsers.u1).toBeUndefined();
  });

  it("purges an un-consumed generated temp password (no orphaned credential)", async () => {
    mem.rtdb.generatedPasswords = { u1: { password: "enc:v1:whatever", createdAt: 1 } };
    const { status } = await req("DELETE", "/users/u1", "admin-token");
    expect(status).toBe(200);
    expect(mem.rtdb.generatedPasswords.u1).toBeUndefined();
  });

  it("blocks self-delete (409)", async () => {
    const { status, json } = await req("DELETE", "/users/admin-uid", "admin-token");
    expect(status).toBe(409);
    expect(json.error).toBe("cannot_self_delete");
  });

  it("returns 404 for a missing user", async () => {
    const { status, json } = await req("DELETE", "/users/ghost", "admin-token");
    expect(status).toBe(404);
    expect(json.error).toBe("not_found");
  });

  it("still clears RTDB when the Auth record is already gone", async () => {
    mem.rtdb.users.u2 = { username: "noauth", role: "groom" };
    mem.rtdb.usernameIndex.noauth = "u2"; // no authUsers.u2 → authDeleteUser throws, swallowed
    const { status } = await req("DELETE", "/users/u2", "admin-token");
    expect(status).toBe(200);
    expect(mem.rtdb.users.u2).toBeUndefined();
    expect(mem.rtdb.usernameIndex.noauth).toBeUndefined();
  });
});

describe("POST /users/:uid/admin-claim — promote/demote", () => {
  it("promotes to admin, stripping a legacy admin claim, and sets RTDB role", async () => {
    mem.authUsers.u1.customClaims = { admin: true, role: "groom", username: "ali" };
    const { status } = await req("POST", "/users/u1/admin-claim", "admin-token", { isAdmin: true });
    expect(status).toBe(200);
    expect(mem.authUsers.u1.customClaims).toEqual({ role: "admin", username: "ali" });
    expect(mem.rtdb.users.u1.role).toBe("admin");
  });

  it("blocks an admin demoting themselves (409)", async () => {
    const { status, json } = await req("POST", "/users/admin-uid/admin-claim", "admin-token", { isAdmin: false });
    expect(status).toBe(409);
    expect(json.error).toBe("cannot_self_demote");
  });
});

describe("PUT /users/:uid/password — set password (admin targets only)", () => {
  it("updates another admin's password and revokes refresh tokens", async () => {
    const { status } = await req("PUT", "/users/admin2-uid/password", "admin-token", { newPassword: "NewPass1" });
    expect(status).toBe(200);
    expect(mem.authUsers["admin2-uid"].password).toBe("NewPass1");
    expect(mem.revoked).toContain("admin2-uid");
  });

  it("rejects a groom/driver target (409 use_reset_endpoint)", async () => {
    const { status, json } = await req("PUT", "/users/u1/password", "admin-token", { newPassword: "NewPass1" });
    expect(status).toBe(409);
    expect(json.error).toBe("use_reset_endpoint");
    expect(mem.authUsers.u1.password).toBeUndefined(); // untouched
  });

  it("rejects a weak password (400)", async () => {
    const { status, json } = await req("PUT", "/users/u1/password", "admin-token", { newPassword: "weak" });
    expect(status).toBe(400);
    expect(json.error).toBe("weak_password");
  });

  it("blocks setting your own password (409)", async () => {
    const { status, json } = await req("PUT", "/users/admin-uid/password", "admin-token", { newPassword: "NewPass1" });
    expect(status).toBe(409);
    expect(json.error).toBe("cannot_self_set");
  });

  it("returns 404 when the Auth user is missing", async () => {
    const { status, json } = await req("PUT", "/users/ghost/password", "admin-token", { newPassword: "NewPass1" });
    expect(status).toBe(404);
    expect(json.error).toBe("not_found");
  });
});

describe("PATCH /users/:uid — allowlisted field patch", () => {
  it("writes displayName + flags and audits without touching synced fields", async () => {
    const { status } = await req("PATCH", "/users/u1", "admin-token", { displayName: "New", canSeeAttendance: false });
    expect(status).toBe(200);
    expect(mem.rtdb.users.u1.displayName).toBe("New");
    expect(mem.rtdb.users.u1.canSeeAttendance).toBe(false);
    expect(mem.rtdb.users.u1.username).toBe("ali"); // untouched
  });

  it("rejects a non-boolean flag (400 invalid_flag)", async () => {
    const { status, json } = await req("PATCH", "/users/u1", "admin-token", { canSeeAttendance: "yes" });
    expect(status).toBe(400);
    expect(json.error).toBe("invalid_flag");
    expect(json.field).toBe("canSeeAttendance");
  });

  it("rejects a body with no allowlisted fields (400)", async () => {
    const { status, json } = await req("PATCH", "/users/u1", "admin-token", { role: "admin" });
    expect(status).toBe(400);
    expect(json.error).toBe("no_allowed_fields");
  });
});

describe("GET reads + groom profiles", () => {
  it("GET /users (admin) lists users; a groom is rejected admins_only", async () => {
    const ok = await req("GET", "/users", "admin-token");
    expect(ok.status).toBe(200);
    expect(ok.json.map((u: any) => u.uid).sort()).toEqual(["admin-uid", "admin2-uid", "u1"]);
    const no = await req("GET", "/users", "groom-token");
    expect(no.status).toBe(403);
    expect(no.json.error).toBe("admins_only");
  });

  it("GET /users/:uid forbids a groom reading another user (403) and 404s a ghost", async () => {
    const forbidden = await req("GET", "/users/u1", "groom-token");
    expect(forbidden.status).toBe(403);
    expect(forbidden.json.error).toBe("forbidden");
    const missing = await req("GET", "/users/ghost", "admin-token");
    expect(missing.status).toBe(404);
    expect(missing.json.error).toBe("not_found");
  });

  it("PUT /users/groom-profiles/:uid upserts; missing username → 400", async () => {
    const ok = await req("PUT", "/users/groom-profiles/u1", "admin-token", { username: "ali", displayName: "Ali B" });
    expect(ok.status).toBe(200);
    expect(mem.rtdb.groomProfiles.u1).toEqual({ username: "ali", displayName: "Ali B" });
    const bad = await req("PUT", "/users/groom-profiles/u1", "admin-token", {});
    expect(bad.status).toBe(400);
    expect(bad.json.error).toBe("missing_username");
  });

  it("DELETE /users/groom-profiles/:uid removes the profile", async () => {
    mem.rtdb.groomProfiles.u1 = { username: "ali" };
    const { status } = await req("DELETE", "/users/groom-profiles/u1", "admin-token");
    expect(status).toBe(200);
    expect(mem.rtdb.groomProfiles.u1).toBeUndefined();
  });
});
