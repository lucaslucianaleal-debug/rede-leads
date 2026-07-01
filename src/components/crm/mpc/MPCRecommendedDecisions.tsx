import React, { useState } from "react";
import { RecommendedDecision } from "@/types/mpc";
import { Lightbulb, ChevronDown } from "lucide-react";

type MPCRecommendedDecisionsProps = {
  decisions: RecommendedDecision[];
};

function ImpactBadge({ impact }: { impact: "high" | "medium" | "low" }) {
  const config = {
    high: "bg-rose-100 text-rose-800",
    medium: "bg-amber-100 text-amber-800",
    low: "bg-blue-100 text-blue-800",
  };

  const labels = {
    high: "Alto Impacto",
    medium: "Impacto Médio",
    low: "Baixo Impacto",
  };

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${config[impact]}`}>
      {labels[impact]}
    </span>
  );
}

function DecisionCard({ decision, isExpanded, onToggle }: { decision: RecommendedDecision; isExpanded: boolean; onToggle: () => void }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-start justify-between hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-start gap-3 flex-1 text-left">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Lightbulb size={20} className="text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900">{decision.title}</h3>
            <div className="flex items-center gap-2 mt-2">
              <ImpactBadge impact={decision.impact} />
              <span className="text-sm text-slate-600">{decision.estimatedOutcome}</span>
            </div>
          </div>
        </div>
        <ChevronDown
          size={20}
          className={`text-slate-400 transition-transform flex-shrink-0 ml-4 ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {isExpanded && (
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 space-y-4">
          <div>
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Descrição</div>
            <p className="text-sm text-slate-700">{decision.description}</p>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Plano de Ação</div>
            <ol className="space-y-2">
              {decision.actionItems.map((item, idx) => (
                <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                  <span className="font-semibold text-slate-500 flex-shrink-0">{idx + 1}.</span>
                  {item}
                </li>
              ))}
            </ol>
          </div>

          <div className="flex gap-3 pt-4">
            <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors">
              Executar Decisão
            </button>
            <button className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium text-sm hover:bg-slate-100 transition-colors">
              Adiar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MPCRecommendedDecisions({ decisions }: MPCRecommendedDecisionsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const highImpactCount = decisions.filter((d) => d.impact === "high").length;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb size={20} className="text-blue-600" />
          <h2 className="text-lg font-bold text-slate-900">Decisões Recomendadas</h2>
        </div>
        {highImpactCount > 0 && (
          <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-3 py-1 rounded-full">
            {highImpactCount} alta prioridade
          </span>
        )}
      </div>

      <p className="text-sm text-slate-600 mb-4">Ações geradas automaticamente pela análise MPC</p>

      {decisions.length === 0 ? (
        <div className="text-center py-8 text-slate-600">
          <p>Nenhuma decisão crítica recomendada no momento.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {decisions.sort((a, b) => {
            const impactOrder = { high: 0, medium: 1, low: 2 };
            return impactOrder[a.impact] - impactOrder[b.impact];
          }).map((decision) => (
            <DecisionCard
              key={decision.id}
              decision={decision}
              isExpanded={expandedId === decision.id}
              onToggle={() => setExpandedId(expandedId === decision.id ? null : decision.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
