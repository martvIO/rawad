// Admin-settings domain module — the deep interface over the RTDB /adminSettings
// node.
//
// It owns ONLY persistence. The route keeps every transport concern: auth, the
// PATCH allowlist + per-field validation (validatePatch, mirroring
// database.rules.json) and the public-contact projection (projectPublicContact).
// Like the guest/confirmation modules it follows the port-seam shape — a narrow
// DbPort, unit-testable with an in-memory fake, no emulator.
//
// Behaviour is a verbatim lift of the pre-extraction settings.ts handlers:
//   read    /adminSettings, or {} when the node is absent
//   patch   shallow-merge the given keys (mirrors ref("adminSettings").update)

import { DbPort } from "../ports";

export interface SettingsStore {
  read(): Promise<Record<string, unknown>>;
  patch(fields: Record<string, unknown>): Promise<void>;
}

export function makeSettingsStore(deps: { db: DbPort }): SettingsStore {
  const { db } = deps;
  return {
    async read() {
      return ((await db.get("adminSettings")) ?? {}) as Record<string, unknown>;
    },
    async patch(fields) {
      // Per-field multi-path update = shallow merge at /adminSettings, matching
      // the legacy ref("adminSettings").update(patch). A whole-node set would
      // clobber unspecified siblings.
      const updates: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        updates[`adminSettings/${k}`] = v;
      }
      await db.update(updates);
    },
  };
}
