// Production adapters: bind the narrow domain ports to the real Firebase
// Admin SDK. Built PER REQUEST (not at module load) so SDK handles resolve at
// request time exactly as the pre-extraction handlers did.
//
// These are the FIRST adapter for each port; the in-memory fakes in
// tests/functions/*.test.ts are the second. Keep these wrappers dumb — all
// behaviour lives in the domain modules, so there is nothing here worth
// unit-testing past the one-line SDK pass-throughs.

import { getDatabase } from "firebase-admin/database";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Query } from "firebase-admin/firestore";
import { DbPort, AuthPort, FirestorePort, FsBatchOp } from "./ports";

// Reuse the SDK's own parameter types so the adapter stays in lock-step with
// firebase-admin without importing named request types.
type CreateReq = Parameters<ReturnType<typeof getAuth>["createUser"]>[0];
type UpdateReq = Parameters<ReturnType<typeof getAuth>["updateUser"]>[1];

/** Realtime Database adapter. `get` collapses `!exists()` to `null`. */
export function rtdbPort(): DbPort {
  const db = getDatabase();
  return {
    async get(path) {
      const snap = await db.ref(path).get();
      return snap.exists() ? snap.val() : null;
    },
    async update(updates) {
      await db.ref().update(updates);
    },
    async set(path, value) {
      await db.ref(path).set(value);
    },
    async remove(path) {
      await db.ref(path).remove();
    },
    async transaction(path, transform) {
      // RTDB hands the transform `null` for an absent path and aborts the write
      // when it returns `undefined` — the exact contract the DbPort declares, so
      // this is a straight pass-through.
      const result = await db
        .ref(path)
        .transaction((current) =>
          transform(current === undefined ? null : current),
        );
      return { committed: result.committed };
    },
  };
}

/** Firestore adapter — thin pass-through to the Admin SDK. */
export function firestorePort(): FirestorePort {
  const fs = getFirestore();
  return {
    async list(collectionPath, opts) {
      let q: Query = fs.collection(collectionPath);
      if (opts?.orderBy) q = q.orderBy(opts.orderBy.field, opts.orderBy.dir);
      const snap = await q.get();
      return snap.docs.map((d) => ({
        id: d.id,
        data: d.data() as Record<string, unknown>,
      }));
    },
    async get(docPath) {
      const snap = await fs.doc(docPath).get();
      return snap.exists
        ? { id: snap.id, data: snap.data() as Record<string, unknown> }
        : null;
    },
    async findByField(collectionPath, field, value) {
      const snap = await fs
        .collection(collectionPath)
        .where(field, "==", value)
        .get();
      return snap.docs.map((d) => ({
        id: d.id,
        data: d.data() as Record<string, unknown>,
      }));
    },
    async add(collectionPath, data) {
      const ref = await fs.collection(collectionPath).add(data);
      return ref.id;
    },
    async update(docPath, patch) {
      await fs.doc(docPath).update(patch);
    },
    async setMerge(docPath, data) {
      await fs.doc(docPath).set(data, { merge: true });
    },
    async remove(docPath) {
      await fs.doc(docPath).delete();
    },
    async batchWrite(ops: FsBatchOp[]) {
      const batch = fs.batch();
      for (const op of ops) {
        if (op.type === "update") batch.update(fs.doc(op.docPath), op.patch);
        else batch.delete(fs.doc(op.docPath));
      }
      await batch.commit();
    },
    async listGroup(collectionId) {
      const snap = await fs.collectionGroup(collectionId).get();
      return snap.docs.map((d) => ({
        id: d.id,
        parentId: d.ref.parent.parent?.id ?? "",
        data: d.data() as Record<string, unknown>,
      }));
    },
    async transactDoc(docPath, decide) {
      const ref = fs.doc(docPath);
      return fs.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const current = snap.exists
          ? { id: snap.id, data: snap.data() as Record<string, unknown> }
          : null;
        const outcome = decide(current);
        if ("write" in outcome) tx.set(ref, outcome.write, { merge: true });
        return outcome.result;
      });
    },
    async addAfterScan(collectionPath, decide) {
      const col = fs.collection(collectionPath);
      return fs.runTransaction(async (tx) => {
        const snap = await tx.get(col);
        const existing = snap.docs.map((d) => ({
          id: d.id,
          data: d.data() as Record<string, unknown>,
        }));
        const data = decide(existing);
        if (data === undefined) return { added: false, id: null };
        const ref = col.doc(); // fresh auto id
        tx.set(ref, data);
        return { added: true, id: ref.id };
      });
    },
  };
}

/** Firebase Auth adapter — thin pass-through to the Admin SDK. */
export function authPort(): AuthPort {
  const auth = getAuth();
  return {
    async createUser(payload) {
      const rec = await auth.createUser(payload as CreateReq);
      return { uid: rec.uid };
    },
    async updateUser(uid, patch) {
      await auth.updateUser(uid, patch as UpdateReq);
    },
    async deleteUser(uid) {
      await auth.deleteUser(uid);
    },
    async getUser(uid) {
      const rec = await auth.getUser(uid);
      return {
        uid: rec.uid,
        customClaims: rec.customClaims as Record<string, unknown> | undefined,
      };
    },
    async setCustomUserClaims(uid, claims) {
      await auth.setCustomUserClaims(uid, claims);
    },
    async revokeRefreshTokens(uid) {
      await auth.revokeRefreshTokens(uid);
    },
  };
}
