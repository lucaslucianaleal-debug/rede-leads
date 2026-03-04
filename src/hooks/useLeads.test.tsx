import { render, act, waitFor } from "@testing-library/react";
import React from "react";
import { format } from "date-fns";
import { vi } from "vitest";
import { useLeads } from "./useLeads";
import { mockLeads } from "@/data/mockLeads";

describe("useLeads hook", () => {
  it("imports leads from a CSV file", async () => {
    let hook: ReturnType<typeof useLeads> | null = null;

    function TestComponent() {
      hook = useLeads();
      return null;
    }

    render(<TestComponent />);

    expect(hook).not.toBeNull();
    const initialCount = hook!.allLeads.length;
    expect(initialCount).toBe(mockLeads.length);

    // Build a minimal CSV string with the headers expected by importCSV
    const csvLines = [
      [
        "DATA DO CONTATO",
        "NOME DO LEAD",
        "TELEFONE",
        "SERVIÇO PROCURADO",
        "CAPTADOR",
        "FONTE DO LEAD",
        "ETAPA DO LEAD",
        "STATUS",
        "RESPOSTA LEAD",
        "COMPARECIMENTO",
        "DATA DE FOLLOW UP",
        "DATA DE AGENDAMENTO",
        "OBSERVAÇÃO",
      ].join(","),
      [
        "01/03/2026",
        "Teste Import",
        "+55123456789",
        "Serviço X",
        "Cap",
        "Instagram",
        "Novo",
        "QUENTE",
        "RESPONDEU",
        "COMPARECEU",
        "02/03/2026",
        "03/03/2026",
        "Observação teste",
      ].join(","),
    ];

    const csv = csvLines.join("\n");
    const file = new File([csv], "imports.csv", { type: "text/csv" });

    // trigger the import and wait for state update
    await act(async () => {
      hook!.importCSV(file);
      // Papa.parse works asynchronously when given a File, so wait a moment
      await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => {
      expect(hook!.allLeads.length).toBeGreaterThan(initialCount);
    });

    const added = hook!.allLeads.slice(initialCount);
    expect(added).toHaveLength(1);
    expect(added[0].nome).toBe("Teste Import");
    expect(added[0].etapaLead).toBe("Novo");
    expect(added[0].fonteLead).toBe("Instagram");
    // ensure id was generated with prefix imported-
    expect(added[0].id).toMatch(/^imported-/);
  });

  it("returns only today's scheduled appointments and can export them", async () => {
    let hook: ReturnType<typeof useLeads> | null = null;
    function TestComponent() {
      hook = useLeads();
      return null;
    }

    render(<TestComponent />);
    expect(hook).not.toBeNull();

    const today = format(new Date(), "dd/MM/yyyy");
    // ensure at least one existing lead has an appointment set to today
    const targetId = hook!.allLeads[0].id;
    await act(async () => {
      hook!.updateLead(targetId, { dataAgendamento: today });
    });

    // wait for the hook state to reflect the change before asserting
    await waitFor(() => {
      const appts = hook!.getAppointmentsFor(new Date());
      expect(appts.every((l) => l.dataAgendamento === today)).toBe(true);
      expect(appts.some((l) => l.id === targetId)).toBe(true);
      // stats should reflect today's appointments count
      expect(hook!.stats.agendadosHoje).toBeGreaterThanOrEqual(1);
    });

    // spy on URL.createObjectURL and anchor click
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const createSpy = vi.fn(() => "blob:fake");
    (URL as any).createObjectURL = createSpy;
    (URL as any).revokeObjectURL = vi.fn();

    let clicked = false;
    const realCreateElement = document.createElement;
    document.createElement = ((tag: string) => {
      const el = realCreateElement.call(document, tag) as any;
      if (tag === "a") {
        el.click = () => { clicked = true; };
      }
      return el;
    }) as any;

    hook!.exportAppointments(new Date());
    expect(createSpy).toHaveBeenCalled();
    expect(clicked).toBe(true);

    // restore
    (URL as any).createObjectURL = originalCreate;
    (URL as any).revokeObjectURL = originalRevoke;
    document.createElement = realCreateElement;
  });

});
