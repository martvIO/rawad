// Reusable in-memory FirestorePort fake (the "second adapter") for digital
// domain unit tests — the emulator-free counterpart to
// firebaseAdapters.firestorePort.
//
// Collections are modelled as a Map<collectionPath, Map<docId, data>>. The
// `addAfterScan` op is atomic by construction (it reads + decides + writes in a
// single synchronous call), which mirrors the production runTransaction: two
// sequential calls therefore serialise, so a duplicate-guard test sees the first
// insert win and the second observe it.

import {
  FirestorePort,
  FsDoc,
  FsBatchOp,
  FsGroupDoc,
} from "../../../functions/src/domain/ports";

type DocData = Record<string, unknown>;

export function inMemoryFirestore(
  seed: Record<string, Record<string, DocData>> = {},
): { fs: FirestorePort; cols: Map<string, Map<string, DocData>> } {
  const cols = new Map<string, Map<string, DocData>>();
  for (const [cp, docs] of Object.entries(seed)) {
    cols.set(cp, new Map(Object.entries(structuredClone(docs))));
  }
  let auto = 0;

  const colOf = (path: string): Map<string, DocData> => {
    if (!cols.has(path)) cols.set(path, new Map());
    return cols.get(path)!;
  };
  const splitDoc = (docPath: string): [string, string] => {
    const i = docPath.lastIndexOf("/");
    return [docPath.slice(0, i), docPath.slice(i + 1)];
  };
  const snapshot = (m: Map<string, DocData>): FsDoc[] =>
    [...m.entries()].map(([id, data]) => ({ id, data }));

  const fs: FirestorePort = {
    async list(collectionPath, opts) {
      const docs = snapshot(cols.get(collectionPath) ?? new Map());
      if (opts?.orderBy) {
        const { field, dir } = opts.orderBy;
        docs.sort((a, b) => {
          const av = a.data[field] as never;
          const bv = b.data[field] as never;
          const c = av < bv ? -1 : av > bv ? 1 : 0;
          return dir === "desc" ? -c : c;
        });
      }
      return docs;
    },
    async get(docPath) {
      const [cp, id] = splitDoc(docPath);
      const data = cols.get(cp)?.get(id);
      return data ? { id, data } : null;
    },
    async findByField(collectionPath, field, value) {
      return snapshot(cols.get(collectionPath) ?? new Map()).filter(
        (d) => d.data[field] === value,
      );
    },
    async add(collectionPath, data) {
      const id = `fsdoc${++auto}`;
      colOf(collectionPath).set(id, data);
      return id;
    },
    async update(docPath, patch) {
      const [cp, id] = splitDoc(docPath);
      const m = cols.get(cp);
      if (!m || !m.has(id)) {
        // Mirror Firestore .update() on a missing doc: it rejects.
        throw new Error(`NOT_FOUND: ${docPath}`);
      }
      m.set(id, { ...m.get(id)!, ...patch });
    },
    async setMerge(docPath, data) {
      const [cp, id] = splitDoc(docPath);
      const m = colOf(cp);
      m.set(id, { ...(m.get(id) ?? {}), ...data });
    },
    async remove(docPath) {
      const [cp, id] = splitDoc(docPath);
      cols.get(cp)?.delete(id);
    },
    async batchWrite(ops: FsBatchOp[]) {
      for (const op of ops) {
        const [cp, id] = splitDoc(op.docPath);
        if (op.type === "update") {
          const m = cols.get(cp);
          if (!m || !m.has(id)) throw new Error(`NOT_FOUND: ${op.docPath}`);
          m.set(id, { ...m.get(id)!, ...op.patch });
        } else {
          cols.get(cp)?.delete(id);
        }
      }
    },
    async listGroup(collectionId) {
      const out: FsGroupDoc[] = [];
      for (const [cp, m] of cols.entries()) {
        const parts = cp.split("/");
        if (parts[parts.length - 1] !== collectionId) continue;
        const parentId = parts[parts.length - 2] ?? "";
        for (const [id, data] of m.entries()) out.push({ id, parentId, data });
      }
      return out;
    },
    async transactDoc(docPath, decide) {
      const [cp, id] = splitDoc(docPath);
      const data = cols.get(cp)?.get(id);
      const current = data ? { id, data } : null;
      const outcome = decide(current);
      if ("write" in outcome) {
        const m = colOf(cp);
        m.set(id, { ...(m.get(id) ?? {}), ...outcome.write });
      }
      return outcome.result;
    },
    async addAfterScan(collectionPath, decide) {
      const m = colOf(collectionPath);
      const data = decide(snapshot(m));
      if (data === undefined) return { added: false, id: null };
      const id = `fsdoc${++auto}`;
      m.set(id, data);
      return { added: true, id };
    },
  };
  return { fs, cols };
}
