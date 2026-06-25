// @vitest-environment node
//
// Pure-logic tests for the admin-settings domain module
// (domain/settings/settingsStore.ts). No emulator: the RTDB dependency is the
// in-memory DbPort fake.
import { describe, it, expect } from "vitest";
import { makeSettingsStore } from "../../functions/src/domain/settings/settingsStore";
import { inMemoryDb } from "./support/inMemoryDb";

describe("makeSettingsStore", () => {
  it("read() returns {} when /adminSettings is absent", async () => {
    const { db } = inMemoryDb();
    expect(await makeSettingsStore({ db }).read()).toEqual({});
  });

  it("read() returns the stored settings node", async () => {
    const { db } = inMemoryDb({ adminSettings: { mode: "digital", contactPhone: "050" } });
    expect(await makeSettingsStore({ db }).read()).toEqual({
      mode: "digital",
      contactPhone: "050",
    });
  });

  it("patch() shallow-merges — unspecified keys survive", async () => {
    const { db, tree } = inMemoryDb({
      adminSettings: { mode: "manual", messageBody: "hi", contactPhone: "050" },
    });
    await makeSettingsStore({ db }).patch({ mode: "digital", contactPhoneEnabled: true });
    expect(tree.adminSettings).toEqual({
      mode: "digital", // overwritten
      messageBody: "hi", // preserved
      contactPhone: "050", // preserved
      contactPhoneEnabled: true, // added
    });
  });

  it("patch() then read() round-trips", async () => {
    const { db } = inMemoryDb();
    const store = makeSettingsStore({ db });
    await store.patch({ contactEmail: "a@b.com", contactEmailEnabled: true });
    expect(await store.read()).toEqual({
      contactEmail: "a@b.com",
      contactEmailEnabled: true,
    });
  });
});
