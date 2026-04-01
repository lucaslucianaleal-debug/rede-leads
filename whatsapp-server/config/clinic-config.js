/**
 * Configuração das clínicas para integração Z-API.
 * 
 * Cada clínica possui sua própria instância Z-API e mensagens de triagem configuráveis.
 * As credenciais (instanceId, token) devem vir do Firestore ou variáveis de ambiente.
 * 
 * Estrutura no Firestore:
 *   clinics/{clinicId}/config/whatsapp
 * 
 * Para adicionar uma nova clínica:
 *   1. Adicionar entrada em CLINIC_DEFAULTS com o clinicId exato do Firestore
 *   2. Configurar no Firestore com instanceId e token reais da Z-API
 */

export const CLINIC_DEFAULTS = {
  "odontocompany-novohorizonte": {
    nomeClinica: "Novo Horizonte",
    nomeAtendente: "Lucas",
    horarioAtendimento: { inicio: 8, fim: 18 },
    diasAtivos: [1, 2, 3, 4, 5], // 1=segunda ... 5=sexta
    mensagens: {
      comercial: `Olá! Meu nome é Lucas e sou da Odontocompany Novo Horizonte! 😊\nMe conta um pouquinho mais... o que vem te incomodando no seu sorriso?`,
      fora_horario: `Olá! Recebemos sua mensagem mas estamos fora do horário de atendimento no momento.\nNosso horário é de segunda a sexta, das 8h às 18h.\nSeu contato foi registrado e retornaremos no próximo dia útil! 🙏`,
    },
  },
  "odontocompany-olimpia": {
    nomeClinica: "Olímpia",
    nomeAtendente: "Lucas",
    horarioAtendimento: { inicio: 8, fim: 18 },
    diasAtivos: [1, 2, 3, 4, 5],
    mensagens: {
      comercial: `Olá! Meu nome é Lucas e sou da Odontocompany Olímpia! 😊\nMe conta um pouquinho mais... o que vem te incomodando no seu sorriso?`,
      fora_horario: `Olá! Recebemos sua mensagem mas estamos fora do horário de atendimento no momento.\nNosso horário é de segunda a sexta, das 8h às 18h.\nSeu contato foi registrado e retornaremos no próximo dia útil! 🙏`,
    },
  },
  "odontocompany-badybassit": {
    nomeClinica: "Bady Bassit",
    nomeAtendente: "Lucas",
    horarioAtendimento: { inicio: 8, fim: 18 },
    diasAtivos: [1, 2, 3, 4, 5],
    mensagens: {
      comercial: `Olá! Meu nome é Lucas e sou da Odontocompany Bady Bassit! 😊\nMe conta um pouquinho mais... o que vem te incomodando no seu sorriso?`,
      fora_horario: `Olá! Recebemos sua mensagem mas estamos fora do horário de atendimento no momento.\nNosso horário é de segunda a sexta, das 8h às 18h.\nSeu contato foi registrado e retornaremos no próximo dia útil! 🙏`,
    },
  },
};

/**
 * Normaliza telefone para formato internacional E.164 (ex: 5511999999999)
 * Usado para identificação consistente na Z-API.
 */
export function normalizePhoneInternational(raw) {
  if (!raw) throw new Error("Telefone vazio");
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) throw new Error("Telefone inválido");
  // Garante prefixo 55 (Brasil)
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

/**
 * Verifica se o horário atual (Brasília) está dentro do horário de atendimento da clínica.
 */
export function isBusinessHours(clinicConfig) {
  // Horário de Brasília: UTC-3
  const now = new Date();
  const brasiliaOffset = -3 * 60; // minutos
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const brasiliaMinutes = ((utcMinutes + brasiliaOffset) % (24 * 60) + 24 * 60) % (24 * 60);
  const brasiliaHour = Math.floor(brasiliaMinutes / 60);

  // Dia da semana em Brasília
  const brasiliaDate = new Date(now.getTime() + brasiliaOffset * 60000);
  const dayOfWeek = brasiliaDate.getUTCDay(); // 0=domingo, 1=segunda, ..., 6=sábado

  const { inicio, fim } = clinicConfig.horarioAtendimento;
  const isDiaAtivo = clinicConfig.diasAtivos.includes(dayOfWeek);

  return isDiaAtivo && brasiliaHour >= inicio && brasiliaHour < fim;
}

/**
 * Formata data/hora atual no padrão dd/MM/yyyy HH:mm (Brasília)
 */
export function formatDateTimeBrasilia() {
  const now = new Date();
  const brasiliaOffset = -3 * 60;
  const brazilDate = new Date(now.getTime() + brasiliaOffset * 60000);
  const d = String(brazilDate.getUTCDate()).padStart(2, "0");
  const m = String(brazilDate.getUTCMonth() + 1).padStart(2, "0");
  const y = brazilDate.getUTCFullYear();
  const h = String(brazilDate.getUTCHours()).padStart(2, "0");
  const min = String(brazilDate.getUTCMinutes()).padStart(2, "0");
  return `${d}/${m}/${y} ${h}:${min}`;
}

export function formatDateBrasilia() {
  return formatDateTimeBrasilia().split(" ")[0];
}
