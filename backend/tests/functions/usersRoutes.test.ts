// @vitest-environment node
//
// Route-seam test for the refactored usersRouter. Mounts the REAL router in an
// Express app and drives it over HTTP, stubbing ONLY token verification
// (`requireAuth`) — `requireAdmin` and the in-handler ownership check run for
// real. This proves the handler→UserStore→sendDomainError wiring survived the
// deep-module extraction:
//   - the authorization chain is unchanged (groom/driver → 403 admins_only),
//   - the GET /:uid ownership guard still runs BEFORE the store,
//   - an admin who clears authz reaches the handler, whose request-scoped store
//     hits getDatabase()/getAuth() (unavailable in this unit env) and surfaces
//     the route's fallback slug (create_failed / read_failed).
// Domain logic itself is covered without Firebase in userStore.test.ts.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const { CLAIMS } = vi.hoisted(() => {
  // Skip the in-memory per-uid rate limiter (read at module load in rateLimit.ts).
  process.env.FUNCTIONS_EMULATOR = "true";
  return {
    CLAIMS: {
      "admin-token": { uid: "admin-uid", role: "admin", username: "admin" },
      "groom-token": { uid: "groom-uid", role: "groom", username: "groom" },
      "driver-token": { uid: "driver-uid", role: "driver", username: "driver" },
    } as Record<string, { uid: string; role: string; username: string }>,
  };
});

// Replace ONLY requireAuth; requireAdmin stays REAL via importActual.
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

import { usersRouter } from "../../functions/src/api/routes/users";

let server: Server;
let baseUrl: string;

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

async function req(
  method: string,
  path: string,
  token: string | null,
  body?: unknown
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

describe("usersRouter authorization chain (admin-only mutations)", () => {
  it("rejects a groom creating a user with 403 admins_only", async () => {
    const { status, json } = await req("POST", "/users", "groom-token", {});
    expect(status).toBe(403);
    expect(json.error).toBe("admins_only");
  });

  it("rejects a driver creating a user with 403 admins_only", async () => {
    const { status, json } = await req("POST", "/users", "driver-token", {});
    expect(status).toBe(403);
    expect(json.error).toBe("admins_only");
  });

  it("rejects an unauthenticated create with 401", async () => {
    const { status } = await req("POST", "/users", null, {});
    expect(status).toBe(401);
  });

  it("rejects a groom updating a user with 403 admins_only", async () => {
    const { status, json } = await req("PUT", "/users/x", "groom-token", {});
    expect(status).toBe(403);
    expect(json.error).toBe("admins_only");
  });

  it("rejects a driver deleting a user with 403 admins_only", async () => {
    const { status, json } = await req("DELETE", "/users/x", "driver-token", undefined);
    expect(status).toBe(403);
    expect(json.error).toBe("admins_only");
  });

  it("rejects a groom flipping an admin-claim with 403 admins_only", async () => {
    const { status, json } = await req("POST", "/users/x/admin-claim", "groom-token", {
      isAdmin: true,
    });
    expect(status).toBe(403);
    expect(json.error).toBe("admins_only");
  });
});

describe("usersRouter wiring (admin reaches the handler → store)", () => {
  it("an admin create reaches the handler and fails create_failed without Firebase", async () => {
    // Admin clears requireAuth + requireAdmin, the handler builds a request
    // store whose rtdbPort()/authPort() touch getDatabase()/getAuth() — absent
    // in this unit env — so the route's create_failed fallback slug surfaces.
    // A 404 here would instead signal a broken/unwired route.
    const { status, json } = await req("POST", "/users", "admin-token", {});
    expect(status).toBe(500);
    expect(json.error).toBe("create_failed");
  });

  it("an admin read of a single user reaches the handler → read_failed", async () => {
    const { status, json } = await req("GET", "/users/some-uid", "admin-token", undefined);
    expect(status).toBe(500);
    expect(json.error).toBe("read_failed");
  });
});

describe("usersRouter GET /:uid ownership guard (runs before the store)", () => {
  it("forbids a groom reading another user's profile with 403 forbidden", async () => {
    // groom-uid !== some-other-uid and role !== admin → the in-handler ownership
    // check returns 403 forbidden BEFORE any store/Firebase access.
    const { status, json } = await req("GET", "/users/some-other-uid", "groom-token", undefined);
    expect(status).toBe(403);
    expect(json.error).toBe("forbidden");
  });
});
