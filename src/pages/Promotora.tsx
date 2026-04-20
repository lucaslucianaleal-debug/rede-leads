import { useState, useEffect, useMemo } from "react";
import { CLINICAS, useCupons, startSessao, endSessao } from "@/hooks/useCupons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserCheck, MapPin, User, Phone, Plus, Check, List, AlertTriangle, LogOut, Clock, MessageSquare, Upload, X } from "lucide-react";

function maskPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const SESSION_KEY = "promotora_sessao";

interface SessaoLocal {
  clinicaId: string;
  clinicaLabel: string;
  abordadora: string;
  local: string;
  sessaoId: string;
  horaInicio: string;
}

type PageTab = "novo" | "meus";

export default function Promotora() {
  const [sessao, setSessao] = useState<SessaoLocal | null>(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const step = sessao ? "captura" : "login";

  // Login fields
  const [clinicaId, setClinicaId] = useState(CLINICAS[0].id);
  const [abordadora, setAbordadora] = useState("");
  const [local, setLocal] = useState("");

  // Contact fields
  const [nome, setNome] = useState("");
  const [telefone1, setTelefone1] = useState("");
  const [telefone2, setTelefone2] = useState("");
  const [observacao, setObservacao] = useState("");
  const [servicosSelecionados, setServicosSelecionados] = useState<string[]>([]);
  const SERVICOS_PROMOTORA = ["Avaliação", "Limpeza Profilaxia", "Clareamento", "Ortodontia", "Implante", "Outro"];
  const toggleServico = (s: string) => setServicosSelecionados((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  const [saving, setSaving] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [pageTab, setPageTab] = useState<PageTab>("novo");
  const [dupWarning, setDupWarning] = useState<string | null>(null);

  // Import modal state
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importPreview, setImportPreview] = useState<Array<{ nome: string; telefone: string; dup: boolean }> | null>(null);

  const { cupons, addCupom } = useCupons(sessao?.clinicaId ?? null);

  const meusContatos = useMemo(() =>
    cupons.filter((c) => c.tipo === "promotora" && c.abordadora === sessao?.abordadora),
    [cupons, sessao]
  );

  useEffect(() => {
    const digits = telefone1.replace(/\D/g, "");
    if (digits.length >= 10) {
      const found = cupons.find(
        (c) =>
          c.telefone1.replace(/\D/g, "") === digits ||
          (c.telefone2 || "").replace(/\D/g, "") === digits
      );
      setDupWarning(found ? `Já cadastrado: ${found.nome} (${found.dataCupom})` : null);
    } else {
      setDupWarning(null);
    }
  }, [telefone1, cupons]);

  const handleComeçar = async () => {
    if (!abordadora.trim()) { toast.error("Informe seu nome"); return; }
    if (!local.trim()) { toast.error("Informe o local"); return; }
    try {
      const sessaoId = await startSessao(clinicaId, abordadora.trim(), local.trim(), "promotora");
      const horaInicio = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const nova: SessaoLocal = {
        clinicaId,
        clinicaLabel: CLINICAS.find((c) => c.id === clinicaId)?.label ?? clinicaId,
        abordadora: abordadora.trim(),
        local: local.trim(),
        sessaoId,
        horaInicio,
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(nova));
      setSessao(nova);
    } catch {
      toast.error("Erro ao iniciar sessão. Tente novamente.");
    }
  };

  const handleEncerrar = async () => {
    if (!sessao) return;
    if (!window.confirm("Encerrar sua sessão? Você precisará fazer login novamente.")) return;
    try {
      await endSessao(sessao.clinicaId, sessao.sessaoId);
    } catch {}
    sessionStorage.removeItem(SESSION_KEY);
    setSessao(null);
    setNome(""); setTelefone1(""); setTelefone2(""); setObservacao(""); setLastAdded(null);
  };

  const resetForm = () => {
    setNome(""); setTelefone1(""); setTelefone2(""); setObservacao(""); setServicosSelecionados([]); setDupWarning(null);
  };

  const handleAdicionar = async () => {
    if (!nome.trim()) { toast.error("Informe o nome"); return; }
    if (!telefone1.trim()) { toast.error("Informe o telefone"); return; }
    if (!sessao) return;
    setSaving(true);
    try {
      const data: Parameters<typeof addCupom>[1] = {
        tipo: "promotora",
        clinicaId: sessao.clinicaId,
        nome: nome.trim(),
        telefone1: telefone1.replace(/\D/g, ""),
        vouchers: servicosSelecionados,
        local: sessao.local,
        abordadora: sessao.abordadora,
        briefing: observacao.trim() || undefined,
      };
      const tel2 = telefone2.replace(/\D/g, "");
      if (tel2) data.telefone2 = tel2;
      await addCupom(sessao.clinicaId, data);
      setLastAdded(nome.trim());
      resetForm();
      toast.success(`✅ ${nome.trim()} adicionado!`);
    } catch {
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const parseImportList = (text: string) => {
    const lines = text.split("\n").filter(l => l.trim());
    const parsed: Array<{ nome: string; telefone: string; dup: boolean }> = [];
    const existingPhones = new Set(
      cupons
        .filter(c => c.tipo === "promotora")
        .map(c => c.telefone1.replace(/\D/g, ""))
    );

    for (const line of lines) {
      const parts = line.split(" - ");
      if (parts.length >= 2) {
        const nome = parts[0].trim();
        const telefone = parts[1].trim().replace(/\D/g, "");
        if (nome && telefone && telefone.length >= 10) {
          const dup = existingPhones.has(telefone);
          parsed.push({ nome, telefone, dup });
          existingPhones.add(telefone);
        }
      }
    }
    return parsed;
  };

  const handleImportPreview = () => {
    const preview = parseImportList(importText);
    if (preview.length === 0) {
      toast.error("Nenhum contato válido encontrado. Formato: Nome - Telefone");
      return;
    }
    setImportPreview(preview);
  };

  const handleImportConfirm = async () => {
    if (!importPreview || importPreview.length === 0 || !sessao) return;
    setImportLoading(true);
    try {
      let successCount = 0;
      let skipCount = 0;
      for (const item of importPreview) {
        if (item.dup) {
          skipCount++;
          continue;
        }
        try {
          const data: Parameters<typeof addCupom>[1] = {
            tipo: "promotora",
            clinicaId: sessao.clinicaId,
            nome: item.nome,
            telefone1: item.telefone,
            vouchers: [],
            local: sessao.local,
            abordadora: sessao.abordadora,
          };
          await addCupom(sessao.clinicaId, data);
          successCount++;
        } catch (e) {
          console.error(`Erro ao importar ${item.nome}:`, e);
        }
      }
      toast.success(`✅ ${successCount} contato${successCount !== 1 ? "s" : ""} importado${successCount !== 1 ? "s" : ""}${skipCount > 0 ? ` (${skipCount} já existente${skipCount !== 1 ? "s" : ""})` : ""}!`);
      setImportOpen(false);
      setImportText("");
      setImportPreview(null);
    } catch (e) {
      toast.error("Erro na importação. Tente novamente.");
      console.error(e);
    } finally {
      setImportLoading(false);
    }
  };

  if (step === "login") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-900 via-rose-800 to-fuchsia-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-5">
          <div className="text-center space-y-1">
            <div className="flex justify-center mb-2">
              <div className="bg-pink-100 p-3 rounded-full">
                <UserCheck className="h-8 w-8 text-pink-700" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Promotora</h1>
            <p className="text-sm text-gray-500">Odontocompany</p>
          </div>

          <div className="space-y-1.5">
            <Label>Clínica</Label>
            <select
              value={clinicaId}
              onChange={(e) => setClinicaId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
            >
              {CLINICAS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Seu nome</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input value={abordadora} onChange={(e) => setAbordadora(e.target.value)} placeholder="Nome da promotora" className="pl-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Local de abordagem</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex: Praça Central, Shopping..." className="pl-9" />
            </div>
          </div>

          <Button className="w-full text-base py-5 bg-pink-700 hover:bg-pink-800" onClick={handleComeçar}>
            Começar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-900 via-rose-800 to-fuchsia-900 flex flex-col items-center p-4 pb-10">
      {/* Header sessão */}
      <div className="w-full max-w-sm mt-4 mb-4 bg-white/10 backdrop-blur rounded-xl px-4 py-3 flex items-center justify-between">
        <div className="text-white text-sm">
          <div className="font-semibold">{sessao?.abordadora}</div>
          <div className="text-white/70 text-xs flex items-center gap-1">
            <MapPin className="h-3 w-3" />{sessao?.local} · {sessao?.clinicaLabel.replace("Odontocompany ", "")}
          </div>
          <div className="text-white/50 text-xs flex items-center gap-1 mt-0.5">
            <Clock className="h-3 w-3" /> Início: {sessao?.horaInicio}
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-white">{meusContatos.length}</div>
          <div className="text-white/70 text-xs">meus contatos</div>
        </div>
      </div>

      {/* Abas */}
      <div className="w-full max-w-sm flex rounded-xl overflow-hidden mb-4 bg-white/10">
        <button
          onClick={() => setPageTab("novo")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${pageTab === "novo" ? "bg-white text-pink-800" : "text-white/70 hover:text-white"}`}
        >
          <Plus className="h-4 w-4" /> Novo
        </button>
        <button
          onClick={() => setPageTab("meus")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${pageTab === "meus" ? "bg-white text-pink-800" : "text-white/70 hover:text-white"}`}
        >
          <List className="h-4 w-4" /> Meus contatos {meusContatos.length > 0 && `(${meusContatos.length})`}
        </button>
      </div>

      {pageTab === "meus" ? (
        <div className="w-full max-w-sm space-y-2">
          {meusContatos.length === 0 ? (
            <div className="text-center text-white/60 py-10 text-sm">Nenhum contato adicionado ainda.</div>
          ) : (
            meusContatos.map((c) => (
              <div key={c.id} className="bg-white rounded-xl px-4 py-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-800 text-sm truncate">{c.nome}</div>
                    <div className="text-gray-500 text-xs">{c.telefone1}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-gray-400">{c.dataCupom?.slice(11)}</div>
                    <div className={`text-xs mt-0.5 font-medium ${c.status === "convertido" ? "text-green-600" : c.status === "ligado" ? "text-blue-600" : "text-yellow-600"}`}>
                      {c.status}
                    </div>
                  </div>
                </div>
                {c.briefing && (
                  <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1 flex items-start gap-1">
                    <MessageSquare className="h-3 w-3 shrink-0 mt-0.5 text-gray-400" />
                    <span className="line-clamp-2">{c.briefing}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          {lastAdded && (
            <div className="w-full max-w-sm mb-3 flex items-center gap-2 bg-green-500/20 border border-green-400/30 rounded-lg px-3 py-2">
              <Check className="h-4 w-4 text-green-300 shrink-0" />
              <span className="text-green-200 text-sm">Contato <strong>{lastAdded}</strong> salvo!</span>
            </div>
          )}

          <div className="w-full max-w-sm space-y-3">
            {/* Botão de importação em lote */}
            <button
              onClick={() => setImportOpen(true)}
              className="w-full bg-pink-700 hover:bg-pink-800 text-white rounded-2xl shadow-lg p-5 flex items-center justify-center gap-2 font-semibold transition-colors"
            >
              <Upload className="h-5 w-5" />
              Importar em lote
            </button>

            <div className="bg-white rounded-2xl shadow-2xl p-5 space-y-4">
              <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">
                <Plus className="h-4 w-4 text-pink-600" /> Novo Contato
              </h2>

            <div className="space-y-1.5">
              <Label>Nome</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" className="pl-9" autoComplete="off" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Telefone 01</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={telefone1}
                  onChange={(e) => setTelefone1(maskPhone(e.target.value))}
                  placeholder="(17) 99999-0000"
                  className={`pl-9 ${dupWarning ? "border-yellow-400 focus-visible:ring-yellow-400" : ""}`}
                  type="tel"
                  inputMode="numeric"
                />
              </div>
              {dupWarning && (
                <div className="flex items-start gap-1.5 text-xs text-yellow-700 bg-yellow-50 border border-yellow-300 rounded px-2.5 py-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{dupWarning}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Telefone 02 <span className="text-gray-400 font-normal">(opcional)</span></Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input value={telefone2} onChange={(e) => setTelefone2(maskPhone(e.target.value))} placeholder="(17) 99999-0000" className="pl-9" type="tel" inputMode="numeric" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Serviço de interesse <span className="text-gray-400 font-normal">(opcional)</span></Label>
              <div className="flex flex-wrap gap-2">
                {SERVICOS_PROMOTORA.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleServico(s)}
                    className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                      servicosSelecionados.includes(s)
                        ? "bg-pink-700 text-white border-pink-700"
                        : "bg-white text-gray-700 border-gray-300 hover:border-pink-400"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observação <span className="text-gray-400 font-normal">(opcional)</span></Label>
              <Textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: interessada em clareamento, perguntou sobre preço..."
                className="resize-none min-h-[80px] text-sm"
              />
            </div>

            <Button className="w-full py-5 text-base bg-pink-700 hover:bg-pink-800" onClick={handleAdicionar} disabled={saving}>
              {saving ? "Salvando..." : "+ Adicionar Contato"}
            </Button>
            </div>
          </div>
        </>
      )}

      {/* Encerrar sessão */}
      <button onClick={handleEncerrar} className="mt-6 flex items-center gap-1.5 text-white/50 text-xs hover:text-white/80 transition-colors">
        <LogOut className="h-3.5 w-3.5" /> Encerrar sessão
      </button>

      {/* Modal de importação em lote */}
      <Dialog open={importOpen} onOpenChange={(o) => {
        if (!o) {
          setImportOpen(false);
          setImportText("");
          setImportPreview(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-pink-600" />
              Importar contatos em lote
            </DialogTitle>
          </DialogHeader>

          {!importPreview ? (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
                <p className="font-medium mb-1">Formato esperado:</p>
                <p className="font-mono text-xs">Nome - Telefone</p>
                <p className="text-xs mt-1">Um contato por linha. Telefone pode ter qualquer formato.</p>
              </div>

              <div className="space-y-2">
                <Label>Cole a lista de contatos</Label>
                <Textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Murilo - promotora Julia&#10;17992362814&#10;Giovana - promotora Julia&#10;17992394259"
                  className="min-h-[200px] font-mono text-xs resize-none"
                />
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
                <Button onClick={handleImportPreview} className="bg-pink-700 hover:bg-pink-800">
                  Visualizar
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {importPreview.filter(p => !p.dup).length} contato{importPreview.filter(p => !p.dup).length !== 1 ? "s" : ""} a importar
                  {importPreview.filter(p => p.dup).length > 0 && (
                    <span className="text-yellow-600 ml-2">
                      ({importPreview.filter(p => p.dup).length} já existente{importPreview.filter(p => p.dup).length !== 1 ? "s" : ""})
                    </span>
                  )}
                </p>
                <div className="max-h-[300px] overflow-y-auto border rounded-lg divide-y bg-gray-50">
                  {importPreview.map((item, i) => (
                    <div
                      key={i}
                      className={`p-3 flex items-center justify-between text-sm ${
                        item.dup ? "bg-yellow-50 text-yellow-700" : "bg-white text-gray-700"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{item.nome}</div>
                        <div className="text-xs text-gray-500">{item.telefone}</div>
                      </div>
                      {item.dup && (
                        <span className="text-xs font-medium shrink-0 ml-2">Duplicado</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setImportPreview(null)}
                  disabled={importLoading}
                >
                  Voltar
                </Button>
                <Button
                  onClick={handleImportConfirm}
                  disabled={importLoading || importPreview.filter(p => !p.dup).length === 0}
                  className="bg-pink-700 hover:bg-pink-800"
                >
                  {importLoading ? "Importando..." : `Importar (${importPreview.filter(p => !p.dup).length})`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
