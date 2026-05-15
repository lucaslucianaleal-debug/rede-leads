import { DashboardStats } from "@/types/crm";
import { Users, CalendarCheck, Clock, UserCheck } from "lucide-react";
import { motion } from "framer-motion";

interface StatsCardsProps {
  stats: DashboardStats;
}

const colorMap: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  accent: "bg-accent/10 text-accent",
};

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    { key: "totalLeads" as const, label: "Total de Leads", icon: Users, color: "primary" },
    { key: "agendados" as const, label: "Agendados", icon: CalendarCheck, color: "success" },
    { key: "followUpsPendentes" as const, label: "Follow-ups Pend.", icon: Clock, color: "accent" },
    { key: "compareceram" as const, label: "Compareceram", icon: UserCheck, color: "success" },
  ];

  // Calcular porcentagens
  const percentAgendados = stats.totalLeads > 0 
    ? ((stats.agendados / stats.totalLeads) * 100).toFixed(1)
    : "0.0";
  
  const percentCompareceram = stats.agendados > 0
    ? ((stats.compareceram / stats.agendados) * 100).toFixed(1)
    : "0.0";

  const getPercentage = (key: string) => {
    if (key === "agendados") return `${percentAgendados}%`;
    if (key === "compareceram") return `${percentCompareceram}%`;
    return null;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card, i) => {
        const Icon = card.icon;
        const percentage = getPercentage(card.key);
        
        return (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="stat-card"
          >
            <div className={`inline-flex p-2 rounded-lg mb-2 ${colorMap[card.color]}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex items-baseline gap-1 flex-wrap">
              <p className="text-xl sm:text-2xl font-heading font-bold text-foreground">{stats[card.key]}</p>
              {percentage && (
                <span className="text-xs font-semibold text-muted-foreground">({percentage})</span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{card.label}</p>
          </motion.div>
        );
      })}
    </div>
  );
}
