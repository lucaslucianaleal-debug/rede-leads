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
  /** Local tracking mode: pass points + currentPosition from useGeoTracking */
  points?: GeoPoint[];
  currentPosition?: GeoPoint | null;
  error?: string | null;
  /** Remote mode: subscribe to Firestore in real time (CRM view) */
  clinicId?: string;
  sessaoId?: string;
  abordadora?: string;
  height?: string;
}

export function MapaRota({
  points: externalPoints,
  currentPosition: externalCurrent,
  error,
  clinicId,
  sessaoId,
  abordadora,
  height = "100%",
}: MapaRotaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const [remotePoints, setRemotePoints] = useState<GeoPoint[]>([]);

  // ── Firestore subscription (CRM view) ───────────────────────────────────────
  useEffect(() => {
    if (externalPoints !== undefined || !clinicId || !sessaoId) return;
    const unsub = onSnapshot(
      doc(db, "clinics", clinicId, "sessoes", sessaoId),
      (snap) => {
        if (snap.exists()) {
          setRemotePoints((snap.data()?.rota as GeoPoint[]) ?? []);
        }
      }
    );
    return () => unsub();
  }, [externalPoints, clinicId, sessaoId]);

  const points = externalPoints ?? remotePoints;
  const current =
    externalCurrent !== undefined
      ? externalCurrent
      : points.length > 0
      ? points[points.length - 1]
      : null;

  // ── Initialize map once on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Default center: interior of SP state (approximate center of the 3 clinics)
    const map = L.map(containerRef.current, { zoomControl: true }).setView(
      [-21.0, -49.3],
      13
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      polylineRef.current = null;
      markerRef.current = null;
      startMarkerRef.current = null;
    };
  }, []);

  // ── Update polyline & markers when points change ─────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove existing polyline
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    // Draw route polyline
    if (points.length > 1) {
      const latlngs = points.map((p) => [p.lat, p.lng] as [number, number]);
      polylineRef.current = L.polyline(latlngs, {
        color: "#be185d",
        weight: 5,
        opacity: 0.85,
      }).addTo(map);
      map.fitBounds(polylineRef.current.getBounds(), { padding: [35, 35] });
    }

    // Start marker (first point)
    if (startMarkerRef.current) {
      startMarkerRef.current.remove();
      startMarkerRef.current = null;
    }
    if (points.length > 0) {
      const first = points[0];
      const startIcon = L.divIcon({
        className: "",
        html: `<div style="width:12px;height:12px;background:#16a34a;border:2.5px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      startMarkerRef.current = L.marker([first.lat, first.lng], {
        icon: startIcon,
        title: "Início",
      }).addTo(map);
    }

    // Current position marker
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (current) {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;background:#be185d;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      markerRef.current = L.marker([current.lat, current.lng], {
        icon,
        title: abordadora ?? "Posição atual",
      }).addTo(map);

      if (points.length <= 1) {
        map.setView([current.lat, current.lng], 16);
      }
    }
  }, [points, current, abordadora]);

  return (
    <div className="relative rounded-xl overflow-hidden" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* GPS error banner */}
      {error && (
        <div className="absolute top-2 left-2 right-2 bg-red-100 border border-red-300 text-red-700 text-xs rounded-lg px-3 py-2 z-[1000] shadow">
          {error}
        </div>
      )}

      {/* Waiting overlay */}
      {points.length === 0 && !error && (
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

      {/* Point count badge */}
      {points.length > 0 && (
        <div className="absolute bottom-2 right-2 z-[1000] bg-white/90 backdrop-blur text-xs text-gray-600 rounded-lg px-2 py-1 shadow">
          🛣️ {points.length} pontos
        </div>
      )}

      {/* Legend */}
      {points.length > 0 && (
        <div className="absolute bottom-2 left-2 z-[1000] bg-white/90 backdrop-blur text-[10px] text-gray-600 rounded-lg px-2 py-1 shadow space-y-0.5">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-green-600 border border-white" />
            Início
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-pink-700 border border-white" />
            Atual
          </div>
        </div>
      )}
    </div>
  );
}
