import { collection, doc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type ParsedPatientSaleItem = { document: string; patientName: string; code: string; description: string; quantity: number; cost: number; value: number; total: number; date: string; responsible?: string };

function parseMoney(value: string) {
  let normalized = String(value || "").trim().replace(/\s/g, "");
  const comma = normalized.lastIndexOf(","); const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) normalized = comma > dot ? normalized.replace(/\./g, "").replace(",", ".") : normalized.replace(/,/g, "");
  else if (comma >= 0) normalized = normalized.replace(",", ".");
  const parsed = Number(normalized); return Number.isFinite(parsed) ? parsed : 0;
}
function normalize(value: string) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase(); }
function compact(value: string) { return normalize(value).replace(/\s+/g, ""); }
function isPatientLine(line: string) {
  if (!line || /\d/.test(line)) return false;
  if (/MOVIMENTO DE PRODUTOS|EMPRESA|PER[IÍ]ODO|TIPO DE PRODUTO|DESCRI[CÇ][AÃ]O|CUSTO|VALOR|TOTAL|DATA|C[ÓO]DIGO|DOC|DESCONTO|ACR[EÉ]SCIMO|JUROS|CREDIARIO|DEMONSTRATIVO|LAN[CÇ]AMENTO|CLIENTE|FORNECEDOR|PRODUTOS|SERVI[CÇ]OS|CONTAS A RECEBER|RESPONS[AÁ]VEL/i.test(line)) return false;
  return line.trim().split(/\s+/).filter(Boolean).length >= 2 && line === line.toUpperCase();
}

async function pdfLines(file: File) {
  const pdfjsUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
  const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const pdfjs: any = await import(/* @vite-ignore */ pdfjsUrl); pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber); const content = await page.getTextContent();
    const groups = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of content.items as any[]) {
      const text = String(item.str || "").trim(); if (!text) continue;
      const y = Math.round(Number(item.transform?.[5] || 0) * 2) / 2; const x = Number(item.transform?.[4] || 0);
      const list = groups.get(y) || []; list.push({ x, text }); groups.set(y, list);
    }
    lines.push(...[...groups.entries()].sort((a,b)=>b[0]-a[0]).map(([,items])=>items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(" ").replace(/\s+/g," ").trim()).filter(Boolean));
  }
  return lines;
}

function parseBulk(lines: string[]): ParsedPatientSaleItem[] {
  const result: ParsedPatientSaleItem[] = []; let currentPatient = "";
  for (const line of lines) {
    if (isPatientLine(line)) { currentPatient = line.trim(); continue; }
    const m=line.match(/^(\d{3,8})\s+(\d{1,8})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(-?[\d.,]+)\s+(-?[\d.,]+)\s+(-?[\d.,]+)\s+(\d{2}\/\d{2}\/\d{2,4})$/); if(!m) continue;
    result.push({document:m[1],patientName:currentPatient,code:m[2],description:m[3].trim(),quantity:parseMoney(m[4]),cost:parseMoney(m[5]),value:parseMoney(m[6]),total:parseMoney(m[7]),date:m[8]});
  } return result;
}

function parseDemonstrative(lines: string[]): ParsedPatientSaleItem[] {
  const joined=lines.join("\n"); const joinedCompact=compact(joined);
  if (!joinedCompact.includes("DEMONSTRATIVO") || !joinedCompact.includes("CONTASARECEBER")) return [];
  let document="", date="", patientName="", responsible="";
  for (const line of lines) {
    if (!document) document=(line.match(/\bDOC\s*:\s*(\d{3,8})/i)||[])[1]||"";
    if (!date && /\bDOC\s*:/i.test(line)) date=(line.match(/\bDATA\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)||[])[1]||"";
    if (!responsible) responsible=((line.match(/RESPONS[AÁ]VEL\s*:\s*(.+)$/i)||[])[1]||"").trim();
    if (!patientName && /CNPJ\/CPF/i.test(line) && /NOME\s*:/i.test(line)) patientName=((line.match(/NOME\s*:\s*(.+?)(?=\s+(?:ENDERE[CÇ]O|RUA|BAIRRO|CIDADE|CEP|FONE)\s*:|$)/i)||[])[1]||"").trim();
  }
  if (!document) return [];
  const result: ParsedPatientSaleItem[]=[]; let inProducts=false;
  for (const line of lines) {
    const c=compact(line);
    if (c.includes("PRODUTOSESERVICOS")) { inProducts=true; continue; }
    if (c.includes("CONTASARECEBER")) { inProducts=false; break; }
    if (!inProducts || /^TOTAL\s*:/i.test(line) || (c.includes("CODIGO")&&c.includes("DESCRICAO"))) continue;
    const m=line.match(/^(\d{2,8})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+([\d.,]+)\s+([\d.,]+)$/); if(!m) continue;
    result.push({document,patientName,code:m[1],description:m[2].trim(),quantity:parseMoney(m[3]),cost:0,value:parseMoney(m[4]),total:parseMoney(m[5]),date,responsible});
  }
  return result;
}

export async function parsePatientSalePdf(file: File): Promise<ParsedPatientSaleItem[]> { const lines=await pdfLines(file); const individual=parseDemonstrative(lines); return individual.length?individual:parseBulk(lines); }
function safeId(value:string){return String(value||"").replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,180);}
export async function persistPatientSalePdf(args:{clinicId:string;patientId:string;patientName:string;patientDocs:string[];file:File}) {
  const parsed=await parsePatientSalePdf(args.file); if(!parsed.length) throw new Error("Não consegui identificar a venda neste PDF. Use o Demonstrativo individual ou o relatório Movimento de Produtos e Serviços.");
  const patientName=normalize(args.patientName); const docs=new Set(args.patientDocs.map(v=>String(v||"").split("/")[0].replace(/\D/g,"")).filter(Boolean));
  const matching=parsed.filter(item=>normalize(item.patientName)===patientName||docs.has(String(item.document).replace(/\D/g,"")));
  if(!matching.length) throw new Error("A venda foi lida, mas o paciente/DOC deste Demonstrativo não corresponde à ficha aberta.");
  const grouped=new Map<string,ParsedPatientSaleItem[]>(); matching.forEach(item=>{const key=String(item.document).replace(/\D/g,"");const list=grouped.get(key)||[];list.push(item);grouped.set(key,list);});
  const now=new Date().toISOString(); const batch=writeBatch(db);
  grouped.forEach((items,docKey)=>{const treatments=Array.from(new Set(items.map(i=>i.description).filter(Boolean)));const originalValue=items.reduce((s,i)=>s+Number(i.quantity||0)*Number(i.value||0),0);const totalValue=items.reduce((s,i)=>s+Number(i.total||0),0);batch.set(doc(collection(db,"clinics",args.clinicId,"financeSales"),safeId(`${args.patientId}_${docKey}`)),{patientId:args.patientId,patientName:args.patientName,doc:docKey,saleDate:items[0]?.date||"",responsible:items[0]?.responsible||"",treatments,originalValue,totalValue,source:"pdf",sourceType:items[0]?.responsible?"demonstrativo":"movimento",sourceFile:args.file.name,updatedAt:now},{merge:true});});
  await batch.commit(); return {documents:grouped.size,items:matching.length,format:matching[0]?.responsible?"demonstrativo":"movimento"};
}
