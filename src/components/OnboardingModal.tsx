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
  const [newClinicColor, setNewClinicColor] = useState("#E6FFFA");

  // User form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const loading = clinicsLoading || usersLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (!newClinicName.trim()) {
      toast.error("Informe o nome da clínica");
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
      // Create clinic first
      const clinic = await createClinic({
        id: newClinicId,
        name: newClinicName,
        address: newClinicAddress,
        color: newClinicColor,
      });

      // Create user with the new clinic
      await createUser(username, password, "admin", clinic.id);

      toast.success(`Clínica e usuário criados com sucesso!`);
      onComplete(clinic.id);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar clínica e usuário");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bem-vindo ao Rede Leads</DialogTitle>
          <DialogDescription>
            Crie sua clínica e primeira conta para começar
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Clinic Info */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Informações da Clínica</h4>
            <div className="space-y-2">
              <Label htmlFor="clinic-name">Nome da clínica *</Label>
              <Input
                id="clinic-name"
                placeholder="ex: Odontocompany"
                value={newClinicName}
                onChange={(e) => setNewClinicName(e.target.value)}
                required
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clinic-id">ID da clínica</Label>
              <Input
                id="clinic-id"
                placeholder="ex: odontocompany-ribeirao"
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
              <Label htmlFor="clinic-color">Cor da clínica</Label>
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
            {loading ? "Criando..." : "Criar Clínica e Conta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
