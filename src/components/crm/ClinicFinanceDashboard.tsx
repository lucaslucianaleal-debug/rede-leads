import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  FileText,
  Landmark,
  ReceiptText,
  UsersRound,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type FinanceView = "overview" | "delinquency";

type AgingBucket = {
  label: string;
  installments: number;
  patients: number;
  original: number;
  current: number;
};

const SNAPSHOT = {
  source: "Relatório de Cobrança",
  period: "01/01/2026 a 23/09/2026",
  generatedAt: "23/09/2026 17:56",
  patients: 288,
  installments: 3272,
  original: 533645.87,
  current: 1095838.93,
};

const AGING: AgingBucket[] = [
  { label: "1–30 dias", installments: 150, patients: 144, original: 35058.47, current: 36866.19 },
  { label: "31–60 dias", installments: 109, patients: 104, original: 25260.75, current: 28846.78 },
  { label: "61–90 dias", installments: 102, patients: 97, original: 21123.87, current: 25770.57 },
  { label: "91–180 dias", installments: 319, patients: 127, original: 63803.12, current: 88300.14 },
  { label: "181–365 dias", installments: 846, patients: 179, original: 155245.32, current: 267209.81 },
  { label: "+1 ano", installments: 1746, patients: 122, original: 233154.34, current: 648845.44 },
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");

function formatCurrency(value: number) {
  return brl.format(value);
}

function SummaryCard({
  title,
  value,
  helper,
  icon,
  tone = "default",
}: {
  title: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  tone?: "default" | "danger" | "warning";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50/60"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50/60"
        : "border-border bg-card";

  return (
    <Card className={toneClass}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
            <div className="mt-2 truncate text-2xl font-bold tracking-tight">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
          </div>
          <div className="rounded-xl border bg-background/80 p-2.5 text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ClinicFinanceDashboard() {
  const [view, setView] = useState<FinanceView>("overview");

  const metrics = useMemo(() => {
    const increase = SNAPSHOT.current - SNAPSHOT.original;
    const increasePct = SNAPSHOT.original > 0 ? (increase / SNAPSHOT.original) * 100 : 0;
    const overOneYear = AGING.find((item) => item.label === "+1 ano");
    const overOneYearPct = overOneYear ? (overOneYear.current / SNAPSHOT.current) * 100 : 0;
    return { increase, increasePct, overOneYear, overOneYearPct };
  }, []);

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            <h2 className="font-heading text-xl font-bold">Financeiro da Clínica</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Cobrança, inadimplência e envelhecimento da carteira em um único painel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={view === "overview" ? "default" : "outline"} onClick={() => setView("overview")}>
            Visão geral
          </Button>
          <Button size="sm" variant={view === "delinquency" ? "default" : "outline"} onClick={() => setView("delinquency")}>
            Inadimplência
          </Button>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-muted/35 px-4 py-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Fonte: {SNAPSHOT.source}</span>
        <span>Período: {SNAPSHOT.period}</span>
        <span>Atualizado em {SNAPSHOT.generatedAt}</span>
      </section>

      {view === "overview" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              title="Saldo em cobrança"
              value={formatCurrency(SNAPSHOT.current)}
              helper="Valor atualizado da carteira"
              icon={<CircleDollarSign className="h-5 w-5" />}
              tone="danger"
            />
            <SummaryCard
              title="Valor original"
              value={formatCurrency(SNAPSHOT.original)}
              helper="Principal das parcelas"
              icon={<Banknote className="h-5 w-5" />}
            />
            <SummaryCard
              title="Acréscimos"
              value={formatCurrency(metrics.increase)}
              helper={`+${metrics.increasePct.toFixed(1).replace(".", ",")}% sobre o original`}
              icon={<ReceiptText className="h-5 w-5" />}
              tone="warning"
            />
            <SummaryCard
              title="Pacientes"
              value={number.format(SNAPSHOT.patients)}
              helper="Com valores em cobrança"
              icon={<UsersRound className="h-5 w-5" />}
            />
            <SummaryCard
              title="Parcelas"
              value={number.format(SNAPSHOT.installments)}
              helper="Títulos em aberto"
              icon={<CalendarClock className="h-5 w-5" />}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Envelhecimento da dívida</CardTitle>
                <CardDescription>Valor atualizado em aberto por faixa de atraso</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={AGING} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} width={44} />
                      <Tooltip formatter={(value) => [formatCurrency(Number(value)), "Valor atualizado"]} />
                      <Bar dataKey="current" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  Ponto crítico
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-3xl font-bold tracking-tight">{metrics.overOneYearPct.toFixed(1).replace(".", ",")}%</div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  do saldo atualizado está em parcelas com mais de um ano de atraso.
                </p>
                <div className="rounded-xl border border-amber-200 bg-background/80 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Mais de 1 ano</div>
                  <div className="mt-1 text-lg font-semibold">{formatCurrency(metrics.overOneYear?.current || 0)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {number.format(metrics.overOneYear?.installments || 0)} parcelas • {number.format(metrics.overOneYear?.patients || 0)} pacientes
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <AgingTable />
        </>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...AGING].reverse().map((item, index) => {
              const share = (item.current / SNAPSHOT.current) * 100;
              return (
                <Card key={item.label} className={index === 0 ? "border-red-200 bg-red-50/50" : undefined}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{item.label}</div>
                        <div className="mt-1 text-2xl font-bold">{formatCurrency(item.current)}</div>
                      </div>
                      <div className="rounded-full border bg-background px-2.5 py-1 text-xs font-semibold">
                        {share.toFixed(1).replace(".", ",")}%
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>{number.format(item.installments)} parcelas</div>
                      <div>{number.format(item.patients)} pacientes</div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </section>

          <AgingTable />
        </>
      )}
    </div>
  );
}

function AgingTable() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Carteira por faixa de atraso</CardTitle>
        <CardDescription>Quantidade de títulos, pacientes e evolução do valor original para o valor atualizado.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Faixa</th>
              <th className="px-4 py-3 text-right font-medium">Parcelas</th>
              <th className="px-4 py-3 text-right font-medium">Pacientes</th>
              <th className="px-4 py-3 text-right font-medium">Original</th>
              <th className="px-4 py-3 text-right font-medium">Atualizado</th>
              <th className="px-4 py-3 text-right font-medium">Acréscimo</th>
            </tr>
          </thead>
          <tbody>
            {AGING.map((item) => {
              const increase = item.current - item.original;
              return (
                <tr key={item.label} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{item.label}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{number.format(item.installments)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{number.format(item.patients)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(item.original)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(item.current)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(increase)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30 font-semibold">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-right tabular-nums">{number.format(SNAPSHOT.installments)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{number.format(SNAPSHOT.patients)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(SNAPSHOT.original)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(SNAPSHOT.current)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(SNAPSHOT.current - SNAPSHOT.original)}</td>
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  );
}
