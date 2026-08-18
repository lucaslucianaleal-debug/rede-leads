import { describe, it, expect } from "vitest";
import {
  resolveServiceOptions,
  addCustomService,
  CORRETOR_SERVICE_LIBRARY,
} from "@/lib/serviceCatalog";

describe("service catalog", () => {
  it("keeps the legacy clinic library for regular clinics", () => {
    const options = resolveServiceOptions({ module: "clinica", customServices: [] }, ["Implante", "Prótese"]);
    expect(options).toEqual(["Implante", "Prótese"]);
  });

  it("uses the corretor real-estate catalog for all corretor profiles", () => {
    const base = resolveServiceOptions({ module: "corretor", services: [] }, []);
    expect(base).toEqual(CORRETOR_SERVICE_LIBRARY);
    expect(base).not.toContain("Implante");
    expect(base).not.toContain("Limpeza");

    const next = addCustomService(base, "Consultoria imobiliária");
    expect(next).toContain("Consultoria imobiliária");
  });

  it("treats legacy Henrique profiles without module as corretor and strips clinic services", () => {
    const base = resolveServiceOptions({ id: "henrique-pereira", name: "Henrique Pereira", services: ["Implante", "Prótese", "Consultoria imobiliária"] }, []);
    expect(base).toContain("Consultoria imobiliária");
    expect(base).not.toContain("Implante");
    expect(base).not.toContain("Prótese");
  });

  it("defaults non-odontocompany legacy IDs to corretor catalog", () => {
    const base = resolveServiceOptions({ id: "corretor-lucas", name: "Lucas", services: ["Implante", "Limpeza"] }, []);
    expect(base).toContain("Comprar imóvel");
    expect(base).toContain("💰 Vender imóvel");
    expect(base).not.toContain("Implante");
    expect(base).not.toContain("Limpeza");
  });

  it("removes a custom service from a corretor catalog", () => {
    const base = ["Comprar imóvel", "💰 Vender imóvel", "Limpeza"];
    const next = base.filter((s) => s !== "Limpeza");
    expect(next).toEqual(["Comprar imóvel", "💰 Vender imóvel"]);
  });
});
