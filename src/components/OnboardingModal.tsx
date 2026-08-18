import { useState } from "react";
import { useClinics } from "@/hooks/useClinics";
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
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { fetchSignInMethodsForEmail } from "firebase/auth";

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: (clinicId: string) => void;
}

export function OnboardingModal({ open, onClose, onComplete }: OnboardingModalProps) {
  const { createClinic, loading: clinicsLoading } = useClinics();
  const { createUser, loading: usersLoading } = useCRMUsers();

  // Clinic form
  const [newClinicName, setNewClinicName] = useState("");
  const [newClinicId, setNewClinicId] = useState("");
  const [newClinicAddress, setNewClinicAddress] = useState("");
  const [newClinicPhone, setNewClinicPhone] = useState("");
  const [newClinicColor, setNewClinicColor] = useState("#E6FFFA");
  const [newClinicModule, setNewClinicModule] = useState<"clinica" | "corretor">("clinica");

  // User form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const loading = clinicsLoading || usersLoading;
  const isCorretorModule = newClinicModule === "corretor";

  const resolveEmail = (input: string): string => {
    const trimmed = input.trim().toLowerCase();
    const atIndex = trimmed.indexOf("@");
    if (atIndex > 0 && trimmed.indexOf(".", atIndex) > atIndex) {
      return trimmed;
    }
    return `${trimmed}@redeleads.app`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (!newClinicName.trim()) {
      toast.error(isCorretorModule ? "Informe o nome do corretor" : "Informe o nome da clínica");
      return;
    }
    if (!username.trim()) {
      toast.error("Informe o usuário");
      return;
    }
    if (password.length < 6) {
      toast.error("Senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Senhas não conferem");
      return;
    }

    try {
      const email = resolveEmail(username);
      const methods = await fetchSignInMethodsForEmail(auth, email);
      if (methods.length > 0) {
        toast.error("Este usuário/e-mail já existe. Use outro login ou recupere a conta.");
        return;
      }

      // Create clinic first
      const clinic = await createClinic({
        id: newClinicId,
        name: newClinicName,
        address: newClinicAddress,
        phone: newClinicPhone,
        color: newClinicColor,
        module: newClinicModule,
      });

      // Create user with the new clinic
      await createUser(username, password, "admin", clinic.id, newClinicModule);

      toast.success(`${newClinicModule === "clinica" ? "Clínica" : "Corretor"} e usuário criados com sucesso!`);
      onComplete(clinic.id);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar cadastro. Verifique se o usuário já existe.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bem-vindo ao Rede Leads</DialogTitle>
          <DialogDescription>
            Crie sua conta e primeiro espaço para começar
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Clinic Info */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">
              {isCorretorModule ? "Informações do Corretor" : "Informações da Clínica"}
            </h4>
            <div className="space-y-2">
              <Label htmlFor="clinic-module">Tipo</Label>
              <select
                id="clinic-module"
                value={newClinicModule}
                onChange={(e) => setNewClinicModule(e.target.value as "clinica" | "corretor")}
                className="w-full bg-slate-700 border-slate-600 text-white rounded px-3 py-2"
              >
                <option value="clinica">Clínica (Padrão)</option>
                <option value="corretor">Corretor</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="clinic-name">{isCorretorModule ? "Nome do corretor *" : "Nome da clínica *"}</Label>
              <Input
                id="clinic-name"
                placeholder={isCorretorModule ? "ex: Henrique" : "ex: Nome da clínica"}
                value={newClinicName}
                onChange={(e) => setNewClinicName(e.target.value)}
                required
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clinic-id">{isCorretorModule ? "ID do corretor" : "ID da clínica"}</Label>
              <Input
                id="clinic-id"
                placeholder={isCorretorModule ? "ex: henrique-corretor" : "ex: odontocompany-ribeirao"}
                value={newClinicId}
                onChange={(e) => setNewClinicId(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
              />
              <p className="text-xs text-slate-400">Deixe em branco para gerar automaticamente</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="clinic-address">Endereço</Label>
              <Input
                id="clinic-address"
                placeholder="Rua, número, bairro, cidade"
                value={newClinicAddress}
                onChange={(e) => setNewClinicAddress(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clinic-phone">Telefone</Label>
              <Input
                id="clinic-phone"
                placeholder="(17) 99999-9999"
                value={newClinicPhone}
                onChange={(e) => setNewClinicPhone(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clinic-color">{isCorretorModule ? "Cor do painel" : "Cor da clínica"}</Label>
              <Input
                id="clinic-color"
                type="color"
                value={newClinicColor}
                onChange={(e) => setNewClinicColor(e.target.value)}
                className="h-10"
              />
            </div>
          </div>

          {/* User Info */}
          <div className="space-y-2 border-t pt-4">
            <h4 className="font-semibold text-sm">Sua conta (Admin)</h4>
            <div className="space-y-2">
              <Label htmlFor="username">Usuário ou E-mail *</Label>
              <Input
                id="username"
                placeholder="seu_usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                required
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha *</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar senha *</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700">
            {loading ? "Criando..." : isCorretorModule ? "Criar Corretor e Conta" : "Criar Clínica e Conta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
