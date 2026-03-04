export type UserRole = "admin" | "editor" | "viewer";

export interface CRMUser {
  uid: string;
  username: string;
  role: UserRole;
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
};
