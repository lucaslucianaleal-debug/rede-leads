import { TimelineActivity } from "@/types/crm";
import { parseISO } from "date-fns";

/**
 * Padrão de observações antigas:
 * [dd/MM/yyyy HH:mm] RESULTADO — observação | [dd/MM/yyyy HH:mm] RESULTADO2 — observação2
 * 
 * Extrai cada entry e converte para TimelineActivity
 */
export function parseObservacaoToActivities(
  observacao: string | null | undefined,
  leadId: string
): TimelineActivity[] {
  if (!observacao || typeof observacao !== "string") return [];

  // Padrão: [dd/MM/yyyy HH:mm] RESULTADO — observação (com ou sem observação)
  // Separador entre entries: |
  const entries = observacao.split("|").map((e) => e.trim());
  const activities: TimelineActivity[] = [];

  for (const entry of entries) {
    if (!entry) continue;

    // Regex para extrair timestamp e resto
    // [dd/MM/yyyy HH:mm] RESTO
    const match = entry.match(/^\[(\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2})\]\s(.+?)(?:—\s(.*))?$/);
    if (!match) {
      // Fallback: entry não segue padrão, pular
      continue;
    }

    const [, timestampStr, resultadoStr, observacaoStr] = match;

    // Converter "dd/MM/yyyy HH:mm" para ISO
    let isoTimestamp: string;
    try {
      // date-fns parse: "dd/MM/yyyy HH:mm"
      const parts = timestampStr.split(" ");
      const dateParts = parts[0].split("/"); // dd/MM/yyyy
      const timeParts = parts[1].split(":"); // HH:mm

      const d = new Date(
        parseInt(dateParts[2]), // year
        parseInt(dateParts[1]) - 1, // month (0-indexed)
        parseInt(dateParts[0]), // day
        parseInt(timeParts[0]), // hour
        parseInt(timeParts[1]), // minute
        0
      );

      isoTimestamp = d.toISOString();
    } catch {
      continue; // Skip invalid timestamp
    }

    // Detectar tipo de atividade
    const resultado = resultadoStr.trim().toUpperCase();
    let type: "CALL_LOG" | "FOLLOW_UP" | "NOTE" = "CALL_LOG";

    if (resultado.includes("FOLLOW-UP") || resultado.includes("FOLLOW UP")) {
      type = "FOLLOW_UP";
    } else if (!resultado.match(/^(ATENDEU|CAIXA|NÃO ATENDEU|NÚMERO ERRADO)/i)) {
      type = "NOTE";
    }

    // Criar atividade
    const activity: TimelineActivity = {
      id: `legacy_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      leadId,
      type,
      timestamp: isoTimestamp,
      createdBy: undefined, // Dados legado não têm quem criou
      createdByName: undefined,
      data: {
        resultado: type === "CALL_LOG" ? resultado : undefined,
        observacao: observacaoStr ? observacaoStr.trim() : undefined,
        etapa: type === "FOLLOW_UP" ? resultado : undefined,
      },
    };

    activities.push(activity);
  }

  return activities;
}

/**
 * Detecta se uma observação parece ter dados de call logs (padrão legado)
 */
export function hasLegacyCallLogs(observacao: string | null | undefined): boolean {
  if (!observacao || typeof observacao !== "string") return false;
  // Heurística: procura por padrão [dd/MM/yyyy HH:mm]
  return /\[\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}\]/.test(observacao);
}
