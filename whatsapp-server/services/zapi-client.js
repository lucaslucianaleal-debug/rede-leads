/**
 * Cliente Z-API para envio de mensagens automáticas de triagem.
 * 
 * Documentação Z-API: https://developer.z-api.io/
 * 
 * As credenciais de cada clínica (instanceId + token) devem estar no Firestore:
 *   clinics/{clinicId}/config/whatsapp
 * 
 * Variáveis de ambiente globais (fallback):
 *   ZAPI_INSTANCE_ID — ID da instância padrão
 *   ZAPI_TOKEN       — Token de segurança padrão
 *   ZAPI_CLIENT_TOKEN — Token de integração (header Client-Token)
 */

const ZAPI_BASE_URL = "https://api.z-api.io/instances";
// Token de integração global Z-API (header Client-Token)
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || "";

/**
 * Envia uma mensagem de texto via Z-API para o número informado.
 * 
 * @param {string} instanceId - ID da instância Z-API da clínica
 * @param {string} instanceToken - Token da instância Z-API da clínica
 * @param {string} phone - Telefone no formato internacional (5511999999999)
 * @param {string} message - Mensagem de texto a enviar
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function sendTextMessage(instanceId, instanceToken, phone, message) {
  if (!instanceId || !instanceToken) {
    console.error("[zapi-client] instanceId ou instanceToken ausente");
    return { success: false, error: "Credenciais Z-API ausentes" };
  }
  if (!phone || !message) {
    console.error("[zapi-client] phone ou message ausente");
    return { success: false, error: "Parâmetros inválidos" };
  }

  const url = `${ZAPI_BASE_URL}/${instanceId}/token/${instanceToken}/send-text`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Token de integração global (obrigatório em contas com segurança habilitada)
        ...(ZAPI_CLIENT_TOKEN ? { "Client-Token": ZAPI_CLIENT_TOKEN } : {}),
      },
      body: JSON.stringify({
        phone,   // formato: "5511999999999" (internacional, sem + e sem @s.whatsapp.net)
        message,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[zapi-client] Erro ao enviar mensagem:", data);
      return { success: false, error: data?.error || "Erro desconhecido Z-API", data };
    }

    console.log(`[zapi-client] Mensagem enviada para ${phone}:`, data);
    return { success: true, data };
  } catch (err) {
    console.error("[zapi-client] Falha na requisição Z-API:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Verifica o status da instância Z-API (se está conectada).
 * 
 * @param {string} instanceId
 * @param {string} instanceToken
 */
export async function getInstanceStatus(instanceId, instanceToken) {
  const url = `${ZAPI_BASE_URL}/${instanceId}/token/${instanceToken}/status`;
  try {
    const response = await fetch(url, {
      headers: {
        ...(ZAPI_CLIENT_TOKEN ? { "Client-Token": ZAPI_CLIENT_TOKEN } : {}),
      },
    });
    const data = await response.json();
    return { success: response.ok, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
