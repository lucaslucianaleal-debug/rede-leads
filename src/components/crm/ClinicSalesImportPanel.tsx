import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { CheckCircle2, FileText, ReceiptText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";

export type SaleItem = {
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

const number = new Intl.NumberFormat("pt-BR");

function parseMoney(value: string) {
  let normalized = value.trim().replace(/\s/g, "");
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (comma >= 0) {
    normalized = normalized.replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function saleKey(item: SaleItem) {
  return [item.document, item.code, item.date, normalize(item.patientName), normalize(item.description)].join("|");
}

function stableId(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `sale_${(hash >>> 0).toString(16)}`;
}

function mergeSales(base: SaleItem[], incoming: SaleItem[]) {
  const merged = new Map<string, SaleItem>();
  base.forEach((item) => merged.set(saleKey(item), item));
  incoming.forEach((item) => {
    const key = saleKey(item);
    const previous = merged.get(key);
    merged.set(key, previous ? { ...previous, ...item } : item);
  });
  return Array.from(merged.values());
}

function isPatientLine(line: string) {
  if (!line || /\d/.test(line)) return false;
  if (/MOVIMENTO DE PRODUTOS|EMPRESA|PER[IÍ]ODO|TIPO DE PRODUTO|DESCRI[CÇ][AÃ]O|CUSTO|VALOR|TOTAL|DATA|C[ÓO]DIGO|DOC|DESCONTO|ACR[EÉ]SCIMO|JUROS|CREDIARIO/i.test(line)) return false;
  const words = line.trim().split(/\s+/).filter(Boolean);
  return words.length >= 2 && line === line.toUpperCase();
}

export function ClinicSalesImportPanel({ onImported }: { onImported?: (items: SaleItem[], fileName: string) => void }) {
  const { currentClinic } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onImportedRef = useRef(onImported);
  const [fileName, setFileName] = useState<string | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);

  useEffect(() => { onImportedRef.current = onImported; }, [onImported]);

  const documents = useMemo(() => new Set(items.map((item) => item.document)).size, [items]);
  const patients = useMemo(() => new Set(items.map((item) => item.patientName).filter(Boolean)).size, [items]);

  useEffect(() => {
    if (!currentClinic) return;
    let cancelled = false;
    setLoadingSaved(true);

    void (async () => {
      try {
        const [metaSnap, itemsSnap] = await Promise.all([
          getDoc(doc(db, "clinics", currentClinic, "financeState", "sales")),
          getDocs(collection(db, "clinics", currentClinic, "financeSalesReportItems")),
        ]);
        if (cancelled) return;
        const savedItems = itemsSnap.docs.map((snapshotDoc) => snapshotDoc.data() as SaleItem);
        const savedFileName = metaSnap.exists() ? String(metaSnap.data()?.fileName || "Base de vendas salva") : "Base de vendas salva";
        if (savedItems.length) {
          setItems(savedItems);
          setFileName(savedFileName);
          onImportedRef.current?.(savedItems, savedFileName);
        }
      } catch (error) {
        console.error("[clinic-sales][hydrate]", error);
      } finally {
        if (!cancelled) setLoadingSaved(false);
      }
    })();

    return () => { cancelled = true; };
  }, [currentClinic]);

  async function persistSales(importedItems: SaleItem[], nextFileName: string) {
    if (!currentClinic) return;
    const nowIso = new Date().toISOString();
    const chunkSize = 350;
    for (let start = 0; start < importedItems.length; start += chunkSize) {
      const batch = writeBatch(db);
      importedItems.slice(start, start + chunkSize).forEach((item) => {
        batch.set(doc(db, "clinics", currentClinic, "financeSalesReportItems", stableId(saleKey(item))), {
          ...item,
          importedAt: nowIso,
          sourceFile: nextFileName,
        }, { merge: true });
      });
      await batch.commit();
    }
    await setDoc(doc(db, "clinics", currentClinic, "financeState", "sales"), {
      fileName: nextFileName,
      updatedAt: nowIso,
    }, { merge: true });
  }

  async function handleImport(file?: File) {
    if (!file || !currentClinic) return;
    setImporting(true);
    try {
      const parsed = await parseSalesPdf(file);
      if (!parsed.length) throw new Error("Não consegui identificar as vendas nesse PDF.");
      const merged = mergeSales(items, parsed);
      await persistSales(parsed, file.name);
      setFileName(file.name);
      setItems(merged);
      onImportedRef.current?.(merged, file.name);
      const docs = new Set(merged.map((item) => item.document)).size;
      toast.success(`Base de vendas salva: ${number.format(docs)} DOCs disponíveis mesmo após atualizar a página.`);
    } catch (error: any) {
      toast.error(error?.message || "Falha ao ler/salvar o relatório de vendas.");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card className={items.length ? "border-emerald-200 bg-emerald-50/40" : "border-blue-200 bg-blue-50/25"}>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => handleImport(event.target.files?.[0])}
      />
      <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl border bg-background p-2.5">
            {items.length ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <ReceiptText className="h-5 w-5 text-blue-700" />}
          </div>
          <div className="min-w-0">
            <div className="font-semibold">Base de vendas para conciliação</div>
            {!items.length ? (
              <div className="mt-1 text-sm text-muted-foreground">{loadingSaved ? "Recuperando vendas salvas…" : "Importe “Movimento de Produtos e Serviços”. A base fica salva por clínica e volta automaticamente após atualizar a página."}</div>
            ) : (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex max-w-full items-center gap-1 truncate"><FileText className="h-3.5 w-3.5" />{fileName}</span>
                <span><b className="text-foreground">{number.format(documents)}</b> DOCs</span>
                <span><b className="text-foreground">{number.format(patients)}</b> pacientes</span>
                <span><b className="text-foreground">{number.format(items.length)}</b> itens/tratamentos</span>
                <span className="font-medium text-emerald-700">Salvo no Firestore</span>
              </div>
            )}
          </div>
        </div>
        <Button size="sm" className="shrink-0 gap-2" variant={items.length ? "outline" : "default"} disabled={importing || loadingSaved} onClick={() => inputRef.current?.click()}>
          <Upload className="h-4 w-4" />
          {importing ? "Lendo vendas..." : items.length ? "Complementar Vendas" : "Importar Vendas"}
        </Button>
      </CardContent>
    </Card>
  );
}

async function parseSalesPdf(file: File): Promise<SaleItem[]> {
  const pdfjsUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
  const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const pdfjs: any = await import(/* @vite-ignore */ pdfjsUrl);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const result: SaleItem[] = [];
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

    const lines = [...groups.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, lineItems]) => lineItems
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim());

    for (const line of lines) {
      if (isPatientLine(line)) {
        currentPatient = line.trim();
        continue;
      }

      const match = line.match(/^(\d{3,8})\s+(\d{1,8})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(-?[\d.,]+)\s+(-?[\d.,]+)\s+(-?[\d.,]+)\s+(\d{2}\/\d{2}\/\d{2,4})$/);
      if (!match) continue;

      result.push({
        document: match[1],
        patientName: currentPatient,
        code: match[2],
        description: match[3].trim(),
        quantity: parseMoney(match[4]),
        cost: parseMoney(match[5]),
        value: parseMoney(match[6]),
        total: parseMoney(match[7]),
        date: match[8],
      });
    }
  }

  return result;
}
