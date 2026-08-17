export type UserRole = "admin" | "editor" | "viewer" | "recepcao" | "cliente" | "mpc_tool";

export interface ClinicRecord {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
  color?: string;
  // 'clinica' is the default for backwards compatibility
  module?: "clinica" | "corretor";
  // Campos personalizados por módulo (p.ex. para corretor: CRECI, corretor, areas)
  customFields?: Record<string, any>;
  // Catalogo de serviços criados pelo usuário/corretor
  customServices?: string[];
  createdAt?: string;
  createdBy?: string;
}

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
  mpc_tool: {
    canView: true,
    canEdit: true,
    canImport: false,
    canDelete: false,
    canManageUsers: false,
  },
};
