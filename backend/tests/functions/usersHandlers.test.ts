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

const { CLAIMS, STORE } = vi.hoisted(() => {
  // Skip the in-memory per-uid rate limiter (read at module load in rateLimit.ts).
  process.env.FUNCTIONS_EMULATOR = "true";
  return {
    CLAIMS: {
      "admin-token": { uid: "admin-uid", role: "admin", username: "admin" },
      "groom-token": { uid: "groom-uid", role: "groom", username: "groom" },
      "driver-token": { uid: "driver-uid", role: "driver", username: "driver" },
    } as Record<string, Record<string, unknown>>,
    STORE: { current: null as ReturnType<typeof inMemoryUserStore>["store"] | null },
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
    },
  };
});

import { usersRouter } from "../../functions/src/api/routes/users";

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
    },
    usernameIndex: { ali: "u1", admin: "admin-uid" },
    phoneIndex: { "972501111111": "u1" },
    authUsers: {
      u1: { uid: "u1", customClaims: { role: "groom", username: "ali" } },
      "admin-uid": { uid: "admin-uid", customClaims: { role: "admin", username: "admin" } },
    },
  });
  STORE.current = mem.store;
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

const NEW_USER = {
  username: "Sara",
  password: "Abcd1234",
  role: "groom",
  phoneE164: "+972502222222",
};

describe("POST /users — create", () => {
  it("admin creates a user: profile + both indices + claims written, returns { uid }", async () => {
    const { status, json } = await req("POST", "/users", "admin-token", { ...NEW_USER });
    expect(status).toBe(200);
    const uid = json.uid;
    expect(uid).toBeTruthy();
    expect(mem.rtdb.users[uid].username).toBe("sara"); // lowercased
    expect(mem.rtdb.users[uid].createdBy).toBe("admin-uid");
    expect(mem.rtdb.usernameIndex.sara).toBe(uid);
    expect(mem.rtdb.phoneIndex["972502222222"]).toBe(uid);
    expect(mem.authUsers[uid].customClaims).toEqual({ role: "groom", username: "sara" });
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

  it("rejects a weak password (400)", async () => {
    const { status, json } = await req("POST", "/users", "admin-token", { ...NEW_USER, password: "weak" });
    expect(status).toBe(400);
    expect(json.error).toBe("weak_password");
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

  it("creates a phone-less user: no Auth phoneNumber, no phoneIndex entry, no profile phoneE164", async () => {
    // Phone is optional end-to-end (Issue 6). Omitting phoneE164 must create a
    // valid account with no Auth phoneNumber and no /phoneIndex row.
    const { username, password, role } = NEW_USER;
    const { status, json } = await req("POST", "/users", "admin-token", { username, password, role });
    expect(status).toBe(200);
    const uid = json.uid;
    expect(uid).toBeTruthy();
    expect(mem.rtdb.users[uid].username).toBe("sara");
    expect(mem.rtdb.users[uid].phoneE164).toBeUndefined();
    expect(Object.values(mem.rtdb.phoneIndex)).not.toContain(uid);
    expect(mem.authUsers[uid].phoneNumber).toBeUndefined();
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

describe("PUT /users/:uid/password — set password", () => {
  it("updates the password and revokes refresh tokens", async () => {
    const { status } = await req("PUT", "/users/u1/password", "admin-token", { newPassword: "NewPass1" });
    expect(status).toBe(200);
    expect(mem.authUsers.u1.password).toBe("NewPass1");
    expect(mem.revoked).toContain("u1");
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
    expect(ok.json.map((u: any) => u.uid).sort()).toEqual(["admin-uid", "u1"]);
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
