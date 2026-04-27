import { useEffect, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, setDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { format } from "date-fns";
import { Navigation, MapPin } from "lucide-react";

const GMAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string ?? "").replace(/\s/g, "");
const FLUSH_INTERVAL = 15_000; // 15s

interface PromotoraMapaGoogleProps {
  sessaoId: string;
  clinicId: string;
  abordadora: string;
}

function gmapsReady(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && (window as any).google?.maps) { resolve(); return; }
    const check = setInterval(() => {
      if ((window as any).google?.maps) { clearInterval(check); resolve(); }
    }, 200);
  });
}

export function PromotoraMapaGoogle({ sessaoId, clinicId, abordadora }: PromotoraMapaGoogleProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const rotaIdRef = useRef<string | null>(null);
  const pointsRef = useRef<{ lat: number; lng: number; ts: number }[]>([]);
  const lastFlushedRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);

  const [gmapsLoaded, setGmapsLoaded] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [pontosCont, setPontosCont] = useState(0);
  const [status, setStatus] = useState<"aguardando" | "em_rota" | "chegou">("aguardando");
  const [rotaInfo, setRotaInfo] = useState<{ distancia: string; duracao: string } | null>(null);

  useEffect(() => {
    gmapsReady().then(() => setGmapsLoaded(true));
  }, []);

  // Init map
  useEffect(() => {
    if (!gmapsLoaded || !mapRef.current || mapInstanceRef.current) return;
    const g = (window as any).google;
    mapInstanceRef.current = new g.maps.Map(mapRef.current, {
      zoom: 15,
      center: { lat: -21.0, lng: -49.3 },
      mapTypeId: "roadmap",
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
  }, [gmapsLoaded]);

  // Create/get rotaAtiva doc and start GPS
  useEffect(() => {
    if (!gmapsLoaded || !sessaoId || !clinicId) return;

    const g = (window as any).google;
    const today = format(new Date(), "dd/MM/yyyy");
    const rotaRef = doc(collection(db, "clinics", clinicId, "rotasAtivas"));
    rotaIdRef.current = rotaRef.id;

    // Create the rotaAtiva doc
    setDoc(rotaRef, {
      sessaoId,
      abordadora,
      clinicId,
      data: today,
      pontos: [],
      status: "em_rota",
      criadoEm: Date.now(),
    }).catch(() => {});

    setStatus("em_rota");

    if (!navigator.geolocation) {
      setGpsError("GPS não disponível neste dispositivo.");
      return;
    }

    const flush = async () => {
      const pts = pointsRef.current;
      if (!rotaIdRef.current || pts.length === lastFlushedRef.current) return;
      const snapshot = [...pts];
      lastFlushedRef.current = snapshot.length;
      try {
        await updateDoc(doc(db, "clinics", clinicId, "rotasAtivas", rotaIdRef.current), {
          pontos: snapshot,
          gpsAtual: snapshot[snapshot.length - 1],
        });
      } catch { lastFlushedRef.current = 0; }
    };

    const interval = setInterval(flush, FLUSH_INTERVAL);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
        pointsRef.current.push(pt);
        setPontosCont(pointsRef.current.length);
        setGpsError(null);

        const map = mapInstanceRef.current;
        if (!map) return;

        // Move/create current position marker
        const latlng = new g.maps.LatLng(pt.lat, pt.lng);
        if (markerRef.current) {
          markerRef.current.setPosition(latlng);
        } else {
          markerRef.current = new g.maps.Marker({
            position: latlng,
            map,
            title: abordadora,
            icon: {
              path: g.maps.SymbolPath.CIRCLE,
              scale: 11,
              fillColor: "#ec4899",
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 3,
            },
            zIndex: 100,
          });
          map.setCenter(latlng);
          map.setZoom(17);
        }

        // Draw GPS trail
        const path = pointsRef.current.map((p) => ({ lat: p.lat, lng: p.lng }));
        if (polylineRef.current) {
          polylineRef.current.setPath(path);
        } else if (path.length > 1) {
          polylineRef.current = new g.maps.Polyline({
            path,
            geodesic: true,
            strokeColor: "#ec4899",
            strokeOpacity: 0.85,
            strokeWeight: 5,
            map,
          });
        }
      },
      (err) => {
        if (err.code === 1) setGpsError("Permissão de localização negada.");
        else if (err.code === 2) setGpsError("Localização indisponível.");
        else setGpsError("Erro ao obter localização.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    watchIdRef.current = watchId;

    return () => {
      clearInterval(interval);
      navigator.geolocation.clearWatch(watchId);
      flush(); // Final flush
    };
  }, [gmapsLoaded, sessaoId, clinicId, abordadora]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />

      {/* Loading overlay */}
      {!gmapsLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <span className="text-sm text-gray-500 animate-pulse">Carregando mapa…</span>
        </div>
      )}

      {/* GPS error */}
      {gpsError && (
        <div className="absolute top-2 left-2 right-2 bg-red-100 border border-red-300 text-red-700 text-xs rounded-lg px-3 py-2 z-10 shadow">
          {gpsError}
        </div>
      )}

      {/* Waiting GPS */}
      {gmapsLoaded && !gpsError && pontosCont === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 backdrop-blur text-gray-600 text-sm rounded-xl px-4 py-3 shadow text-center space-y-1">
            <div className="text-2xl">📍</div>
            <div>Obtendo localização GPS…</div>
            <div className="text-xs text-gray-400">Mantenha a aba aberta</div>
          </div>
        </div>
      )}

      {/* Stats badge */}
      {pontosCont > 0 && (
        <div className="absolute bottom-2 right-2 z-10 bg-black/60 backdrop-blur text-xs text-white rounded-lg px-2 py-1 shadow flex items-center gap-1">
          <Navigation className="h-3 w-3" />
          {pontosCont} pontos · atualiza a cada 15s
        </div>
      )}
    </div>
  );
}
