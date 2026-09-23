import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type {
  MPCClinicBudgetSalesRow,
  MPCClinicReportType,
} from "@/types/mpcClinicReports";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type ParsedBudgetSalesReport = {
  type: "budgets_sales";
  fileName: string;
  periodStart: string;
  periodEnd: string;
  rows: MPCClinicBudgetSalesRow[];
  totals: { budgets: number; sales: number; particular: number; odc: number };
};

type ParsedOrthoSaleRow = {
  externalDoc: string;
  cpf: string;
  patientName: string;
  saleDate: string;
  type: "VENDA" | "COMPLEMENTO";
  modality: string;
  value: number;
  phone?: string;
  startDate?: string;
};

type ParsedOrthoSalesReport = {
  type: "ortho_sales";
  fileName: string;
  periodStart: string;
  periodEnd: string;
  rows: ParsedOrthoSaleRow[];
  totals: { records: number; sales: number; complements: number; value: number };
};

type ParsedCompletedRow = {
  dentistCode: string;
  dentistName: string;
  patientName: string;
  externalDoc: string;
  procedureNo: string;
  service: string;
  tooth?: string;
  value: number;
  completedAt: string;
};

type ParsedCompletedReport = {
  type: "completed";
  fileName: string;
  periodStart: string;
  periodEnd: string;
  rows: ParsedCompletedRow[];
  totals: { procedures: number; value: number };
};

export type ParsedClinicReport = ParsedBudgetSalesReport | ParsedOrthoSalesReport | ParsedCompletedReport;

function cleanText(value: string) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function moneyToNumber(raw: string) {
  const value = String(raw || "").replace(/R\$/gi, "").replace(/\s+/g, "").trim();
  if (!value) return 0;
  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");
  let normalized = value;
  if (comma >= 0 && dot >= 0) {
    if (dot > comma) normalized = value.replace(/,/g, "");
    else normalized = value.replace(/\./g, "").replace(/,/g, ".");
  } else if (comma >= 0) {
    const decimals = value.length - comma - 1;
    normalized = decimals === 2 ? value.replace(/\./g, "").replace(/,/g, ".") : value.replace(/,/g, "");
  } else if (dot >= 0) {
    const decimals = value.length - dot - 1;
    normalized = decimals === 2 ? value.replace(/,/g, "") : value.replace(/\./g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function toIsoDate(raw: string) {
  const value = cleanText(raw);
  const four = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (four) {
    const [, dd, mm, yyyy] = four;
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  const two = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (two) {
    const [, dd, mm, yy] = two;
    return `20${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  return value;
}

function findPeriod(lines: string[]) {
  const joined = lines.join("\n");
  const match = joined.match(/PER[IÍ]ODO\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})\s+A\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  return {
    periodStart: match ? toIsoDate(match[1]) : "",
    periodEnd: match ? toIsoDate(match[2]) : "",
  };
}

function detectType(lines: string[]): MPCClinicReportType {
  const head = lines.slice(0, 30).join(" ").toUpperCase();
  if (head.includes("ORÇAMENTOS E VENDAS") || head.includes("ORCAMENTOS E VENDAS")) return "budgets_sales";
  if (head.includes("APARELHO ORTODONTICO - VENDA") || head.includes("APARELHO ORTODÔNTICO - VENDA")) return "ortho_sales";
  if (head.includes("LISTA - CONCLUÍDOS") || head.includes("LISTA - CONCLUIDOS")) return "completed";
  throw new Error("Relatório não reconhecido. Use Orçamentos e Vendas, Aparelho Ortodôntico - Venda ou Lista - Concluídos.");
}

function buildLines(items: any[]) {
  const positioned = items
    .filter((item) => item && typeof item.str === "string" && cleanText(item.str))
    .map((item) => ({
      text: cleanText(item.str),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
    }))
    .sort((a, b) => {
      if (Math.abs(a.y - b.y) > 2.25) return b.y - a.y;
      return a.x - b.x;
    });

  const groups: Array<{ y: number; parts: Array<{ x: number; text: string }> }> = [];
  positioned.forEach((item) => {
    let group = groups.find((g) => Math.abs(g.y - item.y) <= 2.25);
    if (!group) {
      group = { y: item.y, parts: [] };
      groups.push(group);
    }
    group.parts.push({ x: item.x, text: item.text });
  });

  return groups
    .sort((a, b) => b.y - a.y)
    .map((g) => cleanText(g.parts.sort((a, b) => a.x - b.x).map((p) => p.text).join(" ")))
    .filter(Boolean);
}

async function extractPdfLines(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const task = pdfjsLib.getDocument({ data: bytes });
  const pdf = await task.promise;
  const allLines: string[] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const text = await page.getTextContent();
    allLines.push(...buildLines(text.items as any[]));
  }
  return allLines;
}

function parseBudgetSales(lines: string[], fileName: string): ParsedBudgetSalesReport {
  const { periodStart, periodEnd } = findPeriod(lines);
  const rows: MPCClinicBudgetSalesRow[] = [];
  let totals = { budgets: 0, sales: 0, particular: 0, odc: 0 };

  lines.forEach((line) => {
    const totalMatch = line.match(/TOTAL:\s*OR[ÇC]AMENTOS:\s*(\d+)\s+VENDAS:\s*(\d+)\s+PART\.?:\s*(\d+)\s+ODC\.?:\s*(\d+)/i);
    if (totalMatch) {
      totals = {
        budgets: Number(totalMatch[1]),
        sales: Number(totalMatch[2]),
        particular: Number(totalMatch[3]),
        odc: Number(totalMatch[4]),
      };
      return;
    }

    const match = line.match(/^(.+?)\s+(\d{3}\.\d{3}\.\d{3}-\d{2})\s+OR[ÇC]AMENTOS:\s*(\d+)\s+VENDAS:\s*(\d+)\s+PART\.?:\s*(\d+)\s+ODC\.?:\s*(\d+)$/i);
    if (!match) return;
    rows.push({
      patientName: cleanText(match[1]),
      cpf: match[2],
      budgets: Number(match[3]),
      sales: Number(match[4]),
      particular: Number(match[5]),
      odc: Number(match[6]),
    });
  });

  if (!totals.budgets && rows.length) {
    totals = rows.reduce(
      (acc, row) => ({
        budgets: acc.budgets + row.budgets,
        sales: acc.sales + row.sales,
        particular: acc.particular + row.particular,
        odc: acc.odc + row.odc,
      }),
      { budgets: 0, sales: 0, particular: 0, odc: 0 },
    );
  }

  if (!rows.length) throw new Error("Não consegui identificar as linhas de Orçamentos e Vendas neste PDF.");
  return { type: "budgets_sales", fileName, periodStart, periodEnd, rows, totals };
}

function parseOrthoSales(lines: string[], fileName: string): ParsedOrthoSalesReport {
  const { periodStart, periodEnd } = findPeriod(lines);
  const rows: ParsedOrthoSaleRow[] = [];

  lines.forEach((line) => {
    const match = line.match(/^(\d+)\s+(\d{3}\.\d{3}\.\d{3}-\d{2})\s+(.+?)\s+(\d{1,2}\/\d{1,2}\/\d{2})\s+(VENDA|COMPLEMENTO)\s+(.+?)\s+([\d.,]+)\s+(\(\d{2}\)\s*\d{4,5}-\d{4})(?:\s+(\d{1,2}\/\d{1,2}\/\d{2}))?$/i);
    if (!match) return;
    rows.push({
      externalDoc: match[1],
      cpf: match[2],
      patientName: cleanText(match[3]),
      saleDate: toIsoDate(match[4]),
      type: match[5].toUpperCase() as "VENDA" | "COMPLEMENTO",
      modality: cleanText(match[6]),
      value: moneyToNumber(match[7]),
      phone: cleanText(match[8]),
      startDate: match[9] ? toIsoDate(match[9]) : undefined,
    });
  });

  if (!rows.length) throw new Error("Não consegui identificar as vendas de ortodontia neste PDF.");
  const sales = rows.filter((r) => r.type === "VENDA").length;
  const complements = rows.filter((r) => r.type === "COMPLEMENTO").length;
  const value = rows.reduce((sum, row) => sum + row.value, 0);
  return { type: "ortho_sales", fileName, periodStart, periodEnd, rows, totals: { records: rows.length, sales, complements, value } };
}

function parseCompleted(lines: string[], fileName: string): ParsedCompletedReport {
  const { periodStart, periodEnd } = findPeriod(lines);
  const rows: ParsedCompletedRow[] = [];
  let dentistCode = "";
  let dentistName = "";

  lines.forEach((line) => {
    const header = line.match(/^(\d+)\s+((?:DRA\.?|DR\.?|SUPORTE).+)$/i);
    if (header) {
      dentistCode = header[1];
      dentistName = cleanText(header[2]);
      return;
    }
    if (!dentistCode) return;
    if (/^(NOME\s+NUM DOC|CONCLU[IÍ]DO|TOTAL:)/i.test(line)) return;

    const match = line.match(/^(.+?)\s+(\d{4,6})\s+(\d+)\s+(.+?)\s+(\d{1,2})\s+([\d.,]+)\s+(\d{1,2}\/\d{1,2}\/\d{4})$/i);
    if (!match) return;
    rows.push({
      dentistCode,
      dentistName,
      patientName: cleanText(match[1]),
      externalDoc: match[2],
      procedureNo: match[3],
      service: cleanText(match[4]),
      tooth: match[5],
      value: moneyToNumber(match[6]),
      completedAt: toIsoDate(match[7]),
    });
  });

  if (!rows.length) throw new Error("Não consegui identificar os procedimentos concluídos neste PDF.");
  return {
    type: "completed",
    fileName,
    periodStart,
    periodEnd,
    rows,
    totals: {
      procedures: rows.length,
      value: rows.reduce((sum, row) => sum + row.value, 0),
    },
  };
}

export async function parseClinicReportPdf(file: File): Promise<ParsedClinicReport> {
  if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error("Envie um arquivo PDF.");
  const lines = await extractPdfLines(file);
  const type = detectType(lines);
  if (type === "budgets_sales") return parseBudgetSales(lines, file.name);
  if (type === "ortho_sales") return parseOrthoSales(lines, file.name);
  return parseCompleted(lines, file.name);
}
