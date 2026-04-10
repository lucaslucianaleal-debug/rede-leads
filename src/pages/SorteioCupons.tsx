import { useState } from "react";
import { CLINICAS, VOUCHERS, useCupons } from "@/hooks/useCupons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckSquare, Square, Trophy, MapPin, User, Phone, Plus, Check } from "lucide-react";

type Step = "login" | "captura";

interface Sessao {
  clinicaId: string;
  clinicaLabel: string;
  abordadora: string;
  local: string;
}

export default function SorteioCupons() {
  const [step, setStep] = useState<Step>("login");
  const [sessao, setSessao] = useState<Sessao | null>(null);

  // Login fields
  const [clinicaId, setClinicaId] = useState(CLINICAS[0].id);
  const [abordadora, setAbordadora] = useState("");
  const [local, setLocal] = useState("");

  // Cupom fields
  const [nome, setNome] = useState("");
  const [telefone1, setTelefone1] = useState("");
  const [telefone2, setTelefone2] = useState("");
  const [selectedVouchers, setSelectedVouchers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  // Contador em tempo real
  const { cupons, addCupom } = useCupons(sessao?.clinicaId ?? null);
  const hoje = new Date().toLocaleDateString("pt-BR");
  const cuponHoje = cupons.filter((c) => c.dataCupom?.startsWith(hoje.split("/").reverse().join("/").slice(0,10)) || c.dataCupom?.startsWith(hoje));

  const handleComençar = () => {
    if (!abordadora.trim()) { toast.error("Informe seu nome"); return; }
    if (!local.trim()) { toast.error("Informe o local"); return; }
    setSessao({
      clinicaId,
      clinicaLabel: CLINICAS.find((c) => c.id === clinicaId)?.label ?? clinicaId,
      abordadora: abordadora.trim(),
      local: local.trim(),
    });
    setStep("captura");
  };

  const toggleVoucher = (v: string) => {
    setSelectedVouchers((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
  };

  const resetForm = () => {
    setNome("");
    setTelefone1("");
    setTelefone2("");
    setSelectedVouchers([]);
  };

  const handleAdicionarCupom = async () => {
    if (!nome.trim()) { toast.error("Informe o nome"); return; }
    if (!telefone1.trim()) { toast.error("Informe o telefone"); return; }
    if (selectedVouchers.length === 0) { toast.error("Selecione pelo menos um voucher"); return; }
    if (!sessao) return;

    setSaving(true);
    try {
      await addCupom(sessao.clinicaId, {
        clinicaId: sessao.clinicaId,
        nome: nome.trim(),
        telefone1: telefone1.trim(),
        telefone2: telefone2.trim() || undefined,
        vouchers: selectedVouchers,
        local: sessao.local,
        abordadora: sessao.abordadora,
      });
      setLastAdded(nome.trim());
      resetForm();
      toast.success(`✅ Cupom de ${nome.trim()} adicionado!`);
    } catch (e) {
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  if (step === "login") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-5">
          {/* Header */}
          <div className="text-center space-y-1">
            <div className="flex justify-center mb-2">
              <div className="bg-blue-100 p-3 rounded-full">
                <Trophy className="h-8 w-8 text-blue-700" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Cupom de Sorteio</h1>
            <p className="text-sm text-gray-500">Odontocompany</p>
          </div>

          {/* Clínica */}
          <div className="space-y-1.5">
            <Label>Clínica</Label>
            <select
              value={clinicaId}
              onChange={(e) => setClinicaId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CLINICAS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Abordadora */}
          <div className="space-y-1.5">
            <Label>Seu nome</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={abordadora}
                onChange={(e) => setAbordadora(e.target.value)}
                placeholder="Nome da abordadora"
                className="pl-9"
              />
            </div>
          </div>

          {/* Local */}
          <div className="space-y-1.5">
            <Label>Local de abordagem</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Ex: Praça Central, Shopping..."
                className="pl-9"
              />
            </div>
          </div>

          <Button className="w-full text-base py-5" onClick={handleComençar}>
            Começar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex flex-col items-center p-4 pb-10">
      {/* Header sessão */}
      <div className="w-full max-w-sm mt-4 mb-4 bg-white/10 backdrop-blur rounded-xl px-4 py-3 flex items-center justify-between">
        <div className="text-white text-sm">
          <div className="font-semibold">{sessao?.abordadora}</div>
          <div className="text-white/70 text-xs flex items-center gap-1">
            <MapPin className="h-3 w-3" />{sessao?.local} · {sessao?.clinicaLabel.replace("Odontocompany ", "")}
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-white">{cupons.length}</div>
          <div className="text-white/70 text-xs">cupons hoje</div>
        </div>
      </div>

      {/* Feedback último adicionado */}
      {lastAdded && (
        <div className="w-full max-w-sm mb-3 flex items-center gap-2 bg-green-500/20 border border-green-400/30 rounded-lg px-3 py-2">
          <Check className="h-4 w-4 text-green-300 shrink-0" />
          <span className="text-green-200 text-sm">Cupom de <strong>{lastAdded}</strong> salvo!</span>
        </div>
      )}

      {/* Formulário */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 space-y-4">
        <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">
          <Plus className="h-4 w-4 text-blue-600" /> Novo Cupom
        </h2>

        {/* Nome */}
        <div className="space-y-1.5">
          <Label>Nome</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
              className="pl-9"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Telefones */}
        <div className="space-y-1.5">
          <Label>Telefone 01</Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={telefone1}
              onChange={(e) => setTelefone1(e.target.value)}
              placeholder="(17) 99999-0000"
              className="pl-9"
              type="tel"
              inputMode="tel"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Telefone 02 <span className="text-gray-400 font-normal">(opcional)</span></Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={telefone2}
              onChange={(e) => setTelefone2(e.target.value)}
              placeholder="(17) 99999-0000"
              className="pl-9"
              type="tel"
              inputMode="tel"
            />
          </div>
        </div>

        {/* Vouchers */}
        <div className="space-y-2">
          <Label>Voucher(s) escolhido(s)</Label>
          <div className="space-y-2">
            {VOUCHERS.map((v) => {
              const checked = selectedVouchers.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggleVoucher(v)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left text-sm transition-colors ${
                    checked
                      ? "bg-blue-50 border-blue-400 text-blue-800"
                      : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {checked
                    ? <CheckSquare className="h-4 w-4 text-blue-600 shrink-0" />
                    : <Square className="h-4 w-4 text-gray-400 shrink-0" />
                  }
                  {v}
                </button>
              );
            })}
          </div>
        </div>

        <Button
          className="w-full py-5 text-base"
          onClick={handleAdicionarCupom}
          disabled={saving}
        >
          {saving ? "Salvando..." : "+ Adicionar Cupom"}
        </Button>
      </div>

      {/* Encerrar sessão */}
      <button
        onClick={() => { setStep("login"); setSessao(null); resetForm(); setLastAdded(null); }}
        className="mt-6 text-white/50 text-xs underline"
      >
        Encerrar sessão
      </button>
    </div>
  );
}
