import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { useCRMUsers } from "./useCRMUsers";
import { UserRole, rolePermissions, UserPermissions } from "@/types/auth";

export function useUserPermissions() {
  const { user, userProfile } = useAuth();
  const { getUserRole } = useCRMUsers();
  const [role, setRole] = useState<UserRole | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPermissions = async () => {
      if (user) {
        let userRole: UserRole;
        try {
          const fetchedRole = await getUserRole(user.uid);
          if (fetchedRole) {
            // Fonte principal: registro de permissão (crm_users).
            userRole = fetchedRole;
          } else if (userProfile?.role) {
            // Sem crm_users, mas o perfil (users) já sabe qual era o papel dessa
            // conta — usa isso em vez de assumir Admin. Não persiste nada sozinho:
            // se a conta foi apagada, ela não deve "ressuscitar" com permissões.
            userRole = userProfile.role as UserRole;
          } else {
            // Nenhum registro encontrado em lugar nenhum. Sessão transitória com
            // permissões mínimas — não grava nada no banco automaticamente.
            userRole = "viewer";
          }
        } catch {
          userRole = "viewer";
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
  }, [user, userProfile]);

  return { role, permissions, loading, isAdmin: role === "admin", isReceptionist: role === "recepcao" };
}
