// Hotfix de segurança: automação da agenda da clínica temporariamente pausada.
// Enquanto estiver pausada, esta rotina NÃO toca na fila do WhatsApp.
// A prioridade agora é preservar 100% dos envios manuais e do fluxo normal do agente.

export async function processClinicAgendaAutomation() {
  return {
    paused: true,
    queued: 0,
    released: 0,
    cancelled: 0,
  };
}
