// Reusable tree-backed in-memory DbPort fake (the "second adapter") for domain
// unit tests — the emulator-free counterpart to firebaseAdapters.rtdbPort.
//
// The existing guest/confirmation store tests inline an identical get/set/update/
// remove fake; this support module adds the `transaction` op too (compare-and-set
// over a single path) so the invite-token claim and other CAS guards are
// testable without an emulator. New seam tests should prefer this over re-inlining.

import { DbPort } from "../../../functions/src/domain/ports";

type Obj = Record<string, any>;

function getAt(tree: Obj, path: string): unknown {
  let node: any = tree;
  for (const k of path.split("/")) {
    if (node === null || node === undefined || typeof node !== "object") return null;
    node = node[k];
  }
  return node === undefined ? null : node;
}

function setAt(tree: Obj, path: string, value: unknown): void {
  const parts = path.split("/");
  const last = parts.pop()!;
  let node: any = tree;
  for (const k of parts) {
    if (typeof node[k] !== "object" || node[k] === null) node[k] = {};
    node = node[k];
  }
  if (value === null || value === undefined) delete node[last];
  else node[last] = value;
}

/**
 * Build an in-memory DbPort over a deep clone of `seed`. Returns the port plus
 * the live `tree` so tests can assert post-state directly.
 */
export function inMemoryDb(seed: Record<string, unknown> = {}): {
  db: DbPort;
  tree: Obj;
} {
  const tree: Obj = structuredClone(seed);
  const db: DbPort = {
    async get(path) {
      return getAt(tree, path);
    },
    async update(updates) {
      for (const [p, v] of Object.entries(updates)) setAt(tree, p, v);
    },
    async set(path, value) {
      setAt(tree, path, value);
    },
    async remove(path) {
      setAt(tree, path, null);
    },
    async transaction(path, transform) {
      const current = getAt(tree, path);
      const next = transform(current === undefined ? null : current);
      if (next === undefined) return { committed: false };
      setAt(tree, path, next);
      return { committed: true };
    },
  };
  return { db, tree };
}
