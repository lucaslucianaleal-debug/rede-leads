import { useState, useEffect, useRef } from "react";
import { Lead, LeadStage, LeadStatus, LeadResposta, LeadComparecimento } from "@/types/crm";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { maskPhone, isValidPhone } from "@/lib/phone";
import { useLeads } from "@/hooks/useLeads";
import { useClinics } from "@/hooks/useClinics";
import { normalizePhoneTo10Digits } from "@/lib/phone";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { fetchActiveCampaignList } from "@/services/campaignService";
import { addCustomService, CORRETOR_SERVICE_LIBRARY, isCorretorProfile, removeCustomService, resolveServiceOptions } from '@/lib/serviceCatalog';

interface CreateLeadDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (lead: Omit<Lead, 'id'>) => void;
  onOpenCall?: (phone: string) => void;
}

const ETAPAS: LeadStage[] = [
  "Novo", "Em contato",
  "Follow-Up 1", "Follow-Up 2", "Follow-Up 3", "Follow-Up 4",
  "Follow-Up 5", "Follow-Up 6", "Follow-Up 7", "Follow-Up 8",
  "Follow-Up 9", "Follow-Up 10", "Follow-Up 11", "Follow-Up 12",
  "Avaliação agendada", "Fora da região", "Desistência", "Finalizado",
];

const FONTES = ["Online", "Google", "Sorteio Radio", "Site", "Indicação", "Promotora", "Hotleads", "Outro"];

const STATUSES: LeadStatus[] = ["QUENTE", "MORNO", "FRIO"];

const RESPOSTAS: LeadResposta[] = ["RESPONDEU", "NÃO RESPONDEU"];

const COMPARECIMENTOS: LeadComparecimento[] = ["COMPARECEU", "NÃO COMPARECEU", "AGUARDANDO DATA"];

export function CreateLeadDialog({ open, onClose, onSave, onOpenCall }: CreateLeadDialogProps) {
  const { allLeads } = useLeads();
  const { currentClinic, selectedClinic, clinicMeta, userProfile } = useAuth();
  const clinicId = currentClinic || selectedClinic || "";
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const fetchedClinic = useRef("");
  const [duplicateWarning, setDuplicateWarning] = useState<{ nome: string; etapa: string } | null>(null);
  const [form, setForm] = useState<Omit<Lead, 'id'>>({
    dataCriacao: format(new Date(), "dd/MM/yyyy"),
    dataContato: format(new Date(), "dd/MM/yyyy"),
    nome: "",
    telefone: "",
    servicoProcurado: "",
    captador: "",
    fonteLead: "Outro",
    etapaLead: "Novo",
    status: "",
    respostaLead: "",
    comparecimento: "",
    dataFollowUp: format(new Date(), "dd/MM/yyyy"), // Default hoje para aparecer na fila de follow-up
    dataAgendamento: "",
    dataRetornoLigacao: "",
    observacao: "",
    followUpCount: 0,
    lembretes: { h24: false, today: false },
    customFields: {},
  });

  const { clinics } = useClinics();
  const [dynamicFields, setDynamicFields] = useState<Record<string, any> | null>(null);
  const [customServiceInput, setCustomServiceInput] = useState("");
  const [serviceOptions, setServiceOptions] = useState<string[]>([]);
  const [showServiceManager, setShowServiceManager] = useState(false);
  const currentClinicObj = clinics.find((c) => c.id === clinicId);
  const effectiveClinicContext = currentClinicObj
    ? {
        id: currentClinicObj.id,
        name: currentClinicObj.name,
        module: userProfile?.accountModule ?? currentClinicObj.module ?? (clinicMeta as any)?.module,
        services: currentClinicObj.customServices || [],
        customFields: currentClinicObj.customFields,
      }
    : {
        id: clinicId,
        name: (clinicMeta as any)?.name,
        module: userProfile?.accountModule ?? (clinicMeta as any)?.module,
        services: Array.isArray((clinicMeta as any)?.customServices) ? (clinicMeta as any).customServices : [],
        customFields: (clinicMeta as any)?.customFields,
      };
  const isCorretorContext = isCorretorProfile(effectiveClinicContext);

  useEffect(() => {
    if (!open || !clinicId) return;
    if (clinicId !== fetchedClinic.current) {
      fetchedClinic.current = clinicId;
    }
    fetchActiveCampaignList(clinicId).then(setCampaigns);

    const defaultCorretorFields: Record<string, any> = {
      endereco: { label: "Endereço", placeholder: "Rua, número, bairro, cidade" },
      creci: { label: "CRECI", placeholder: "Número do CRECI" },
    };

    const resolvedServices = resolveServiceOptions(effectiveClinicContext, currentClinicObj?.customServices || []);
    setServiceOptions(resolvedServices);

    const fields = currentClinicObj
      ? (currentClinicObj.customFields || (isCorretorContext ? defaultCorretorFields : null))
      : (isCorretorContext ? defaultCorretorFields : null);
    if (fields) {
      setDynamicFields(fields);
      setForm((f) => ({ ...f, customFields: { ...(f.customFields || {}), ...Object.keys(fields).reduce((acc, k) => ({ ...acc, [k]: "" }), {}) } }));
    } else {
      setDynamicFields(null);
    }
  }, [clinicId, open, clinics, clinicMeta, isCorretorContext]);

  useEffect(() => {
    if (!open) setShowServiceManager(false);
  }, [open]);

  const selectValue = (val: any) => (val === "" || val === undefined ? "none" : String(val));
  const fromSelect = (val: string) => (val === "none" ? "" : val);
  const set = (key: keyof typeof form, value: any) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const checkDuplicate = (phone: string) => {
    const norm = normalizePhoneTo10Digits(phone);
    if (!norm) { setDuplicateWarning(null); return; }
    const found = allLeads.find(l => normalizePhoneTo10Digits(l.telefone) === norm);
    setDuplicateWarning(found ? { nome: found.nome, etapa: found.etapaLead } : null);
  };

  const handleAddCustomService = async () => {
    const value = customServiceInput.trim();
    if (!value) return;

    const updated = addCustomService(serviceOptions, value);
    setServiceOptions(updated);
    setForm((f) => ({ ...f, servicoProcurado: value }));
    setCustomServiceInput("");

    if (isCorretorContext) {
      const nextServices = updated
        .filter((service) => service && service.trim())
        .filter((service) => !CORRETOR_SERVICE_LIBRARY.includes(service));
      try {
        const { doc, updateDoc } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        await updateDoc(doc(db, "clinics", clinicId), { customServices: nextServices });
      } catch {
        // no-op, the user can still use the service in the form
      }
    }
  };

  const handleRemoveCustomService = async (service: string) => {
    const next = removeCustomService(serviceOptions, service);
    setServiceOptions(next);
    if (form.servicoProcurado === service) {
      setForm((f) => ({ ...f, servicoProcurado: "" }));
    }

    if (isCorretorContext) {
      const nextServices = next.filter((service) => !CORRETOR_SERVICE_LIBRARY.includes(service));
      try {
        const { doc, updateDoc } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        await updateDoc(doc(db, "clinics", clinicId), { customServices: nextServices });
      } catch {
        // no-op
      }
    }
  };

  const handleSave = () => {
    if (!form.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (!form.telefone.trim()) {
      toast.error("Telefone é obrigatório");
      return;
    }
    if (!isValidPhone(form.telefone)) {
      toast.error("Telefone inválido — use o formato (XX) XXXXX-XXXX");
      return;
    }

    onSave(form);
    toast.success(`Lead "${form.nome}" criado com sucesso!`);
    
    // Abrir diálogo de ligação com o novo lead (após criar)
    if (onOpenCall) {
      onOpenCall(form.telefone);
    }
    
    // Reset form
    setForm({
      dataCriacao: format(new Date(), "dd/MM/yyyy"),
      dataContato: format(new Date(), "dd/MM/yyyy"),
      nome: "",
      telefone: "",
      servicoProcurado: "",
      captador: "",
      fonteLead: "Outro",
      etapaLead: "Novo",
      status: "",
      respostaLead: "",
      comparecimento: "",
      dataFollowUp: format(new Date(), "dd/MM/yyyy"),
      dataAgendamento: "",
      dataRetornoLigacao: "",
      observacao: "",
      followUpCount: 0,
      lembretes: { h24: false, today: false },
    });
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      handleSave();
    }
  };

  const dialogTitle = isCorretorContext ? "Criar Corretor" : "Criar Novo Lead";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <div className="text-xs text-muted-foreground mt-1">
            Preencha os campos abaixo para adicionar um novo {isCorretorContext ? "corretor" : "lead"}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          {/* Nome */}
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input
              value={form.nome || ""}
              onChange={(e) => set("nome", e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nome do contato"
            />
          </div>

          {/* Telefone */}
          <div className="space-y-1">
            <Label>Telefone *</Label>
            <Input
              value={form.telefone || ""}
              onChange={(e) => {
                const masked = maskPhone(e.target.value);
                set("telefone", masked);
                checkDuplicate(masked);
              }}
              onKeyDown={handleKeyDown}
              placeholder="(17) 99999-9999"
              className={duplicateWarning ? "border-yellow-400 focus-visible:ring-yellow-400" : ""}
            />
            {duplicateWarning && (
              <div className="flex items-center gap-1.5 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1.5 mt-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Telefone já cadastrado: <strong>{duplicateWarning.nome}</strong> ({duplicateWarning.etapa})</span>
              </div>
            )}
          </div>

          {/* Data de Criação */}
          <div className="space-y-1">
            <Label>Data de Criação</Label>
            <Input
              type="date"
              value={form.dataCriacao?.split("/").reverse().join("-") || ""}
              onChange={(e) => {
                if (e.target.value) {
                  const [year, month, day] = e.target.value.split("-");
                  set("dataCriacao", `${day}/${month}/${year}`);
                }
              }}
            />
          </div>

          {/* Data de Contato */}
          <div className="space-y-1">
            <Label>Data de Contato</Label>
            <Input
              type="date"
              value={form.dataContato?.split("/").reverse().join("-") || ""}
              onChange={(e) => {
                if (e.target.value) {
                  const [year, month, day] = e.target.value.split("-");
                  set("dataContato", `${day}/${month}/${year}`);
                }
              }}
            />
          </div>

          {/* Serviço Procurado */}
          <div className="space-y-1">
            <Label>Serviço Procurado</Label>
            <Select value={selectValue(form.servicoProcurado)} onValueChange={(v) => set("servicoProcurado", fromSelect(v))}>
              <SelectTrigger><SelectValue placeholder={isCorretorContext ? "Digite ou selecione um serviço" : "Selecione um serviço"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {serviceOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {isCorretorContext && (
              <div className="mt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1 text-xs text-slate-600 hover:text-slate-900"
                  onClick={() => setShowServiceManager((visible) => !visible)}
                >
                  {showServiceManager ? "Fechar serviços" : "Gerenciar serviços"}
                </Button>
                {showServiceManager && (
              <div className="space-y-2 mt-1 rounded-md border border-dashed border-slate-300 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-600">Serviços do corretor</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {serviceOptions.length === 0 ? (
                    <span className="text-xs text-slate-500">Nenhum serviço cadastrado ainda.</span>
                  ) : (
                    serviceOptions.map((service) => (
                      <span key={service} className="inline-flex items-center gap-1 rounded-full border bg-slate-100 px-2 py-1 text-xs text-slate-700">
                        {service}
                        <button
                          type="button"
                          className="ml-1 text-red-500 hover:text-red-700"
                          onClick={() => handleRemoveCustomService(service)}
                          aria-label={`Excluir serviço ${service}`}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={customServiceInput}
                    onChange={(e) => setCustomServiceInput(e.target.value)}
                    placeholder="Adicionar serviço personalizado"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCustomService();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={handleAddCustomService}>Adicionar</Button>
                </div>
              </div>
                )}
              </div>
            )}
          </div>

          {/* Captador */}
          <div className="space-y-1">
            <Label>Captador</Label>
            <Input
              value={form.captador || ""}
              onChange={(e) => set("captador", e.target.value)}
              placeholder="Quem captou o lead"
            />
          </div>

          {/* Fonte */}
          <div className="space-y-1">
            <Label>Fonte</Label>
            <Select value={selectValue(form.fonteLead)} onValueChange={(v) => set("fonteLead", fromSelect(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONTES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Campanha Meta Ads */}
          {/* Campanha Meta Ads */}
          <div className="space-y-1">
            <Label>Campanha Meta Ads</Label>
            <Select
              value={form.metaCampanhaId || "none"}
              onValueChange={(v) => {
                if (v === "none") {
                  set("metaCampanhaId", "");
                  set("metaCampanhaNome", "");
                } else {
                  const c = campaigns.find(c => c.id === v);
                  set("metaCampanhaId", v);
                  set("metaCampanhaNome", c?.name || "");
                }
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Nenhuma</SelectItem>
                {campaigns.length > 0 ? campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>) : <SelectItem value="_disabled" disabled>Nenhuma campanha ativa</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {/* Etapa */}
          <div className="space-y-1">
            <Label>Etapa</Label>
            <Select value={selectValue(form.etapaLead)} onValueChange={(v) => set("etapaLead", fromSelect(v) as LeadStage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ETAPAS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={selectValue(form.status)} onValueChange={(v) => set("status", fromSelect(v) as LeadStatus)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Resposta */}
          <div className="space-y-1">
            <Label>Resposta</Label>
            <Select value={selectValue(form.respostaLead)} onValueChange={(v) => set("respostaLead", fromSelect(v) as LeadResposta)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {RESPOSTAS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Comparecimento */}
          <div className="space-y-1">
            <Label>Comparecimento</Label>
            <Select value={selectValue(form.comparecimento)} onValueChange={(v) => set("comparecimento", fromSelect(v) as LeadComparecimento)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {COMPARECIMENTOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Observação */}
          <div className="space-y-1 col-span-2">
            <Label>Observação</Label>
            <Textarea
              value={form.observacao || ""}
              onChange={(e) => set("observacao", e.target.value)}
              rows={2}
              placeholder="Notas sobre o lead"
            />
          </div>

          {/* Dynamic custom fields from clinic */}
          {dynamicFields && Object.keys(dynamicFields).length > 0 && (
            <div className="col-span-2 border-t pt-3 space-y-3">
              <h4 className="text-sm font-semibold">Informações adicionais</h4>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(dynamicFields).map(([key, def]) => {
                  const label = typeof def === "string" ? key : def.label || key;
                  const type = typeof def === "string" ? "text" : def.type || "text";
                  return (
                    <div className="space-y-1" key={key}>
                      <Label>{label}</Label>
                      <Input
                        value={(form.customFields && form.customFields[key]) || ""}
                        onChange={(e) => set("customFields", { ...(form.customFields || {}), [key]: e.target.value })}
                        placeholder={typeof def === "string" ? def : (def.placeholder || "")}
                        type={type === "number" ? "number" : "text"}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave}>Criar e Ligar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
