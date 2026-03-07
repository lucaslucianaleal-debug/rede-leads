import React from "react";

interface ProgressWithLabelProps {
  label: string;
  current: number;
  goal: number;
  icon?: React.ReactNode;
  variant?: "primary" | "success" | "warning" | "info";
  showTrophy?: boolean;
}

export function ProgressWithLabel({
  label,
  current,
  goal,
  icon,
  variant = "primary",
  showTrophy = false,
}: ProgressWithLabelProps) {
  const progress = Math.min((current / goal) * 100, 100);
  const isComplete = current >= goal;

  // Determina a cor baseado no variant ou se completou
  const getBarColor = () => {
    if (isComplete && showTrophy) return "bg-blue-500"; // Agendamentos: Azul + 🏆
    if (isComplete && variant === "success") return "bg-green-500"; // Atendimentos: Verde Vibrante
    if (isComplete && variant === "warning") return "bg-amber-500"; // Follow-up: Dourado
    
    // Cores padrão (incompleto)
    switch (variant) {
      case "success":
        return "bg-green-400";
      case "warning":
        return "bg-amber-400";
      case "info":
        return "bg-blue-400";
      default:
        return "bg-blue-400";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon && <span className="text-base">{icon}</span>}
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tabular-nums">
            {current}/{goal}
          </span>
          {isComplete && showTrophy && <span className="text-lg">🏆</span>}
        </div>
      </div>
      <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden border border-border/30">
        <div
          className={`h-full transition-all duration-300 ${getBarColor()}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
