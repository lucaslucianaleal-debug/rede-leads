import React, { useState } from "react";
import { SectorHealth } from "@/types/mpc";
import { ChevronRight } from "lucide-react";
import { MPCStore } from "@/hooks/useMPCDataStore";

type MPCSectorHealthProps = {
  sectors: SectorHealth[];
  store: MPCStore;
  mutations: {
    setStore: (s: MPCStore | ((prev: MPCStore) => MPCStore)) => void;
    saveNow: (nextStore?: MPCStore) => Promise<void>;
  };
};

function SectorCard({ sector, onDetails }: { sector: SectorHealth; onDetails: () => void }) {
  const scoreColor =
    sector.score >= 4.5
      ? "text-emerald-600"
      : sector.score >= 4.0
        ? "text-blue-600"
        : sector.score >= 3.5
          ? "text-amber-600"
          : "text-rose-600";

  const scoreGradient =
    sector.score >= 4.5
      ? "from-emerald-50 to-emerald-100"
      : sector.score >= 4.0
        ? "from-blue-50 to-blue-100"
        : sector.score >= 3.5
          ? "from-amber-50 to-amber-100"
          : "from-rose-50 to-rose-100";

  return (
    <div className={`bg-gradient-to-br ${scoreGradient} rounded-lg p-6 border border-slate-200 hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between mb-4">
        <h3 className="font-bold text-slate-900">{sector.name}</h3>
      </div>

      <div className="mb-6">
        <div className={`text-4xl font-bold ${scoreColor}`}>{sector.score.toFixed(1)}</div>
        <div className="text-xs text-slate-600 mt-1">/5.0 de satisfação</div>
      </div>

      {/* Barra de score */}
      <div className="mb-6 w-full bg-white/50 rounded-full h-3 overflow-hidden">
        <div
          className={`h-full transition-all ${
            sector.score >= 4.5
              ? "bg-emerald-500"
              : sector.score >= 4.0
                ? "bg-blue-500"
                : sector.score >= 3.5
                  ? "bg-amber-500"
                  : "bg-rose-500"
          }`}
          style={{ width: `${(sector.score / 5) * 100}%` }}
        />
      </div>

      {/* Top Issues */}
      {sector.topIssues.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Principais Pontos</div>
          <ul className="space-y-1">
            {sector.topIssues.slice(0, 2).map((issue, idx) => (
              <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                <span className="text-amber-500 mt-1">•</span>
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onDetails}
        className="w-full mt-4 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium text-sm hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
      >
        Ver Detalhes
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export default function MPCSectorHealth({ sectors, store, mutations }: MPCSectorHealthProps) {
  const [selectedSector, setSelectedSector] = useState<SectorHealth | null>(null);

  const sectorMap: Record<string, string> = {
    "Recepção": "reception",
    "Clínica": "clinic",
    "Comercial": "sales",
    "Dentistas": "dentist",
  };

  const saveSurveyEdit = async (surveyId: string, patch: { score?: number; comment?: string }) => {
    let nextStoreSnapshot: MPCStore | null = null;
    mutations.setStore((prev) => {
      const surveys = (prev.surveys || []).map((s: any) => {
        if (s.id !== surveyId) return s;
        return {
          ...s,
          ...(patch.score !== undefined ? { score: patch.score } : {}),
          ...(patch.comment !== undefined ? { comment: patch.comment } : {}),
        };
      });
      nextStoreSnapshot = { ...prev, surveys };
      return nextStoreSnapshot;
    });
    if (nextStoreSnapshot) await mutations.saveNow(nextStoreSnapshot);
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">Saúde dos Setores</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {sectors.map((sector) => (
          <SectorCard
            key={sector.name}
            sector={sector}
            onDetails={() => setSelectedSector(sector)}
          />
        ))}
      </div>

      {/* Modal de Detalhes */}
      {selectedSector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-slate-900 mb-4">{selectedSector.name}</h3>

            <div className="space-y-6">
              <div>
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Score Geral</div>
                <div className="text-3xl font-bold text-slate-900">{selectedSector.score.toFixed(1)}/5.0</div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Principais Problemas</div>
                <ul className="space-y-2">
                  {selectedSector.topIssues.map((issue, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="inline-block w-5 h-5 bg-amber-100 text-amber-600 rounded-full text-center text-xs font-bold flex-shrink-0 flex items-center justify-center">
                        {idx + 1}
                      </span>
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Avaliações do Setor</div>
                {store.surveys.filter((s: any) => s.sector === (sectorMap[selectedSector.name] || "")).length === 0 ? (
                  <p className="text-sm text-slate-500">Sem avaliações registradas para este setor.</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-auto">
                    {store.surveys
                      .filter((s: any) => s.sector === (sectorMap[selectedSector.name] || ""))
                      .sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
                      .map((sv: any) => (
                        <div key={sv.id} className="p-2 rounded border border-slate-200 bg-slate-50">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div>
                              <label className="text-[11px] text-slate-600 block mb-1">Data</label>
                              <div className="text-xs text-slate-700">{String(sv.createdAt || "").slice(0, 10) || "-"}</div>
                            </div>
                            <div>
                              <label className="text-[11px] text-slate-600 block mb-1">Nota</label>
                              <select
                                value={Number(sv.score || 0)}
                                onChange={(e) => void saveSurveyEdit(sv.id, { score: Number(e.target.value) })}
                                className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
                              >
                                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="mt-2">
                            <label className="text-[11px] text-slate-600 block mb-1">Comentário</label>
                            <input
                              defaultValue={sv.comment || ""}
                              onBlur={(e) => void saveSurveyEdit(sv.id, { comment: e.target.value })}
                              className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
                              placeholder="Editar comentário"
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                <div>
                  <div className="text-xs text-slate-600">Status</div>
                  <div className="font-semibold text-slate-900 capitalize">{selectedSector.status}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-600">Última Atualização</div>
                  <div className="font-semibold text-slate-900 text-sm">
                    {selectedSector.lastUpdated.toLocaleDateString("pt-BR")}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setSelectedSector(null)}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                Fechar
              </button>
              <button className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors">Auditar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
