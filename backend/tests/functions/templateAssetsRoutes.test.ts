// @vitest-environment node
//
// Route-seam test for the template preview-cover routes. Mounts the REAL router
// and drives it over HTTP, stubbing only the auth middleware and the Firestore/
// Storage I/O — the validation and security logic under test (the TEMPLATE_IDS
// allowlist, the images-only + no-SVG content-type gate, the merge-not-clobber
// pointer write, and the prior-object sweep) is exercised for real.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const { STATE, CALLER } = vi.hoisted(() => ({
  // The fake appConfig/templateAssets document.
  STATE: {
    doc: null as Record<string, any> | null,
    uploaded: [] as { path: string; contentType: string }[],
    deleted: [] as string[],
    // What the next parseMultipart() call resolves to.
    multipart: null as any,
    multipartThrows: false,
  },
  CALLER: { uid: "admin-1", role: "admin" as string },
}));

// Auth: exercise the admin gate itself (requireAdmin reads the stubbed caller).
vi.mock("../../functions/src/api/middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.caller = { uid: CALLER.uid, claims: { role: CALLER.role } };
    next();
  },
  requireAdmin: (req: any, res: any, next: any) => {
    if (req.caller?.claims?.role !== "admin") {
      res.status(403).json({ error: "permission-denied" });
      return;
    }
    next();
  },
}));

// Rate limiters are pass-through here (their own suite covers them).
vi.mock("../../functions/src/api/middleware/rateLimit", () => ({
  ipRateLimit: () => (_req: any, _res: any, next: any) => next(),
  uidRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../functions/src/audit", () => ({ writeAudit: vi.fn(async () => {}) }));

// Firestore: an in-memory doc with real get/set(merge) semantics. The route
// removes a map key with firebase-admin's REAL FieldValue.delete() sentinel —
// firebase-admin is a dependency of backend/functions and is not resolvable from
// this test package, so instead of mocking it we recognise the sentinel
// structurally: every value the route writes is a plain object literal, while
// the sentinel is a class instance (DeleteTransform). This keeps the assertion
// pointed at exactly what production hands to Firestore.
const isDeleteSentinel = (v: unknown) =>
  typeof v === "object" && v !== null && Object.getPrototypeOf(v) !== Object.prototype;

vi.mock("../../functions/src/api/routes/digital/firestore", () => ({
  templateAssetsDoc: () => ({
    get: async () => ({
      exists: STATE.doc !== null,
      data: () => STATE.doc ?? undefined,
    }),
    set: async (patch: Record<string, any>, opts?: { merge?: boolean }) => {
      const base = opts?.merge && STATE.doc ? { ...STATE.doc } : {};
      for (const [k, v] of Object.entries(patch)) {
        if (isDeleteSentinel(v)) delete base[k];
        else base[k] = v;
      }
      STATE.doc = base;
    },
  }),
}));

// Storage: stub the I/O, keep the REAL content-type + extension logic.
vi.mock("../../functions/src/api/routes/digital/storage", async (importActual) => {
  const actual = (await importActual()) as any;
  return {
    ...actual,
    parseMultipart: async () => {
      if (STATE.multipartThrows) throw new Error("bad form");
      return STATE.multipart;
    },
    uploadAndGetUrl: async (path: string, _buf: Buffer, contentType: string) => {
      STATE.uploaded.push({ path, contentType });
      return `https://storage.example/${path}?token=abc`;
    },
    deleteStorageObjectSilently: async (path: string) => {
      STATE.deleted.push(path);
    },
  };
});

const { registerTemplateAssetsRoutes } = await import(
  "../../functions/src/api/routes/digital/templateAssets.routes"
);

let server: Server;
let base: string;

const fileFixture = (contentType: string, filename = "cover.jpg") => ({
  fields: {},
  file: { buffer: Buffer.from("bytes"), contentType, filename, truncated: false },
});

beforeAll(async () => {
  const app = express();
  const router = express.Router();
  registerTemplateAssetsRoutes(router);
  app.use("/digital", router);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  STATE.doc = null;
  STATE.uploaded = [];
  STATE.deleted = [];
  STATE.multipart = fileFixture("image/jpeg");
  STATE.multipartThrows = false;
  CALLER.uid = "admin-1";
  CALLER.role = "admin";
});

describe("GET /digital/templates/assets (public)", () => {
  it("returns an empty map when nothing has been uploaded", async () => {
    const r = await fetch(`${base}/digital/templates/assets`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ assets: {} });
  });

  it("returns the pointer map and is edge-cacheable", async () => {
    STATE.doc = { "destination-love": { url: "u", storagePath: "p", updatedAt: 5 } };
    const r = await fetch(`${base}/digital/templates/assets`);
    expect((await r.json()).assets).toEqual(STATE.doc);
    expect(r.headers.get("cache-control")).toContain("max-age=300");
  });
});

describe("POST /digital/templates/:templateId/asset (admin)", () => {
  it("rejects a non-admin caller", async () => {
    CALLER.role = "groom";
    const r = await fetch(`${base}/digital/templates/classic/asset`, { method: "POST" });
    expect(r.status).toBe(403);
    expect(STATE.uploaded).toHaveLength(0);
  });

  it("rejects an unknown templateId before touching Storage", async () => {
    const r = await fetch(`${base}/digital/templates/not-a-template/asset`, { method: "POST" });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("invalid_template_id");
    expect(STATE.uploaded).toHaveLength(0);
  });

  it("uploads a cover and writes the pointer entry", async () => {
    const r = await fetch(`${base}/digital/templates/destination-love/asset`, { method: "POST" });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.templateId).toBe("destination-love");
    expect(body.url).toContain("templateAssets/destination-love/cover_");
    expect(STATE.doc!["destination-love"].storagePath).toMatch(
      /^templateAssets\/destination-love\/cover_\d+\.jpg$/,
    );
    expect(typeof STATE.doc!["destination-love"].updatedAt).toBe("number");
  });

  it("REJECTS image/svg+xml (active markup on a public-read bucket)", async () => {
    STATE.multipart = fileFixture("image/svg+xml", "evil.svg");
    const r = await fetch(`${base}/digital/templates/classic/asset`, { method: "POST" });
    expect(r.status).toBe(415);
    expect(STATE.uploaded).toHaveLength(0);
  });

  it("REJECTS video (covers are stills)", async () => {
    STATE.multipart = fileFixture("video/mp4", "clip.mp4");
    const r = await fetch(`${base}/digital/templates/classic/asset`, { method: "POST" });
    expect(r.status).toBe(415);
    expect(STATE.uploaded).toHaveLength(0);
  });

  it("rejects an oversized (truncated) file with 413", async () => {
    STATE.multipart = { fields: {}, file: { ...fileFixture("image/jpeg").file, truncated: true } };
    const r = await fetch(`${base}/digital/templates/classic/asset`, { method: "POST" });
    expect(r.status).toBe(413);
    expect(STATE.uploaded).toHaveLength(0);
  });

  it("rejects a missing file with 400", async () => {
    STATE.multipart = { fields: {}, file: null };
    const r = await fetch(`${base}/digital/templates/classic/asset`, { method: "POST" });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("missing_file");
  });

  it("MERGES — uploading one template's cover never clobbers another's", async () => {
    STATE.doc = { classic: { url: "keep-me", storagePath: "templateAssets/classic/old.jpg", updatedAt: 1 } };
    await fetch(`${base}/digital/templates/destination-love/asset`, { method: "POST" });
    expect(STATE.doc!.classic.url).toBe("keep-me");
    expect(STATE.doc!["destination-love"]).toBeTruthy();
    // Another template's object must NOT be swept.
    expect(STATE.deleted).toHaveLength(0);
  });

  it("sweeps the superseded object when replacing a cover", async () => {
    STATE.doc = { classic: { url: "old", storagePath: "templateAssets/classic/cover_1.jpg", updatedAt: 1 } };
    await fetch(`${base}/digital/templates/classic/asset`, { method: "POST" });
    expect(STATE.deleted).toEqual(["templateAssets/classic/cover_1.jpg"]);
  });

  it("preserves the real file extension", async () => {
    STATE.multipart = fileFixture("image/png", "art.png");
    await fetch(`${base}/digital/templates/classic/asset`, { method: "POST" });
    expect(STATE.uploaded[0].path).toMatch(/\.png$/);
  });
});

describe("DELETE /digital/templates/:templateId/asset (admin)", () => {
  it("rejects a non-admin caller", async () => {
    CALLER.role = "groom";
    const r = await fetch(`${base}/digital/templates/classic/asset`, { method: "DELETE" });
    expect(r.status).toBe(403);
  });

  it("rejects an unknown templateId", async () => {
    const r = await fetch(`${base}/digital/templates/nope/asset`, { method: "DELETE" });
    expect(r.status).toBe(400);
  });

  it("removes the entry and its Storage object, leaving others intact", async () => {
    STATE.doc = {
      classic: { url: "a", storagePath: "templateAssets/classic/cover_1.jpg", updatedAt: 1 },
      "destination-love": { url: "b", storagePath: "templateAssets/dl/cover_2.jpg", updatedAt: 2 },
    };
    const r = await fetch(`${base}/digital/templates/classic/asset`, { method: "DELETE" });
    expect(await r.json()).toEqual({ ok: true, removed: true });
    expect(STATE.doc!.classic).toBeUndefined();
    expect(STATE.doc!["destination-love"]).toBeTruthy();
    expect(STATE.deleted).toEqual(["templateAssets/classic/cover_1.jpg"]);
  });

  it("is a no-op (not an error) when there is no cover to remove", async () => {
    STATE.doc = null;
    const r = await fetch(`${base}/digital/templates/classic/asset`, { method: "DELETE" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, removed: false });
    expect(STATE.deleted).toHaveLength(0);
  });
});
