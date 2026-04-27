import { useEffect, useRef, useState } from "react";
import { useRotasAtivasCRM, type RotaAtivaDoc } from "@/hooks/useRotasAtivasCRM";
import { MapPin, Navigation, Clock, Users } from "lucide-react";

const GMAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string ?? "").replace(/\s/g, "");

interface RotasAtivasTabProps {
  clinicId: string;
}

const COLORS = [
  "#ec4899", "#3b82f6", "#10b981", "#f59e0b",
  "#8b5cf6", "#ef4444", "#06b6d4", "#84cc16",
];

declare global {
  interface Window { google: typeof google; }
}

function gmapsReady(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.google !== "undefined" && window.google.maps) {
      resolve();
      return;
    }
    const check = setInterval(() => {
      if (typeof window.google !== "undefined" && window.google.maps) {
        clearInterval(check);
        resolve();
      }
    }, 200);
  });
}

export function RotasAtivasTab({ clinicId }: RotasAtivasTabProps) {
  const { rotas, loading } = useRotasAtivasCRM(clinicId);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const polylinesRef = useRef<Map<string, google.maps.Polyline>>(new Map());
  const [selected, setSelected] = useState<RotaAtivaDoc | null>(null);
  const [gmapsLoaded, setGmapsLoaded] = useState(false);

  // Initialize Google Maps
  useEffect(() => {
    gmapsReady().then(() => setGmapsLoaded(true));
  }, []);

  useEffect(() => {
    if (!gmapsLoaded || !mapRef.current || mapInstanceRef.current) return;
    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      zoom: 14,
      center: { lat: -21.0, lng: -49.3 },
      mapTypeId: "roadmap",
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });
  }, [gmapsLoaded]);

  // Update markers and polylines whenever rotas change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !gmapsLoaded) return;

    const seenIds = new Set<string>();

    rotas.forEach((rota, idx) => {
      const color = COLORS[idx % COLORS.length];
      seenIds.add(rota.id);

      // Current position marker
      const gps = rota.gpsAtual;
      if (gps) {
        const pos = { lat: gps.lat, lng: gps.lng };
        if (markersRef.current.has(rota.id)) {
          markersRef.current.get(rota.id)!.setPosition(pos);
        } else {
          const marker = new window.google.maps.Marker({
            position: pos,
            map,
            title: rota.abordadora,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: color,
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 2.5,
            },
            label: {
              text: rota.abordadora.charAt(0).toUpperCase(),
              color: "#fff",
              fontSize: "11px",
              fontWeight: "bold",
            },
          });
          marker.addListener("click", () => setSelected(rota));
          markersRef.current.set(rota.id, marker);
        }
      }

      // Route polyline (GPS trail)
      const pontos = rota.pontos ?? [];
      if (pontos.length > 1) {
        const path = pontos.map((p) => ({ lat: p.lat, lng: p.lng }));
        if (polylinesRef.current.has(rota.id)) {
          polylinesRef.current.get(rota.id)!.setPath(path);
        } else {
          const poly = new window.google.maps.Polyline({
            path,
            geodesic: true,
            strokeColor: color,
            strokeOpacity: 0.75,
            strokeWeight: 4,
            map,
          });
          polylinesRef.current.set(rota.id, poly);
        }
      }
    });

    // Remove markers/lines for rotas that no longer exist
    markersRef.current.forEach((marker, id) => {
      if (!seenIds.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    });
    polylinesRef.current.forEach((poly, id) => {
      if (!seenIds.has(id)) {
        poly.setMap(null);
        polylinesRef.current.delete(id);
      }
    });

    // Auto-center to show all active markers
    if (rotas.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      rotas.forEach((r) => {
        if (r.gpsAtual) bounds.extend({ lat: r.gpsAtual.lat, lng: r.gpsAtual.lng });
        (r.pontos ?? []).forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      });
      if (!bounds.isEmpty()) map.fitBounds(bounds, 60);
    }
  }, [rotas, gmapsLoaded]);

  const emRota = rotas.filter((r) => r.status === "em_rota");
  const chegou = rotas.filter((r) => r.status === "chegou");

  function focusRota(rota: RotaAtivaDoc) {
    setSelected(rota);
    const map = mapInstanceRef.current;
    if (!map || !rota.gpsAtual) return;
    map.setCenter({ lat: rota.gpsAtual.lat, lng: rota.gpsAtual.lng });
    map.setZoom(17);
  }

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* Header stats */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-medium text-green-800">
            {emRota.length} em rota agora
          </span>
        </div>
        {chegou.length > 0 && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
            <MapPin className="h-3 w-3 text-blue-600" />
            <span className="text-xs font-medium text-blue-800">
              {chegou.length} já chegou
            </span>
          </div>
        )}
        {!loading && rotas.length === 0 && (
          <span className="text-sm text-muted-foreground">
            Nenhuma promotora em rota hoje
          </span>
        )}
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        {/* Map */}
        <div className="flex-1 rounded-xl overflow-hidden border border-border min-h-[400px] relative">
          <div ref={mapRef} className="w-full h-full" />
          {!gmapsLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
              <span className="text-sm text-muted-foreground animate-pulse">Carregando mapa…</span>
            </div>
          )}
          {gmapsLoaded && rotas.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <Navigation className="h-10 w-10 text-muted-foreground/30 mb-2" />
              <span className="text-sm text-muted-foreground">Aguardando promotoras…</span>
            </div>
          )}
        </div>

        {/* Sidebar: list of active routes */}
        <div className="w-56 flex flex-col gap-2 overflow-y-auto shrink-0">
          {loading ? (
            <div className="text-xs text-muted-foreground animate-pulse px-1 pt-2">Carregando…</div>
          ) : rotas.length === 0 ? (
            <div className="text-xs text-muted-foreground px-1 pt-2 text-center space-y-1">
              <Users className="h-8 w-8 mx-auto opacity-20" />
              <div>Nenhuma rota ativa hoje</div>
            </div>
          ) : (
            rotas.map((rota, idx) => {
              const color = COLORS[idx % COLORS.length];
              const isSelected = selected?.id === rota.id;
              return (
                <button
                  key={rota.id}
                  onClick={() => focusRota(rota)}
                  className={`text-left rounded-xl border p-3 transition-all space-y-1.5 ${
                    isSelected
                      ? "border-gray-400 bg-gray-50 shadow-sm"
                      : "border-border hover:border-gray-300 hover:bg-muted/40"
                  }`}
                >
                  {/* Name + status dot */}
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    <span className="font-semibold text-sm truncate">{rota.abordadora}</span>
                    {rota.status === "em_rota" && (
                      <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse shrink-0 ml-auto" />
                    )}
                    {rota.status === "chegou" && (
                      <MapPin className="h-3 w-3 text-blue-500 shrink-0 ml-auto" />
                    )}
                  </div>

                  {/* Points count */}
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Navigation className="h-3 w-3" />
                    {(rota.pontos ?? []).length} pontos registrados
                  </div>

                  {/* Status badge */}
                  <div className={`text-[11px] rounded-full px-2 py-0.5 inline-flex items-center gap-1 font-medium ${
                    rota.status === "em_rota"
                      ? "bg-green-100 text-green-700"
                      : "bg-blue-100 text-blue-700"
                  }`}>
                    {rota.status === "em_rota" ? "Em rota" : "Chegou"}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
