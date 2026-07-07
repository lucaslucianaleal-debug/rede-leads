import { useEffect, useState } from "react";
import { useCRMUsers } from "@/hooks/useCRMUsers";
import { useClinics } from "@/hooks/useClinics";
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
  const {
    clinics,
    createClinic,
    loading: clinicsLoading,
    error: clinicsError,
  } = useClinics();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("viewer");
  const [open, setOpen] = useState(false);
  const [clinicForUser, setClinicForUser] = useState<string | null>(null);
  const [newClinicId, setNewClinicId] = useState("");
  const [newClinicName, setNewClinicName] = useState("");
  const [newClinicAddress, setNewClinicAddress] = useState("");
  const [newClinicColor, setNewClinicColor] = useState("#E6FFFA");
  const [newClinicLogoUrl, setNewClinicLogoUrl] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!clinicForUser && clinics.length > 0) {
      setClinicForUser(clinics[0].id);
    }
  }, [clinicForUser, clinics]);

  const handleCreateClinic = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const clinic = await createClinic({
        id: newClinicId,
        name: newClinicName,
        address: newClinicAddress,
        color: newClinicColor,
        logoUrl: newClinicLogoUrl,
      });
      toast.success(`Clínica "${clinic.name}" criada com sucesso!`);
      setClinicForUser(clinic.id);
      setNewClinicId("");
      setNewClinicName("");
      setNewClinicAddress("");
      setNewClinicColor("#E6FFFA");
      setNewClinicLogoUrl("");
    } catch {
      toast.error(clinicsError || "Erro ao criar clínica");
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser(username, password, role, clinicForUser);
      toast.success(`Usuário "${username}" criado com sucesso!`);
      setUsername("");
      setPassword("");
      setRole("viewer");
      setClinicForUser(clinics[0]?.id ?? null);
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
      cliente: "bg-purple-100 text-purple-800",
      mpc_tool: "bg-cyan-100 text-cyan-800",
    };
    return colors[role];
  };

  const getRoleLabel = (role: UserRole) => {
    const labels: Record<UserRole, string> = {
      admin: "Administrador",
      editor: "Editor",
      viewer: "Visualizador",
      recepcao: "Recepção",
      cliente: "Cliente",
      mpc_tool: "MPC Tool",
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
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Usuários</DialogTitle>
          <DialogDescription>
            Crie novas contas e gerencie permissões
          </DialogDescription>
        </DialogHeader>

        {/* Create Clinic Form */}
        <div className="space-y-4 border-b pb-4">
          <h3 className="font-semibold">Criar Nova Clínica</h3>
          <form onSubmit={handleCreateClinic} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="new-clinic-name">Nome da clínica</Label>
                <Input
                  id="new-clinic-name"
                  placeholder="Odontocompany Ribeirão"
                  value={newClinicName}
                  onChange={(e) => setNewClinicName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-clinic-id">ID da clínica</Label>
                <Input
                  id="new-clinic-id"
                  placeholder="odontocompany-ribeirao"
                  value={newClinicId}
                  onChange={(e) => setNewClinicId(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="new-clinic-address">Endereço</Label>
                <Input
                  id="new-clinic-address"
                  placeholder="Rua, número, bairro, cidade"
                  value={newClinicAddress}
                  onChange={(e) => setNewClinicAddress(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-clinic-color">Cor</Label>
                <Input
                  id="new-clinic-color"
                  type="color"
                  value={newClinicColor}
                  onChange={(e) => setNewClinicColor(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-clinic-logo">Logo URL</Label>
              <Input
                id="new-clinic-logo"
                placeholder="https://..."
                value={newClinicLogoUrl}
                onChange={(e) => setNewClinicLogoUrl(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={clinicsLoading} className="w-full">
              {clinicsLoading ? "Criando clínica..." : "Criar Clínica"}
            </Button>
          </form>
        </div>

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
                  <SelectItem value="cliente">
                    Cliente (Acesso limitado a leads)
                  </SelectItem>
                  <SelectItem value="mpc_tool">
                    MPC Tool (Somente painel operacional MPC)
                  </SelectItem>
                  <SelectItem value="admin">
                    Administrador (Acesso total)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="clinic-select">Clínica</Label>
              <select
                id="clinic-select"
                value={clinicForUser || ''}
                onChange={(e) => setClinicForUser(e.target.value || null)}
                className="w-full bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500 p-2 rounded"
                disabled={clinicsLoading || clinics.length === 0}
              >
                {clinics.length === 0 ? (
                  <option value="">Nenhuma clínica cadastrada</option>
                ) : (
                  clinics.map((clinic) => (
                    <option key={clinic.id} value={clinic.id}>
                      {clinic.name}
                    </option>
                  ))
                )}
              </select>
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
                            <SelectItem value="cliente">Cliente</SelectItem>
                            <SelectItem value="mpc_tool">MPC Tool</SelectItem>
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

        {(error || clinicsError) && (
          <p className="text-sm text-red-500">{error || clinicsError}</p>
        )}
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
