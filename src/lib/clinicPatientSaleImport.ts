import { collection, doc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type ParsedPatientSaleItem = {
  document: string;
  patientName: string;
  code: string;
  description: string;
  quantity: number;
  cost: number;
  value: number;
  total: number;
  date: string;
  responsible?: string;
};

function parseMoney(value: string) {
  let normalized = String(value || "").trim().replace(/\s/g, "");
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) normalized = comma > dot ? normalized.replace(/\./g, "").replace(",", ".") : normalized.replace(/,/g, "");
  else if (comma >= 0) normalized = normalized.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value: string) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

function isPatientLine(line: string) {
  if (!line || /\d/.test(line)) return false;
  if (/MOVIMENTO DE PRODUTOS|EMPRESA|PER[IÍ]ODO|TIPO DE PRODUTO|DESCRI[CÇ][AÃ]O|CUSTO|VALOR|TOTAL|DATA|C[ÓO]DIGO|DOC|DESCONTO|ACR[EÉ]SCIMO|JUROS|CREDIARIO|DEMONSTRATIVO|LAN[CÇ]AMENTO|CLIENTE|FORNECEDOR|PRODUTOS|SERVI[CÇ]OS|CONTAS A RECEBER|RESPONS[AÁ]VEL/i.test(line)) return false;
  const words = line.trim().split(/\s+/).filter(Boolean);
  return words.length >= 2 && line === line.toUpperCase();
}

async function pdfLines(file: File) {
  const pdfjsUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
  const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const pdfjs: any = await import(/* @vite-ignore */ pdfjsUrl);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const lines: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const groups = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of content.items as any[]) {
      const text = String(item.str || "").trim();
      if (!text) continue;
      const y = Math.round(Number(item.transform?.[5] || 0) * 2) / 2;
      const x = Number(item.transform?.[4] || 0);
      const list = groups.get(y) || [];
      list.push({ x, text });
      groups.set(y, list);
    }
    lines.push(...[...groups.entries()].sort((a, b) => b[0] - a[0]).map(([, items]) => items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean));
  }
  return lines;
}

function parseBulk(lines: string[]): ParsedPatientSaleItem[] {
  const result: ParsedPatientSaleItem[] = [];
  let currentPatient = "";
  for (const line of lines) {
    if (isPatientLine(line)) { currentPatient = line.trim(); continue; }
    const match = line.match(/^(\d{3,8})\s+(\d{1,8})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(-?[\d.,]+)\s+(-?[\d.,]+)\s+(-?[\d.,]+)\s+(\d{2}\/\d{2}\/\d{2,4})$/);
    if (!match) continue;
    result.push({ document: match[1], patientName: currentPatient, code: match[2], description: match[3].trim(), quantity: parseMoney(match[4]), cost: parseMoney(match[5]), value: parseMoney(match[6]), total: parseMoney(match[7]), date: match[8] });
  }
  return result;
}

function parseDemonstrative(lines: string[]): ParsedPatientSaleItem[] {
  const text = lines.join("\n");
  if (!/DEMONSTRATIVO/i.test(text) || !/CONTAS A RECEBER/i.test(text)) return [];
  const docMatch = text.match(/(?:^|\n)DOC:\s*(\d{3,8})/i);
  const dateMatch = text.match(/(?:^|\n)DOC:\s*\d{3,8}\s+DATA:\s*(\d{2}\/\d{2}\/\d{4})/i) || text.match(/(?:^|\n)DATA:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const responsibleMatch = text.match(/RESPONS[AÁ]VEL:\s*([^\n]+)/i);
  const nameMatch = text.match(/CNPJ\/CPF:[^\n]*?NOME:\s*([^\n]+?)(?=\s+(?:RUA|ENDERE[CÇ]O|BAIRRO|CIDADE|CEP|FONE):|$)/i) || text.match(/(?:^|\n)NOME:\s*([^\n]+)/i);
  const document = docMatch?.[1] || "";
  const patientName = (nameMatch?.[1] || "").trim();
  const date = dateMatch?.[1] || "";
  const responsible = (responsibleMatch?.[1] || "").trim();
  if (!document) return [];

  const result: ParsedPatientSaleItem[] = [];
  let inProducts = false;
  for (const line of lines) {
    if (/PRODUTOS E SERVI[CÇ]OS/i.test(line)) { inProducts = true; continue; }
    if (/CONTAS A RECEBER/i.test(line)) { inProducts = false; break; }
    if (!inProducts || /C[ÓO]DIGO\s+DESCRI[CÇ][AÃ]O|^TOTAL:/i.test(line)) continue;
    const match = line.match(/^(\d{2,8})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(-?[\d.,]+)\s+(-?[\d.,]+)$/);
    if (!match) continue;
    result.push({ document, patientName, code: match[1], description: match[2].trim(), quantity: parseMoney(match[3]), cost: 0, value: parseMoney(match[4]), total: parseMoney(match[5]), date, responsible });
  }
  return result;
}

export async function parsePatientSalePdf(file: File): Promise<ParsedPatientSaleItem[]> {
  const lines = await pdfLines(file);
  const demonstrative = parseDemonstrative(lines);
  return demonstrative.length ? demonstrative : parseBulk(lines);
}

function safeId(value: string) { return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180); }

export async function persistPatientSalePdf(args: { clinicId: string; patientId: string; patientName: string; patientDocs: string[]; file: File }) {
  const parsed = await parsePatientSalePdf(args.file);
  if (!parsed.length) throw new Error("Não consegui identificar a venda neste PDF. Use o Demonstrativo individual ou o relatório Movimento de Produtos e Serviços.");
  const patientName = normalize(args.patientName);
  const docs = new Set(args.patientDocs.map((value) => String(value || "").split("/")[0].replace(/\D/g, "")).filter(Boolean));
  const matching = parsed.filter((item) => normalize(item.patientName) === patientName || docs.has(String(item.document).replace(/\D/g, "")));
  if (!matching.length) throw new Error("A venda foi lida, mas o paciente/DOC deste Demonstrativo não corresponde à ficha aberta.");
  const grouped = new Map<string, ParsedPatientSaleItem[]>();
  matching.forEach((item) => { const key = String(item.document).replace(/\D/g, ""); const list = grouped.get(key) || []; list.push(item); grouped.set(key, list); });
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  grouped.forEach((items, docKey) => {
    const treatments = Array.from(new Set(items.map((item) => item.description).filter(Boolean)));
    const originalValue = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.value || 0), 0);
    const totalValue = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
    batch.set(doc(collection(db, "clinics", args.clinicId, "financeSales"), safeId(`${args.patientId}_${docKey}`)), {
      patientId: args.patientId,
      patientName: args.patientName,
      doc: docKey,
      saleDate: items[0]?.date || "",
      responsible: items[0]?.responsible || "",
      treatments,
      originalValue,
      totalValue,
      source: "pdf",
      sourceType: items[0]?.responsible ? "demonstrativo" : "movimento",
      sourceFile: args.file.name,
      updatedAt: now,
    }, { merge: true });
  });
  await batch.commit();
  return { documents: grouped.size, items: matching.length, format: matching[0]?.responsible ? "demonstrativo" : "movimento" };
}
