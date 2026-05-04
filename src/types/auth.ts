export type UserRole = "admin" | "editor" | "viewer" | "recepcao" | "cliente";

export interface CRMUser {
  uid: string;
  username: string;
  role: UserRole;
  clinicId?: string | null;
  clinicIds?: string[]; // Para role 'cliente' que pode ter múltiplas clínicas
  createdAt: string;
  createdBy: string;
}

export interface UserPermissions {
  canView: boolean;
  canEdit: boolean;
  canImport: boolean;
  canDelete: boolean;
  canManageUsers: boolean;
}

export const rolePermissions: Record<UserRole, UserPermissions> = {
  admin: {
    canView: true,
    canEdit: true,
    canImport: true,
    canDelete: true,
    canManageUsers: true,
  },
  editor: {
    canView: true,
    canEdit: true,
    canImport: true,
    canDelete: false,
    canManageUsers: false,
  },
  viewer: {
    canView: true,
    canEdit: false,
    canImport: false,
    canDelete: false,
    canManageUsers: false,
  },
  recepcao: {
    canView: true,
    canEdit: true,
    canImport: false,
    canDelete: false,
    canManageUsers: false,
  },
  cliente: {
    canView: true,
    canEdit: false,
    canImport: false,
    canDelete: false,
    canManageUsers: false,
  },
};
