import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lead } from "@/types/crm";
import { TrendingUp } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ComparisonChartProps {
  leads: Lead[];
}

type MetricKey = "leads_novos" | "agendamentos" | "compareceu" | "nao_compareceu";

const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
  { key: "leads_novos", label: "Leads Novos" },
  { key: "agendamentos", label: "Agendamentos" },
  { key: "compareceu", label: "Compareceu" },
  { key: "nao_compareceu", label: "Não Compareceu" },
];

const LINE_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4"];

function getAvailableMonths(n = 12): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(format(d, "MM/yyyy"));
  }
  return months;
}

function getMonthLabel(mmYYYY: string): string {
  const [mm, yyyy] = mmYYYY.split("/");
  const d = new Date(parseInt(yyyy), parseInt(mm) - 1, 1);
  return format(d, "MMM/yy", { locale: ptBR });
}

function getDaysInMonthStr(mmYYYY: string): number {
  const [mm, yyyy] = mmYYYY.split("/");
  return new Date(parseInt(yyyy), parseInt(mm), 0).getDate();
}

function getDateField(lead: Lead, metric: MetricKey): string | undefined {
  switch (metric) {
    case "leads_novos":   return lead.dataCriacao;
    case "agendamentos":  return lead.dataAgendamentoCriado;
    case "compareceu":    return lead.dataAgendamento;
    case "nao_compareceu": return lead.dataAgendamento;
  }
}

function matchesMetric(lead: Lead, metric: MetricKey): boolean {
  if (metric === "compareceu")    return lead.comparecimento === "COMPARECEU";
  if (metric === "nao_compareceu") return lead.comparecimento === "NÃO COMPARECEU";
  return true;
}

export function ComparisonChart({ leads }: ComparisonChartProps) {
  const availableMonths = useMemo(() => getAvailableMonths(12), []);

  const [metric, setMetric] = useState<MetricKey>("leads_novos");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([
    availableMonths[0], // mês atual
    availableMonths[1], // mês anterior
  ]);

  function toggleMonth(month: string) {
    setSelectedMonths((prev) => {
      if (prev.includes(month)) {
        if (prev.length <= 1) return prev; // mínimo 1 mês
        return prev.filter((m) => m !== month);
      }
      if (prev.length >= 5) return prev; // máximo 5 meses
      return [...prev, month];
    });
  }

  // Gera os dados do gráfico: X = dia do mês, uma série por mês selecionado
  const chartData = useMemo(() => {
    const maxDays = Math.max(...selectedMonths.map((m) => getDaysInMonthStr(m)));

    return Array.from({ length: maxDays }, (_, i) => {
      const day = i + 1;
      const point: Record<string, number | string | null> = { dia: day };

      for (const month of selectedMonths) {
        const [mm, yyyy] = month.split("/");
        const dayStr = `${String(day).padStart(2, "0")}/${mm}/${yyyy}`;
        const daysInMonth = getDaysInMonthStr(month);

        if (day > daysInMonth) {
          point[month] = null;
        } else {
          point[month] = leads.filter((lead) => {
            const dateField = getDateField(lead, metric);
            if (!dateField) return false;
            return dateField.startsWith(dayStr) && matchesMetric(lead, metric);
          }).length;
        }
      }

      return point;
    });
  }, [leads, metric, selectedMonths]);

  // Totais por mês selecionado para exibir no rodapé
  const totals = useMemo(() => {
    return selectedMonths.map((month) => {
      const [mm, yyyy] = month.split("/");
      const prefix = `/${mm}/${yyyy}`;
      const count = leads.filter((lead) => {
        const dateField = getDateField(lead, metric);
        if (!dateField) return false;
        return dateField.includes(prefix) && matchesMetric(lead, metric);
      }).length;
      return { month, count };
    });
  }, [leads, metric, selectedMonths]);

  return (
    <div className="bg-[#1C1C1E] rounded-xl border border-gray-800 p-6 mt-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 mb-5">
        <TrendingUp className="w-5 h-5 text-indigo-400" />
        <h3 className="text-white font-semibold text-base">Comparação de Períodos</h3>
      </div>

      {/* Controles */}
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:flex-wrap">
        {/* Seletor de métrica */}
        <div>
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Métrica</p>
          <div className="flex gap-2 flex-wrap">
            {METRIC_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setMetric(opt.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  metric === opt.key
                    ? "bg-indigo-500 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Seletor de meses */}
        <div>
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
            Meses para comparar <span className="normal-case text-gray-600">(máx. 5)</span>
          </p>
          <div className="flex gap-2 flex-wrap">
            {availableMonths.slice(0, 8).map((month) => {
              const selected = selectedMonths.includes(month);
              const colorIdx = selectedMonths.indexOf(month);
              return (
                <button
                  key={month}
                  onClick={() => toggleMonth(month)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    selected
                      ? "text-white border-transparent"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700 border-gray-700"
                  }`}
                  style={
                    selected
                      ? {
                          backgroundColor: LINE_COLORS[colorIdx],
                          borderColor: LINE_COLORS[colorIdx],
                        }
                      : {}
                  }
                >
                  {getMonthLabel(month)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Gráfico */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d2d30" />
          <XAxis
            dataKey="dia"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
            interval={1}
          />
          <YAxis
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: "8px",
              color: "#f9fafb",
              fontSize: "12px",
            }}
            labelFormatter={(val) => `Dia ${val}`}
            formatter={(value, name) => [value, getMonthLabel(name as string)]}
          />
          <Legend
            formatter={(value) => getMonthLabel(value as string)}
            wrapperStyle={{ color: "#9ca3af", fontSize: "12px" }}
          />
          {selectedMonths.map((month, idx) => (
            <Line
              key={month}
              type="monotone"
              dataKey={month}
              stroke={LINE_COLORS[idx % LINE_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Totais por mês */}
      <div className="flex gap-4 mt-4 flex-wrap">
        {totals.map(({ month, count }, idx) => (
          <div key={month} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: LINE_COLORS[idx % LINE_COLORS.length] }}
            />
            <span className="text-xs text-gray-400">
              {getMonthLabel(month)}:{" "}
              <span className="text-white font-semibold">{count}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
