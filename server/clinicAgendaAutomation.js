// Hotfix de segurança: régua automática da clínica temporariamente pausada.
// Detectamos envio de confirmações de pacientes distintos para a mesma conversa.
// Enquanto pausada, esta rotina NÃO cria, altera nem cancela itens da fila do WhatsApp.
// Envios manuais e o restante do agente permanecem intactos.

export async function processClinicAgendaAutomation() {
  return {
    paused: true,
    queued: 0,
    released: 0,
    cancelled: 0,
  };
}
