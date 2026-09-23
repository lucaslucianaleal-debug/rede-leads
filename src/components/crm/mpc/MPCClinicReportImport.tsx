import React, { useMemo, useState } from "react";
import { CheckCircle2, FileText, Link2, Loader2, Upload, Users, XCircle } from "lucide-react";
import type { Lead } from "@/types/crm";
import type { MPCStore } from "@/hooks/useMPCDataStore";
import { parseClinicReportPdf, type ParsedClinicReport } from "@/lib/mpcClinicReportParser";
import type {
  MPCClinicBudgetSalesSnapshot,
  MPCClinicLeadLink,
  MPCClinicProcedureRecord,
  MPCClinicReportImport,
  MPCClinicSaleRecord,
} from "@/types/mpcClinicReports";

type Props = {
  store: MPCStore;
  allLeads: Lead[];
  setStore: (s: MPCStore | ((prev: MPCStore) => MPCStore)) => void;
  saveNow: (nextStore?: MPCStore) => Promise<void>;
};

type LinkedReport = ParsedClinicReport & { linkedRows: any[] };

function normalizeName(value?: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCpf(value?: string) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhone(value?: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  return digits;
}

function getLeadCpf(lead: Lead) {
  const fields = lead.customFields || {};
  const candidates = [fields.cpf, fields.CPF, fields.documento, fields.document, fields.cnpjCpf, fields.cnpj_cpf];
  for (const candidate of candidates) {
    const cpf = normalizeCpf(candidate);
    if (cpf.length === 11) return cpf;
  }
  return "";
}

function buildUniqueIndex<T>(entries: Array<[string, T]>) {
  const grouped = new Map<string, T[]>();
  entries.forEach(([key, value]) => {
    if (!key) return;
    const list = grouped.get(key) || [];
    list.push(value);
    grouped.set(key, list);
  });
  const unique = new Map<string, T>();
  grouped.forEach((list, key) => {
    if (list.length === 1) unique.set(key, list[0]);
  });
  return unique;
}

function extractLeadAppointmentDates(lead: Lead) {
  const values = [lead.dataAgendamento, ...(lead.historicoAgendamentos || []).map((h) => h.data)].filter(Boolean);
  const result = new Set<string>();
  values.forEach((raw) => {
    const text = String(raw);
    const br = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) {
      result.add(`${br[3]}-${String(br[2]).padStart(2, "0")}-${String(br[1]).padStart(2, "0")}`);
      return;
    }
    const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) result.add(`${iso[1]}-${iso[2]}-${iso[3]}`);
  });
  return result;
}

function stableId(prefix: string, parts: Array<string | number | undefined>) {
  const input = `${prefix}|${parts.map((v) => String(v ?? "")).join("|")}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

function mergeById<T extends { id: string }>(current: T[] = [], incoming: T[] = []) {
  const map = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function formatPeriod(start: string, end: string) {
  const fmt = (iso: string) => {
    if (!iso) return "?";
    const [y, m, d] = iso.split("-");
    return y && m && d ? `${d}/${m}/${y}` : iso;
  };
  return `${fmt(start)} a ${fmt(end)}`;
}

function reportLabel(type: ParsedClinicReport["type"]) {
  if (type === "budgets_sales") return "Orçamentos e Vendas";
  if (type === "ortho_sales") return "Venda Orto";
  return "Atendimentos / Concluídos";
}

export default function MPCClinicReportImport({ store, allLeads, setStore, saveNow }: Props) {
  const [reports, setReports] = useState<LinkedReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const indexes = useMemo(() => {
    const byName = buildUniqueIndex(allLeads.map((lead) => [normalizeName(lead.nome), lead] as [string, Lead]));
    const byPhone = buildUniqueIndex(allLeads.map((lead) => [normalizePhone(lead.telefone), lead] as [string, Lead]));
    const byCpf = buildUniqueIndex(allLeads.map((lead) => [getLeadCpf(lead), lead] as [string, Lead]));
    return { byName, byPhone, byCpf };
  }, [allLeads]);

  const makeLink = (row: { patientName?: string; cpf?: string; phone?: string }, eventDate?: string): MPCClinicLeadLink | undefined => {
    const cpf = normalizeCpf(row.cpf);
    const phone = normalizePhone(row.phone);
    const name = normalizeName(row.patientName);
    let lead: Lead | undefined;
    let method: MPCClinicLeadLink["method"] | undefined;

    if (cpf && indexes.byCpf.has(cpf)) {
      lead = indexes.byCpf.get(cpf);
      method = "cpf";
    } else if (phone && indexes.byPhone.has(phone)) {
      lead = indexes.byPhone.get(phone);
      method = "phone";
    } else if (name && indexes.byName.has(name)) {
      lead = indexes.byName.get(name);
      method = "name";
    }

    if (!lead || !method) return undefined;
    const sameDayAppointment = eventDate ? extractLeadAppointmentDates(lead).has(eventDate) : false;
    return {
      leadId: lead.id,
      method,
      crmName: lead.nome,
      crmPhone: lead.telefone,
      crmAppointmentDate: lead.dataAgendamento || undefined,
      crmComparecimento: lead.comparecimento || undefined,
      metaCampanhaId: lead.metaCampanhaId,
      metaCampanhaNome: lead.metaCampanhaNome,
      fonteLead: lead.fonteLead,
      servicoProcurado: lead.servicoProcurado,
      sameDayAppointment,
    };
  };

  const linkReport = (report: ParsedClinicReport): LinkedReport => {
    if (report.type === "budgets_sales") {
      return { ...report, linkedRows: report.rows.map((row) => ({ ...row, link: makeLink(row) })) };
    }
    if (report.type === "ortho_sales") {
      return { ...report, linkedRows: report.rows.map((row) => ({ ...row, link: makeLink(row, row.saleDate) })) };
    }
    return { ...report, linkedRows: report.rows.map((row) => ({ ...row, link: makeLink(row, row.completedAt) })) };
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const parsed: LinkedReport[] = [];
      for (const file of Array.from(files)) {
        const report = await parseClinicReportPdf(file);
        parsed.push(linkReport(report));
      }
      setReports(parsed);
      setMessage(`${parsed.length} relatório(s) lido(s). Confira o cruzamento antes de salvar.`);
    } catch (e) {
      console.error("[MPC] Falha ao ler relatório da clínica", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const commitReports = async () => {
    if (!reports.length) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const importedAt = new Date().toISOString();
      let snapshots = [...(store.clinicBudgetSalesSnapshots || [])];
      let sales = [...(store.clinicSales || [])];
      let procedures = [...(store.clinicProcedures || [])];
      let imports = [...(store.clinicReportImports || [])];

      reports.forEach((report) => {
        const linkedCount = report.linkedRows.filter((row: any) => row.link?.leadId).length;
        const sameDayConfirmedCount = report.linkedRows.filter((row: any) => row.link?.sameDayAppointment).length;
        const importId = stableId("clinic_import", [report.type, report.periodStart, report.periodEnd]);

        const importRecord: MPCClinicReportImport = {
          id: importId,
          type: report.type,
          fileName: report.fileName,
          periodStart: report.periodStart,
          periodEnd: report.periodEnd,
          importedAt,
          rowCount: report.linkedRows.length,
          linkedCount,
          unmatchedCount: report.linkedRows.length - linkedCount,
          sameDayConfirmedCount,
        };
        imports = mergeById(imports, [importRecord]);

        if (report.type === "budgets_sales") {
          const snapshot: MPCClinicBudgetSalesSnapshot = {
            id: stableId("budget_sales", [report.periodStart, report.periodEnd]),
            sourceFile: report.fileName,
            periodStart: report.periodStart,
            periodEnd: report.periodEnd,
            importedAt,
            rows: report.linkedRows,
            totals: report.totals,
          };
          snapshots = mergeById(snapshots, [snapshot]);
          return;
        }

        if (report.type === "ortho_sales") {
          const incoming: MPCClinicSaleRecord[] = report.linkedRows.map((row: any) => ({
            id: stableId("clinic_sale", [row.externalDoc]),
            sourceFile: report.fileName,
            importedAt,
            externalDoc: row.externalDoc,
            cpf: row.cpf,
            patientName: row.patientName,
            saleDate: row.saleDate,
            type: row.type,
            modality: row.modality,
            value: row.value,
            phone: row.phone,
            startDate: row.startDate,
            link: row.link,
          }));
          sales = mergeById(sales, incoming);
          return;
        }

        const incoming: MPCClinicProcedureRecord[] = report.linkedRows.map((row: any) => ({
          id: stableId("clinic_proc", [row.dentistCode, row.externalDoc, row.procedureNo, row.service, row.completedAt]),
          sourceFile: report.fileName,
          importedAt,
          dentistCode: row.dentistCode,
          dentistName: row.dentistName,
          patientName: row.patientName,
          externalDoc: row.externalDoc,
          procedureNo: row.procedureNo,
          service: row.service,
          tooth: row.tooth,
          value: row.value,
          completedAt: row.completedAt,
          link: row.link,
        }));
        procedures = mergeById(procedures, incoming);
      });

      const nextStore: MPCStore = {
        ...store,
        clinicBudgetSalesSnapshots: snapshots,
        clinicSales: sales,
        clinicProcedures: procedures,
        clinicReportImports: imports,
      };
      setStore(nextStore);
      await saveNow(nextStore);
      setReports([]);
      setMessage(`Importação concluída: ${reports.length} relatório(s) cruzado(s) e salvo(s) no MPC.`);
    } catch (e) {
      console.error("[MPC] Falha ao salvar relatórios da clínica", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const storedSummary = useMemo(() => {
    const latestSnapshot = [...(store.clinicBudgetSalesSnapshots || [])].sort((a, b) => b.importedAt.localeCompare(a.importedAt))[0];
    const sales = store.clinicSales || [];
    const procedures = store.clinicProcedures || [];
    const linked = new Set<string>();
    let sameDay = 0;
    sales.forEach((r) => r.link?.leadId && linked.add(r.link.leadId));
    procedures.forEach((r) => {
      if (r.link?.leadId) linked.add(r.link.leadId);
      if (r.link?.sameDayAppointment) sameDay += 1;
    });
    latestSnapshot?.rows.forEach((r) => r.link?.leadId && linked.add(r.link.leadId));
    return {
      latestSnapshot,
      saleCount: sales.filter((r) => r.type === "VENDA").length,
      saleValue: sales.filter((r) => r.type === "VENDA").reduce((sum, r) => sum + r.value, 0),
      procedures: procedures.length,
      productionValue: procedures.reduce((sum, r) => sum + r.value, 0),
      linkedLeads: linked.size,
      sameDay,
      imports: (store.clinicReportImports || []).length,
    };
  }, [store]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Relatórios oficiais da clínica</h4>
            <p className="mt-1 text-xs text-slate-600">
              Aceita os PDFs: Orçamentos e Vendas, Venda Orto e Lista - Concluídos. O MPC cruza CPF, telefone e nome com o CRM sem criar atendimentos fictícios.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {loading ? "Lendo PDFs..." : "Selecionar PDFs"}
            <input
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              disabled={loading || saving}
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <XCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}
      {message && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> {message}
        </div>
      )}

      {reports.length > 0 && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Prévia do cruzamento</h4>
              <p className="text-xs text-slate-500">Nada é salvo até você clicar em Confirmar importação.</p>
            </div>
            <button
              type="button"
              onClick={() => void commitReports()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              Confirmar importação
            </button>
          </div>

          {reports.map((report) => {
            const linked = report.linkedRows.filter((row: any) => row.link?.leadId).length;
            const sameDay = report.linkedRows.filter((row: any) => row.link?.sameDayAppointment).length;
            const unmatched = report.linkedRows.filter((row: any) => !row.link?.leadId).slice(0, 8);
            return (
              <div key={`${report.type}-${report.fileName}`} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText size={15} className="text-sky-700" />
                      <span className="text-sm font-semibold text-slate-900">{reportLabel(report.type)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{report.fileName} · {formatPeriod(report.periodStart, report.periodEnd)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{report.linkedRows.length} linhas</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">{linked} no CRM</span>
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{report.linkedRows.length - linked} pendentes</span>
                    {report.type === "completed" && <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">{sameDay} presença(s) na mesma data</span>}
                  </div>
                </div>

                {report.type === "budgets_sales" && (
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <Stat label="Orçamentos" value={report.totals.budgets} />
                    <Stat label="Vendas" value={report.totals.sales} />
                    <Stat label="Conversão" value={`${report.totals.budgets ? ((report.totals.sales / report.totals.budgets) * 100).toFixed(1) : "0"}%`} />
                    <Stat label="PART. / ODC" value={`${report.totals.particular} / ${report.totals.odc}`} />
                  </div>
                )}
                {report.type === "ortho_sales" && (
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <Stat label="Vendas" value={report.totals.sales} />
                    <Stat label="Complementos" value={report.totals.complements} />
                    <Stat label="Movimentos" value={report.totals.records} />
                    <Stat label="Valor" value={formatMoney(report.totals.value)} />
                  </div>
                )}
                {report.type === "completed" && (
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <Stat label="Procedimentos" value={report.totals.procedures} />
                    <Stat label="Valor produzido" value={formatMoney(report.totals.value)} />
                    <Stat label="Vinculados ao CRM" value={linked} />
                    <Stat label="Mesma data do agendamento" value={sameDay} />
                  </div>
                )}

                {unmatched.length > 0 && (
                  <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <strong>Pendentes de vínculo:</strong> {unmatched.map((row: any) => row.patientName).join(" · ")}
                    {report.linkedRows.length - linked > unmatched.length ? " · ..." : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(storedSummary.imports > 0 || storedSummary.latestSnapshot) && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-slate-700" />
            <h4 className="text-sm font-semibold text-slate-900">Base clínica já conciliada no MPC</h4>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
            <Stat label="Relatórios" value={storedSummary.imports} />
            <Stat label="Leads encontrados" value={storedSummary.linkedLeads} />
            <Stat label="Vendas Orto" value={storedSummary.saleCount} />
            <Stat label="Valor vendas Orto" value={formatMoney(storedSummary.saleValue)} />
            <Stat label="Procedimentos" value={storedSummary.procedures} />
            <Stat label="Presenças mesma data" value={storedSummary.sameDay} />
          </div>
          {storedSummary.latestSnapshot && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <Users size={14} />
              Último comercial oficial: <strong>{storedSummary.latestSnapshot.totals.budgets} orçamentos</strong> · <strong>{storedSummary.latestSnapshot.totals.sales} vendas</strong> · conversão <strong>{((storedSummary.latestSnapshot.totals.sales / Math.max(storedSummary.latestSnapshot.totals.budgets, 1)) * 100).toFixed(1)}%</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}
