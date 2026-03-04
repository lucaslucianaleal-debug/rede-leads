import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { useCRMUsers } from "./useCRMUsers";
import { UserRole, rolePermissions, UserPermissions } from "@/types/auth";

export function useUserPermissions() {
  const { user } = useAuth();
  const { getUserRole } = useCRMUsers();
  const [role, setRole] = useState<UserRole | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPermissions = async () => {
      if (user) {
        const userRole = await getUserRole(user.uid);
        setRole(userRole || "viewer");
        setPermissions(rolePermissions[userRole || "viewer"]);
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
