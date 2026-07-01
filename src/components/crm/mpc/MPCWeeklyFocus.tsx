import React from "react";
import { WeeklyFocus } from "@/types/mpc";
import { Target } from "lucide-react";

type MPCWeeklyFocusProps = {
  focus: WeeklyFocus[];
};

export default function MPCWeeklyFocus({ focus }: MPCWeeklyFocusProps) {
  // Placeholder: the weekly focus may be editable in future iterations
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Target size={20} className="text-slate-900" />
        <h2 className="text-lg font-bold text-slate-900">Foco da Semana</h2>
      </div>

      <p className="text-sm text-slate-600 mb-4">Prioridades estratégicas baseadas em análise MPC</p>

      {focus.length === 0 ? (
        <div className="text-center py-8 text-slate-600">
          <p>Nenhum foco definido. Operação dentro de padrões.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {focus.map((item, idx) => (
            <div
              key={item.id}
              className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold text-sm">
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">{item.priority}</h3>
                  <p className="text-sm text-slate-600 mt-1">{item.rationale}</p>
                  {item.owner && (
                    <div className="text-xs text-slate-500 mt-2">Responsável: {item.owner}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button className="w-full mt-6 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors">
        Editar Prioridades
      </button>
    </div>
  );
}
