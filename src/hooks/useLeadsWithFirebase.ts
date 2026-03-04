import { useEffect } from "react";
import { useLeads } from "./useLeads";
import { db, auth } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { User } from "firebase/auth";

export function useLeadsWithFirebase(user: User | null, isReadOnly: boolean = false) {
  const leadsHook = useLeads();
  const { leads, setLeads } = leadsHook;

  // Load leads from localStorage or Firebase on mount
  useEffect(() => {
    const loadLeads = async () => {
      if (user && !isReadOnly) {
        // Load from Firebase if authenticated
        try {
          const docRef = doc(db, "crm_data", user.uid);
          const snapshot = await getDoc(docRef);
          if (snapshot.exists() && snapshot.data().leads) {
            setLeads(snapshot.data().leads);
          } else {
            // Fallback to localStorage
            const saved = localStorage.getItem("crm_leads");
            if (saved) setLeads(JSON.parse(saved));
          }
        } catch (error) {
          console.error("Erro ao carregar do Firebase:", error);
          const saved = localStorage.getItem("crm_leads");
          if (saved) setLeads(JSON.parse(saved));
        }
      } else if (!isReadOnly) {
        // Load from localStorage if not authenticated
        const saved = localStorage.getItem("crm_leads");
        if (saved) setLeads(JSON.parse(saved));
      }
    };

    loadLeads();
  }, [user, isReadOnly]);

  // Auto-sync to localStorage (always)
  useEffect(() => {
    localStorage.setItem("crm_leads", JSON.stringify(leads));
  }, [leads]);

  // Auto-sync to Firebase (only if authenticated and not read-only)
  useEffect(() => {
    if (user && !isReadOnly && leads.length > 0) {
      const timer = setTimeout(async () => {
        try {
          const docRef = doc(db, "crm_data", user.uid);
          await setDoc(
            docRef,
            {
              leads,
              lastUpdated: new Date().toISOString(),
              ownerId: user.uid,
            },
            { merge: true }
          );
          console.log("✅ Sincronizado com Firebase");
        } catch (error) {
          console.error("❌ Erro ao sincronizar:", error);
        }
      }, 2000); // Debounce 2 segundos

      return () => clearTimeout(timer);
    }
  }, [leads, user, isReadOnly]);

  const setLeadsProxy = (leads: Lead[]) => {
    // Implement any proxy logic if needed
    return leadsHook.setLeads?.(leads) || leads;
  };

  return leadsHook;
}

// Type imports
import { Lead } from "@/types/crm";
