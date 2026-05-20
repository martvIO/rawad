// Unit tests for the delivery/reply status maps and the reply-state deriver.
import { describe, it, expect } from "vitest";
import { STATUS, REPLY_STATUS, replyStateOf } from "../../data/status.js";

describe("replyStateOf", () => {
  it("returns confirmed when confirmedAt is set", () => {
    expect(replyStateOf({ confirmedAt: 1700000000000 })).toBe("confirmed");
  });

  it("returns pending when only inviteLinkSentAt is set", () => {
    expect(replyStateOf({ inviteLinkSentAt: 1700000000000 })).toBe("pending");
  });

  it("returns notSent when neither field is set", () => {
    expect(replyStateOf({})).toBe("notSent");
  });

  it("returns notSent for a null guest", () => {
    expect(replyStateOf(null)).toBe("notSent");
  });

  it("returns notSent for an undefined guest", () => {
    expect(replyStateOf(undefined)).toBe("notSent");
  });

  it("prefers confirmed when both timestamps are present", () => {
    expect(replyStateOf({ confirmedAt: 2, inviteLinkSentAt: 1 })).toBe("confirmed");
  });

  it("treats a zero confirmedAt as not confirmed and falls through to pending", () => {
    expect(replyStateOf({ confirmedAt: 0, inviteLinkSentAt: 1 })).toBe("pending");
  });

  it("returns notSent when both timestamps are zero", () => {
    expect(replyStateOf({ confirmedAt: 0, inviteLinkSentAt: 0 })).toBe("notSent");
  });
});

describe("STATUS map", () => {
  it("has a fully-populated entry for each delivery status", () => {
    for (const key of ["pending", "enroute", "delivered"]) {
      expect(STATUS[key]).toMatchObject({
        label: expect.any(String),
        color: expect.any(String),
        bg: expect.any(String),
        icon: expect.any(String),
      });
    }
  });
});

describe("REPLY_STATUS map", () => {
  it("has a presentation entry for each reply state", () => {
    for (const key of ["notSent", "pending", "confirmed"]) {
      expect(REPLY_STATUS[key]).toMatchObject({
        color: expect.any(String),
        bg: expect.any(String),
        icon: expect.any(String),
      });
    }
  });
});
