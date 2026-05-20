// Unit tests for the confirmation-matching engine — the single most complex
// piece of pure business logic in the app. Covers phone normalization, fuzzy
// name/address similarity, and the green/red/unknown classification cases.
import { describe, it, expect } from "vitest";
import {
  normalizePhoneForMatching,
  phonesEqual,
  nameSimilarity,
  addressSimilarity,
  composeConfirmationAddress,
  classifyConfirmation,
  classifyAll,
  NAME_SIMILAR_THRESHOLD,
  ADDRESS_SIMILAR_THRESHOLD,
} from "../../utils/matchUtils.js";

describe("normalizePhoneForMatching", () => {
  it("strips the +972 country code", () => {
    expect(normalizePhoneForMatching("+972501234567")).toBe("501234567");
  });

  it("strips the 00972 international prefix", () => {
    expect(normalizePhoneForMatching("00972501234567")).toBe("501234567");
  });

  it("strips a bare 972 country code", () => {
    expect(normalizePhoneForMatching("972501234567")).toBe("501234567");
  });

  it("strips the +970 Palestinian country code", () => {
    expect(normalizePhoneForMatching("+970591234567")).toBe("591234567");
  });

  it("strips the 00970 international prefix", () => {
    expect(normalizePhoneForMatching("00970591234567")).toBe("591234567");
  });

  it("strips a national leading zero", () => {
    expect(normalizePhoneForMatching("0501234567")).toBe("501234567");
  });

  it("collapses formatting characters (spaces and dashes)", () => {
    expect(normalizePhoneForMatching("+972 50-123-4567")).toBe("501234567");
  });

  it("leaves an already-bare national number unchanged", () => {
    expect(normalizePhoneForMatching("501234567")).toBe("501234567");
  });

  it("returns empty string for null", () => {
    expect(normalizePhoneForMatching(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(normalizePhoneForMatching(undefined)).toBe("");
  });

  it("returns empty string for an empty string", () => {
    expect(normalizePhoneForMatching("")).toBe("");
  });

  it("returns empty string when there are no digits", () => {
    expect(normalizePhoneForMatching("abc-def")).toBe("");
  });

  it("coerces numeric input to a string", () => {
    expect(normalizePhoneForMatching(972501234567)).toBe("501234567");
  });

  it("all equivalent forms collapse to the same canonical value", () => {
    const forms = [
      "+972501234567",
      "972501234567",
      "00972501234567",
      "0501234567",
      "501234567",
      "050 123 4567",
    ];
    const canonical = forms.map(normalizePhoneForMatching);
    expect(new Set(canonical).size).toBe(1);
    expect(canonical[0]).toBe("501234567");
  });
});

describe("phonesEqual", () => {
  it("treats E.164 and local formats of the same number as equal", () => {
    expect(phonesEqual("+972501234567", "0501234567")).toBe(true);
  });

  it("treats 00972 and bare-972 forms as equal", () => {
    expect(phonesEqual("00972501234567", "972501234567")).toBe(true);
  });

  it("returns false for genuinely different numbers", () => {
    expect(phonesEqual("0501234567", "0509999999")).toBe(false);
  });

  it("returns false when one side is empty", () => {
    expect(phonesEqual("", "0501234567")).toBe(false);
  });

  it("returns false when both sides are empty", () => {
    expect(phonesEqual("", "")).toBe(false);
  });

  it("returns false when both sides are null", () => {
    expect(phonesEqual(null, null)).toBe(false);
  });
});

describe("nameSimilarity", () => {
  it("returns 1 for identical names", () => {
    expect(nameSimilarity("Ahmad Khalil", "Ahmad Khalil")).toBe(1);
  });

  it("returns 1 for case-insensitive matches", () => {
    expect(nameSimilarity("ahmad khalil", "AHMAD KHALIL")).toBe(1);
  });

  it("returns 1 for reordered words (Jaccard word-set)", () => {
    expect(nameSimilarity("Ali Muhammad", "Muhammad Ali")).toBe(1);
  });

  it("returns 0 when either name is empty", () => {
    expect(nameSimilarity("", "Ahmad Khalil")).toBe(0);
    expect(nameSimilarity("Ahmad Khalil", "")).toBe(0);
  });

  it("returns 0 for null inputs", () => {
    expect(nameSimilarity(null, null)).toBe(0);
  });

  it("scores completely different names below the threshold", () => {
    expect(nameSimilarity("Ahmad Khalil", "Yosef Cohen")).toBeLessThan(NAME_SIMILAR_THRESHOLD);
  });

  it("ignores Latin diacritics (NFD normalization)", () => {
    expect(nameSimilarity("café crème", "cafe creme")).toBe(1);
  });

  it("partially normalizes Arabic alef variants (NFD-decomposed hamza is not stripped)", () => {
    // [BUG-PRONE] normalizeText runs .normalize("NFD") before its [آأإ]→ا
    // replacement. NFD decomposes precomposed أ (U+0623) into bare alef +
    // combining hamza (U+0654), which sits outside both the Latin
    // (U+0300–036F) and the tashkeel (U+064B–0652) strip ranges — so the
    // [آأإ] replace never matches the decomposed form. The score stays well
    // above the match threshold but does not reach an exact 1.0.
    const score = nameSimilarity("أحمد علي", "احمد علي");
    expect(score).toBeGreaterThanOrEqual(NAME_SIMILAR_THRESHOLD);
    expect(score).toBeLessThan(1);
  });

  it("normalizes taa marbuta to haa", () => {
    expect(nameSimilarity("فاطمة علي", "فاطمه علي")).toBe(1);
  });

  it("returns a value in the [0,1] range for partial matches", () => {
    const s = nameSimilarity("Muhammad Ali", "Mohammed Ali");
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});

describe("addressSimilarity", () => {
  it("returns 1 for identical addresses", () => {
    expect(addressSimilarity("Haifa", "Haifa")).toBe(1);
  });

  it("returns 1 for case-insensitive matches", () => {
    expect(addressSimilarity("haifa", "HAIFA")).toBe(1);
  });

  it("returns 0 when either address is empty", () => {
    expect(addressSimilarity("", "Haifa")).toBe(0);
    expect(addressSimilarity("Haifa", "")).toBe(0);
  });

  it("scores a partial multi-word match above the threshold", () => {
    expect(addressSimilarity("Tel Aviv Rothschild", "Tel Aviv")).toBeGreaterThanOrEqual(ADDRESS_SIMILAR_THRESHOLD);
  });

  it("uses character bigrams for single-word addresses", () => {
    // "haifa" vs "haifo" share 3 of 4 bigrams → dice 0.75
    expect(addressSimilarity("Haifa", "Haifo")).toBeCloseTo(0.75, 5);
  });

  it("scores unrelated addresses below the threshold", () => {
    expect(addressSimilarity("Tel Aviv", "Nazareth")).toBeLessThan(ADDRESS_SIMILAR_THRESHOLD);
  });
});

describe("composeConfirmationAddress", () => {
  it("joins city, street, and house with spaces", () => {
    expect(composeConfirmationAddress({
      submittedCity: "Haifa", submittedStreet: "Main St", submittedHouse: "5",
    })).toBe("Haifa Main St 5");
  });

  it("omits missing parts", () => {
    expect(composeConfirmationAddress({ submittedCity: "Haifa" })).toBe("Haifa");
  });

  it("omits whitespace-only parts", () => {
    expect(composeConfirmationAddress({
      submittedCity: "Haifa", submittedStreet: "   ", submittedHouse: "",
    })).toBe("Haifa");
  });

  it("returns empty string for a null confirmation", () => {
    expect(composeConfirmationAddress(null)).toBe("");
  });

  it("returns empty string when every part is missing", () => {
    expect(composeConfirmationAddress({})).toBe("");
  });
});

describe("classifyConfirmation", () => {
  const guest = {
    groomUid: "g1", phone: "0501234567", name: "Ahmad Khalil", area: "Haifa",
  };

  it("returns green when phone, name, and address all match (Case A)", () => {
    const conf = {
      groomUid: "g1", submittedPhone: "+972501234567",
      submittedName: "Ahmad Khalil", submittedCity: "Haifa",
    };
    const result = classifyConfirmation(conf, [guest]);
    expect(result.status).toBe("green");
    expect(result.guest).toBe(guest);
    expect(result.reasons).toEqual([]);
  });

  it("returns green when name matches and the guest record has no address (Case B)", () => {
    const noAddrGuest = { ...guest, area: "" };
    const conf = {
      groomUid: "g1", submittedPhone: "0501234567",
      submittedName: "Ahmad Khalil", submittedCity: "Haifa",
    };
    const result = classifyConfirmation(conf, [noAddrGuest]);
    expect(result.status).toBe("green");
    expect(result.reasons).toEqual([]);
  });

  it("returns green when the guest has no address and the confirmation has none either", () => {
    const noAddrGuest = { ...guest, area: "" };
    const conf = {
      groomUid: "g1", submittedPhone: "0501234567", submittedName: "Ahmad Khalil",
    };
    expect(classifyConfirmation(conf, [noAddrGuest]).status).toBe("green");
  });

  it("returns red with name_differs when the name does not match (Case C)", () => {
    const conf = {
      groomUid: "g1", submittedPhone: "0501234567",
      submittedName: "Yosef Cohen", submittedCity: "Haifa",
    };
    const result = classifyConfirmation(conf, [guest]);
    expect(result.status).toBe("red");
    expect(result.guest).toBe(guest);
    expect(result.reasons).toContain("name_differs");
  });

  it("returns red with address_differs when the address does not match (Case C)", () => {
    const conf = {
      groomUid: "g1", submittedPhone: "0501234567",
      submittedName: "Ahmad Khalil", submittedCity: "Nazareth",
    };
    const result = classifyConfirmation(conf, [guest]);
    expect(result.status).toBe("red");
    expect(result.reasons).toContain("address_differs");
  });

  it("returns red with both reasons when name and address differ", () => {
    const conf = {
      groomUid: "g1", submittedPhone: "0501234567",
      submittedName: "Yosef Cohen", submittedCity: "Nazareth",
    };
    const result = classifyConfirmation(conf, [guest]);
    expect(result.status).toBe("red");
    expect(result.reasons).toContain("name_differs");
    expect(result.reasons).toContain("address_differs");
  });

  it("returns unknown when the phone matches no guest (Case D)", () => {
    const conf = {
      groomUid: "g1", submittedPhone: "0509999999",
      submittedName: "Ahmad Khalil", submittedCity: "Haifa",
    };
    const result = classifyConfirmation(conf, [guest]);
    expect(result.status).toBe("unknown");
    expect(result.guest).toBeNull();
  });

  it("returns unknown for a null confirmation", () => {
    const result = classifyConfirmation(null, [guest]);
    expect(result.status).toBe("unknown");
    expect(result.guest).toBeNull();
  });

  it("returns unknown when the submitted phone is empty", () => {
    const conf = { groomUid: "g1", submittedPhone: "", submittedName: "Ahmad Khalil" };
    expect(classifyConfirmation(conf, [guest]).status).toBe("unknown");
  });

  it("returns unknown when the submitted phone has no digits", () => {
    const conf = { groomUid: "g1", submittedPhone: "n/a", submittedName: "Ahmad Khalil" };
    expect(classifyConfirmation(conf, [guest]).status).toBe("unknown");
  });

  it("only matches a guest belonging to the same groomUid", () => {
    const otherGroomGuest = { ...guest, groomUid: "g2" };
    const conf = {
      groomUid: "g1", submittedPhone: "0501234567", submittedName: "Ahmad Khalil",
    };
    expect(classifyConfirmation(conf, [otherGroomGuest]).status).toBe("unknown");
  });

  it("matches any guest in a flat list when the confirmation has no groomUid", () => {
    // [DESIGN DECISION: INTENTIONAL] a falsy conf.groomUid disables the guard
    // so an admin-bulk flat list can still be searched by phone alone.
    const conf = {
      submittedPhone: "0501234567", submittedName: "Ahmad Khalil", submittedCity: "Haifa",
    };
    expect(classifyConfirmation(conf, [guest]).status).toBe("green");
  });

  it("tolerates Arabic spelling variants in the name", () => {
    const arabicGuest = { ...guest, name: "أحمد خليل" };
    const conf = {
      groomUid: "g1", submittedPhone: "0501234567",
      submittedName: "احمد خليل", submittedCity: "Haifa",
    };
    expect(classifyConfirmation(conf, [arabicGuest]).status).toBe("green");
  });
});

describe("classifyAll", () => {
  it("returns an empty Map for empty inputs", () => {
    const out = classifyAll([], []);
    expect(out).toBeInstanceOf(Map);
    expect(out.size).toBe(0);
  });

  it("treats null inputs as empty", () => {
    expect(classifyAll(null, null).size).toBe(0);
  });

  it("keys the result Map by confirmation id", () => {
    const guests = [{ groomUid: "g1", phone: "0501234567", name: "Ahmad Khalil", area: "Haifa" }];
    const confs = [{
      id: "c1", groomUid: "g1", submittedPhone: "0501234567",
      submittedName: "Ahmad Khalil", submittedCity: "Haifa",
    }];
    const out = classifyAll(confs, guests);
    expect(out.get("c1").status).toBe("green");
  });

  it("isolates guests by groom — a confirmation for groom g1 cannot match a g2 guest", () => {
    const guests = [{ groomUid: "g2", phone: "0501234567", name: "Ahmad Khalil", area: "Haifa" }];
    const confs = [{
      id: "c1", groomUid: "g1", submittedPhone: "0501234567",
      submittedName: "Ahmad Khalil", submittedCity: "Haifa",
    }];
    expect(classifyAll(confs, guests).get("c1").status).toBe("unknown");
  });

  it("classifies multiple confirmations independently", () => {
    const guests = [
      { groomUid: "g1", phone: "0501111111", name: "Ahmad Khalil", area: "Haifa" },
      { groomUid: "g1", phone: "0502222222", name: "Sara Levi", area: "Tel Aviv" },
    ];
    const confs = [
      { id: "c1", groomUid: "g1", submittedPhone: "0501111111", submittedName: "Ahmad Khalil", submittedCity: "Haifa" },
      { id: "c2", groomUid: "g1", submittedPhone: "0509999999", submittedName: "Nobody Here", submittedCity: "X" },
    ];
    const out = classifyAll(confs, guests);
    expect(out.get("c1").status).toBe("green");
    expect(out.get("c2").status).toBe("unknown");
  });

  it("skips guest records that have no groomUid", () => {
    const guests = [{ phone: "0501234567", name: "Ahmad Khalil", area: "Haifa" }];
    const confs = [{
      id: "c1", groomUid: "g1", submittedPhone: "0501234567",
      submittedName: "Ahmad Khalil", submittedCity: "Haifa",
    }];
    expect(classifyAll(confs, guests).get("c1").status).toBe("unknown");
  });
});

describe("similarity thresholds", () => {
  it("exposes the documented name and address thresholds", () => {
    expect(NAME_SIMILAR_THRESHOLD).toBe(0.55);
    expect(ADDRESS_SIMILAR_THRESHOLD).toBe(0.4);
  });
});
