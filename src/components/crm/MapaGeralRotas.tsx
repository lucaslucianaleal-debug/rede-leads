import { useEffect, useRef, useState, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-rotate";
import * as LGeocode from "leaflet-control-geocoder";
import { geocoders } from "leaflet-control-geocoder";
import "leaflet-control-geocoder/dist/Control.Geocoder.css";
import { Route, User, CalendarDays, Eye, EyeOff, Navigation } from "lucide-react";

const COLORS = [
  "#ec4899", // pink
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ef4444", // red
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#f97316", // orange
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#e879f9", // fuchsia
];

interface RotaDoc {
  id: string;
  nome: string;
  abordadora: string;
  data: string;
  waypoints: { lat: number; lng: number }[];
  criadoEm: number;
}

interface MapaGeralRotasProps {
  clinicId: string;
}

export function MapaGeralRotas({ clinicId }: MapaGeralRotasProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const layersRef = useRef<Record<string, { poly: L.Polyline; markers: L.Marker[] }>>({});

  const [rotas, setRotas] = useState<RotaDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [filterAbordadora, setFilterAbordadora] = useState("");

  // Firestore: all rotas
  useEffect(() => {
    if (!clinicId) return;
    const q = query(collection(db, "clinics", clinicId, "rotas"), orderBy("criadoEm", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setRotas(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RotaDoc)));
      setLoading(false);
    });
    return () => unsub();
  }, [clinicId]);

  // Init Leaflet map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      rotate: true,
      touchRotate: true,
      rotateControl: { closeOnZeroBearing: false },
      bearing: 0,
    }).setView([-21.0, -49.3], 13);

    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19,
    }).addTo(map);
    // Esri Reference labels (streets, names) — transparent overlay
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, opacity: 1 }
    ).addTo(map);

    const geocoder = LGeocode.geocoder({
      defaultMarkGeocode: false,
      collapsed: true,
      placeholder: "Buscar endereço…",
      geocoder: new geocoders.Nominatim({ serviceUrl: "https://nominatim.openstreetmap.org/" }),
    });
    geocoder.on("markgeocode", (e: any) => map.setView(e.geocode.center, 17));
    geocoder.addTo(map);

    mapRef.current = map;

    const invalidate = () => map.invalidateSize(false);
    requestAnimationFrame(invalidate);
    const t = window.setTimeout(invalidate, 250);

    if (typeof ResizeObserver !== "undefined") {
      resizeObserverRef.current = new ResizeObserver(invalidate);
      resizeObserverRef.current.observe(containerRef.current);
    }

    return () => {
      window.clearTimeout(t);
      resizeObserverRef.current?.disconnect();
      map.remove();
      mapRef.current = null;
      layersRef.current = {};
    };
  }, []);

  // Draw / update layers whenever rotas or hidden set changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(rotas.map((r) => r.id));

    // Remove layers for deleted rotas
    for (const id of Object.keys(layersRef.current)) {
      if (!currentIds.has(id)) {
        layersRef.current[id].poly.remove();
        layersRef.current[id].markers.forEach((m) => m.remove());
        delete layersRef.current[id];
      }
    }

    rotas.forEach((rota, idx) => {
      const color = COLORS[idx % COLORS.length];
      const isHidden = hidden.has(rota.id);
      const isSelected = selected === rota.id;
      const pts = rota.waypoints.map((w) => [w.lat, w.lng] as [number, number]);

      // Remove old layer if exists
      if (layersRef.current[rota.id]) {
        layersRef.current[rota.id].poly.remove();
        layersRef.current[rota.id].markers.forEach((m) => m.remove());
      }

      if (isHidden || pts.length < 2) {
        layersRef.current[rota.id] = { poly: L.polyline([]), markers: [] };
        return;
      }

      const poly = L.polyline(pts, {
        color,
        weight: isSelected ? 7 : 4,
        opacity: isSelected ? 1 : 0.75,
        dashArray: undefined,
      }).addTo(map);

      const markers: L.Marker[] = rota.waypoints.map((w, i) => {
        const isLast = i === rota.waypoints.length - 1;
        return L.marker([w.lat, w.lng], {
          icon: L.divIcon({
            className: "",
            html: isLast
              ? `<div style="width:20px;height:20px;background:${color};border:2.5px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:10px;">🏁</div>`
              : `<div style="width:18px;height:18px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:700;">${i + 1}</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          }),
          title: isLast ? `${rota.nome} — fim` : `${rota.nome} — ponto ${i + 1}`,
          zIndexOffset: isSelected ? 500 : 100,
        }).addTo(map);
      });

      layersRef.current[rota.id] = { poly, markers };
    });

    // Fit map to all visible routes on first load
    const allPts = rotas
      .filter((r) => !hidden.has(r.id) && r.waypoints.length > 1)
      .flatMap((r) => r.waypoints.map((w) => [w.lat, w.lng] as [number, number]));
    if (allPts.length > 1) {
      map.fitBounds(L.latLngBounds(allPts), { padding: [30, 30] });
    }
  }, [rotas, hidden, selected]);

  const abordadoras = useMemo(
    () => [...new Set(rotas.map((r) => r.abordadora))].sort(),
    [rotas]
  );

  const filtered = useMemo(
    () =>
      filterAbordadora
        ? rotas.filter((r) => r.abordadora === filterAbordadora)
        : rotas,
    [rotas, filterAbordadora]
  );

  const toggleHide = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const focusRota = (rota: RotaDoc) => {
    setSelected(rota.id);
    const map = mapRef.current;
    if (!map || rota.waypoints.length < 2) return;
    const pts = rota.waypoints.map((w) => [w.lat, w.lng] as [number, number]);
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Map */}
      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden border border-gray-200"
        style={{ height: 420 }}
      />

      {/* Filter + legend */}
      <div className="flex items-center gap-2 flex-wrap">
        <Route className="h-4 w-4 text-pink-500 shrink-0" />
        <span className="text-sm font-medium text-gray-700">
          {rotas.length} rota{rotas.length !== 1 ? "s" : ""} no total
        </span>
        {abordadoras.length > 1 && (
          <select
            value={filterAbordadora}
            onChange={(e) => setFilterAbordadora(e.target.value)}
            className="ml-auto text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-pink-400"
          >
            <option value="">Todas as promotoras</option>
            {abordadoras.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        )}
      </div>

      {/* Route list */}
      {loading ? (
        <div className="text-center py-6 text-sm text-gray-400 animate-pulse">Carregando rotas…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">Nenhuma rota encontrada.</div>
      ) : (
        <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 280 }}>
          {filtered.map((rota, idx) => {
            const color = COLORS[rotas.indexOf(rota) % COLORS.length];
            const isHidden = hidden.has(rota.id);
            const isSelected = selected === rota.id;
            const wps = rota.waypoints.length > 25
              ? [rota.waypoints[0], ...rota.waypoints.slice(1, 24), rota.waypoints[rota.waypoints.length - 1]]
              : rota.waypoints;
            const mapsUrl = rota.waypoints.length >= 2
              ? `https://www.google.com/maps/dir/${wps.map((w) => `${w.lat},${w.lng}`).join("/")}?travelmode=walking`
              : "";

            return (
              <div
                key={rota.id}
                onClick={() => focusRota(rota)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? "border-gray-400 bg-gray-50 shadow-sm"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                } ${isHidden ? "opacity-40" : ""}`}
              >
                {/* Color dot */}
                <div
                  className="w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-white shadow"
                  style={{ background: color }}
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 text-sm truncate">{rota.nome}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3 shrink-0" />{rota.abordadora}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3 shrink-0" />{rota.data}
                    </span>
                    <span className="text-gray-400">{rota.waypoints.length} pt{rota.waypoints.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {mapsUrl && (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir no Google Maps"
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => toggleHide(rota.id)}
                    title={isHidden ? "Mostrar no mapa" : "Ocultar no mapa"}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
