import { collection, doc, setDoc, writeBatch } from "firebase/firestore";
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
};

function parseMoney(value: string) {
  let normalized = value.trim().replace(/\s/g, "");
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
  if (/MOVIMENTO DE PRODUTOS|EMPRESA|PER[IÍ]ODO|TIPO DE PRODUTO|DESCRI[CÇ][AÃ]O|CUSTO|VALOR|TOTAL|DATA|C[ÓO]DIGO|DOC|DESCONTO|ACR[EÉ]SCIMO|JUROS|CREDIARIO/i.test(line)) return false;
  const words = line.trim().split(/\s+/).filter(Boolean);
  return words.length >= 2 && line === line.toUpperCase();
}

export async function parsePatientSalePdf(file: File): Promise<ParsedPatientSaleItem[]> {
  const pdfjsUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
  const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const pdfjs: any = await import(/* @vite-ignore */ pdfjsUrl);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const result: ParsedPatientSaleItem[] = [];
  let currentPatient = "";
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
    const lines = [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([, items]) => items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim());
    for (const line of lines) {
      if (isPatientLine(line)) { currentPatient = line.trim(); continue; }
      const match = line.match(/^(\d{3,8})\s+(\d{1,8})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(-?[\d.,]+)\s+(-?[\d.,]+)\s+(-?[\d.,]+)\s+(\d{2}\/\d{2}\/\d{2,4})$/);
      if (!match) continue;
      result.push({ document: match[1], patientName: currentPatient, code: match[2], description: match[3].trim(), quantity: parseMoney(match[4]), cost: parseMoney(match[5]), value: parseMoney(match[6]), total: parseMoney(match[7]), date: match[8] });
    }
  }
  return result;
}

function safeId(value: string) { return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180); }

export async function persistPatientSalePdf(args: { clinicId: string; patientId: string; patientName: string; patientDocs: string[]; file: File }) {
  const parsed = await parsePatientSalePdf(args.file);
  const patientName = normalize(args.patientName);
  const docs = new Set(args.patientDocs.map((value) => String(value || "").split("/")[0].replace(/\D/g, "")).filter(Boolean));
  const matching = parsed.filter((item) => normalize(item.patientName) === patientName || docs.has(String(item.document).replace(/\D/g, "")));
  if (!matching.length) throw new Error("Não encontrei nesse PDF uma venda compatível com este paciente ou com os DOCs das parcelas dele.");
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
      treatments,
      originalValue,
      totalValue,
      source: "pdf",
      sourceFile: args.file.name,
      updatedAt: now,
    }, { merge: true });
  });
  await batch.commit();
  return { documents: grouped.size, items: matching.length };
}
