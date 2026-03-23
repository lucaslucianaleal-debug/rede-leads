import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { useCRMUsers } from "./useCRMUsers";
import { UserRole, rolePermissions, UserPermissions, CRMUser } from "@/types/auth";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { attachLastWriter } from '../lib/crmGuard';

export function useUserPermissions() {
  const { user } = useAuth();
  const { getUserRole } = useCRMUsers();
  const [role, setRole] = useState<UserRole | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPermissions = async () => {
      if (user) {
        let userRole: UserRole = "admin"; // padrão para usuário logado
        try {
          const fetchedRole = await getUserRole(user.uid);
          if (fetchedRole) {
            userRole = fetchedRole;
          } else {
            // Tenta criar registro no Firestore, mas não bloqueia se falhar
            try {
              const crmUser: CRMUser = {
                uid: user.uid,
                username: user.email?.split("@")[0] || user.uid,
                role: "admin",
                createdAt: new Date().toISOString(),
                createdBy: "system",
              };
              const sanitized = JSON.parse(JSON.stringify(crmUser));
              await setDoc(doc(db, "crm_users", user.uid), attachLastWriter(sanitized, user.uid));
            } catch {
              // Silencia erro do Firestore, ainda usa admin como padrão
            }
            userRole = "admin";
          }
        } catch {
          // Se Firestore inacessível, usuário logado = admin
          userRole = "admin";
        }
        setRole(userRole);
        setPermissions(rolePermissions[userRole]);
      } else {
        // Usuário não autenticado = viewer
        setRole("viewer");
        setPermissions(rolePermissions.viewer);
      }
      setLoading(false);
    };

    loadPermissions();
  }, [user]);

  return { role, permissions, loading, isAdmin: role === "admin", isReceptionist: role === "recepcao" };
}
