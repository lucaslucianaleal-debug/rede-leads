import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export type ClinicFinanceDueItem = {
  name: string;
  phone: string;
  document: string;
  dueDate: string;
  current: number;
};

export type ClinicFinanceSnapshot = {
  fileName: string;
  updatedAt: string;
  dueToday: ClinicFinanceDueItem[];
  dueTomorrow: ClinicFinanceDueItem[];
  overdueCount: number;
  overdueAmount: number;
};

export const financeSnapshotKey = (clinicId: string) => `clinic_finance_snapshot_${clinicId}`;
export const FINANCE_SNAPSHOT_EVENT = "clinic-finance-snapshot-updated";

const brDate = (date: Date) => new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
}).format(date);

function parseMoney(value: string) {
  const cleaned = String(value || "").trim().replace(/\s/g, "");
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (comma >= 0) {
    normalized = cleaned.replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateKey(value: string) {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

async function extractSnapshot(file: File): Promise<ClinicFinanceSnapshot | null> {
  const pdfJsUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
  const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const pdfjs: any = await import(/* @vite-ignore */ pdfJsUrl);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;

  const firstPage = await pdf.getPage(1);
  const firstContent = await firstPage.getTextContent();
  const firstText = (firstContent.items as any[]).map((item) => String(item.str || "")).join(" ");
  const looksFinancial = /(COBRAN|CONTAS\s+A\s+RECEBER|CREDIARIO|PARCELA)/i.test(firstText)
    && /(CPF|VENCIMENTO|VENC\.|EMISSAO|EMISSÃO|DOCUMENTO|DOC)/i.test(firstText);
  if (!looksFinancial) return null;

  const now = new Date();
  const today = brDate(now);
  const tomorrow = brDate(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const todaySortable = parseDateKey(today);
  const dueToday: ClinicFinanceDueItem[] = [];
  const dueTomorrow: ClinicFinanceDueItem[] = [];
  let overdueCount = 0;
  let overdueAmount = 0;

  let currentName = "";
  let currentPhone = "";
  const seen = new Set<string>();

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = pageNumber === 1 ? firstPage : await pdf.getPage(pageNumber);
    const content = pageNumber === 1 ? firstContent : await page.getTextContent();
    const items = (content.items as any[])
      .map((item) => ({ text: String(item.str || "").trim(), x: Number(item.transform?.[4] || 0), y: Number(item.transform?.[5] || 0) }))
      .filter((item) => item.text)
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const clusters: Array<{ y: number; items: Array<{ x: number; text: string }> }> = [];
    for (const item of items) {
      const last = clusters[clusters.length - 1];
      if (!last || Math.abs(last.y - item.y) > 1.25) clusters.push({ y: item.y, items: [{ x: item.x, text: item.text }] });
      else last.items.push({ x: item.x, text: item.text });
    }

    const lines = clusters.map((cluster) => cluster.items
      .sort((a, b) => a.x - b.x)
      .map((item) => item.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim());

    for (const line of lines) {
      const cpf = line.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
      if (cpf) {
        const beforeCpf = line.slice(0, cpf.index).replace(/CPF\.?\s*:?/gi, "").trim();
        const candidate = beforeCpf.replace(/\s+(CPF|RG|FONE\(S\)).*$/i, "").trim();
        if (candidate && !/EMPRESA|PER[IÍ]ODO|RELAT[ÓO]RIO|TOTAL/i.test(candidate)) currentName = candidate;
        currentPhone = (line.match(/\(?\d{2}\)?\s?\d{4,5}-\d{4}/g) || [""])[0] || "";
        continue;
      }

      const extraPhone = (line.match(/\(?\d{2}\)?\s?\d{4,5}-\d{4}/g) || [""])[0];
      if (extraPhone && !currentPhone) currentPhone = extraPhone;

      const row = line.match(/(\d{1,6}\/[-\w.]+)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(-?[\d,.]+)\s+(-?[\d,.]+)(?:\s+(.*))?$/);
      if (!row || !currentName) continue;

      const dueDate = row[3];
      const current = parseMoney(row[5]);
      const uniqueKey = `${currentName}|${row[1]}|${dueDate}`;
      if (seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);

      const item: ClinicFinanceDueItem = {
        name: currentName,
        phone: currentPhone,
        document: row[1],
        dueDate,
        current,
      };

      if (dueDate === today) dueToday.push(item);
      if (dueDate === tomorrow) dueTomorrow.push(item);
      const sortable = parseDateKey(dueDate);
      if (sortable && sortable < todaySortable) {
        overdueCount += 1;
        overdueAmount += current;
      }
    }
  }

  return { fileName: file.name, updatedAt: new Date().toISOString(), dueToday, dueTomorrow, overdueCount, overdueAmount };
}

export function ClinicFinanceSnapshotBridge() {
  const { currentClinic } = useAuth();

  useEffect(() => {
    if (!currentClinic) return;

    const onChange = async (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      const file = target?.files?.[0];
      if (!target || target.type !== "file" || !file || !/pdf/i.test(file.type || file.name)) return;

      try {
        const snapshot = await extractSnapshot(file);
        if (!snapshot) return;
        localStorage.setItem(financeSnapshotKey(currentClinic), JSON.stringify(snapshot));
        window.dispatchEvent(new CustomEvent(FINANCE_SNAPSHOT_EVENT, { detail: snapshot }));
      } catch (error) {
        console.warn("[clinic-finance-snapshot]", error);
      }
    };

    document.addEventListener("change", onChange, true);
    return () => document.removeEventListener("change", onChange, true);
  }, [currentClinic]);

  return null;
}
