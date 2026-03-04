import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  query,
  where,
} from "firebase/firestore";
import { Lead } from "@/types/crm";

export function useFirebaseSync(leads: Lead[], userId: string | null) {
  const [syncing, setSyncing] = useState(false);

  // Listen to Firestore changes
  useEffect(() => {
    if (!userId) return;

    const docRef = doc(db, "crm_data", userId);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          // Aqui você pode retornar os dados, mas manteremos sincronização unidirecional por enquanto
          console.log("Dados do Firestore carregados");
        }
      },
      (error) => console.error("Erro ao sincronizar:", error)
    );

    return unsubscribe;
  }, [userId]);

  // Save leads to Firestore
  const syncToFirebase = async (leadsToSync: Lead[]) => {
    if (!userId || leadsToSync.length === 0) return;

    setSyncing(true);
    try {
      const docRef = doc(db, "crm_data", userId);
      await setDoc(
        docRef,
        {
          leads: leadsToSync,
          lastUpdated: new Date().toISOString(),
          ownerId: userId,
        },
        { merge: true }
      );
      console.log("✅ Dados sincronizados com Firestore");
    } catch (error) {
      console.error("❌ Erro ao sincronizar:", error);
    } finally {
      setSyncing(false);
    }
  };

  // Load leads from Firestore
  const loadFromFirebase = async (): Promise<Lead[] | null> => {
    if (!userId) return null;

    try {
      const docRef = doc(db, "crm_data", userId);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        return snapshot.data().leads || [];
      }
    } catch (error) {
      console.error("Erro ao carregar do Firestore:", error);
    }
    return null;
  };

  return { syncToFirebase, loadFromFirebase, syncing };
}
