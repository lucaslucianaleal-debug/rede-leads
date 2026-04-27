import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoPoint } from "@/hooks/useGeoTracking";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

// Fix Leaflet default icons broken by Vite's asset bundling
(L.Icon.Default as unknown as { mergeOptions: (o: object) => void }).mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface MapaRotaProps {
  /** Local tracking mode (Promotora): GPS points from useGeoTracking */
  points?: GeoPoint[];
  currentPosition?: GeoPoint | null;
  error?: string | null;
  /** Firestore session reference: subscribes to rota + rotaDefinida */
  clinicId?: string;
  sessaoId?: string;
  /** Live drawing preview override — pass draftWaypoints when in draw mode */
  plannedRoute?: GeoPoint[];
  /** When provided, map enters draw mode (crosshair cursor + click handler) */
  onMapClick?: (pt: GeoPoint) => void;
  abordadora?: string;
  height?: string;
}

export function MapaRota({
  points: externalPoints,
  currentPosition: externalCurrent,
  error,
  clinicId,
  sessaoId,
  plannedRoute: externalPlanned,
  onMapClick,
  abordadora,
  height = "100%",
}: MapaRotaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const plannedPolyRef = useRef<L.Polyline | null>(null);
  const plannedMarkersRef = useRef<L.Marker[]>([]);
  const markerRef = useRef<L.Marker | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const onMapClickRef = useRef(onMapClick);

  const [remotePoints, setRemotePoints] = useState<GeoPoint[]>([]);
  const [firestorePlanned, setFirestorePlanned] = useState<GeoPoint[]>([]);

  // Keep click handler ref in sync (avoids stale closure in Leaflet event)
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  // ── Firestore subscription ───────────────────────────────────────────────────
  useEffect(() => {
    if (!clinicId || !sessaoId) return;
    const unsub = onSnapshot(
      doc(db, "clinics", clinicId, "sessoes", sessaoId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          // Remote mode (CRM): read actual GPS points from Firestore
          if (externalPoints === undefined) {
            setRemotePoints((data?.rota as GeoPoint[]) ?? []);
          }
          // Always read planned route (unless overridden by prop)
          if (externalPlanned === undefined) {
            setFirestorePlanned((data?.rotaDefinida as GeoPoint[]) ?? []);
          }
        }
      }
    );
    return () => unsub();
  }, [clinicId, sessaoId, externalPoints, externalPlanned]);

  const points = externalPoints ?? remotePoints;
  const current =
    externalCurrent !== undefined
      ? externalCurrent
      : points.length > 0
      ? points[points.length - 1]
      : null;
  const planned = externalPlanned ?? firestorePlanned;

  // ── Initialize map once on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: true }).setView(
      [-21.0, -49.3],
      14
    );

    // OpenStreetMap — free, no API key, reliable
    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }
    ).addTo(map);

    // Map click → draw mode callback
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (onMapClickRef.current) {
        onMapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng, ts: Date.now() });
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      polylineRef.current = null;
      plannedPolyRef.current = null;
      plannedMarkersRef.current = [];
      markerRef.current = null;
      startMarkerRef.current = null;
    };
  }, []);

  // ── Update actual GPS polyline & markers ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }
    if (startMarkerRef.current) { startMarkerRef.current.remove(); startMarkerRef.current = null; }
    if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }

    if (points.length > 1) {
      const latlngs = points.map((p) => [p.lat, p.lng] as [number, number]);
      polylineRef.current = L.polyline(latlngs, {
        color: "#ec4899",
        weight: 5,
        opacity: 0.9,
      }).addTo(map);
      if (planned.length === 0) {
        map.fitBounds(polylineRef.current.getBounds(), { padding: [35, 35] });
      }
    }

    if (points.length > 0) {
      const first = points[0];
      startMarkerRef.current = L.marker([first.lat, first.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="width:12px;height:12px;background:#16a34a;border:2.5px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        }),
        title: "Início",
      }).addTo(map);
    }

    if (current) {
      markerRef.current = L.marker([current.lat, current.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="width:16px;height:16px;background:#ec4899;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
        title: abordadora ?? "Posição atual",
      }).addTo(map);
      if (points.length <= 1) map.setView([current.lat, current.lng], 16);
    }
  }, [points, current, abordadora, planned.length]);

  // ── Update planned route (blue dashed line + numbered markers) ───────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (plannedPolyRef.current) { plannedPolyRef.current.remove(); plannedPolyRef.current = null; }
    plannedMarkersRef.current.forEach((m) => m.remove());
    plannedMarkersRef.current = [];

    if (planned.length === 0) return;

    const latlngs = planned.map((p) => [p.lat, p.lng] as [number, number]);
    plannedPolyRef.current = L.polyline(latlngs, {
      color: "#3b82f6",
      weight: 4,
      opacity: 0.85,
      dashArray: "10 6",
    }).addTo(map);

    planned.forEach((p, i) => {
      const isLast = i === planned.length - 1;
      const m = L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: "",
          html: isLast
            ? `<div style="width:22px;height:22px;background:#1d4ed8;border:2.5px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:11px;">🏁</div>`
            : `<div style="width:20px;height:20px;background:#3b82f6;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:700;">${i + 1}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        title: isLast ? "Destino final" : `Ponto ${i + 1}`,
        zIndexOffset: 100,
      }).addTo(map);
      plannedMarkersRef.current.push(m);
    });

    // Fit to planned route when there's no GPS yet
    if (points.length === 0 && plannedPolyRef.current) {
      map.fitBounds(plannedPolyRef.current.getBounds(), { padding: [35, 35] });
    }
  }, [planned, points.length]);

  const hasContent = points.length > 0 || planned.length > 0;

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      style={{ height, cursor: onMapClick ? "crosshair" : undefined }}
    >
      <div ref={containerRef} className="w-full h-full" />

      {/* GPS error banner */}
      {error && (
        <div className="absolute top-2 left-2 right-2 bg-red-100 border border-red-300 text-red-700 text-xs rounded-lg px-3 py-2 z-[1000] shadow">
          {error}
        </div>
      )}

      {/* Draw mode instruction */}
      {onMapClick && (
        <div className="absolute top-2 left-2 right-2 bg-blue-600/90 backdrop-blur text-white text-xs font-medium rounded-lg px-3 py-2 z-[1000] shadow text-center">
          ✏️ Clique no mapa para adicionar pontos à rota
        </div>
      )}

      {/* Waiting overlay */}
      {!hasContent && !error && !onMapClick && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[999]">
          <div className="bg-white/90 backdrop-blur text-gray-600 text-sm rounded-xl px-4 py-3 shadow text-center space-y-1">
            <div className="text-2xl">📍</div>
            <div>
              {abordadora
                ? `Aguardando localização de ${abordadora}…`
                : "Aguardando sinal de GPS…"}
            </div>
            <div className="text-xs text-gray-400">
              Mantenha a aba aberta com a tela ligada
            </div>
          </div>
        </div>
      )}

      {/* Stats badge */}
      {hasContent && (
        <div className="absolute bottom-8 right-2 z-[1000] bg-black/60 backdrop-blur text-xs text-white rounded-lg px-2 py-1 shadow space-y-0.5">
          {planned.length > 0 && <div>📋 {planned.length} pts planejados</div>}
          {points.length > 0 && <div>🛣️ {points.length} pts percorridos</div>}
        </div>
      )}

      {/* Legend */}
      {hasContent && (
        <div className="absolute bottom-8 left-2 z-[1000] bg-black/60 backdrop-blur text-[10px] text-white rounded-lg px-2 py-1 shadow space-y-0.5">
          {planned.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div style={{ width: 18, height: 3, background: "#3b82f6", borderRadius: 2, flexShrink: 0 }} />
              Rota planejada
            </div>
          )}
          {points.length > 0 && (
            <>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 border border-white shrink-0" />
                Início
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-pink-500 border border-white shrink-0" />
                Posição atual
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
