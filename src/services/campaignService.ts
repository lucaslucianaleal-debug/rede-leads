import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import type { Campaign, CampaignDailyMetric, CampaignDecisionCycle, CampaignOperationalEvent, CampaignScaleEvent, PeriodType } from "@/types/commandCenter";
import { fetchLeadsFromClinic } from "./firebaseQueries";
import { parse, isValid } from "date-fns";

const CAMPAIGN_COLORS = ["#D4537E", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];
const CAMPAIGN_BACKUP_FIELD = "metaAdsCampaigns";

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function toIsoFromBrDate(value?: string) {
  if (!value) return new Date().toISOString();
  const [dd, mm, yyyy] = value.split("/").map(Number);
  if (!dd || !mm || !yyyy) return new Date().toISOString();
  return new Date(yyyy, mm - 1, dd).toISOString();
}

function mapLegacyScaleStateToCycleStatus(value?: string): CampaignDecisionCycle["status"] {
  if (value === "aguardando_dados") return "aguardando_dados";
  if (value === "pronto_reavaliar") return "pronto_reavaliar";
  return "aberto";
}

function migrateFromScaleHistory(data: any): { cycles: CampaignDecisionCycle[]; events: CampaignOperationalEvent[]; activeCycleId: string } {
  const createdAt = data.createdAt || new Date().toISOString();
  const baseBudget = data.dailyBudget || 15;
  const scaleHistory: CampaignScaleEvent[] = Array.isArray(data.scaleHistory) ? data.scaleHistory : [];

  const baseCycleId = makeId("cycle");
  const cycles: CampaignDecisionCycle[] = [
    {
      id: baseCycleId,
      startedAt: createdAt,
      triggerType: "campaign_created",
      triggerNote: "Ciclo inicial da campanha",
      status: "encerrado",
      recommendedDailyBudget: baseBudget,
      appliedDailyBudget: baseBudget,
      executedInMeta: true,
      executedAt: createdAt,
      adherenceStatus: "aderente",
      adherenceDiffPct: 0,
      investedAtStart: 0,
      reviewAfterSpend: 50,
      reviewAfterHours: 72,
    },
  ];

  const events: CampaignOperationalEvent[] = [
    {
      id: makeId("event"),
      cycleId: baseCycleId,
      type: "campaign_created",
      createdAt,
      title: "Campanha criada",
      note: "Inicio da operacao",
      payload: { dailyBudget: baseBudget },
    },
  ];

  let activeCycleId = baseCycleId;

  scaleHistory.forEach((ev) => {
    const startedAt = toIsoFromBrDate(ev.date);
    const cycleId = makeId("cycle");
    const recommended = ev.toDailyBudget || baseBudget;
    const applied = ev.toDailyBudget || recommended;
    const diff = recommended > 0 ? ((applied - recommended) / recommended) * 100 : 0;
    const adherenceStatus: CampaignDecisionCycle["adherenceStatus"] = Math.abs(diff) <= 10
      ? "aderente"
      : diff > 10
        ? "acima_recomendado"
        : "abaixo_recomendado";

    cycles.push({
      id: cycleId,
      startedAt,
      triggerType: "budget_change",
      triggerNote: ev.reason || "Escala de budget",
      status: ev.status === "concluido" ? "encerrado" : ev.status === "pronto_reavaliar" ? "pronto_reavaliar" : "aguardando_dados",
      recommendedDailyBudget: recommended,
      appliedDailyBudget: applied,
      executedInMeta: true,
      executedAt: startedAt,
      adherenceStatus,
      adherenceDiffPct: Math.round(diff * 10) / 10,
      investedAtStart: ev.investedAtChange || 0,
      reviewAfterSpend: ev.reviewAfterSpend || 50,
      reviewAfterHours: ev.reviewAfterHours || 72,
      result: ev.result || "neutro",
      resultNote: ev.resultNote || ev.note,
    });

    events.push({
      id: makeId("event"),
      cycleId,
      type: "budget_scaled",
      createdAt: startedAt,
      title: `Escala ${ev.fromDailyBudget || recommended} -> ${ev.toDailyBudget || recommended}`,
      note: ev.reason || "Escala registrada",
      payload: {
        fromDailyBudget: ev.fromDailyBudget || recommended,
        toDailyBudget: ev.toDailyBudget || recommended,
      },
    });

    activeCycleId = cycleId;
  });

  if (cycles.length > 0) {
    cycles.forEach((c, idx) => {
      if (idx < cycles.length - 1 && !c.endedAt) {
        c.endedAt = cycles[idx + 1].startedAt;
      }
    });
  }

  const activeCycle = cycles.find((c) => c.id === activeCycleId);
  if (activeCycle && activeCycle.status === "encerrado") {
    activeCycle.status = mapLegacyScaleStateToCycleStatus(data.scaleCycleState);
  }

  return { cycles, events, activeCycleId };
}

function normalizeCampaignStructure(data: any) {
  const hasCycles = Array.isArray(data.cycles) && data.cycles.length > 0;
  const hasEvents = Array.isArray(data.events);

  if (hasCycles && hasEvents) {
    return {
      cycles: data.cycles as CampaignDecisionCycle[],
      events: data.events as CampaignOperationalEvent[],
      activeCycleId: data.activeCycleId || data.cycles[data.cycles.length - 1]?.id,
    };
  }

  return migrateFromScaleHistory(data);
}

function parseCampaignDate(value?: string) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const iso = new Date(value);
    return isValid(iso) ? iso : null;
  }

  const parsed = parse(value.trim(), "dd/MM/yyyy", new Date());
  return isValid(parsed) ? parsed : null;
}

function compareCampaignRecency(a: any, b: any) {
  const aDate = parseCampaignDate(a.createdAt) || parseCampaignDate(a.dateStart) || parseCampaignDate(a.dateEnd) || new Date(0);
  const bDate = parseCampaignDate(b.createdAt) || parseCampaignDate(b.dateStart) || parseCampaignDate(b.dateEnd) || new Date(0);
  return bDate.getTime() - aDate.getTime();
}

function getSharedCampaignDoc(clinicId: string) {
  return doc(db, "clinics", clinicId, "shared", "shared");
}

function toCampaignDataSnapshot(data: any, id: string, clinicId: string) {
  const normalized = normalizeCampaignStructure(data);
  return {
    id,
    clinicId,
    name: data.name || "Campanha",
    active: data.active ?? true,
    color: data.color || CAMPAIGN_COLORS[0],
    dateStart: data.dateStart || "",
    dateEnd: data.dateEnd || "",
    budget: data.budget || 0,
    dailyBudget: data.dailyBudget || 15,
    lastBudgetChangeAt: data.lastBudgetChangeAt || "",
    scaleHistory: Array.isArray(data.scaleHistory) ? data.scaleHistory : [],
    scaleCycleState: data.scaleCycleState || "idle",
    cycles: normalized.cycles,
    events: normalized.events,
    activeCycleId: normalized.activeCycleId,
    fundsAdded: data.fundsAdded || 0,
    taxCost: data.taxCost || 0,
    dailyMetrics: Array.isArray(data.dailyMetrics) ? data.dailyMetrics : [],
    createdAt: data.createdAt || new Date().toISOString(),
  };
}

function buildCampaignFromSnapshot(
  id: string,
  clinicId: string,
  data: any,
  idx: number,
  ticketMedio: number,
  leadsCount: number,
  scheduledCount: number,
  completedCount: number,
  monthLeadsCount: number,
  monthScheduledCount: number,
  monthCompletedCount: number,
  totals: { totalSpend: number; totalImpressions: number; totalClicks: number; totalReach: number }
): Campaign {
  const color = data.color || CAMPAIGN_COLORS[idx % CAMPAIGN_COLORS.length];
  const dailyMetrics: CampaignDailyMetric[] = Array.isArray(data.dailyMetrics) ? data.dailyMetrics : [];
  const allDailyMetrics: CampaignDailyMetric[] = Array.isArray(data.allDailyMetrics) ? data.allDailyMetrics : dailyMetrics;
  const roas = (totals.totalSpend + (data.taxCost || 0)) > 0
    ? parseFloat(((completedCount * ticketMedio) / (totals.totalSpend + (data.taxCost || 0))).toFixed(2))
    : 0;
  const predictability = leadsCount > 0 ? Math.round((completedCount / leadsCount) * 100) : 0;
  const cacLead = leadsCount > 0 ? parseFloat((totals.totalSpend / leadsCount).toFixed(2)) : 0;
  const cacAgendamento = scheduledCount > 0 ? parseFloat((totals.totalSpend / scheduledCount).toFixed(2)) : 0;
  const cacComparecimento = completedCount > 0 ? parseFloat((totals.totalSpend / completedCount).toFixed(2)) : 0;
  const conversionRate = leadsCount > 0 ? Math.round((scheduledCount / leadsCount) * 100) : 0;
  const showUpRate = scheduledCount > 0 ? Math.round((completedCount / scheduledCount) * 100) : 0;

  const normalized = normalizeCampaignStructure(data);

  return {
    id,
    clinicId,
    name: data.name || "Campanha",
    active: data.active ?? true,
    color,
    dateStart: data.dateStart || "",
    dateEnd: data.dateEnd || "",
    budget: data.budget || 0,
    dailyBudget: data.dailyBudget || 15,
    lastBudgetChangeAt: data.lastBudgetChangeAt || "",
    scaleHistory: Array.isArray(data.scaleHistory) ? data.scaleHistory : [],
    scaleCycleState: data.scaleCycleState || "idle",
    cycles: normalized.cycles,
    events: normalized.events,
    activeCycleId: normalized.activeCycleId,
    fundsAdded: data.fundsAdded || 0,
    taxCost: data.taxCost || 0,
    dailyMetrics,
    allDailyMetrics,
    ...totals,
    leads: leadsCount,
    scheduled: scheduledCount,
    completed: completedCount,
    monthLeads: monthLeadsCount,
    monthScheduled: monthScheduledCount,
    monthCompleted: monthCompletedCount,
    roas,
    predictability,
    cacLead,
    cacAgendamento,
    cacComparecimento,
    conversionRate,
    showUpRate,
  } as Campaign;
}

async function persistCampaignBackup(clinicId: string, campaigns: Array<{ id: string; [key: string]: any }>) {
  if (!clinicId) return;
  try {
    await setDoc(getSharedCampaignDoc(clinicId), {
      [CAMPAIGN_BACKUP_FIELD]: campaigns,
      campaignsLastSyncAt: new Date().toISOString(),
    }, { merge: true });
  } catch (e) {
    console.warn("[campaignService] Failed to persist Meta Ads backup:", e);
  }
}

/**
 * Retorna lista leve de campanhas ativas para seletores de formulário
 */
export async function fetchActiveCampaignList(clinicId: string): Promise<{ id: string; name: string }[]> {
  if (!clinicId) return [];
  try {
    const colRef = collection(db, "clinics", clinicId, "campaigns");
    const snapshot = await getDocs(colRef);
    return snapshot.docs
      .filter(d => d.data().active !== false)
      .sort((a, b) => compareCampaignRecency(a.data(), b.data()))
      .map(d => ({ id: d.id, name: d.data().name || "Campanha" }));
  } catch {
    return [];
  }
}

function calcCampaignTotals(dailyMetrics: CampaignDailyMetric[]) {
  return dailyMetrics.reduce(
    (acc, d) => ({
      totalSpend: acc.totalSpend + (d.spend || 0),
      totalImpressions: acc.totalImpressions + (d.impressions || 0),
      totalClicks: acc.totalClicks + (d.clicks || 0),
      totalReach: acc.totalReach + (d.reach || 0),
    }),
    { totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalReach: 0 }
  );
}

function parseFlexibleDate(value?: string) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const iso = new Date(raw);
    return isValid(iso) ? iso : null;
  }

  const br = parse(raw, "dd/MM/yyyy", new Date());
  if (isValid(br)) return br;

  const parsed = new Date(raw);
  return isValid(parsed) ? parsed : null;
}

function getPeriodRange(period: PeriodType) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (period === 'historico') {
    start.setFullYear(2000, 0, 1);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (period === 'hoje' || period === 'operacao') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (period === 'semana') {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function inRange(date: Date, start: Date, end: Date) {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function resolveLeadDate(lead: any) {
  return parseFlexibleDate(lead?.dataCriacao)
    || parseFlexibleDate(lead?.createdAt)
    || parseFlexibleDate(lead?.created_at)
    || parseFlexibleDate(lead?.dataCadastro)
    || null;
}

/**
 * Busca todas as campanhas de uma clínica e enriquece com dados reais de leads
 */
export async function fetchCampaigns(clinicId: string, ticketMedio = 1800, period: PeriodType = 'operacao'): Promise<Campaign[]> {
  try {
    const { start, end } = getPeriodRange(period);
    const { start: monthStart, end: monthEnd } = getCurrentMonthRange();
    const colRef = collection(db, "clinics", clinicId, "campaigns");
    const snapshot = await getDocs(colRef);
    const sharedSnap = await getDoc(getSharedCampaignDoc(clinicId));

    if (snapshot.empty && sharedSnap.exists()) {
      const backupCampaigns = Array.isArray(sharedSnap.data()?.[CAMPAIGN_BACKUP_FIELD])
        ? sharedSnap.data()[CAMPAIGN_BACKUP_FIELD]
        : [];

      if (backupCampaigns.length > 0) {
        await Promise.all(backupCampaigns.map(async (campaign: any) => {
          if (!campaign?.id) return;
          await setDoc(doc(db, "clinics", clinicId, "campaigns", campaign.id), {
            ...campaign,
            clinicId,
          }, { merge: true });
        }));

        const leads = await fetchLeadsFromClinic(clinicId);
        const restored = backupCampaigns.map((campaign: any, idx: number) => {
          const data = toCampaignDataSnapshot(campaign, campaign.id, clinicId);
            const activeCycle = (data.cycles || []).find((c: CampaignDecisionCycle) => c.id === data.activeCycleId);
            const cycleStart = activeCycle?.startedAt ? parseFlexibleDate(activeCycle.startedAt) : null;
            const filteredMetrics = (data.dailyMetrics || []).filter((m: CampaignDailyMetric) => {
              const dt = parseFlexibleDate(m.date);
              if (period === 'ciclo' && cycleStart) return dt ? inRange(dt, cycleStart, end) : false;
              return dt ? inRange(dt, start, end) : false;
            });
            const campaignLeads = leads.filter(l => {
              if (l.metaCampanhaId !== campaign.id) return false;
              const dt = resolveLeadDate(l);
              if (period === 'ciclo' && cycleStart) return dt ? inRange(dt, cycleStart, end) : false;
              return dt ? inRange(dt, start, end) : false;
            });
            const campaignMonthLeads = leads.filter(l => {
              if (l.metaCampanhaId !== campaign.id) return false;
              const dt = resolveLeadDate(l);
              return dt ? inRange(dt, monthStart, monthEnd) : false;
            });
          const leadsCount = campaignLeads.length;
          const scheduledCount = campaignLeads.filter(l => l.dataAgendamento?.trim()).length;
          const completedCount = campaignLeads.filter(l => l.comparecimento === "COMPARECEU").length;
          const monthLeadsCount = campaignMonthLeads.length;
          const monthScheduledCount = campaignMonthLeads.filter(l => l.dataAgendamento?.trim()).length;
          const monthCompletedCount = campaignMonthLeads.filter(l => l.comparecimento === "COMPARECEU").length;
            const totals = calcCampaignTotals(filteredMetrics);
            return buildCampaignFromSnapshot(campaign.id, clinicId, { ...data, dailyMetrics: filteredMetrics, allDailyMetrics: data.dailyMetrics || [] }, idx, ticketMedio, leadsCount, scheduledCount, completedCount, monthLeadsCount, monthScheduledCount, monthCompletedCount, totals);
        });

        await persistCampaignBackup(clinicId, backupCampaigns);
        return restored;
      }
    }

    if (snapshot.empty) return [];

    const leads = await fetchLeadsFromClinic(clinicId);

    const campaigns = snapshot.docs
      .sort((a, b) => compareCampaignRecency(a.data(), b.data()))
      .map((docSnap, idx) => {
        const data = docSnap.data();
        const normalized = normalizeCampaignStructure(data);
        const activeCycle = normalized.cycles.find((c) => c.id === normalized.activeCycleId);
        const cycleStart = activeCycle?.startedAt ? parseFlexibleDate(activeCycle.startedAt) : null;
        const dailyMetrics: CampaignDailyMetric[] = Array.isArray(data.dailyMetrics) ? data.dailyMetrics : [];

        const filteredMetrics = dailyMetrics.filter((m) => {
          const dt = parseFlexibleDate(m.date);
          if (period === 'ciclo' && cycleStart) return dt ? inRange(dt, cycleStart, end) : false;
          return dt ? inRange(dt, start, end) : false;
        });
        const totals = calcCampaignTotals(filteredMetrics);
        const campaignLeads = leads.filter(l => {
          if (l.metaCampanhaId !== docSnap.id) return false;
          const dt = resolveLeadDate(l);
          if (period === 'ciclo' && cycleStart) return dt ? inRange(dt, cycleStart, end) : false;
          return dt ? inRange(dt, start, end) : false;
        });
        const campaignMonthLeads = leads.filter(l => {
          if (l.metaCampanhaId !== docSnap.id) return false;
          const dt = resolveLeadDate(l);
          return dt ? inRange(dt, monthStart, monthEnd) : false;
        });

        return buildCampaignFromSnapshot(
          docSnap.id,
          clinicId,
          { ...data, dailyMetrics: filteredMetrics, allDailyMetrics: dailyMetrics },
          idx,
          ticketMedio,
          campaignLeads.length,
          campaignLeads.filter(l => l.dataAgendamento?.trim()).length,
          campaignLeads.filter(l => l.comparecimento === "COMPARECEU").length,
          campaignMonthLeads.length,
          campaignMonthLeads.filter(l => l.dataAgendamento?.trim()).length,
          campaignMonthLeads.filter(l => l.comparecimento === "COMPARECEU").length,
          totals
        );
      });

    void persistCampaignBackup(clinicId, snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));

    return campaigns;
  } catch (e) {
    console.error("Error fetching campaigns:", e);
    return [];
  }
}

/**
 * Cria uma nova campanha
 */
export async function createCampaign(clinicId: string, data: {
  name: string;
  dateStart: string;
  dateEnd: string;
  budget: number;
  dailyBudget?: number;
  fundsAdded?: number;
  taxCost?: number;
}): Promise<string> {
  const colRef = collection(db, "clinics", clinicId, "campaigns");
  const newRef = doc(colRef);
  const color = CAMPAIGN_COLORS[Math.floor(Math.random() * CAMPAIGN_COLORS.length)];
  const now = new Date().toISOString();
  const initialCycleId = makeId("cycle");
  const initialCycle: CampaignDecisionCycle = {
    id: initialCycleId,
    startedAt: now,
    triggerType: "campaign_created",
    triggerNote: "Ciclo inicial da campanha",
    status: "aberto",
    recommendedDailyBudget: data.dailyBudget || 15,
    investedAtStart: 0,
    reviewAfterSpend: 50,
    reviewAfterHours: 72,
  };
  const initialEvent: CampaignOperationalEvent = {
    id: makeId("event"),
    cycleId: initialCycleId,
    type: "campaign_created",
    createdAt: now,
    title: "Campanha criada",
    note: "Inicio da operacao",
    payload: { dailyBudget: data.dailyBudget || 15 },
  };

  await setDoc(newRef, {
    name: data.name,
    dateStart: data.dateStart,
    dateEnd: data.dateEnd,
    budget: data.budget,
    dailyBudget: data.dailyBudget || 15,
    lastBudgetChangeAt: data.dateStart || new Date().toISOString(),
    scaleHistory: [],
    scaleCycleState: "idle",
    cycles: [initialCycle],
    events: [initialEvent],
    activeCycleId: initialCycleId,
    fundsAdded: data.fundsAdded || 0,
    taxCost: data.taxCost || 0,
    active: true,
    color,
    dailyMetrics: [],
    clinicId,
    createdAt: now,
  });
  await persistCampaignBackup(clinicId, [{
    id: newRef.id,
    name: data.name,
    dateStart: data.dateStart,
    dateEnd: data.dateEnd,
    budget: data.budget,
    dailyBudget: data.dailyBudget || 15,
    lastBudgetChangeAt: data.dateStart || new Date().toISOString(),
    scaleHistory: [],
    scaleCycleState: "idle",
    cycles: [initialCycle],
    events: [initialEvent],
    activeCycleId: initialCycleId,
    fundsAdded: data.fundsAdded || 0,
    taxCost: data.taxCost || 0,
    active: true,
    color,
    dailyMetrics: [],
    clinicId,
    createdAt: now,
  }]);
  return newRef.id;
}

/**
 * Adiciona ou substitui métricas de um dia específico
 */
export async function upsertDailyMetric(
  clinicId: string,
  campaignId: string,
  metric: CampaignDailyMetric
): Promise<void> {
  const docRef = doc(db, "clinics", clinicId, "campaigns", campaignId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("Campaign not found");

  const current: CampaignDailyMetric[] = snap.data().dailyMetrics || [];
  const existing = current.findIndex(m => m.date === metric.date);

  let updated: CampaignDailyMetric[];
  if (existing >= 0) {
    updated = current.map((m, i) => (i === existing ? metric : m));
  } else {
    updated = [...current, metric].sort((a, b) => {
      const [da, ma, ya] = a.date.split("/").map(Number);
      const [db2, mb, yb] = b.date.split("/").map(Number);
      return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db2).getTime();
    });
  }

  await updateDoc(docRef, { dailyMetrics: updated });
  const snapAfter = await getDoc(docRef);
  if (snapAfter.exists()) {
    await persistCampaignBackup(clinicId, [{ id: campaignId, ...snapAfter.data() }]);
  }
}

/**
 * Remove uma métrica de um dia específico.
 */
export async function deleteDailyMetric(
  clinicId: string,
  campaignId: string,
  date: string
): Promise<void> {
  const docRef = doc(db, "clinics", clinicId, "campaigns", campaignId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("Campaign not found");

  const current: CampaignDailyMetric[] = snap.data().dailyMetrics || [];
  const updated = current.filter(m => m.date !== date);
  await updateDoc(docRef, { dailyMetrics: updated });
  const snapAfter = await getDoc(docRef);
  if (snapAfter.exists()) {
    await persistCampaignBackup(clinicId, [{ id: campaignId, ...snapAfter.data() }]);
  }
}

/**
 * Atualiza status da campanha (ativa/pausada) ou budget/nome
 */
export async function updateCampaign(
  clinicId: string,
  campaignId: string,
  fields: Partial<{ name: string; active: boolean; budget: number; dailyBudget: number; lastBudgetChangeAt: string; scaleHistory: CampaignScaleEvent[]; scaleCycleState: 'idle' | 'aguardando_dados' | 'pronto_reavaliar'; cycles: CampaignDecisionCycle[]; events: CampaignOperationalEvent[]; activeCycleId: string; dateEnd: string; fundsAdded: number; taxCost: number }>
): Promise<void> {
  const docRef = doc(db, "clinics", clinicId, "campaigns", campaignId);
  const before = await getDoc(docRef);
  const current = before.exists() ? before.data() : null;

  const preparedFields: any = { ...fields };
  if (current && typeof fields.dailyBudget === "number" && fields.dailyBudget > 0 && fields.cycles === undefined) {
    const normalized = normalizeCampaignStructure(current);
    const prevBudget = Number(current.dailyBudget || 15);
    const nextBudget = Number(fields.dailyBudget);

    if (Math.abs(prevBudget - nextBudget) > 0.01) {
      const now = new Date().toISOString();
      const activeCycle = normalized.cycles.find((c) => c.id === normalized.activeCycleId);
      const closedCycles = normalized.cycles.map((cycle) => {
        if (cycle.id === normalized.activeCycleId) {
          return { ...cycle, status: "encerrado" as const, endedAt: now };
        }
        return cycle;
      });

      const diffPct = prevBudget > 0 ? ((nextBudget - prevBudget) / prevBudget) * 100 : 0;
      const adherenceStatus: CampaignDecisionCycle["adherenceStatus"] = Math.abs(diffPct) <= 10
        ? "aderente"
        : diffPct > 10
          ? "acima_recomendado"
          : "abaixo_recomendado";

      const newCycleId = makeId("cycle");
      const newCycle: CampaignDecisionCycle = {
        id: newCycleId,
        startedAt: now,
        triggerType: "budget_change",
        triggerNote: "Ajuste de budget aplicado",
        status: "aguardando_dados",
        recommendedDailyBudget: activeCycle?.recommendedDailyBudget || nextBudget,
        appliedDailyBudget: nextBudget,
        executedInMeta: true,
        executedAt: now,
        adherenceStatus,
        adherenceDiffPct: Math.round(diffPct * 10) / 10,
        investedAtStart: Number(current.totalSpend || 0),
        reviewAfterSpend: 50,
        reviewAfterHours: 72,
      };

      const newEvent: CampaignOperationalEvent = {
        id: makeId("event"),
        cycleId: newCycleId,
        type: "budget_scaled",
        createdAt: now,
        title: `Escala ${prevBudget.toFixed(0)} -> ${nextBudget.toFixed(0)}`,
        note: "Atualizacao registrada via Command Center",
        payload: {
          fromDailyBudget: prevBudget,
          toDailyBudget: nextBudget,
          recommendedDailyBudget: activeCycle?.recommendedDailyBudget || nextBudget,
          adherenceStatus,
        },
      };

      preparedFields.cycles = [...closedCycles, newCycle];
      preparedFields.events = [...normalized.events, newEvent];
      preparedFields.activeCycleId = newCycleId;
      preparedFields.scaleCycleState = "aguardando_dados";
      preparedFields.lastBudgetChangeAt = new Date().toLocaleDateString("pt-BR");
    }
  }

  await updateDoc(docRef, preparedFields);
  const snapAfter = await getDoc(docRef);
  if (snapAfter.exists()) {
    await persistCampaignBackup(clinicId, [{ id: campaignId, ...snapAfter.data() }]);
  }
}

/**
 * Deleta uma campanha
 */
export async function deleteCampaign(clinicId: string, campaignId: string): Promise<void> {
  await deleteDoc(doc(db, "clinics", clinicId, "campaigns", campaignId));
  try {
    const sharedRef = getSharedCampaignDoc(clinicId);
    const sharedSnap = await getDoc(sharedRef);
    if (sharedSnap.exists()) {
      const current = Array.isArray(sharedSnap.data()?.[CAMPAIGN_BACKUP_FIELD]) ? sharedSnap.data()[CAMPAIGN_BACKUP_FIELD] : [];
      const updated = current.filter((campaign: any) => campaign?.id !== campaignId);
      await setDoc(sharedRef, {
        [CAMPAIGN_BACKUP_FIELD]: updated,
        campaignsLastSyncAt: new Date().toISOString(),
      }, { merge: true });
    }
  } catch (e) {
    console.warn("[campaignService] Failed to remove campaign from backup:", e);
  }
}
