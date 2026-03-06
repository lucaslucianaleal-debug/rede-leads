import { useState } from "react";
import { useCRMUsers } from "@/hooks/useCRMUsers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserRole } from "@/types/auth";
import { Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function AdminPanel() {
  const { users, createUser, updateUserRole, deleteUser, loading, error } =
    useCRMUsers();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("viewer");
  const [open, setOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser(username, password, role);
      toast.success(`Usuário "${username}" criado com sucesso!`);
      setUsername("");
      setPassword("");
      setRole("viewer");
      setOpen(false);
    } catch {
      toast.error(error || "Erro ao criar usuário");
    }
  };

  const handleUpdateRole = async (uid: string, newRole: UserRole) => {
    try {
      await updateUserRole(uid, newRole);
      toast.success("Função atualizada!");
    } catch {
      toast.error("Erro ao atualizar função");
    }
  };

  const handleDeleteUser = async (uid: string) => {
    try {
      await deleteUser(uid);
      toast.success("Usuário removido!");
      setDeleteConfirm(null);
    } catch {
      toast.error("Erro ao remover usuário");
    }
  };

  const getRoleBadgeColor = (role: UserRole) => {
    const colors: Record<UserRole, string> = {
      admin: "bg-red-100 text-red-800",
      editor: "bg-blue-100 text-blue-800",
      viewer: "bg-gray-100 text-gray-800",
      recepcao: "bg-green-100 text-green-800",
    };
    return colors[role];
  };

  const getRoleLabel = (role: UserRole) => {
    const labels: Record<UserRole, string> = {
      admin: "Administrador",
      editor: "Editor",
      viewer: "Visualizador",
      recepcao: "Recepção",
    };
    return labels[role];
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4 mr-1" />
          Admin
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerenciar Usuários</DialogTitle>
          <DialogDescription>
            Crie novas contas e gerencie permissões
          </DialogDescription>
        </DialogHeader>

        {/* Create User Form */}
        <div className="space-y-4 border-b pb-4">
          <h3 className="font-semibold">Criar Novo Usuário</h3>
          <form onSubmit={handleCreateUser} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="new-username">Usuário / Email</Label>
                <Input
                  id="new-username"
                  placeholder="nome_usuario ou email@dominio.com"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-select">Função</Label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger id="role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">
                    Visualizador (Somente leitura)
                  </SelectItem>
                  <SelectItem value="editor">
                    Editor (Editar + Importar)
                  </SelectItem>
                  <SelectItem value="recepcao">
                    Recepção (Agenda do Dia)
                  </SelectItem>
                  <SelectItem value="admin">
                    Administrador (Acesso total)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Criando..." : "Criar Usuário"}
            </Button>
          </form>
        </div>

        {/* Users List */}
        <div className="space-y-3">
          <h3 className="font-semibold">Usuários Cadastrados</h3>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Nenhum usuário cadastrado
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.uid}>
                      <TableCell className="font-medium">@{user.username}</TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          onValueChange={(v) =>
                            handleUpdateRole(user.uid, v as UserRole)
                          }
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">
                              Visualizador
                            </SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="recepcao">Recepção</SelectItem>
                            <SelectItem value="admin">
                              Administrador
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(user.uid)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDeleteUser(deleteConfirm)}
              className="bg-red-600"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
