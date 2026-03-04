import { useState } from "react";
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
import { LogOut, LogIn } from "lucide-react";
import { toast } from "sonner";

export function AuthComponent() {
  const { user, login, logout, register, error } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [open, setOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Converter username em email válido para Firebase Auth
      const email = `${username.toLowerCase()}@redeleads.app`;
      
      if (isRegistering) {
        await register(email, password);
        toast.success(`Usuário "${username}" criado com sucesso!`);
      } else {
        await login(email, password);
        toast.success(`Bem-vindo, ${username}!`);
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
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">@{displayName}</span>
        <Button variant="ghost" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4 mr-1" />
          Sair
        </Button>
      </div>
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
            <Label htmlFor="username">Usuário</Label>
            <Input
              id="username"
              type="text"
              placeholder="seu_usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
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
