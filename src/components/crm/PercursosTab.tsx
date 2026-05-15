import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { MapaRota } from "@/components/MapaRota";
import type { GeoPoint } from "@/hooks/useGeoTracking";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, MapPin, Clock, User } from "lucide-react";

interface Percurso {
  id: string;
  abordadora: string;
  sessaoId: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  pontos: GeoPoint[];
  distanciaM: number;
  criadoEm: number;
}

interface Props {
  clinicId: string;
}

function formatDist(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

function formatDuracao(inicio: string, fim: string) {
  try {
    const [ih, im] = inicio.split(":").map(Number);
    const [fh, fm] = fim.split(":").map(Number);
    const totalMin = fh * 60 + fm - (ih * 60 + im);
    if (totalMin <= 0) return "—";
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  } catch {
    return "—";
  }
}

export function PercursosTab({ clinicId }: Props) {
  const [percursos, setPercursos] = useState<Percurso[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Percurso | null>(null);
  const [filterAbordadora, setFilterAbordadora] = useState("");

  useEffect(() => {
    if (!clinicId) return;
    const q = query(
      collection(db, "clinics", clinicId, "percursos"),
      orderBy("criadoEm", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setPercursos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Percurso)));
      setLoading(false);
    });
    return () => unsub();
  }, [clinicId]);

  const abordadoras = [...new Set(percursos.map((p) => p.abordadora))].sort();
  const filtered = filterAbordadora
    ? percursos.filter((p) => p.abordadora === filterAbordadora)
    : percursos;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-pink-600" />
          <h3 className="font-semibold text-base">Percursos Gravados</h3>
          <span className="text-xs text-muted-foreground">({filtered.length})</span>
        </div>
        {abordadoras.length > 1 && (
          <select
            value={filterAbordadora}
            onChange={(e) => setFilterAbordadora(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-pink-400"
          >
            <option value="">Todas as promotoras</option>
            {abordadoras.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm animate-pulse">
          Carregando…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Activity className="h-8 w-8 opacity-30" />
          <span className="text-sm">Nenhum percurso gravado ainda</span>
          <span className="text-xs opacity-60">
            Os percursos aparecem aqui após a promotora gravar pelo app
          </span>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Data</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Promotora</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Horário</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Distância</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Duração</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{p.data}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-pink-400 shrink-0" />
                      {p.abordadora}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {p.horaInicio} → {p.horaFim}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                    {formatDist(p.distanciaM)}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                    {formatDuracao(p.horaInicio, p.horaFim)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(p)}
                      className="flex items-center gap-1 text-xs text-pink-700 hover:text-pink-900 font-medium border border-pink-200 rounded-full px-2.5 py-1 hover:bg-pink-50 transition-colors"
                    >
                      <MapPin className="h-3 w-3" /> Ver mapa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Map modal */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-pink-600" />
              Percurso — {selected?.abordadora} · {selected?.data}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-pink-50 rounded-lg px-3 py-2 text-center">
                  <div className="font-bold text-pink-800">{formatDist(selected.distanciaM)}</div>
                  <div className="text-xs text-pink-500">distância</div>
                </div>
                <div className="bg-pink-50 rounded-lg px-3 py-2 text-center">
                  <div className="font-bold text-pink-800">{selected.pontos.length}</div>
                  <div className="text-xs text-pink-500">pontos GPS</div>
                </div>
                <div className="bg-pink-50 rounded-lg px-3 py-2 text-center">
                  <div className="font-bold text-pink-800">{formatDuracao(selected.horaInicio, selected.horaFim)}</div>
                  <div className="text-xs text-pink-500">duração</div>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden border" style={{ height: 380 }}>
                <MapaRota points={selected.pontos} height="380px" />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
