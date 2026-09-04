import { useEffect, useMemo, useState } from "react";
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
import { CORRETOR_SERVICE_LIBRARY } from "@/lib/serviceCatalog";
import { filterVisibleClinicsForProfile, isGlobalAdminProfile } from "@/lib/userAccess";

type AdminPanelProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

export function AdminPanel({
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: AdminPanelProps = {}) {
  const { users, currentUserProfile, createUser, updateUserRole, deleteUser, loading, error } =
    useCRMUsers();
  const {
    clinics: allClinics,
    createClinic,
    updateClinic,
    loading: clinicsLoading,
    error: clinicsError,
  } = useClinics();

  // Um admin "de conta" (ex.: dono de uma conta de corretor vinculada a um clinicId
  // especifico) so pode ver/gerenciar a propria conta - nao a lista inteira de
  // clinicas/corretores de todos os clientes. So um admin global (sem vinculo, ou
  // com clinicId "*") enxerga tudo.
  const isGlobalAdmin = isGlobalAdminProfile(currentUserProfile);
  const clinics = useMemo(
    () => filterVisibleClinicsForProfile(currentUserProfile, allClinics),
    [currentUserProfile, allClinics]
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("viewer");
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const [clinicForUser, setClinicForUser] = useState<string | null>(null);
  const [newClinicId, setNewClinicId] = useState("");
  const [newClinicName, setNewClinicName] = useState("");
  const [newClinicAddress, setNewClinicAddress] = useState("");
  const [newClinicColor, setNewClinicColor] = useState("#E6FFFA");
  const [newClinicLogoUrl, setNewClinicLogoUrl] = useState("");
  const [newClinicModule, setNewClinicModule] = useState<"clinica" | "corretor">("clinica");
  const [newClinicCustomFields, setNewClinicCustomFields] = useState("{}");
  const [newClinicServices, setNewClinicServices] = useState(CORRETOR_SERVICE_LIBRARY.join(", "));
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingClinicId, setEditingClinicId] = useState<string | null>(null);
  const [editClinicModule, setEditClinicModule] = useState<"clinica" | "corretor">("clinica");
  const [editClinicServices, setEditClinicServices] = useState("");
  const isCorretorModule = newClinicModule === "corretor";

  const startEditClinic = (clinic: (typeof clinics)[number]) => {
    setEditingClinicId(clinic.id);
    setEditClinicModule(clinic.module === "corretor" ? "corretor" : "clinica");
    setEditClinicServices(
      Array.isArray(clinic.customServices) && clinic.customServices.length > 0
        ? clinic.customServices.join(", ")
        : CORRETOR_SERVICE_LIBRARY.join(", ")
    );
  };

  const handleSaveClinicEdit = async () => {
    if (!editingClinicId) return;
    try {
      const services =
        editClinicModule === "corretor"
          ? editClinicServices.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined;
      await updateClinic(editingClinicId, {
        module: editClinicModule,
        ...(services ? { customServices: services } : {}),
      });
      toast.success("Cadastro atualizado com sucesso!");
      setEditingClinicId(null);
    } catch {
      toast.error(clinicsError || "Erro ao atualizar cadastro");
    }
  };

  useEffect(() => {
    if (!isGlobalAdmin && !clinicForUser && clinics.length > 0 && clinics[0]?.id) {
      setClinicForUser(clinics[0].id);
    }
  }, [clinicForUser, clinics, isGlobalAdmin]);

  const handleCreateClinic = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let parsedCustom: Record<string, any> | undefined = undefined;
      try {
        parsedCustom = newClinicCustomFields ? JSON.parse(newClinicCustomFields) : undefined;
      } catch (err) {
        toast.error("JSON inválido em Campos Personalizados");
        return;
      }
      const parsedServices = isCorretorModule
        ? newClinicServices
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

      const clinic = await createClinic({
        id: newClinicId,
        name: newClinicName,
        address: newClinicAddress,
        color: newClinicColor,
        logoUrl: newClinicLogoUrl,
        module: newClinicModule,
        customFields: parsedCustom,
        customServices: parsedServices,
      });
      toast.success(`${isCorretorModule ? "Corretor" : "Clínica"} "${clinic.name}" criado(a) com sucesso!`);
      setClinicForUser(clinic.id);
      setNewClinicId("");
      setNewClinicName("");
      setNewClinicAddress("");
      setNewClinicColor("#E6FFFA");
      setNewClinicLogoUrl("");
      setNewClinicModule("clinica");
      setNewClinicCustomFields("{}");
      setNewClinicServices(CORRETOR_SERVICE_LIBRARY.join(", "));
    } catch {
      toast.error(clinicsError || "Erro ao criar clínica");
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const accountModule = allClinics.find((clinic) => clinic.id === clinicForUser)?.module;
      await createUser(username, password, role, clinicForUser, accountModule);
      toast.success(`Usuário "${username}" criado com sucesso!`);
      setUsername("");
      setPassword("");
      setRole("viewer");
      setClinicForUser(null);
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
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-1" />
            Admin
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Usuários</DialogTitle>
          <DialogDescription>
            Crie novas contas e gerencie permissões
          </DialogDescription>
        </DialogHeader>

        {/* Create Clinic Form — apenas admin global (dono da plataforma) cria novas contas */}
        {isGlobalAdmin && (
        <div className="space-y-4 border-b pb-4">
          <h3 className="font-semibold">{isCorretorModule ? "Criar Novo Corretor" : "Criar Nova Clínica"}</h3>
          <form onSubmit={handleCreateClinic} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="new-clinic-name">{isCorretorModule ? "Nome do corretor" : "Nome da clínica"}</Label>
                <Input
                  id="new-clinic-name"
                  placeholder={isCorretorModule ? "Henrique" : "Nome da clínica"}
                  value={newClinicName}
                  onChange={(e) => setNewClinicName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-clinic-id">{isCorretorModule ? "ID do corretor" : "ID da clínica"}</Label>
                <Input
                  id="new-clinic-id"
                  placeholder={isCorretorModule ? "henrique-corretor" : "odontocompany-ribeirao"}
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
                <Label htmlFor="new-clinic-color">{isCorretorModule ? "Cor do painel" : "Cor"}</Label>
                <Input
                  id="new-clinic-color"
                  type="color"
                  value={newClinicColor}
                  onChange={(e) => setNewClinicColor(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="new-clinic-module">Tipo</Label>
                <select
                  id="new-clinic-module"
                  value={newClinicModule}
                  onChange={(e) => {
                    const value = e.target.value as "clinica" | "corretor";
                    setNewClinicModule(value);
                    if (value === "corretor" && !newClinicServices.trim()) {
                      setNewClinicServices(CORRETOR_SERVICE_LIBRARY.join(", "));
                    }
                  }}
                  className="w-full bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500 p-2 rounded"
                >
                  <option value="clinica">Clínica</option>
                  <option value="corretor">Corretor</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-clinic-logo">Campos Personalizados (JSON)</Label>
                <Input
                  id="new-clinic-customfields"
                  placeholder='{"creci": "string", "corretor": "string"}'
                  value={newClinicCustomFields}
                  onChange={(e) => setNewClinicCustomFields(e.target.value)}
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
            {isCorretorModule && (
              <div className="space-y-2">
                <Label htmlFor="new-clinic-services">
                  Serviços oferecidos (separados por vírgula)
                </Label>
                <Input
                  id="new-clinic-services"
                  placeholder="Venda de imóveis, Locação/Aluguel, Avaliação imobiliária..."
                  value={newClinicServices}
                  onChange={(e) => setNewClinicServices(e.target.value)}
                />
                <p className="text-xs text-slate-400">
                  Essa lista aparece na aba "Serviço Procurado" ao cadastrar um lead. O corretor
                  também pode adicionar/remover serviços depois, direto pela tela de leads.
                </p>
              </div>
            )}
            <Button type="submit" disabled={clinicsLoading} className="w-full">
              {clinicsLoading ? "Criando..." : isCorretorModule ? "Criar Corretor" : "Criar Clínica"}
            </Button>
          </form>
        </div>
        )}

        {/* Existing Clinics / Corretores List */}
        <div className="space-y-3 border-b pb-4">
          <h3 className="font-semibold">Clínicas e Corretores cadastrados</h3>
          <p className="text-xs text-slate-400">
            Se o tipo estiver errado (ex.: um corretor marcado como "Clínica"), a lista de
            serviços mostrada no cadastro de lead também vai ficar errada. Corrija aqui.
          </p>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clinics.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Nenhuma clínica/corretor cadastrado
                    </TableCell>
                  </TableRow>
                ) : (
                  clinics.map((clinic) => (
                    <TableRow key={clinic.id}>
                      <TableCell className="font-medium">{clinic.name}</TableCell>
                      <TableCell>
                        {clinic.module === "corretor" ? "Corretor" : "Clínica"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => startEditClinic(clinic)}>
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {editingClinicId && (
            <div className="space-y-3 border rounded-lg p-3 mt-2">
              <p className="text-sm font-medium">
                Editando: {clinics.find((c) => c.id === editingClinicId)?.name}
              </p>
              <div className="space-y-2">
                <Label htmlFor="edit-clinic-module">Tipo</Label>
                <select
                  id="edit-clinic-module"
                  value={editClinicModule}
                  onChange={(e) => setEditClinicModule(e.target.value as "clinica" | "corretor")}
                  className="w-full bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500 p-2 rounded"
                >
                  <option value="clinica">Clínica</option>
                  <option value="corretor">Corretor</option>
                </select>
              </div>
              {editClinicModule === "corretor" && (
                <div className="space-y-2">
                  <Label htmlFor="edit-clinic-services">Serviços oferecidos (separados por vírgula)</Label>
                  <Input
                    id="edit-clinic-services"
                    value={editClinicServices}
                    onChange={(e) => setEditClinicServices(e.target.value)}
                  />
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveClinicEdit} disabled={clinicsLoading}>
                  Salvar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingClinicId(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
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
              <Label htmlFor="clinic-select">
                {isGlobalAdmin ? "Clínica (opcional)" : "Conta"}
              </Label>
              <select
                id="clinic-select"
                value={clinicForUser || ''}
                onChange={(e) => setClinicForUser(e.target.value || null)}
                className="w-full bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500 p-2 rounded"
                disabled={clinicsLoading || clinics.length === 0 || !isGlobalAdmin}
              >
                {isGlobalAdmin && <option value="">Sem vínculo com clínica</option>}
                {clinics.length === 0 ? null : (
                  clinics.map((clinic) => (
                    <option key={clinic.id} value={clinic.id}>
                      {clinic.name}
                    </option>
                  ))
                )}
              </select>
              {!isGlobalAdmin && (
                <p className="text-xs text-slate-400">
                  Novos usuários ficam automaticamente vinculados à sua conta.
                </p>
              )}
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
