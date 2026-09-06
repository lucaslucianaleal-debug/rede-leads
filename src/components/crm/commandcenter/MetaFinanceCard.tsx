import React from "react";
import type { MetaFinanceStatus } from "@/hooks/useMetaFinance";

interface Props {
  status: MetaFinanceStatus | null;
  loading?: boolean;
  errorMessage?: string | null;
}

function money(value: number | null | undefined, currency = "BRL") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency || "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function dateBr(iso: string | null | undefined) {
  if (!iso) return "—";
  const clean = String(iso).slice(0, 10);
  const [yyyy, mm, dd] = clean.split("-");
  if (yyyy && mm && dd) return `${dd}/${mm}/${yyyy}`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("pt-BR");
}

function dateTimeBr(iso: string | null | undefined) {
  if (!iso) return "—";
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("pt-BR");
}

export default function MetaFinanceCard({ status, loading = false, errorMessage = null }: Props) {
  if (loading && !status) {
    return (
      <div style={{ background: "#202020", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-4 mb-4">
        <p style={{ color: "#fff", fontSize: "12px" }} className="font-semibold">Financeiro e combustível das campanhas</p>
        <p style={{ color: "#9ca3af", fontSize: "10px" }} className="mt-1">Carregando leitura financeira da Meta...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div style={{ background: "#202020", border: "0.5px solid #ef4444" }} className="rounded-lg p-4 mb-4">
        <p style={{ color: "#777", fontSize: "9px" }} className="uppercase tracking-wider">DADO • META</p>
        <p style={{ color: "#fff", fontSize: "13px" }} className="font-semibold">Financeiro e combustível das campanhas</p>
        <p style={{ color: "#ef4444", fontSize: "10px" }} className="mt-2">Não foi possível consultar o financeiro neste ambiente: {errorMessage}</p>
        <p style={{ color: "#777", fontSize: "9px" }} className="mt-1">As métricas de campanhas continuam funcionando; este aviso existe para o financeiro nunca desaparecer silenciosamente.</p>
      </div>
    );
  }

  if (!status?.configured) {
    return (
      <div style={{ background: "#202020", border: "0.5px solid #f59e0b" }} className="rounded-lg p-4 mb-4">
        <p style={{ color: "#777", fontSize: "9px" }} className="uppercase tracking-wider">DADO • META</p>
        <p style={{ color: "#fff", fontSize: "13px" }} className="font-semibold">Financeiro e combustível das campanhas</p>
        <p style={{ color: "#f59e0b", fontSize: "10px" }} className="mt-2">Conta Meta ainda não identificada para este ambiente/clinica. Use “Sincronizar Meta” para vincular e gerar a primeira leitura financeira.</p>
      </div>
    );
  }

  const financial = status.financial;
  if (!financial) {
    const financeError = status.financeLastError?.message;
    return (
      <div style={{ background: "#202020", border: `0.5px solid ${financeError ? "#ef4444" : "#f59e0b"}` }} className="rounded-lg p-4 mb-4">
        <p style={{ color: "#777", fontSize: "9px" }} className="uppercase tracking-wider">DADO • META</p>
        <p style={{ color: "#fff", fontSize: "13px" }} className="font-semibold">Financeiro e combustível das campanhas</p>
        {financeError ? (
          <p style={{ color: "#ef4444", fontSize: "10px" }} className="mt-2">A conta está vinculada, mas a leitura financeira falhou: {financeError}</p>
        ) : (
          <p style={{ color: "#f59e0b", fontSize: "10px" }} className="mt-2">Conta vinculada. Faça uma sincronização agora para gerar a primeira leitura de saldo, gasto e entrega.</p>
        )}
      </div>
    );
  }

  const tone = financial.alertLevel === "critical"
    ? { border: "#ef4444", color: "#ef4444", label: "AÇÃO NECESSÁRIA", emoji: "🔴" }
    : financial.alertLevel === "warning"
      ? { border: "#f59e0b", color: "#f59e0b", label: "ATENÇÃO", emoji: "🟠" }
      : { border: "#10b981", color: "#10b981", label: "SEM ALERTA CRÍTICO", emoji: "🟢" };

  const currency = financial.currency || "BRL";
  const balanceLabel = "Saldo disponível";
  const balanceValue = financial.isPrepayAccount ? money(financial.balance, currency) : "Não aplicável";
  const autonomyValue = financial.isPrepayAccount
    ? (financial.autonomyDays !== null ? `${financial.autonomyDays} dia${financial.autonomyDays === 1 ? "" : "s"}` : "Sem base")
    : "Conta pós-paga";
  const lastSpendText = financial.lastSpendDate
    ? `${dateBr(financial.lastSpendDate)}${financial.zeroSpendStreak > 0 ? ` • ${financial.zeroSpendStreak} dia(s) sem gasto` : ""}`
    : "Sem gasto nos últimos 30 dias";
  const topUpIsPaymentHistory = financial.lastTopUpSource === "meta_payment_history";
  const topUpText = financial.lastTopUpAt
    ? `${dateBr(financial.lastTopUpAt)}${financial.lastTopUpAmount > 0 ? ` • ${topUpIsPaymentHistory ? "" : "~"}${money(financial.lastTopUpAmount, currency)}` : ""}`
    : `Monitoramento iniciado em ${dateTimeBr(financial.monitoringStartedAt)}`;
  const topUpSourceText = financial.lastTopUpAt
    ? (topUpIsPaymentHistory ? "Histórico de pagamento Meta" : "Detectada automaticamente pelo saldo")
    : null;

  return (
    <div style={{ background: "#202020", border: `0.5px solid ${tone.border}` }} className="rounded-lg p-4 mb-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-3">
        <div>
          <p style={{ color: "#777", fontSize: "9px" }} className="uppercase tracking-wider">DADO • ATUALIZAÇÃO AUTOMÁTICA META</p>
          <p style={{ color: "#fff", fontSize: "14px" }} className="font-semibold">Financeiro e combustível das campanhas</p>
          <p style={{ color: tone.color, fontSize: "12px" }} className="font-semibold mt-1">{tone.emoji} {tone.label}</p>
        </div>
        <div className="text-left md:text-right">
          <p style={{ color: "#9ca3af", fontSize: "10px" }}>{status.accountName || "Conta Meta"}</p>
          <p style={{ color: "#666", fontSize: "9px" }}>Última leitura: {dateTimeBr(financial.syncedAt || status.lastSyncAt)}</p>
        </div>
      </div>

      <div style={{ background: financial.alertLevel === "critical" ? "#2b1f1f" : financial.alertLevel === "warning" ? "#2b271f" : "#1f2b26", border: `0.5px solid ${tone.border}` }} className="rounded p-3 mb-3">
        <p style={{ color: tone.color, fontSize: "11px" }} className="font-semibold">{financial.alertMessage}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
          <p style={{ color: "#777", fontSize: "9px" }} className="uppercase">{balanceLabel}</p>
          <p style={{ color: financial.isPrepayAccount ? "#fff" : "#9ca3af", fontSize: "14px" }} className="font-bold">{balanceValue}</p>
        </div>
        <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
          <p style={{ color: "#777", fontSize: "9px" }} className="uppercase">Gasto ontem</p>
          <p style={{ color: "#fff", fontSize: "14px" }} className="font-bold">{money(financial.yesterdaySpend, currency)}</p>
        </div>
        <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
          <p style={{ color: "#777", fontSize: "9px" }} className="uppercase">Ritmo diário de gasto</p>
          <p style={{ color: "#fff", fontSize: "14px" }} className="font-bold">{money(financial.baselineDailySpend, currency)}</p>
          <p style={{ color: "#666", fontSize: "9px" }}>média dos últimos dias com entrega</p>
        </div>
        <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
          <p style={{ color: "#777", fontSize: "9px" }} className="uppercase">Autonomia estimada</p>
          <p style={{ color: financial.autonomyDays !== null && financial.autonomyDays <= 3 ? "#f59e0b" : "#fff", fontSize: "14px" }} className="font-bold">{autonomyValue}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
        <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
          <p style={{ color: "#777", fontSize: "9px" }} className="uppercase">Último dia com gasto</p>
          <p style={{ color: financial.zeroSpendStreak >= 2 ? "#ef4444" : "#d1d5db", fontSize: "10px" }} className="font-semibold">{lastSpendText}</p>
        </div>
        <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
          <p style={{ color: "#777", fontSize: "9px" }} className="uppercase">Última recarga</p>
          <p style={{ color: "#d1d5db", fontSize: "10px" }} className="font-semibold">{topUpText}</p>
          {topUpSourceText && (
            <p style={{ color: "#666", fontSize: "9px" }} className="mt-0.5">{topUpSourceText}</p>
          )}
        </div>
        <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
          <p style={{ color: "#777", fontSize: "9px" }} className="uppercase">Entrega / conta</p>
          <p style={{ color: financial.accountStatusActive ? "#d1d5db" : "#ef4444", fontSize: "10px" }} className="font-semibold">
            {financial.activeAds} anúncio(s) ativo(s) • conta {financial.accountStatusActive ? "ativa" : `status ${financial.accountStatus}`}
          </p>
        </div>
      </div>

      {!financial.isPrepayAccount && financial.remainingSpendCap !== null && (
        <p style={{ color: "#777", fontSize: "9px" }} className="mt-2">
          Limite restante da conta: {money(financial.remainingSpendCap, currency)}. Em conta pós-paga, o campo balance da Meta não é tratado como crédito disponível.
        </p>
      )}
      {financial.isPrepayAccount && (
        <p style={{ color: "#666", fontSize: "9px" }} className="mt-2">
          Autonomia = saldo disponível ÷ média dos últimos dias com gasto. É uma estimativa operacional, não garantia de entrega futura.
        </p>
      )}
    </div>
  );
}
