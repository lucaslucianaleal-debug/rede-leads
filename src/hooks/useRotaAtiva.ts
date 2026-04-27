import { useEffect, useRef, useCallback } from "react";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

export interface RotaAtivaData {
  leadId: string;
  abordadora: string;
  clinicId: string;
  pontos: { lat: number; lng: number; ts: number }[];
  gpsAtual?: { lat: number; lng: number; ts: number };
  status: "em_rota" | "chegou";
  criadoEm: number;
  iniciadoEm: number;
}

interface UseRotaAtivaOptions {
  clinicId: string;
  rotaId: string;
  enabled?: boolean;
}

const MIN_DISTANCE_M = 10;
const FLUSH_INTERVAL_MS = 15_000; // 15 seconds

function haversineDistance(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000; // meters
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function useRotaAtiva({ clinicId, rotaId, enabled = true }: UseRotaAtivaOptions) {
  const pointsRef = useRef<{ lat: number; lng: number; ts: number }[]>([]);
  const lastFlushedRef = useRef(0);
  const clinicIdRef = useRef(clinicId);
  const rotaIdRef = useRef(rotaId);

  useEffect(() => {
    clinicIdRef.current = clinicId;
    rotaIdRef.current = rotaId;
  }, [clinicId, rotaId]);

  const flush = useCallback(async (force = false) => {
    const pts = pointsRef.current;
    const cId = clinicIdRef.current;
    const rId = rotaIdRef.current;

    if (!cId || !rId || (pts.length === lastFlushedRef.current && !force)) return;

    try {
      const snapshot = [...pts];
      lastFlushedRef.current = snapshot.length;

      const updates: any = {
        pontos: snapshot,
        gpsAtual:
          snapshot.length > 0
            ? snapshot[snapshot.length - 1]
            : undefined,
      };

      // Check if arrived (last point within 100m of destination)
      if (snapshot.length > 0) {
        // This would be checked against lead coordinates in the UI
        updates.updated = serverTimestamp();
      }

      await updateDoc(doc(db, "clinics", cId, "rotasAtivas", rId), updates);
    } catch (err) {
      console.error("Failed to flush rota pontos:", err);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ts: Date.now(),
        };

        pointsRef.current.push(newPoint);

        // Periodically flush to Firestore
        const interval = setInterval(() => flush(), FLUSH_INTERVAL_MS);
        return () => clearInterval(interval);
      },
      (err) => {
        console.error("Geolocation error:", err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      flush(true); // Final flush on unmount
    };
  }, [enabled, flush]);
}
