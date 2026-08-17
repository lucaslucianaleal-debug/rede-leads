import { describe, it, expect } from "vitest";
import { normalizeUserClinicBindings } from "@/lib/userAccess";

describe("user clinic bindings", () => {
  it("creates a brand-new user or corretor with no clinic linkage", () => {
    const bindings = normalizeUserClinicBindings({ uid: "new-user" });

    expect(bindings).toEqual({
      clinicId: null,
      clinicIds: [],
      clinics: [],
      hasWildcard: false,
      explicit: [],
    });
  });

  it("does not inherit stale clinic links from a previous session", () => {
    const bindings = normalizeUserClinicBindings({
      uid: "new-user",
      clinicId: "odontocompany-limpeza",
      clinics: ["odontocompany-limpeza"],
      clinicIds: ["odontocompany-limpeza"],
    });

    expect(bindings).toEqual({
      clinicId: "odontocompany-limpeza",
      clinicIds: ["odontocompany-limpeza"],
      clinics: ["odontocompany-limpeza"],
      hasWildcard: false,
      explicit: ["odontocompany-limpeza"],
    });
  });
});
