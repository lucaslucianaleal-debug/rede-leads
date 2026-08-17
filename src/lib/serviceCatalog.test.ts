import { describe, it, expect } from "vitest";
import {
  resolveServiceOptions,
  addCustomService,
  DEFAULT_CORRETOR_SERVICE_LIBRARY,
} from "@/lib/serviceCatalog";

describe("service catalog", () => {
  it("keeps the legacy clinic library for regular clinics", () => {
    const options = resolveServiceOptions({ module: "clinica", customServices: [] }, ["Implante", "Prótese"]);
    expect(options).toEqual(["Implante", "Prótese"]);
  });

  it("uses the default real-estate library for a brand-new corretor account", () => {
    const base = resolveServiceOptions({ module: "corretor" }, []);
    expect(base).toEqual(DEFAULT_CORRETOR_SERVICE_LIBRARY);
  });

  it("uses the corretor's saved customServices from Firestore once it has any", () => {
    const base = resolveServiceOptions(
      { module: "corretor", customServices: ["Venda de imóveis", "Locação/Aluguel"] },
      [],
    );
    expect(base).toEqual(["Venda de imóveis", "Locação/Aluguel"]);

    const next = addCustomService(base, "Consultoria imobiliária");
    expect(next).toEqual(["Venda de imóveis", "Locação/Aluguel", "Consultoria imobiliária"]);
  });

  it("respects an explicitly empty customServices list (user removed everything)", () => {
    const base = resolveServiceOptions({ module: "corretor", customServices: [] }, []);
    expect(base).toEqual([]);
  });

  it("treats legacy Henrique profiles without module as corretor", () => {
    const base = resolveServiceOptions({ id: "henrique-pereira", name: "Henrique Pereira" }, []);
    expect(base).toEqual(DEFAULT_CORRETOR_SERVICE_LIBRARY);
  });

  it("removes a custom service from a corretor catalog", () => {
    const base = ["Aparelho Invisalign", "Limpeza", "Implante"];
    const next = base.filter((s) => s !== "Limpeza");
    expect(next).toEqual(["Aparelho Invisalign", "Implante"]);
  });
});
