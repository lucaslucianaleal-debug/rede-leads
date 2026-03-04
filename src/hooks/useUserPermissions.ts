import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { useCRMUsers } from "./useCRMUsers";
import { UserRole, rolePermissions, UserPermissions, CRMUser } from "@/types/auth";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

export function useUserPermissions() {
  const { user } = useAuth();
  const { getUserRole } = useCRMUsers();
  const [role, setRole] = useState<UserRole | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPermissions = async () => {
      if (user) {
        let userRole = await getUserRole(user.uid);

        // Se não existe registro no Firestore, auto-criar como admin
        // (usuário criado diretamente no Firebase Console)
        if (!userRole) {
          const crmUser: CRMUser = {
            uid: user.uid,
            username: user.email?.split("@")[0] || user.uid,
            role: "admin",
            createdAt: new Date().toISOString(),
            createdBy: "system",
          };
          await setDoc(doc(db, "crm_users", user.uid), crmUser);
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

  return { role, permissions, loading, isAdmin: role === "admin" };
}
