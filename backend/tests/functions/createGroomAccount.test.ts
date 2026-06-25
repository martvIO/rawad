// Unit tests for the shared post-payment account-provisioning service, driven
// through the in-memory UserStore (no emulator). Verifies the atomic
// account+indices+ledger invariant, the claims shape, the collision guards, and
// that the extra ledger/token/password writes land in the SAME update.
import { describe, it, expect, beforeEach } from "vitest";
import { inMemoryUserStore } from "./support/inMemoryUserStore";
import {
  createGroomAccount,
  GroomAccountError,
} from "../../functions/src/api/services/createGroomAccount";
import { PACKAGES } from "../../functions/src/config/packages";

let mem: ReturnType<typeof inMemoryUserStore>;

beforeEach(() => {
  mem = inMemoryUserStore({
    users: { existing: { username: "taken", role: "groom", phoneE164: "+972500000000" } },
    usernameIndex: { taken: "existing" },
    phoneIndex: { "972500000000": "existing" },
  });
});

const BASE = {
  username: "newgroom",
  phoneE164: "+972511111111",
  password: "Abcd1234!xyz",
  features: PACKAGES.vip.features,
  createdBy: "lemonsqueezy",
};

describe("createGroomAccount", () => {
  it("writes the profile + both indices + groom profile, sets claims, returns uid", async () => {
    const { uid } = await createGroomAccount(mem.store, {
      ...BASE,
      extraProfile: { mustChangePassword: true, paymentPackageId: "vip" },
    });
    expect(uid).toBeTruthy();
    const u = mem.rtdb.users[uid];
    expect(u.username).toBe("newgroom");
    expect(u.role).toBe("groom");
    expect(u.createdBy).toBe("lemonsqueezy");
    expect(u.phoneE164).toBe("+972511111111");
    expect(u.canUseBoardingPass).toBe(true); // from VIP features
    expect(u.mustChangePassword).toBe(true);
    expect(u.paymentPackageId).toBe("vip");
    expect(mem.rtdb.usernameIndex.newgroom).toBe(uid);
    expect(mem.rtdb.phoneIndex["972511111111"]).toBe(uid);
    expect(mem.rtdb.groomProfiles[uid]).toEqual({ username: "newgroom" });
    expect(mem.authUsers[uid].customClaims).toEqual({ role: "groom", username: "newgroom" });
    expect(mem.authUsers[uid].email).toBe("newgroom@dawa.local");
  });

  it("merges buildExtraUpdates (ledger, generated password, token, reservation release) atomically", async () => {
    mem.rtdb.usernameReservations = { newgroom: { token: "tok", expiresAt: Date.now() + 1000 } };
    const { uid } = await createGroomAccount(mem.store, {
      ...BASE,
      buildExtraUpdates: (newUid) => ({
        [`generatedPasswords/${newUid}`]: { password: BASE.password, createdAt: 1, token: "tok" },
        [`purchases/tok`]: { uid: newUid, packageId: "vip", amountIls: 2000, paidAt: 1 },
        [`paymentTokens/tok/status`]: "paid",
        [`paymentTokens/tok/createdUid`]: newUid,
        [`usernameReservations/newgroom`]: null,
      }),
    });
    expect(mem.rtdb.generatedPasswords[uid].password).toBe(BASE.password);
    expect(mem.rtdb.purchases.tok.uid).toBe(uid);
    expect(mem.rtdb.paymentTokens.tok.status).toBe("paid");
    expect(mem.rtdb.paymentTokens.tok.createdUid).toBe(uid);
    expect(mem.rtdb.usernameReservations.newgroom).toBeUndefined(); // released
  });

  it("throws GroomAccountError(username_taken) on a username collision — no auth user created", async () => {
    const before = Object.keys(mem.authUsers).length;
    await expect(
      createGroomAccount(mem.store, { ...BASE, username: "taken" }),
    ).rejects.toBeInstanceOf(GroomAccountError);
    expect(Object.keys(mem.authUsers).length).toBe(before);
  });

  it("throws GroomAccountError(phone_taken) on a phone collision", async () => {
    await expect(
      createGroomAccount(mem.store, { ...BASE, phoneE164: "+972500000000" }),
    ).rejects.toMatchObject({ code: "phone_taken" });
  });

  it("deletes the orphaned Auth user when the RTDB write fails (no orphan left for retries to collide on)", async () => {
    // Make the atomic write blow up AFTER the Auth user is created.
    const store = mem.store;
    store.applyUpdates = async () => { throw new Error("rtdb_down"); };
    await expect(createGroomAccount(store, BASE)).rejects.toThrow("rtdb_down");
    // The Auth user created mid-flight must have been rolled back, so a Stripe
    // retry won't hit auth/email-already-exists on the synthetic email.
    const created = Object.values(mem.authUsers).find(
      (u) => u.email === "newgroom@dawa.local",
    );
    expect(created).toBeUndefined();
  });
});
