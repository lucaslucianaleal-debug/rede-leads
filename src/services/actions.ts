// ─── Ações executáveis do Command Center ──────────────────────────────────────
// Estrutura pronta para conectar à API real.
// Hoje: retorna simulação com delay realista.

interface ActionResult {
  success: boolean;
  message: string;
}

async function simulateDelay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export async function executeAction(actionId: string, unitId: string): Promise<ActionResult> {
  // Mapa de ações disponíveis
  const actions: Record<string, () => Promise<ActionResult>> = {
    distribute_leads: async () => {
      await simulateDelay(1400);
      // TODO: await api.post('/actions/distribute', { unitId, count: 851 })
      return { success: true, message: "340 leads distribuídos entre Lucas, Julia e Neto" };
    },
    send_whatsapp_unresponded: async () => {
      await simulateDelay(1200);
      // TODO: await api.post('/actions/send-whatsapp', { unitId, filter: 'unresponded_24h' })
      return { success: true, message: "8 mensagens enviadas — tempo médio previsto: 2min" };
    },
    pause_campaign_sorteio: async () => {
      await simulateDelay(800);
      // TODO: await api.post('/actions/campaigns/pause', { campaignId: 'sorteio' })
      return { success: true, message: "Campanha Sorteio pausada. Budget R$ 320 preservado." };
    },
    activate_automation_confirmation: async () => {
      await simulateDelay(900);
      // TODO: await api.post('/actions/automations/activate', { automationId: 'confirmation_2h' })
      return { success: true, message: "Confirmação 2h antes ativada — +12 comp/mês esperado" };
    },
    confirm_appointments: async () => {
      await simulateDelay(1000);
      // TODO: await api.post('/actions/confirm-appointments', { unitId })
      return { success: true, message: "6 confirmações enviadas via WhatsApp" };
    },
    view_followup_queue: async () => {
      await simulateDelay(300);
      return { success: true, message: "Fila aberta — 86 follow-ups pendentes" };
    },
    toggleAutomation: async () => {
      await simulateDelay(700);
      return { success: true, message: "Automação atualizada com sucesso" };
    },
  };

  const handler = actions[actionId];
  if (!handler) {
    return { success: false, message: `Ação "${actionId}" não reconhecida` };
  }

  try {
    return await handler();
  } catch (e) {
    return { success: false, message: "Erro ao executar ação. Tente novamente." };
  }
}
