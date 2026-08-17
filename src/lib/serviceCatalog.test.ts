import { describe, it, expect } from "vitest";
import { resolveServiceOptions, addCustomService } from "@/lib/serviceCatalog";

describe("service catalog", () => {
  it("keeps the legacy clinic library for regular clinics", () => {
    const options = resolveServiceOptions({ module: "clinica", services: [] }, ["Implante", "Prótese"]);
    expect(options).toEqual(["Implante", "Prótese"]);
  });

  it("starts empty for a new corretor and saves new services", () => {
    const base = resolveServiceOptions({ module: "corretor", services: [] }, []);
    expect(base).toEqual([]);

    const next = addCustomService(base, "Aparelho Invisalign");
    expect(next).toEqual(["Aparelho Invisalign"]);
  });

  it("treats legacy Henrique profiles without module as corretor", () => {
    const base = resolveServiceOptions({ id: "henrique-pereira", name: "Henrique Pereira", services: [] }, []);
    expect(base).toEqual([]);

    const next = addCustomService(base, "Consultoria imobiliária");
    expect(next).toEqual(["Consultoria imobiliária"]);
  });
});
