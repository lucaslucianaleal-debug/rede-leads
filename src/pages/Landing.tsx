import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, BarChart3, Bell, Lock } from "lucide-react";
import { toast } from "sonner";

export default function Landing() {
  const { login, error } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const resolveEmail = (input: string): string => {
    const trimmed = input.trim().toLowerCase();
    const atIndex = trimmed.indexOf("@");
    if (atIndex > 0 && trimmed.indexOf(".", atIndex) > atIndex) {
      return trimmed;
    }
    const clean = trimmed.replace(/[^a-z0-9_\-]/g, "");
    return `${clean}@redeleads.app`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = resolveEmail(username);
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Bem-vindo!");
    } catch {
      toast.error(error || "Usuário ou senha incorretos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col">
      {/* Header */}
      <header className="px-8 py-6 flex items-center gap-3">
        <div className="bg-blue-500 rounded-lg p-2">
          <Activity className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Rede Leads</h1>
          <p className="text-xs text-blue-300">Central de Conversão de Leads</p>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          {/* Left: Info */}
          <div className="space-y-8">
            <div>
              <h2 className="text-4xl font-bold text-white leading-tight">
                Gerencie seus leads com
                <span className="text-blue-400"> inteligência</span>
              </h2>
              <p className="mt-4 text-slate-400 text-lg">
                CRM completo para acompanhar follow-ups, agendamentos e resultados da sua equipe comercial.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-blue-500/20 rounded-lg p-2">
                  <Users className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-white font-medium">Controle total de leads</p>
                  <p className="text-slate-400 text-sm">Importe, organize e acompanhe cada contato</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-green-500/20 rounded-lg p-2">
                  <BarChart3 className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-white font-medium">Relatórios em Excel</p>
                  <p className="text-slate-400 text-sm">Relatórios diários e semanais com um clique</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-yellow-500/20 rounded-lg p-2">
                  <Bell className="h-5 w-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-white font-medium">Fila de follow-up</p>
                  <p className="text-slate-400 text-sm">Nunca perca um contato importante</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Login Form */}
          <div>
            <Card className="border-slate-700 bg-slate-800/80 backdrop-blur shadow-2xl">
              <CardHeader className="text-center">
                <div className="mx-auto bg-blue-500/20 rounded-full p-3 w-fit mb-2">
                  <Lock className="h-6 w-6 text-blue-400" />
                </div>
                <CardTitle className="text-white text-2xl">Acesso Restrito</CardTitle>
                <CardDescription className="text-slate-400">
                  Entre com suas credenciais para acessar o CRM
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username" className="text-slate-300">Usuário ou E-mail</Label>
                    <Input
                      id="username"
                      type="text"
                      placeholder="usuario ou email@gmail.com"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-slate-300">Senha</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <Button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2"
                    disabled={loading}
                  >
                    {loading ? "Entrando..." : "Entrar"}
                  </Button>
                </form>
                <p className="mt-4 text-center text-xs text-slate-500">
                  Não tem acesso? Solicite ao administrador do sistema.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-8 py-4 text-center">
        <p className="text-slate-600 text-xs">
          © 2026 Rede Leads · Central de Conversão de Leads · WhatsApp: (17) 99115-4763
        </p>
      </footer>
    </div>
  );
}
