import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdminPanel } from "@/components/crm/AdminPanel";
import { ChevronDown, LogOut, LogIn, Settings, Settings2, UserRound } from "lucide-react";
import { toast } from "sonner";

export function AuthComponent({ canShowAdminControls = false }: { canShowAdminControls?: boolean }) {
  const { user, login, logout, register, error, selectedClinic } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [open, setOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const resolveEmail = (input: string): string => {
    const trimmed = input.trim().toLowerCase();
    const atIndex = trimmed.indexOf("@");
    if (atIndex > 0 && trimmed.indexOf(".", atIndex) > atIndex) {
      return trimmed;
    }
    const clean = trimmed.replace(/[^a-z0-9_-]/g, "");
    return `${clean}@redeleads.app`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = resolveEmail(username);
    if (!email) {
      toast.error("Usuário inválido.");
      return;
    }
    const displayName = username.trim().split("@")[0];
    try {
      if (isRegistering) {
        await register(email, password);
        toast.success(`Usuário "${displayName}" criado com sucesso!`);
      } else {
        await login(email, password, selectedClinic);
        toast.success(`Bem-vindo, ${displayName}!`);
      }
      setUsername("");
      setPassword("");
      setOpen(false);
    } catch (err) {
      toast.error(error || "Erro ao autenticar");
    }
  };

  if (user) {
    const displayName = user.email?.split("@")[0] || user.email || "Usuário";
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 gap-2 px-2" aria-label="Abrir menu da conta">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound className="h-4 w-4" />
              </span>
              <span className="hidden lg:inline">Conta</span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <div className="text-sm font-medium text-foreground">Minha conta</div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">@{displayName}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {canShowAdminControls && (
              <DropdownMenuItem onSelect={() => setAdminOpen(true)}>
                <Settings className="mr-2 h-4 w-4" />
                Administração
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link to="/whatsapp-agent" aria-label="Abrir configurações do agente WhatsApp">
                <Settings2 className="mr-2 h-4 w-4" />
                Agente do WhatsApp
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {canShowAdminControls && (
          <AdminPanel open={adminOpen} onOpenChange={setAdminOpen} hideTrigger />
        )}
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <LogIn className="h-4 w-4 mr-1" />
          Login
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isRegistering ? "Criar Usuário" : "Login"}</DialogTitle>
          <DialogDescription>
            {isRegistering
              ? "Crie seu usuário para sincronizar dados com a nuvem"
              : "Faça login para sincronizar seus dados com a nuvem"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Usuário ou E-mail</Label>
            <Input
              id="username"
              type="text"
              placeholder="usuario ou email@gmail.com"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              {isRegistering ? "Criar Usuário" : "Login"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setIsRegistering(!isRegistering)}
            >
              {isRegistering ? "Já tem usuário?" : "Criar usuário"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
