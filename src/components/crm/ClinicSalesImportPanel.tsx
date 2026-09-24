import { useMemo, useRef, useState } from "react";
import { FileText, ReceiptText, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

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

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");

function formatCurrency(value: number) {
  return brl.format(value || 0);
}

function parseMoney(value: string) {
  const normalized = value.replace(/\s/g, "").replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isPatientLine(line: string) {
  if (!line || /\d/.test(line)) return false;
  if (/MOVIMENTO DE PRODUTOS|EMPRESA|PER[IÍ]ODO|TIPO DE PRODUTO|DESCRI[CÇ][AÃ]O|CUSTO|VALOR|TOTAL|DATA|C[ÓO]DIGO|DOC/i.test(line)) return false;
  const words = line.trim().split(/\s+/).filter(Boolean);
  return words.length >= 2 && line === line.toUpperCase();
}

export function ClinicSalesImportPanel({ onImported }: { onImported?: (items: SaleItem[], fileName: string) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);

  const documents = useMemo(() => new Set(items.map((item) => item.document)).size, [items]);
  const patients = useMemo(() => new Set(items.map((item) => item.patientName).filter(Boolean)).size, [items]);
  const total = useMemo(() => items.reduce((sum, item) => sum + item.total, 0), [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      item.document.toLowerCase().includes(term) ||
      item.patientName.toLowerCase().includes(term) ||
      item.code.toLowerCase().includes(term) ||
      item.description.toLowerCase().includes(term),
    );
  }, [items, search]);

  async function handleImport(file?: File) {
    if (!file) return;
    setImporting(true);
    setFileName(file.name);
    try {
      const parsed = await parseSalesPdf(file);
      if (!parsed.length) throw new Error("Não consegui identificar as vendas nesse PDF.");
      setItems(parsed);
      setSearch("");
      onImported?.(parsed, file.name);
      const docs = new Set(parsed.map((item) => item.document)).size;
      toast.success(`Vendas importadas: ${docs} documentos e ${parsed.length} itens reconhecidos.`);
    } catch (error: any) {
      setItems([]);
      onImported?.([], file.name);
      toast.error(error?.message || "Falha ao ler o relatório de vendas.");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card className="border-blue-200 bg-blue-50/25">
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => handleImport(event.target.files?.[0])}
      />

      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ReceiptText className="h-4 w-4 text-blue-700" />
              Vendas / Produtos e Serviços
            </CardTitle>
            <CardDescription className="mt-1">
              Importe o PDF “Movimento de Produtos e Serviços” para identificar o tratamento ligado ao DOC da cobrança.
            </CardDescription>
          </div>
          <Button size="sm" className="gap-2" disabled={importing} onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            {importing ? "Lendo vendas..." : "Importar Vendas"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!items.length ? (
          <div className="rounded-lg border border-dashed bg-background/70 px-4 py-3 text-sm text-muted-foreground">
            Nenhum relatório de vendas importado nesta sessão. O processamento é local no navegador e ainda não grava dados no banco.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1">
                <FileText className="h-3.5 w-3.5" /> {fileName}
              </span>
              <span className="rounded-full border bg-background px-2.5 py-1 font-medium">{number.format(documents)} DOCs</span>
              <span className="rounded-full border bg-background px-2.5 py-1 font-medium">{number.format(patients)} pacientes</span>
              <span className="rounded-full border bg-background px-2.5 py-1 font-medium">{number.format(items.length)} itens</span>
              <span className="rounded-full border bg-background px-2.5 py-1 font-medium">{formatCurrency(total)} em movimentos</span>
            </div>

            <div className="relative max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar DOC, paciente, código ou tratamento"
              />
            </div>

            <div className="max-h-[420px] overflow-auto rounded-lg border bg-background">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-3">DOC</th>
                    <th className="px-3 py-3">Paciente</th>
                    <th className="px-3 py-3">Código</th>
                    <th className="px-3 py-3">Descrição / Tratamento</th>
                    <th className="px-3 py-3 text-right">Qtde</th>
                    <th className="px-3 py-3 text-right">Valor</th>
                    <th className="px-3 py-3 text-right">Total</th>
                    <th className="px-3 py-3">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, index) => (
                    <tr key={`${item.document}-${item.code}-${item.description}-${index}`} className="border-b last:border-0 hover:bg-muted/25">
                      <td className="px-3 py-3 font-semibold">{item.document}</td>
                      <td className="px-3 py-3">{item.patientName || "—"}</td>
                      <td className="px-3 py-3">{item.code}</td>
                      <td className="px-3 py-3 font-medium">{item.description}</td>
                      <td className="px-3 py-3 text-right">{item.quantity}</td>
                      <td className="px-3 py-3 text-right">{formatCurrency(item.value)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{formatCurrency(item.total)}</td>
                      <td className="px-3 py-3">{item.date}</td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Nenhuma venda encontrada para essa busca.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
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
