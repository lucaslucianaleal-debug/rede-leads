import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { format } from "date-fns";
import { MapaRota } from "@/components/MapaRota";
import type { GeoPoint } from "@/hooks/useGeoTracking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  MapPin,
  Pencil,
  Trash2,
  Route,
  CalendarDays,
  User,
  Navigation,
  Undo2,
} from "lucide-react";

interface RotaDoc {
  id: string;
  nome: string;
  abordadora: string;
  data: string; // "dd/MM/yyyy"
  waypoints: { lat: number; lng: number }[];
  criadoEm: number;
}

interface RotasTabProps {
  clinicId: string;
}

function buildMapsUrl(waypoints: { lat: number; lng: number }[]): string {
  if (waypoints.length < 2) return "";
  const pts = waypoints.map((w) => `${w.lat},${w.lng}`).join("/");
  return `https://www.google.com/maps/dir/${pts}?travelmode=walking`;
}

export function RotasTab({ clinicId }: RotasTabProps) {
  const [rotas, setRotas] = useState<RotaDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [abordadora, setAbordadora] = useState("");
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [waypoints, setWaypoints] = useState<GeoPoint[]>([]);
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch all routes realtime
  useEffect(() => {
    if (!clinicId) return;
    setLoading(true);
    const q = query(
      collection(db, "clinics", clinicId, "rotas"),
      orderBy("criadoEm", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setRotas(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RotaDoc)));
      setLoading(false);
    });
    return () => unsub();
  }, [clinicId]);

  const openCreate = () => {
    setEditingId(null);
    setNome("");
    setAbordadora("");
    setData(format(new Date(), "yyyy-MM-dd"));
    setWaypoints([]);
    setModalOpen(true);
  };

  const openEdit = (r: RotaDoc) => {
    setEditingId(r.id);
    setNome(r.nome);
    setAbordadora(r.abordadora);
    const [d, m, y] = r.data.split("/");
    setData(`${y}-${m}-${d}`);
    setWaypoints(r.waypoints.map((w) => ({ ...w, ts: 0 })));
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Informe o nome da rota"); return; }
    if (!abordadora.trim()) { toast.error("Informe a promotora"); return; }
    if (waypoints.length < 2) { toast.error("Adicione pelo menos 2 pontos no mapa"); return; }
    setSaving(true);
    const [y, m, d] = data.split("-");
    const dataFormatted = `${d}/${m}/${y}`;
    const pts = waypoints.map(({ lat, lng }) => ({ lat, lng }));
    try {
      if (editingId) {
        await updateDoc(doc(db, "clinics", clinicId, "rotas", editingId), {
          nome: nome.trim(),
          abordadora: abordadora.trim(),
          data: dataFormatted,
          waypoints: pts,
        });
        toast.success("Rota atualizada!");
      } else {
        await addDoc(collection(db, "clinics", clinicId, "rotas"), {
          nome: nome.trim(),
          abordadora: abordadora.trim(),
          data: dataFormatted,
          waypoints: pts,
          criadoEm: Date.now(),
        });
        toast.success("Rota criada!");
      }
      setModalOpen(false);
    } catch {
      toast.error("Erro ao salvar rota.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "clinics", clinicId, "rotas", deleteId));
      toast.success("Rota excluída.");
      setDeleteId(null);
    } catch {
      toast.error("Erro ao excluir rota.");
    } finally {
      setDeleting(false);
    }
  };

  const handleMapClick = useCallback((pt: GeoPoint) => {
    setWaypoints((prev) => [...prev, pt]);
  }, []);

  const today = format(new Date(), "dd/MM/yyyy");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Route className="h-4 w-4 text-pink-500" />
            Rotas das Promotoras
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Crie rotas e atribua a uma promotora — ela abre no Maps do celular
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="bg-pink-700 hover:bg-pink-800 gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Nova Rota
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-8 text-sm text-gray-400 animate-pulse">
          Carregando rotas…
        </div>
      ) : rotas.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm space-y-2">
          <MapPin className="h-8 w-8 mx-auto text-gray-300" />
          <p className="font-medium">Nenhuma rota criada ainda.</p>
          <p className="text-xs">Clique em "Nova Rota" para começar.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rotas.map((r) => {
            const mapsUrl = buildMapsUrl(r.waypoints);
            const isToday = r.data === today;
            return (
              <div
                key={r.id}
                className={`bg-white rounded-xl border px-4 py-3 space-y-2.5 ${
                  isToday
                    ? "border-pink-300 ring-1 ring-pink-200"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-800 text-sm flex items-center gap-1.5 flex-wrap">
                      {isToday && (
                        <span className="text-xs bg-pink-500 text-white rounded-full px-2 py-0.5 font-medium">
                          Hoje
                        </span>
                      )}
                      {r.nome}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <User className="h-3 w-3 shrink-0" />
                        {r.abordadora}
                      </span>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <CalendarDays className="h-3 w-3 shrink-0" />
                        {r.data}
                      </span>
                      <span className="text-xs text-gray-400">
                        {r.waypoints.length} ponto{r.waypoints.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(r)}
                      title="Editar"
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteId(r.id)}
                      title="Excluir"
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-medium rounded-lg py-2 transition-colors"
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    Ver no Google Maps
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) setModalOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Route className="h-4 w-4 text-pink-600" />
              {editingId ? "Editar Rota" : "Nova Rota"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome da rota</Label>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Centro - Segunda"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Promotora</Label>
              <Input
                value={abordadora}
                onChange={(e) => setAbordadora(e.target.value)}
                placeholder="Nome completo da promotora"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  Pontos da rota{" "}
                  <span className="text-gray-400 font-normal text-xs">
                    ({waypoints.length} pontos — clique no mapa para adicionar)
                  </span>
                </Label>
                {waypoints.length > 0 && (
                  <button
                    onClick={() => setWaypoints((p) => p.slice(0, -1))}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Undo2 className="h-3 w-3" /> Desfazer último
                  </button>
                )}
              </div>

              <div
                className="rounded-xl overflow-hidden border border-gray-200 cursor-crosshair"
                style={{ height: 340 }}
              >
                <MapaRota
                  plannedRoute={waypoints}
                  onMapClick={handleMapClick}
                  height="100%"
                />
              </div>

              {waypoints.length < 2 && (
                <p className="text-xs text-gray-400 text-center">
                  Clique em pelo menos 2 pontos para definir o trajeto
                </p>
              )}

              {waypoints.length >= 2 && (
                <a
                  href={buildMapsUrl(waypoints)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-medium rounded-lg py-2 transition-colors"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Pré-visualizar no Google Maps
                </a>
              )}
            </div>
          </div>

          <DialogFooter className="px-5 pb-5 pt-3 border-t gap-2 shrink-0">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-pink-700 hover:bg-pink-800"
            >
              {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Criar rota"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir rota?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">Esta ação não pode ser desfeita.</p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
