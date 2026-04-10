import { useState } from "react";
import { CLINICAS, VOUCHERS, useCupons } from "@/hooks/useCupons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckSquare, Square, Briefcase, MapPin, User, Phone, Plus, Check, Building2 } from "lucide-react";

function maskPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

type Step = "login" | "captura";

interface Sessao {
  clinicaId: string;
  clinicaLabel: string;
  vendedor: string;
}

export default function VisitaComercial() {
  const [step, setStep] = useState<Step>("login");
  const [sessao, setSessao] = useState<Sessao | null>(null);

  // Login fields
  const [clinicaId, setClinicaId] = useState(CLINICAS[0].id);
  const [vendedor, setVendedor] = useState("");

  // Lead fields
  const [nome, setNome] = useState("");
  const [estabelecimento, setEstabelecimento] = useState("");
  const [telefone1, setTelefone1] = useState("");
  const [telefone2, setTelefone2] = useState("");
  const [selectedVouchers, setSelectedVouchers] = useState<string[]>([]);
  const [briefing, setBriefing] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const { cupons, addCupom } = useCupons(sessao?.clinicaId ?? null);
  const visitasHoje = cupons.filter((c) => c.tipo === "visita");

  const handleComeçar = () => {
    if (!vendedor.trim()) { toast.error("Informe seu nome"); return; }
    setSessao({
      clinicaId,
      clinicaLabel: CLINICAS.find((c) => c.id === clinicaId)?.label ?? clinicaId,
      vendedor: vendedor.trim(),
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
    setEstabelecimento("");
    setTelefone1("");
    setTelefone2("");
    setSelectedVouchers([]);
    setBriefing("");
  };

  const handleAdicionar = async () => {
    if (!nome.trim()) { toast.error("Informe o nome"); return; }
    if (!telefone1.trim()) { toast.error("Informe o telefone"); return; }
    if (selectedVouchers.length === 0) { toast.error("Selecione pelo menos um voucher"); return; }
    if (!sessao) return;

    setSaving(true);
    try {
      if (!estabelecimento.trim()) { toast.error("Informe o estabelecimento"); setSaving(false); return; }
      const data: Parameters<typeof addCupom>[1] = {
        tipo: "visita",
        clinicaId: sessao.clinicaId,
        nome: nome.trim(),
        telefone1: telefone1.replace(/\D/g, ""),
        vouchers: selectedVouchers,
        local: estabelecimento.trim(),
        abordadora: sessao.vendedor,
      };
      const tel2 = telefone2.replace(/\D/g, "");
      if (tel2) data.telefone2 = tel2;
      if (briefing.trim()) data.briefing = briefing.trim();
      await addCupom(sessao.clinicaId, data);
      setLastAdded(nome.trim());
      resetForm();
      toast.success(`✅ ${nome.trim()} adicionado!`);
    } catch (e) {
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  if (step === "login") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-5">
          <div className="text-center space-y-1">
            <div className="flex justify-center mb-2">
              <div className="bg-emerald-100 p-3 rounded-full">
                <Briefcase className="h-8 w-8 text-emerald-700" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Visita Comercial</h1>
            <p className="text-sm text-gray-500">Odontocompany</p>
          </div>

          {/* Clínica */}
          <div className="space-y-1.5">
            <Label>Clínica</Label>
            <select
              value={clinicaId}
              onChange={(e) => setClinicaId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {CLINICAS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Vendedor */}
          <div className="space-y-1.5">
            <Label>Seu nome</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={vendedor}
                onChange={(e) => setVendedor(e.target.value)}
                placeholder="Nome do vendedor"
                className="pl-9"
              />
            </div>
          </div>

          <Button className="w-full text-base py-5 bg-emerald-600 hover:bg-emerald-700" onClick={handleComeçar}>
            Começar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 flex flex-col items-center p-4 pb-10">
      {/* Header sessão */}
      <div className="w-full max-w-sm mt-4 mb-4 bg-white/10 backdrop-blur rounded-xl px-4 py-3 flex items-center justify-between">
        <div className="text-white text-sm">
          <div className="font-semibold">{sessao?.vendedor}</div>
          <div className="text-white/70 text-xs">{sessao?.clinicaLabel.replace("Odontocompany ", "")}</div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-white">{visitasHoje.length}</div>
          <div className="text-white/70 text-xs">leads hoje</div>
        </div>
      </div>

      {/* Feedback último adicionado */}
      {lastAdded && (
        <div className="w-full max-w-sm mb-3 flex items-center gap-2 bg-green-500/20 border border-green-400/30 rounded-lg px-3 py-2">
          <Check className="h-4 w-4 text-green-300 shrink-0" />
          <span className="text-green-200 text-sm"><strong>{lastAdded}</strong> salvo!</span>
        </div>
      )}

      {/* Formulário */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 space-y-4">
        <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">
          <Plus className="h-4 w-4 text-emerald-600" /> Novo Lead
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

        {/* Estabelecimento */}
        <div className="space-y-1.5">
          <Label>Estabelecimento</Label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={estabelecimento}
              onChange={(e) => setEstabelecimento(e.target.value)}
              placeholder="Ex: Empresa X, Comércio Y..."
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
              onChange={(e) => setTelefone1(maskPhone(e.target.value))}
              placeholder="(17) 99999-0000"
              className="pl-9"
              type="tel"
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Telefone 02 <span className="text-gray-400 font-normal">(opcional)</span></Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={telefone2}
              onChange={(e) => setTelefone2(maskPhone(e.target.value))}
              placeholder="(17) 99999-0000"
              className="pl-9"
              type="tel"
              inputMode="numeric"
            />
          </div>
        </div>

        {/* Vouchers */}
        <div className="space-y-2">
          <Label>Voucher(s) de interesse</Label>
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
                      ? "bg-emerald-50 border-emerald-400 text-emerald-800"
                      : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {checked
                    ? <CheckSquare className="h-4 w-4 text-emerald-600 shrink-0" />
                    : <Square className="h-4 w-4 text-gray-400 shrink-0" />
                  }
                  {v}
                </button>
              );
            })}
          </div>
        </div>

        {/* Briefing */}
        <div className="space-y-1.5">
          <Label>
            Briefing <span className="text-gray-400 font-normal">(observações para a clínica)</span>
          </Label>
          <Textarea
            value={briefing}
            onChange={(e) => setBriefing(e.target.value)}
            placeholder="Ex: Cliente interessado, pediu para ligar após as 18h, esposa também tem interesse..."
            className="min-h-[80px] text-sm resize-none"
          />
        </div>

        <Button
          className="w-full py-5 text-base bg-emerald-600 hover:bg-emerald-700"
          onClick={handleAdicionar}
          disabled={saving}
        >
          {saving ? "Salvando..." : "+ Adicionar Lead"}
        </Button>
      </div>

      {/* Trocar estabelecimento */}
      <button
        onClick={() => { setStep("login"); setSessao(null); resetForm(); setLastAdded(null); }}
        className="mt-6 text-white/50 text-xs underline"
      >
        Reiniciar sessão
      </button>
    </div>
  );
}
