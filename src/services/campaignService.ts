import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, arrayUnion } from "firebase/firestore";
import type { Campaign, CampaignDailyMetric, CampaignScaleEvent } from "@/types/commandCenter";
import { fetchLeadsFromClinic } from "./firebaseQueries";
import { parse, isValid } from "date-fns";

const CAMPAIGN_COLORS = ["#D4537E", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];
const CAMPAIGN_BACKUP_FIELD = "metaAdsCampaigns";

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
    fundsAdded: data.fundsAdded || 0,
    taxCost: data.taxCost || 0,
    dailyMetrics,
    allDailyMetrics,
    ...totals,
    leads: leadsCount,
    scheduled: scheduledCount,
    completed: completedCount,
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

function getPeriodRange(period: 'hoje' | 'semana' | 'mes' | 'historico') {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (period === 'historico') {
    start.setFullYear(2000, 0, 1);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (period === 'hoje') {
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
export async function fetchCampaigns(clinicId: string, ticketMedio = 1800, period: 'hoje' | 'semana' | 'mes' | 'historico' = 'mes'): Promise<Campaign[]> {
  try {
    const { start, end } = getPeriodRange(period);
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
            const filteredMetrics = (data.dailyMetrics || []).filter((m: CampaignDailyMetric) => {
              const dt = parseFlexibleDate(m.date);
              return dt ? inRange(dt, start, end) : false;
            });
            const campaignLeads = leads.filter(l => {
              if (l.metaCampanhaId !== campaign.id) return false;
              const dt = resolveLeadDate(l);
              return dt ? inRange(dt, start, end) : false;
            });
          const leadsCount = campaignLeads.length;
          const scheduledCount = campaignLeads.filter(l => l.dataAgendamento?.trim()).length;
          const completedCount = campaignLeads.filter(l => l.comparecimento === "COMPARECEU").length;
            const totals = calcCampaignTotals(filteredMetrics);
            return buildCampaignFromSnapshot(campaign.id, clinicId, { ...data, dailyMetrics: filteredMetrics, allDailyMetrics: data.dailyMetrics || [] }, idx, ticketMedio, leadsCount, scheduledCount, completedCount, totals);
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
        const dailyMetrics: CampaignDailyMetric[] = Array.isArray(data.dailyMetrics) ? data.dailyMetrics : [];

        const filteredMetrics = dailyMetrics.filter((m) => {
          const dt = parseFlexibleDate(m.date);
          return dt ? inRange(dt, start, end) : false;
        });
        const totals = calcCampaignTotals(filteredMetrics);
        const campaignLeads = leads.filter(l => {
          if (l.metaCampanhaId !== docSnap.id) return false;
          const dt = resolveLeadDate(l);
          return dt ? inRange(dt, start, end) : false;
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
  await setDoc(newRef, {
    name: data.name,
    dateStart: data.dateStart,
    dateEnd: data.dateEnd,
    budget: data.budget,
    dailyBudget: data.dailyBudget || 15,
    lastBudgetChangeAt: data.dateStart || new Date().toISOString(),
    scaleHistory: [],
    fundsAdded: data.fundsAdded || 0,
    taxCost: data.taxCost || 0,
    active: true,
    color,
    dailyMetrics: [],
    clinicId,
    createdAt: new Date().toISOString(),
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
    fundsAdded: data.fundsAdded || 0,
    taxCost: data.taxCost || 0,
    active: true,
    color,
    dailyMetrics: [],
    clinicId,
    createdAt: new Date().toISOString(),
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
  fields: Partial<{ name: string; active: boolean; budget: number; dailyBudget: number; lastBudgetChangeAt: string; scaleHistory: CampaignScaleEvent[]; dateEnd: string; fundsAdded: number; taxCost: number }>
): Promise<void> {
  const docRef = doc(db, "clinics", clinicId, "campaigns", campaignId);
  await updateDoc(docRef, fields);
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
