import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, arrayUnion } from "firebase/firestore";
import type { Campaign, CampaignDailyMetric } from "@/types/commandCenter";
import { fetchLeadsFromClinic } from "./firebaseQueries";

const CAMPAIGN_COLORS = ["#D4537E", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];

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

/**
 * Busca todas as campanhas de uma clínica e enriquece com dados reais de leads
 */
export async function fetchCampaigns(clinicId: string, ticketMedio = 1800, period: 'hoje' | 'semana' | 'mes' = 'mes'): Promise<Campaign[]> {
  try {
    const colRef = collection(db, "clinics", clinicId, "campaigns");
    const snapshot = await getDocs(colRef);

    if (snapshot.empty) return [];

    const leads = await fetchLeadsFromClinic(clinicId);

    return snapshot.docs.map((docSnap, idx) => {
      const data = docSnap.data();
      const allDailyMetrics: CampaignDailyMetric[] = data.dailyMetrics || [];

      // Meta Ads precisa mostrar o desempenho completo da campanha, sem filtro de período.
      const dailyMetrics = allDailyMetrics;
      const totals = calcCampaignTotals(dailyMetrics);

      const campaignLeads = leads.filter(l => l.metaCampanhaId === docSnap.id);
      
      const leadsCount = campaignLeads.length;
      const scheduledCount = campaignLeads.filter(l => l.dataAgendamento?.trim()).length;
      const completedCount = campaignLeads.filter(l => l.comparecimento === "COMPARECEU").length;

      const roas = totals.totalSpend > 0 ? parseFloat(((completedCount * ticketMedio) / totals.totalSpend).toFixed(2)) : 0;
      const cacLead = leadsCount > 0 ? parseFloat((totals.totalSpend / leadsCount).toFixed(2)) : 0;
      const cacAgendamento = scheduledCount > 0 ? parseFloat((totals.totalSpend / scheduledCount).toFixed(2)) : 0;
      const cacComparecimento = completedCount > 0 ? parseFloat((totals.totalSpend / completedCount).toFixed(2)) : 0;
      const conversionRate = leadsCount > 0 ? Math.round((scheduledCount / leadsCount) * 100) : 0;
      const showUpRate = scheduledCount > 0 ? Math.round((completedCount / scheduledCount) * 100) : 0;

      return {
        id: docSnap.id,
        clinicId,
        name: data.name || "Campanha",
        active: data.active ?? true,
        color: data.color || CAMPAIGN_COLORS[idx % CAMPAIGN_COLORS.length],
        dateStart: data.dateStart || "",
        dateEnd: data.dateEnd || "",
        budget: data.budget || 0,
        fundsAdded: data.fundsAdded || 0,
        taxCost: data.taxCost || 0,
        dailyMetrics,
        ...totals,
        leads: leadsCount,
        scheduled: scheduledCount,
        completed: completedCount,
        roas: (totals.totalSpend + (data.taxCost || 0)) > 0 ? parseFloat(((completedCount * ticketMedio) / (totals.totalSpend + (data.taxCost || 0))).toFixed(2)) : 0,
        cacLead,
        cacAgendamento,
        cacComparecimento,
        conversionRate,
        showUpRate,
      } as Campaign;
    });
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
    fundsAdded: data.fundsAdded || 0,
    taxCost: data.taxCost || 0,
    active: true,
    color,
    dailyMetrics: [],
    clinicId,
    createdAt: new Date().toISOString(),
  });
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
}

/**
 * Atualiza status da campanha (ativa/pausada) ou budget/nome
 */
export async function updateCampaign(
  clinicId: string,
  campaignId: string,
  fields: Partial<{ name: string; active: boolean; budget: number; dateEnd: string; fundsAdded: number; taxCost: number }>
): Promise<void> {
  const docRef = doc(db, "clinics", clinicId, "campaigns", campaignId);
  await updateDoc(docRef, fields);
}

/**
 * Deleta uma campanha
 */
export async function deleteCampaign(clinicId: string, campaignId: string): Promise<void> {
  await deleteDoc(doc(db, "clinics", clinicId, "campaigns", campaignId));
}
