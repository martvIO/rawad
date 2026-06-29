// API helper for the integration journeys — drives the REST API directly
// (login + Bearer calls) for steps that are either admin-only or whose UI
// selectors aren't stable enough to assert a JOURNEY on. The journeys use the
// UI for the human-facing flows (guest RSVP, driver, confirm) and this helper
// for setup/mutation/verification, so a multi-feature story stays robust.

import type { APIRequestContext } from "@playwright/test";
import { API } from "./stubs";

export interface Session {
  idToken: string;
  uid: string;
  role: string;
  username: string;
}

function decodeJwt(token: string): Record<string, any> {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(part, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

// API calls go through the emulator, which can briefly stall under suite load;
// use a generous per-request timeout (the global 8s actionTimeout is too tight).
const API_TIMEOUT = 30_000;

export async function apiLogin(request: APIRequestContext, username: string, password: string): Promise<Session> {
  const res = await request.post(`${API}/auth/login`, { data: { username, password }, timeout: API_TIMEOUT });
  if (!res.ok()) throw new Error(`login ${username} failed: ${res.status()} ${await res.text()}`);
  const json = await res.json();
  const claims = decodeJwt(json.idToken);
  return { idToken: json.idToken, uid: claims.user_id || claims.sub, role: claims.role, username: claims.username };
}

export async function apiCall(
  request: APIRequestContext,
  method: "get" | "post" | "patch" | "delete" | "put",
  path: string,
  opts: { token?: string; data?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await request[method](`${API}${path}`, { headers, data: opts.data as any, timeout: API_TIMEOUT });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status(), ok: res.ok(), body };
}

/** Mint a physical invite token for a guest (admin-only). Returns the token. */
export async function mintInvite(request: APIRequestContext, admin: Session, groomUid: string, guestId: string): Promise<string> {
  const r = await apiCall(request, "post", "/invites", { token: admin.idToken, data: { groomUid, guestId } });
  if (r.status !== 200 || !r.body?.token) throw new Error(`mint invite failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.token;
}

/** Find a guest id by name under a groom (groom or admin token). */
export async function findGuestId(request: APIRequestContext, session: Session, groomUid: string, name: string): Promise<string | null> {
  const r = await apiCall(request, "get", `/guests/${groomUid}`, { token: session.idToken });
  if (!Array.isArray(r.body)) return null;
  const g = r.body.find((x: any) => x.name === name);
  return g?.id ?? null;
}
