import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Lead, LeadComparecimento, LeadResposta, LeadStage, LeadStatus } from "@/types/crm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useClinics } from "@/hooks/useClinics";
import { fetchActiveCampaignList } from "@/services/campaignService";
import { CORRETOR_SERVICE_LIBRARY, isCorretorProfile, resolveServiceOptions } from "@/lib/serviceCatalog";
import { formatPhoneNumber, maskPhone } from "@/lib/phone";

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

type Draft = Omit<Lead, "id">;

type Props = {
  open: boolean;
  onClose: () => void;
  initialName?: string;
  initialPhone?: string;
  initialCampaignId?: string;
  initialCampaignName?: string;
  initialSource?: string;
  contextText?: string;
  onSave: (lead: Draft, campaignId: string, campaignName: string) => Promise<void> | void;
};

function defaultDraft(): Draft {
  const today = format(new Date(), "dd/MM/yyyy");
  return {
    dataCriacao: today,
    dataContato: today,
    nome: "",
    telefone: "",
    servicoProcurado: "",
    captador: "",
    fonteLead: "Online",
    etapaLead: "Novo",
    status: "MORNO",
    respostaLead: "RESPONDEU",
    comparecimento: "",
    dataFollowUp: today,
    dataAgendamento: "",
    dataRetornoLigacao: "",
    observacao: "",
    followUpCount: 0,
    lembretes: { h24: false, today: false },
    customFields: {},
  };
}

function dateToInput(value?: string) {
  const parts = String(value || "").split("/");
  if (parts.length !== 3) return "";
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function inputToDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function inferDentalService(text: string, options: string[]) {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const keywordGroups = [
    ["implante"],
    ["ortodont", "aparelho"],
    ["clareamento"],
    ["protese", "dentadura"],
    ["faceta", "lente"],
    ["canal", "endodont"],
    ["infantil", "crianca", "odontopedi"],
  ];

  for (const keywords of keywordGroups) {
    if (!keywords.some((keyword) => normalized.includes(keyword))) continue;
    const match = options.find((option) => {
      const value = option.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      return keywords.some((keyword) => value.includes(keyword));
    });
    if (match) return match;
  }
  return "";
}

export function WhatsAppLeadRegistrationDialog({
  open,
  onClose,
  initialName = "",
  initialPhone = "",
  initialCampaignId = "",
  initialCampaignName = "",
  initialSource = "Online",
  contextText = "",
  onSave,
}: Props) {
  const { currentClinic, selectedClinic, clinicMeta, userProfile } = useAuth();
  const { clinics } = useClinics();
  const clinicId = currentClinic || selectedClinic || "";
  const [form, setForm] = useState<Draft>(defaultDraft());
  const [campaignId, setCampaignId] = useState("");
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const currentClinicObj = clinics.find((clinic) => clinic.id === clinicId);
  const effectiveClinicContext = useMemo(() => currentClinicObj
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
      }, [currentClinicObj, userProfile?.accountModule, clinicMeta, clinicId]);

  const isCorretorContext = isCorretorProfile(effectiveClinicContext);
  const serviceOptions = useMemo(() => {
    const resolved = resolveServiceOptions(effectiveClinicContext, currentClinicObj?.customServices || []);
    if (isCorretorContext) return resolved;
    return resolved.filter((service) => !CORRETOR_SERVICE_LIBRARY.includes(service));
  }, [effectiveClinicContext, currentClinicObj?.customServices, isCorretorContext]);

  useEffect(() => {
    if (!open) return;
    const next = defaultDraft();
    const suggestedService = inferDentalService(`${initialCampaignName} ${contextText}`, serviceOptions);
    next.nome = initialName;
    next.telefone = formatPhoneNumber(initialPhone);
    next.fonteLead = initialSource || "Online";
    next.servicoProcurado = suggestedService;
    next.observacao = "Primeiro contato recebido pelo WhatsApp";
    setForm(next);
    setCampaignId(initialCampaignId);
    setSaving(false);
  }, [open, initialName, initialPhone, initialSource, initialCampaignId, initialCampaignName, contextText, serviceOptions]);

  useEffect(() => {
    if (!open || !clinicId) return;
    fetchActiveCampaignList(clinicId).then(setCampaigns).catch(() => setCampaigns([]));
  }, [open, clinicId]);

  const set = (key: keyof Draft, value: any) => setForm((current) => ({ ...current, [key]: value }));
  const selectValue = (value: unknown) => value ? String(value) : "none";
  const fromSelect = (value: string) => value === "none" ? "" : value;

  const handleSave = async () => {
    if (!form.nome.trim() || !form.telefone.trim()) return;
    setSaving(true);
    try {
      const campaignName = campaigns.find((item) => item.id === campaignId)?.name || initialCampaignName || "";
      await onSave(form, campaignId, campaignName);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Novo Lead</DialogTitle>
          <div className="text-xs text-muted-foreground mt-1">Cadastro completo a partir da conversa do WhatsApp.</div>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input value={form.nome || ""} onChange={(event) => set("nome", event.target.value)} placeholder="Nome do contato" />
          </div>
          <div className="space-y-1">
            <Label>Telefone *</Label>
            <Input value={form.telefone || ""} onChange={(event) => set("telefone", maskPhone(event.target.value))} placeholder="(17) 99999-9999" />
          </div>

          <div className="space-y-1">
            <Label>Data de Criação</Label>
            <Input type="date" value={dateToInput(form.dataCriacao)} onChange={(event) => set("dataCriacao", inputToDate(event.target.value))} />
          </div>
          <div className="space-y-1">
            <Label>Data de Contato</Label>
            <Input type="date" value={dateToInput(form.dataContato)} onChange={(event) => set("dataContato", inputToDate(event.target.value))} />
          </div>

          <div className="space-y-1">
            <Label>Serviço Procurado</Label>
            <Select value={selectValue(form.servicoProcurado)} onValueChange={(value) => set("servicoProcurado", fromSelect(value))}>
              <SelectTrigger><SelectValue placeholder="Selecione um serviço da clínica" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {serviceOptions.map((service) => <SelectItem key={service} value={service}>{service}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Serviços da clínica selecionada — sem misturar o catálogo de corretor.</p>
          </div>
          <div className="space-y-1">
            <Label>Captador</Label>
            <Input value={form.captador || ""} onChange={(event) => set("captador", event.target.value)} placeholder="Quem captou o lead" />
          </div>

          <div className="space-y-1">
            <Label>Fonte</Label>
            <Select value={selectValue(form.fonteLead)} onValueChange={(value) => set("fonteLead", fromSelect(value))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FONTES.map((source) => <SelectItem key={source} value={source}>{source}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Campanha Meta Ads</Label>
            <Select value={campaignId || "none"} onValueChange={(value) => setCampaignId(value === "none" ? "" : value)}>
              <SelectTrigger><SelectValue placeholder="— Nenhuma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Nenhuma</SelectItem>
                {initialCampaignId && initialCampaignName && !campaigns.some((item) => item.id === initialCampaignId) && (
                  <SelectItem value={initialCampaignId}>{initialCampaignName}</SelectItem>
                )}
                {campaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Etapa</Label>
            <Select value={selectValue(form.etapaLead)} onValueChange={(value) => set("etapaLead", fromSelect(value))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ETAPAS.map((stage) => <SelectItem key={stage} value={stage}>{stage}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={selectValue(form.status)} onValueChange={(value) => set("status", fromSelect(value))}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Resposta</Label>
            <Select value={selectValue(form.respostaLead)} onValueChange={(value) => set("respostaLead", fromSelect(value))}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {RESPOSTAS.map((answer) => <SelectItem key={answer} value={answer}>{answer}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Comparecimento</Label>
            <Select value={selectValue(form.comparecimento)} onValueChange={(value) => set("comparecimento", fromSelect(value))}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {COMPARECIMENTOS.map((attendance) => <SelectItem key={attendance} value={attendance}>{attendance}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Data de Follow-Up</Label>
            <Input type="date" value={dateToInput(form.dataFollowUp)} onChange={(event) => set("dataFollowUp", inputToDate(event.target.value))} />
          </div>
          <div className="space-y-1">
            <Label>Data de Agendamento</Label>
            <Input type="date" value={dateToInput(form.dataAgendamento)} onChange={(event) => set("dataAgendamento", inputToDate(event.target.value))} />
          </div>

          <div className="space-y-1">
            <Label>Retorno de Ligação</Label>
            <Input type="date" value={dateToInput(form.dataRetornoLigacao)} onChange={(event) => set("dataRetornoLigacao", inputToDate(event.target.value))} />
          </div>
          <div className="space-y-1" />

          <div className="space-y-1 sm:col-span-2">
            <Label>Observação</Label>
            <Textarea value={form.observacao || ""} onChange={(event) => set("observacao", event.target.value)} rows={3} placeholder="Observações do atendimento" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !form.nome.trim() || !form.telefone.trim()}>
            {saving ? "Cadastrando..." : "Cadastrar e continuar no chat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}