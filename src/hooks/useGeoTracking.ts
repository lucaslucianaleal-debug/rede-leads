import { useEffect, useRef, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

export interface GeoPoint {
  lat: number;
  lng: number;
  ts: number; // timestamp ms
}

interface UseGeoTrackingOptions {
  clinicId: string | null;
  sessaoId: string | null;
  enabled?: boolean;
}

export interface UseGeoTrackingResult {
  points: GeoPoint[];
  currentPosition: GeoPoint | null;
  error: string | null;
  permission: "granted" | "denied" | "prompt" | null;
}

const MIN_DISTANCE_M = 10; // only add point if moved ≥10m
const FLUSH_INTERVAL_MS = 20_000; // flush to Firestore every 20s

function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function useGeoTracking({
  clinicId,
  sessaoId,
  enabled = true,
}: UseGeoTrackingOptions): UseGeoTrackingResult {
  const [points, setPoints] = useState<GeoPoint[]>([]);
  const [currentPosition, setCurrentPosition] = useState<GeoPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<"granted" | "denied" | "prompt" | null>(null);

  const allPointsRef = useRef<GeoPoint[]>([]);
  const lastFlushedRef = useRef(0);
  const clinicIdRef = useRef(clinicId);
  const sessaoIdRef = useRef(sessaoId);

  // Keep refs in sync with props
  useEffect(() => { clinicIdRef.current = clinicId; }, [clinicId]);
  useEffect(() => { sessaoIdRef.current = sessaoId; }, [sessaoId]);

  const flush = useCallback(() => {
    const pts = allPointsRef.current;
    const cId = clinicIdRef.current;
    const sId = sessaoIdRef.current;
    if (!cId || !sId || pts.length <= lastFlushedRef.current) return;
    const snapshot = [...pts];
    lastFlushedRef.current = snapshot.length;
    updateDoc(doc(db, "clinics", cId, "sessoes", sId), { rota: snapshot }).catch(() => {
      // allow retry on next flush
      lastFlushedRef.current = 0;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;

    if (!navigator.geolocation) {
      setError("GPS não disponível neste dispositivo.");
      return;
    }

    // Query permission state without prompting
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((r) => {
        setPermission(r.state as "granted" | "denied" | "prompt");
        r.addEventListener("change", () =>
          setPermission(r.state as "granted" | "denied" | "prompt")
        );
      })
      .catch(() => {/* permissions API not supported */});

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const p: GeoPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ts: Date.now(),
        };
        setCurrentPosition(p);
        setError(null);
        setPoints((prev) => {
          const last = prev[prev.length - 1];
          if (last && haversineDistance(last, p) < MIN_DISTANCE_M) return prev;
          const next = [...prev, p];
          allPointsRef.current = next;
          return next;
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError(
            "Permissão de localização negada. Ative nas configurações do navegador."
          );
          setPermission("denied");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError("Localização indisponível. Verifique se o GPS está ativo.");
        } else {
          setError("Timeout ao obter localização. Tente novamente.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 }
    );

    const timer = setInterval(flush, FLUSH_INTERVAL_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
      flush(); // final flush when session ends or component unmounts
    };
  }, [enabled, flush]);

  return { points, currentPosition, error, permission };
}
