import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import express from "express";
import cors from "cors";
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";


// Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync(new URL("./serviceAccountKey.json", import.meta.url))
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Express API
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
const PORT = process.env.PORT || 3001;

// Estado do QR Code (para exibir no CRM)
let currentQR = null;
let isConnected = false;

// Cache LID -> telefone real (garante consistência)
const lidCache = new Map();
// Alias de telefone detectado no envio -> telefone canônico da conversa
const phoneAliasMap = new Map();
// msgId enviado via API -> telefone canônico escolhido no CRM
const sentMsgConversationMap = new Map();
// Número do próprio bot (capturado no evento "ready") — usado para trava anti-auto-conversa
let myOwnPhone = null;
// Constante fixa de segurança: mesmo que myOwnPhone não esteja populado ainda, este número NUNCA vira conversa
const MY_PHONE = '17991040452';

// Pasta para arquivos de midia (audios)
const __dirname = dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = join(__dirname, "media");
mkdirSync(MEDIA_DIR, { recursive: true });
app.use("/media", express.static(MEDIA_DIR));

// Verifica se e um LID (ID interno do WA) em vez de telefone real
function isLID(jid) {
  const digits = (jid || "").replace("@c.us", "").replace(/\D/g, "");
  return digits.length > 13;
}

// Extrai numero real com fallback para getContact()
async function getRealPhone(msg, useToField = false, isInbound = false) {
  try {
    const rawFrom = useToField ? (msg.to || "") : (msg.from || "");
    const digits = rawFrom.replace("@c.us", "").replace(/\D/g, "");

    console.log(`[getRealPhone] rawFrom=${rawFrom}, digits=${digits}, isLID=${isLID(rawFrom)}, useToField=${useToField}, isInbound=${isInbound}`);

    // If rawFrom is a plain JID (not LID), return normalized international form
    if (!isLID(rawFrom)) {
      const result = digits.startsWith("55") ? digits : `55${digits}`;
      if (useToField && myOwnPhone && digits.slice(-11) === myOwnPhone) {
        console.warn(`[getRealPhone] msg.to resolveu para o PRÓPRIO número (${result}). Retornando null para forçar fallback.`);
        return null;
      }
      console.log(`[getRealPhone] NAO eh LID, retornando: ${result}`);
      return result;
    }

    if (lidCache.has(rawFrom)) {
      const cached = lidCache.get(rawFrom);
      console.log(`[getRealPhone] Cache hit para LID ${rawFrom}: ${cached}`);
      return cached;
    }

    let resolvedPhone = null;
    try {
      const contact = await msg.getContact();

      if (contact?.number) {
        const num = String(contact.number).replace(/\D/g, "");
        if (num.length >= 10 && num.length <= 13) {
          resolvedPhone = num.startsWith("55") ? num : `55${num}`;
          console.log(`[getRealPhone] Resolvido via contact.number: ${resolvedPhone}`);
        }
      }

      if (!resolvedPhone && contact?._data?.id) {
        const id = String(contact._data.id).replace("@c.us", "").replace(/\D/g, "");
        if (id.length >= 10 && id.length <= 13) {
          resolvedPhone = id.startsWith("55") ? id : `55${id}`;
          console.log(`[getRealPhone] Resolvido via contact._data.id: ${resolvedPhone}`);
        }
      }

      if (resolvedPhone && isInbound && msg.to) {
        const toDigits = (msg.to || "").replace("@c.us", "").replace(/\D/g, "");
        const toNormalized = toDigits.startsWith("55") ? toDigits : `55${toDigits}`;
        if (resolvedPhone === toNormalized) {
          console.warn(`[getRealPhone] getContact retornou o NÚMERO DO USUÁRIO (${resolvedPhone}) — tentando outras fontes`);
          resolvedPhone = null;
        }
      }

      if (!resolvedPhone) {
        const candidates = [msg._data?.author, msg._data?.participant, msg._data?.id, msg._data?.senderJid];
        for (const c of candidates) {
          if (!c) continue;
          const cd = String(c).replace("@c.us", "").replace(/\D/g, "");
          if (cd.length >= 10 && cd.length <= 13) {
            const candidate = cd.startsWith("55") ? cd : `55${cd}`;
            if (msg.to) {
              const toDigits = (msg.to || "").replace("@c.us", "").replace(/\D/g, "");
              const toNormalized = toDigits.startsWith("55") ? toDigits : `55${toDigits}`;
              if (candidate === toNormalized) continue;
            }
            resolvedPhone = candidate;
            console.log(`[getRealPhone] Resolvido via msg._data campo: ${resolvedPhone}`);
            break;
          }
        }
      }
    } catch (contactErr) {
      console.warn("[getRealPhone] Erro ao buscar contact:", contactErr?.message || contactErr);
    }

    if (!resolvedPhone) {
      if (digits.length >= 10 && digits.length <= 13) {
        const candidate = digits.startsWith("55") ? digits : `55${digits}`;
        if (isInbound && msg.to) {
          const toDigits = (msg.to || "").replace("@c.us", "").replace(/\D/g, "");
          const toNormalized = toDigits.startsWith("55") ? toDigits : `55${toDigits}`;
          if (candidate === toNormalized) {
            console.error(`[getRealPhone] Fallback extraiu NÚMERO DO USUÁRIO (${candidate}) — não vou usar`);
            return null;
          }
        }
        resolvedPhone = candidate;
        console.log(`[getRealPhone] Fallback com dígitos (${digits.length} chars): ${resolvedPhone}`);
      } else {
        console.error(`[getRealPhone] Número inválido: ${digits.length} dígitos. rawFrom=${rawFrom}. REJEITANDO mensagem.`);
        return null;
      }
    }
    lidCache.set(rawFrom, resolvedPhone);
    return resolvedPhone;
  } catch (e) {
    console.error("[getRealPhone] Erro inesperado:", e);
    return null;
  }
}

// Limpa lastMessage para exibição na lista lateral (remove nomes técnicos de arquivos)
function cleanLastMessage(body) {
  if (!body || typeof body !== "string") return "";
  if (body.startsWith("[audio:")) return "🎤 Áudio";
  if (body.startsWith("[image:")) return "📷 Foto";
  if (body.startsWith("[video:")) return "🎬 Vídeo";
  if (body.startsWith("[document:")) return "📄 Documento";
  if (body === "🎙️ Áudio") return "🎤 Áudio";
  if (body === "📷 Imagem") return "📷 Foto";
  if (body === "🎬 Vídeo") return "🎬 Vídeo";
  if (body === "📄 Documento") return "📄 Documento";
  if (body === "🎙️ Áudio" || body.includes(".ogg") || body.includes(".mp3")) return "🎤 Áudio";
  return body;
}

// Formata para padrao brasileiro: (17) 99762-5696
function formatBRPhone(digits) {
  const d = digits.replace(/\D/g, "");
  const local = d.startsWith("55") ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return d;
}

function phoneToWAId(telefone) {
  const digits = telefone.replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `${withCountry}@c.us`;
}

// Salvar mensagem na conversa correta
// BUSCA PROFUNDA: verifica doc ID + campo telefone para evitar duplicatas
async function saveMessage({ telefone, body, fromMe, msgId, targetConversation }) {
  console.log(`[saveMessage] Mensagem recebida de ID: ${telefone}, tentando vincular ao lead...`);

  const digits = telefone.replace(/\D/g, "");
  const phoneAfter55 = digits.startsWith("55") ? digits.slice(2) : digits;

  // ─── BLOQUEIO DO PRÓPRIO NÚMERO ───────────────────────────────────────────
  // Se o telefone normalizado (últimos 11 dígitos) for o próprio número da conta,
  // não criamos uma conversa 'de mim para mim'. A mensagem deve ir para o destinatário.
  const selfCheck = digits.slice(-11);
  if (selfCheck === MY_PHONE || (myOwnPhone && selfCheck === myOwnPhone)) {
    console.warn(`[saveMessage] BLOQUEADO (auto-conversa): "${telefone}" é o próprio número do bot (${MY_PHONE}). Mensagem descartada.`);
    return;
  }

  // ─── BLOQUEIO DE IDs TÉCNICOS ─────────────────────────────────────────────
  // Após remover o prefixo "55", o número precisa ter 10 ou 11 dígitos reais.
  // IDs de sistema do WhatsApp (LIDs não resolvidos, etc.) geralmente falham aqui.
  if (phoneAfter55.length < 10 || phoneAfter55.length > 11) {
    console.warn(`[saveMessage] BLOQUEADO: "${telefone}" tem ${phoneAfter55.length} dígito(s) após prefixo 55 (esperado: 10-11). Mensagem descartada.`);
    return;
  }

  // ─── REGRA DE FERRO: ID canônico = SEMPRE últimos 11 dígitos (sem "55") ───
  // "5517991164762" → "17991164762"
  // "17991164762"   → "17991164762"  (sem alteração)
  let aliasKey = digits.slice(-11);

  // ─── PRIORIDADE AO LEAD CADASTRADO ────────────────────────────────────────
  // Antes de qualquer busca em conversations, verifica nos leads cadastrados
  // se existe um número cujo sufixo (últimos 8 dígitos) bate com o número recebido.
  // Isso resolve casos onde o WhatsApp entrega um DDD errado (ex: 95 ao invés de 17).
  try {
    const crmSnap = await db.collection("crm_data").doc("shared").get();
    const leads = crmSnap.exists ? (crmSnap.data()?.leads || []) : [];
    const suffix8 = aliasKey.slice(-8);
    const receivedDDD = aliasKey.slice(0, 2);

    for (const lead of leads) {
      const leadDigits = (lead.telefone || "").replace(/\D/g, "");
      const leadNorm = leadDigits.startsWith("55") ? leadDigits.slice(2) : leadDigits;
      if (leadNorm.length < 10) continue;
      const leadLast11 = leadNorm.slice(-11);
      const leadDDD = leadLast11.slice(0, 2);
      const leadSuffix8 = leadLast11.slice(-8);
      // Mesmo sufixo de 8 dígitos, DDDs diferentes → WhatsApp entregou DDD errado
      if (leadSuffix8 === suffix8 && leadDDD !== receivedDDD) {
        console.log(`[saveMessage] ⚠ DDD incorreto detectado! Recebido: ${aliasKey} (DDD ${receivedDDD}) | Lead cadastrado: ${leadLast11} (DDD ${leadDDD}). Corrigindo para ${leadLast11}.`);
        aliasKey = leadLast11;
        break;
      }
    }
  } catch (leadLookupErr) {
    console.warn("[saveMessage] Erro ao buscar lead por sufixo:", leadLookupErr.message);
  }

  let targetPhone = targetConversation
    ? targetConversation.replace(/\D/g, "").slice(-11)   // normaliza imediatamente
    : null;

  // Mesmo quando targetConversation é fornecido, verifica se o doc EXISTE no Firestore.
  // Se não existir, faz busca profunda para evitar criar duplicata.
  if (targetPhone) {
    const directSnap = await db.collection("conversations").doc(targetPhone).get();
    if (!directSnap.exists) {
      console.log(`[saveMessage] Doc "${targetPhone}" não existe. Buscando conversa equivalente para: ${aliasKey}`);
      targetPhone = null; // força busca profunda abaixo
    }
  }

  if (!targetPhone) {
    // 1ª tentativa: alias map (pré-carregado no startup)
    const mappedPhone = phoneAliasMap.get(aliasKey);
    if (mappedPhone) {
      targetPhone = mappedPhone;
      console.log(`[saveMessage] Alias map: ${aliasKey} -> ${targetPhone}`);
    } else {
      // 2ª tentativa: busca profunda em todas as conversas
      // Verifica TANTO o ID do documento QUANTO o campo 'telefone' dentro do doc
      const allConvs = await db.collection("conversations").get();
      for (const convDoc of allConvs.docs) {
        const idLast11  = convDoc.id.replace(/\D/g, "").slice(-11);
        const telLast11 = (convDoc.data().telefone || "").replace(/\D/g, "").slice(-11);
        if (
          (idLast11.length === 11  && idLast11  === aliasKey) ||
          (telLast11.length === 11 && telLast11 === aliasKey)
        ) {
          targetPhone = convDoc.id;
          phoneAliasMap.set(aliasKey, targetPhone); // cacheia para próximas vezes
          console.log(`[saveMessage] Conversa encontrada por busca profunda: ${targetPhone}`);
          break;
        }
      }
      
      // 3ª tentativa: criar nova conversa (última opção)
      if (!targetPhone) {
        // Última verificação: busca por SUFIXO novamente (garantia extra)
        const convSnaps2 = await db.collection("conversations").get();
        for (const convDoc2 of convSnaps2.docs) {
          const idLast112 = convDoc2.id.replace(/\D/g, "").slice(-11);
          if (idLast112.length === 11 && idLast112 === aliasKey) {
            targetPhone = convDoc2.id;
            phoneAliasMap.set(aliasKey, targetPhone);
            console.log(`[saveMessage] Conversa encontrada por sufixo (segunda verificação): ${targetPhone}`);
            break;
          }
        }

        if (!targetPhone) {
          // Log claro para auditoria antes de criar
          console.log(`[saveMessage] CRIANDO NOVA: Motivo - Nenhum match encontrado para os 11 dígitos finais de ${telefone}.`);
          targetPhone = aliasKey;
        }
      }
    }
  }

  // Registra alias para futuras mensagens usando last11 como chave
  const targetAliasKey = (targetPhone || aliasKey).replace(/\D/g, "").slice(-11);
  if (targetAliasKey) phoneAliasMap.set(targetAliasKey, targetPhone);

  const convRef = db.collection("conversations").doc(targetPhone);
  const msgRef = convRef.collection("messages").doc(msgId);
  const existing = await msgRef.get();
  if (existing.exists) {
    console.log(`[saveMessage] Mensagem ${msgId} já existe - ignorando duplicata`);
    return;
  }

  await msgRef.set({ id: msgId, body, fromMe, timestamp: Timestamp.now(), read: fromMe });
  const convSnap = await convRef.get();
  const currentUnread = convSnap.exists ? (convSnap.data().unreadCount || 0) : 0;

  // ─── REGRA DE FERRO: campo 'telefone' salvo no doc = SEMPRE 11 dígitos ───
  const canonicalTelefone = targetPhone.replace(/\D/g, "").slice(-11);
  const cleanMessage = cleanLastMessage(body);
  await convRef.set(
    { telefone: canonicalTelefone, lastMessage: cleanMessage, lastMessageAt: Timestamp.now(), unreadCount: fromMe ? 0 : currentUnread + 1 },
    { merge: true }
  );

  console.log(`[saveMessage] Mensagem salva na conversa: ${targetPhone}, fromMe: ${fromMe}`);
}

// Sincronizar lead: cria se novo, NAO sobrescreve se ja existe
// RETORNA o telefone correto da conversa para ser usado pelo saveMessage
async function syncLead(telefone, pushName, firstMessage) {
  try {
    if (telefone.length < 12) {
      console.error(`[syncLead] Rejeitando telefone invalido: "${telefone}"`);
      return null;
    }

    // TRAVA: nunca criar lead/conversa para o próprio número do bot
    const telDigitsCheck = telefone.replace(/\D/g, "");
    if (telDigitsCheck.slice(-11) === MY_PHONE || (myOwnPhone && telDigitsCheck.slice(-11) === myOwnPhone)) {
      console.warn(`[syncLead] BLOQUEADO: tentativa de criar lead para o próprio número do bot (${telefone}). Ignorando.`);
      return null;
    }

    // NORMALIZAR PARA ÚLTIMOS 11 DÍGITOS (canonical ID)
    const telDigits = telefone.replace(/\D/g, "");
    const telLast11 = telDigits.slice(-11);  // ex: "17991045246"
    console.log(`[syncLead] Normalizando ${telefone} -> ${telLast11}`);

    const crmRef = db.collection("crm_data").doc("shared");
    const doc = await crmRef.get();
    const leads = doc.exists ? doc.data()?.leads || [] : [];

    // Busca lead por últimos 11 dígitos (DDD + número)
    let existing = leads.find((l) => {
      const d = l.telefone?.replace(/\D/g, "") || "";
      return d.length >= 11 && telLast11.length === 11 && d.slice(-11) === telLast11;
    });

    if (existing) {
      let nomeAtual = existing.nome;
      const leadPhone = existing.telefone.replace(/\D/g, "");
      const leadPhoneNormalized = leadPhone.startsWith("55") ? leadPhone : `55${leadPhone}`;

      // Se o nome foi gerado automaticamente ("WhatsApp XXXX") e agora temos o nome real, atualiza
      if (pushName && /^WhatsApp \d+$/.test(existing.nome)) {
        console.log(`[syncLead] Atualizando nome gerado "${existing.nome}" -> "${pushName}"`);
        const updatedLeads = leads.map((l) => l.id === existing.id ? { ...l, nome: pushName } : l);
        await crmRef.update({ leads: updatedLeads });
        nomeAtual = pushName;
      }

      // Buscar conversa existente para este lead
      let conversationPhone = null;
      const allConvs = await db.collection("conversations").get();
      const leadLast11 = leadPhoneNormalized.slice(-11);
      
      // 1ª tentativa: buscar por telefone do LEAD (últimos 11 dígitos)
      for (const convDoc of allConvs.docs) {
        const convDigits = convDoc.id.replace(/\D/g, "");
        if (convDigits.length >= 11 && leadLast11.length >= 11 && convDigits.slice(-11) === leadLast11) {
          conversationPhone = convDoc.id;
          console.log(`[syncLead] Conversa encontrada por telefone do lead: ${conversationPhone}`);
          break;
        }
      }
      
      // 2ª tentativa: buscar por leadNome (conversa já existente para este contato)
      if (!conversationPhone) {
        const nameKey = String(nomeAtual || "").trim().toLowerCase();
        if (nameKey && !/^whatsapp \d+$/i.test(nameKey)) {
          for (const convDoc of allConvs.docs) {
            const convName = String(convDoc.data()?.leadNome || "").trim().toLowerCase();
            if (convName === nameKey) {
              conversationPhone = convDoc.id;
              console.log(`[syncLead] Conversa encontrada por nome: ${conversationPhone} (nome: "${nomeAtual}")`);
              break;
            }
          }
        }
      }
      
      // 3ª tentativa: criar conversa com ÚLTIMOS 11 DÍGITOS do telefone normalizado
      if (!conversationPhone) {
        conversationPhone = telLast11;  // Usar a versão normalizada de 11 dígitos
        console.log(`[syncLead] Criando conversa com telefone normalizado: ${conversationPhone}`);
      }

      // Registra alias: usar sempre os ÚLTIMOS 11 dígitos como chave
      const aliasKey = telLast11;
      phoneAliasMap.set(aliasKey, conversationPhone);


      const updateData = { telefone: conversationPhone };
      if (nomeAtual) {
        updateData.leadNome = nomeAtual;
      }
      // Se temos o lead existente, garantir que registramos o leadId
      if (existing && existing.id) {
        updateData.leadId = existing.id;
      }
      await db.collection("conversations").doc(conversationPhone).set(updateData, { merge: true });

      // Limpa leadNome duplicado em outras conversas
      try {
        const targetName = String(nomeAtual || "").trim().toLowerCase();
        if (targetName) {
          for (const convDoc of allConvs.docs) {
            if (convDoc.id === conversationPhone) continue;
            const convName = String(convDoc.data()?.leadNome || "").trim().toLowerCase();
            if (convName === targetName) {
              await convDoc.ref.set({ leadNome: "" }, { merge: true });
              console.log(`[syncLead] leadNome duplicado removido de ${convDoc.id}`);
            }
          }
        }
      } catch (cleanupErr) {
        console.warn("[syncLead] Falha ao limpar leadNome duplicado:", cleanupErr.message);
      }
      
      console.log(`[syncLead] Lead "${nomeAtual}" -> conversa: ${conversationPhone}`);
      return conversationPhone;
    }

    // Lead novo
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    const nome = pushName || `WhatsApp ${telLast11.slice(-4)}`;

    console.log(`[syncLead] Novo lead: nome='${nome}', tel='${telLast11}'`);

    const newLead = {
      id: `lead_${Date.now()}`,
      dataCriacao: dateStr,
      dataContato: dateStr,
      nome,
      telefone: telefone,  // Guardar o formato original do telefone no CRM
      servicoProcurado: "",
      captador: "",
      fonteLead: "",
      etapaLead: "Novo",
      status: "",
      respostaLead: "RESPONDEU",
      comparecimento: "",
      dataFollowUp: "",
      dataAgendamento: "",
      dataRetornoLigacao: "",
      observacao: "",
      followUpCount: 0,
      lembretes: { h24: false, today: false },
    };

    await crmRef.update({ leads: [...leads, newLead] });
    console.log(`Novo lead criado: ${nome} (${telefone})`);
    
    // Cria conversa com ÚLTIMOS 11 DÍGITOS (canonical ID)
    await db.collection("conversations").doc(telLast11).set(
      { leadNome: nome, telefone: telLast11, leadId: newLead.id },
      { merge: true }
    );
    
    // Registra alias para futuras mensagens
    phoneAliasMap.set(telLast11, telLast11);
    
    console.log(`[syncLead] Conversa criada com ID: ${telLast11}`);
    
    return telLast11;  // Retornar a conversa normalizada
  } catch (e) {
    console.error("Erro ao sincronizar lead:", e);
    return null;
  }
}

// Pré-carrega phoneAliasMap com TODAS as conversas existentes no Firestore.
// Isso garante que números conhecidos sejam vinculados ao doc correto
// desde o primeiro evento, sem precisar de mensagens prévias para popular o cache.
async function preloadPhoneAliasMap() {
  try {
    const convSnaps = await db.collection("conversations").get();
    let count = 0;
    for (const docSnap of convSnaps.docs) {
      const data = docSnap.data();
      const docId = docSnap.id;

      // Registra pelo ID do documento (last-11 → docId)
      const idLast11 = docId.replace(/\D/g, "").slice(-11);
      if (idLast11.length === 11) {
        phoneAliasMap.set(idLast11, docId);
        count++;
      }

      // Registra também pelo campo 'telefone' dentro do documento
      // (pode ter formato diferente do ID, ex: "5527..." vs "270...")
      if (data.telefone) {
        const telLast11 = (data.telefone || "").replace(/\D/g, "").slice(-11);
        if (telLast11.length === 11 && telLast11 !== idLast11) {
          if (!phoneAliasMap.has(telLast11)) {
            phoneAliasMap.set(telLast11, docId);
            count++;
          }
        }
      }
    }
    console.log(`[preload] phoneAliasMap: ${count} entradas de ${convSnaps.size} conversas`);
  } catch (e) {
    console.error("[preload] Erro ao pré-carregar alias map:", e.message);
  }
}

// Também percorre os leads no CRM e garante mapeamento forçado
// para evitar que conversas sejam criadas em formatos diferentes (ex: com 55 prefix)
async function preloadPhoneAliasMapFromLeads() {
  try {
    const crmRef = db.collection("crm_data").doc("shared");
    const doc = await crmRef.get();
    const leads = doc.exists ? doc.data()?.leads || [] : [];
    if (!leads || leads.length === 0) return;

    const convSnaps = await db.collection("conversations").get();
    for (const l of leads) {
      const tel = String(l.telefone || "").replace(/\D/g, "");
      if (!tel || tel.length < 8) continue;
      const last11 = tel.slice(-11);
      if (last11.length !== 11) continue;

      // Se já tem no alias map, pula
      if (phoneAliasMap.has(last11)) continue;

      // Tenta encontrar um documento cuja ID termine com esses 11 dígitos
      let found = null;
      for (const convDoc of convSnaps.docs) {
        const convIdLast11 = convDoc.id.replace(/\D/g, "").slice(-11);
        if (convIdLast11.length === 11 && convIdLast11 === last11) {
          found = convDoc.id;
          break;
        }
      }

      if (found) {
        phoneAliasMap.set(last11, found);
      } else {
        // Não encontrou conversa correspondente — mapear para o próprio last11
        // Isso força o uso do ID canônico (últimos 11 dígitos) quando for criado
        phoneAliasMap.set(last11, last11);
      }
    }
    console.log(`[preload] phoneAliasMap alimentado a partir dos leads: ${leads.length} leads varridos`);
  } catch (e) {
    console.error("[preload] Erro ao pré-carregar alias map a partir dos leads:", e.message);
  }
}

// Executa imediatamente ao iniciar o servidor (antes do WhatsApp conectar)
await preloadPhoneAliasMap();
await preloadPhoneAliasMapFromLeads();

// Atualiza conversas associadas a um lead quando o lead é editado
async function updateConversationsForLead(lead) {
  try {
    if (!lead || !lead.telefone) return;
    const leadDigits = String(lead.telefone || "").replace(/\D/g, "");
    const leadNorm = leadDigits.startsWith("55") ? leadDigits.slice(2) : leadDigits;
    if (leadNorm.length < 8) return;
    const leadLast11 = leadNorm.slice(-11);
    const leadLast8 = leadNorm.slice(-8);

    const convSnaps = await db.collection('conversations').get();
    // Ensure target conversation exists (create if necessary)
    const targetId = leadLast11;
    const targetRef = db.collection('conversations').doc(targetId);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      await targetRef.set({ telefone: leadLast11, leadId: lead.id, leadNome: lead.nome }, { merge: true });
    } else {
      // ensure leadId/leadNome present
      await targetRef.set({ leadId: lead.id, leadNome: lead.nome }, { merge: true });
    }

    for (const doc of convSnaps.docs) {
      const id = doc.id.replace(/\D/g, "").slice(-11);
      if (id === leadLast11) continue; // already the canonical one
      const data = doc.data() || {};
      const telField = String(data.telefone || "").replace(/\D/g, "").slice(-11);
      // match by last8 and different last11
      if ((id && id.slice(-8) === leadLast8) || (telField && telField.slice(-8) === leadLast8)) {
        // merge this doc into targetId
        const srcRef = db.collection('conversations').doc(doc.id);
        const msgs = await srcRef.collection('messages').get();
        for (const m of msgs.docs) {
          const targetMsgRef = targetRef.collection('messages').doc(m.id);
          const exists = await targetMsgRef.get();
          if (!exists.exists) {
            await targetMsgRef.set(m.data());
          }
        }
        // update metadata if target missing
        const srcData = doc.data() || {};
        const updates = {};
        if (!targetSnap.exists || !targetSnap.data()?.leadId) updates.leadId = lead.id;
        if (!targetSnap.exists || !targetSnap.data()?.leadNome) updates.leadNome = lead.nome;
        if (!targetSnap.exists || !targetSnap.data()?.telefone) updates.telefone = leadLast11;
        if (Object.keys(updates).length) await targetRef.set(updates, { merge: true });
        // delete source
        await srcRef.delete();
        console.log(`[lead-sync] Mesclada conversa ${doc.id} -> ${targetId} para lead ${lead.id}`);
      }
    }
  } catch (e) {
    console.error('[lead-sync] erro ao atualizar conversas para lead', lead?.id, e.message || e);
  }
}

// Escuta alterações no documento de leads e sincroniza conversas automaticamente
const crmSharedRef = db.collection('crm_data').doc('shared');
crmSharedRef.onSnapshot(async (snap) => {
  try {
    if (!snap.exists) return;
    const leads = snap.data()?.leads || [];
    console.log('[lead-sync] snapshot de leads recebido, sincronizando', leads.length, 'leads');
    for (const l of leads) {
      // executar sem bloquear tudo (fire-and-forget com await para ordem)
      await updateConversationsForLead(l);
    }
    // repopular alias map após sync
    await preloadPhoneAliasMapFromLeads();
  } catch (e) {
    console.error('[lead-sync] falha no snapshot handler:', e.message || e);
  }
});

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./auth_info" }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  },
});

client.on("qr", async (qr) => {
  console.log("\nQR Code gerado — escaneie no CRM ou aqui abaixo:\n");
  qrcode.generate(qr, { small: true });
  console.log("\n(WhatsApp -> Aparelhos conectados -> Conectar aparelho)\n");
  try {
    currentQR = await QRCode.toDataURL(qr);
    isConnected = false;
  } catch (e) {
    console.error("Erro ao gerar QR base64:", e.message);
  }
});

client.on("ready", () => {
  console.log("WhatsApp conectado! Escutando mensagens...");
  currentQR = null;
  isConnected = true;
  // Captura o próprio número para trava anti-auto-conversa
  try {
    if (client.info?.wid?._serialized) {
      const ownDigits = client.info.wid._serialized.replace("@c.us", "").replace(/\D/g, "");
      myOwnPhone = ownDigits.slice(-11);
      console.log(`[ready] Meu número (bot): ${myOwnPhone}`);
    }
  } catch (e) {
    console.warn("[ready] Não foi possível capturar phone do bot:", e.message);
  }
  // Recarrega alias map com dados atuais do Firestore (cobertura de conversas criadas após o startup)
  preloadPhoneAliasMap();
  preloadPhoneAliasMapFromLeads();
});

client.on("authenticated", () => {
  console.log("Autenticado! Sessao salva.");
  currentQR = null;
});

client.on("auth_failure", (msg) => {
  console.error("Falha de autenticacao:", msg);
});

client.on("disconnected", (reason) => {
  console.log("Desconectado:", reason);
  isConnected = false;
  setTimeout(() => client.initialize(), 5000);
});

client.on("message", async (msg) => {
  // TRAVA: ignorar mensagens enviadas pelo próprio usuário (evita auto-conversa e duplicatas)
  if (msg.fromMe || msg.isGroupMsg) return;
  
  // Resolve telefone UMA VEZ e usa o mesmo em todas as operações
  // isInbound=true: NÃO tentar getContact() que pode retornar número errado
  const telefone = await getRealPhone(msg, false, true);
  
  // Rejeita mensagens com telefone inválido/não resolvível
  if (!telefone) {
    console.warn(`[message] Telefone não resolvido: ${msg.from}. Ignorando mensagem.`);
    return;
  }

  // Validar telefone: minimo "55" + DDD(2) + numero(8-9) = 12-14 chars
  if (telefone.length < 12 || telefone.length > 14) {
    console.warn(`[message] Telefone invalido (tamanho ${telefone.length}): "${telefone}" de ${msg.from}. Ignorando.`);
    return;
  }
  
  // Valida que começa com "55"
  if (!telefone.startsWith("55")) {
    console.warn(`[message] Telefone invalido (não começa com 55): "${telefone}" de ${msg.from}. Ignorando.`);
    return;
  }
  
  // Extrai e valida DDD (2 dígitos após "55", deve ser 11-99)
  const ddd = telefone.substring(2, 4);
  const dddNum = parseInt(ddd, 10);
  if (dddNum < 11 || dddNum > 99) {
    console.warn(`[message] DDD inválido (${ddd}): telefone "${telefone}" de ${msg.from}. Ignorando.`);
    return;
  }

  // Tenta extrair nome real do WhatsApp por múltiplas fontes
  let pushName = msg.notifyName || msg._data?.notifyName || msg._data?.pushName || null;
  if (!pushName) {
    try {
      const contact = await msg.getContact();
      pushName = contact?.pushname || contact?.name || null;
      if (pushName) console.log(`[pushName] Resolvido via getContact: ${pushName}`);
    } catch (_) {}
  }

  let body = msg.body || "";

  // Identificar tipo de midia com emoji descritivo
  if (msg.hasMedia) {
    if (msg.type === "ptt" || msg.type === "audio") {
      // tratado abaixo separadamente
    } else if (msg.type === "image") {
      body = msg.body ? `\uD83D\uDCF7 ${msg.body}` : "\uD83D\uDCF7 Imagem";
    } else if (msg.type === "video") {
      body = msg.body ? `\uD83C\uDFA5 ${msg.body}` : "\uD83C\uDFA5 V\u00eddeo";
    } else if (msg.type === "document") {
      body = msg.body || msg._data?.filename || "\uD83D\uDCC4 Documento";
    } else if (msg.type === "sticker") {
      body = "\uD83C\uDFF7\uFE0F Sticker";
    } else {
      body = body || "📦 Arquivo";
    }
  }

  // Detectar e salvar audio (ptt = mensagem de voz, audio = arquivo de audio)
  if (msg.hasMedia && (msg.type === "ptt" || msg.type === "audio")) {
    try {
      const media = await msg.downloadMedia();
      if (media?.data) {
        const ext = media.mimetype?.includes("ogg") ? "ogg" : "mp3";
        const sanitizedId = msg.id._serialized.replace(/[^a-zA-Z0-9_\-]/g, "_");
        const filename = `${sanitizedId}.${ext}`;
        writeFileSync(join(MEDIA_DIR, filename), Buffer.from(media.data, "base64"));
        body = `[audio:${filename}]`;
        console.log(`Audio salvo: ${filename}`);
      }
    } catch (e) {
      console.error("Erro ao baixar audio:", e.message);
      body = "🎙️ Áudio";
    }
  }

  console.log(`RECV ${telefone} (desde ${msg.from}): ${body || "[sem conteúdo]"}`);
  
  // syncLead retorna o telefone CORRETO da conversa - usá-lo em saveMessage
  const firstMsg = typeof body === "string" && body.startsWith("[audio:") ? "🎙️ Áudio" : body;
  const conversationPhone = await syncLead(telefone, pushName, firstMsg);
  await saveMessage({ telefone, body, fromMe: false, msgId: msg.id._serialized, targetConversation: conversationPhone });
});

client.on("message_create", async (msg) => {
  try {
    if (!msg.fromMe || msg.isGroupMsg) return;

    // Usa a mesma função getRealPhone para consistência (campo msg.to)
    let resolvedPhone = await getRealPhone(msg, true);

    // Trava Anti-Auto-Conversa: getRealPhone retornou null OU resolveu para o próprio bot
    const resolvedLast11 = resolvedPhone ? String(resolvedPhone).replace(/\D/g, "").slice(-11) : null;
    if (!resolvedPhone || (myOwnPhone && resolvedLast11 === myOwnPhone)) {
      if (resolvedPhone) {
        console.warn(`[message_create] ⚠️ Trava Anti-Auto-Conversa: resolvedPhone (${resolvedPhone}) é o próprio bot. Buscando destinatário real...`);
      }
      // Tentativa 1: msg.to direto
      const toRaw = (msg.to || "").replace("@c.us", "").replace(/\D/g, "");
      // Tentativa 2: msg._data.id.remote (remoteJid)
      const remoteRaw = (msg._data?.id?.remote || "").replace("@c.us", "").replace(/\D/g, "");
      const fallback = [toRaw, remoteRaw].find(r => r && r.length >= 10 && (!myOwnPhone || r.slice(-11) !== myOwnPhone));
      if (fallback) {
        resolvedPhone = fallback.startsWith("55") ? fallback : `55${fallback}`;
        console.warn(`[message_create] ⚠️ Destinatário real encontrado via fallback: ${resolvedPhone}`);
      } else {
        console.error(`[message_create] ❌ Não foi possível determinar o destinatário real (msg.to=${msg.to}). Ignorando.`);
        return;
      }
    }
    
    const msgId = msg.id?._serialized;
    
    // Verifica se há mapeamento forçado da API (quando enviamos via /send-message)
    const forcedConversationPhone = msgId ? sentMsgConversationMap.get(msgId) : null;
    
    // Extrai últimos 11 dígitos do telefone resolvido (canonical key)
    const resolvedDigits = String(resolvedPhone).replace(/\D/g, "");
    const aliasKey = resolvedDigits.slice(-11);  // últimos 11 dígitos
    
    // Prioridade: mapeamento forçado > alias registrado > normalização dos últimos 11
    let telefone;
    if (forcedConversationPhone) {
      // API enviou explicitamente para qual conversa usar
      telefone = forcedConversationPhone;
      console.log(`[message_create] Usando conversa forçada: ${telefone}`);
    } else if (phoneAliasMap.has(aliasKey)) {
      // Há alias registrado para este contato
      telefone = phoneAliasMap.get(aliasKey);
      console.log(`[message_create] Usando alias registrado: ${aliasKey} -> ${telefone}`);
    } else {
      // Normaliza para últimos 11 dígitos (eliminando prefixo "55" se presente)
      telefone = aliasKey;
      console.log(`[message_create] Normalizado para 11 dígitos (sem prefixo): ${telefone}`);
    }

    // Se havia um mapeamento forçado diferente do resolvido, registra o alias
    if (forcedConversationPhone && forcedConversationPhone !== telefone) {
      phoneAliasMap.set(aliasKey, forcedConversationPhone);
      console.log(`[message_create] Alias registrado: ${aliasKey} -> ${forcedConversationPhone}`);
    }

    // Limpa o mapeamento temporário
    if (msgId) {
      sentMsgConversationMap.delete(msgId);
    }

    // Determinar body — para mídia (áudio, imagem, etc.) faz download igual ao handler de incoming
    let body = msg.body || "";

    if (msg.hasMedia) {
      if (msg.type === "ptt" || msg.type === "audio") {
        try {
          const media = await msg.downloadMedia();
          if (media?.data) {
            const ext = media.mimetype?.includes("ogg") ? "ogg" : "mp3";
            const sanitizedId = msg.id._serialized.replace(/[^a-zA-Z0-9_\-]/g, "_");
            const filename = `${sanitizedId}.${ext}`;
            writeFileSync(join(MEDIA_DIR, filename), Buffer.from(media.data, "base64"));
            body = `[audio:${filename}]`;
            console.log(`[message_create] Áudio enviado salvo: ${filename}`);
          }
        } catch (e) {
          console.error("[message_create] Erro ao baixar áudio enviado:", e.message);
          body = "🎙️ Áudio";
        }
      } else if (msg.type === "image") {
        body = body ? `📷 ${body}` : "📷 Imagem";
      } else if (msg.type === "video") {
        body = body ? `🎥 ${body}` : "🎥 Vídeo";
      } else if (msg.type === "document") {
        body = body || msg._data?.filename || "📄 Documento";
      } else if (msg.type === "sticker") {
        body = "🏷️ Sticker";
      } else {
        body = body || "📦 Arquivo";
      }
    } else {
      body = body || "(mídia)";
    }

    // Log de identidade: mostra o fluxo completo da resolução
    console.log(`[message_create] Enviado por: ME | Destinatário Original: ${msg.to} | Resolvido para: ${telefone}`);
    console.log(`SENT ${telefone}: ${body}`);
    
    // Salva com telefone normalizado (sempre últimos 11 dígitos)
    await saveMessage({ telefone, body, fromMe: true, msgId: msg.id._serialized, targetConversation: telefone });
  } catch (err) {
    console.error('[message_create handler] erro inesperado:', err && err.stack ? err.stack : err);
  }
});

// API: enviar mensagem
app.post("/send-message", async (req, res) => {
  console.log('[send-message] payload:', req.body);
  const { telefone, message } = req.body;
  if (!telefone || !message) return res.status(400).json({ error: "telefone e message sao obrigatorios" });
  try {
    // Normaliza telefone (remove formatação, pode vir formatado do CRM: "(17) 99104-5246")
    const digits = telefone.replace(/\D/g, "");
    const normalizedPhone = digits.startsWith("55") ? digits : `55${digits}`;
    
    if (normalizedPhone.length < 12) {
      return res.status(400).json({ error: "telefone invalido (menos de 12 digitos)" });
    }
    
    // Busca o lead no CRM para obter o nome
    let leadName = null;
    try {
      const crmRef = db.collection("crm_data").doc("shared");
      const crmSnap = await crmRef.get();
      const leads = crmSnap.exists ? (crmSnap.data()?.leads || []) : [];
      const telDigits = normalizedPhone.replace(/\D/g, "");
      const matchedLead = leads.find((l) => {
        const leadDigits = String(l?.telefone || "").replace(/\D/g, "");
        return leadDigits.length >= 11 && telDigits.length >= 11 && leadDigits.slice(-11) === telDigits.slice(-11);
      });
      if (matchedLead) {
        leadName = String(matchedLead.nome || "").trim();
        console.log(`[send-message] Lead encontrado: "${leadName}" para telefone ${normalizedPhone}`);
      }
    } catch (leadErr) {
      console.warn("[send-message] Falha ao buscar lead do CRM:", leadErr.message);
    }

    // syncLead PRIMEIRO para obter a conversa correta
    const syncedConversation = await syncLead(normalizedPhone, leadName || null, message);
    const targetConv = syncedConversation || normalizedPhone;

    const waId = phoneToWAId(normalizedPhone);
    
    // Verifica se o número é válido e WhatsApp ativo (cria chat implicitamente)
    let numberId;
    try {
      numberId = await client.getNumberId(normalizedPhone);
      if (!numberId) {
        return res.status(400).json({ error: `Número ${normalizedPhone} não é WhatsApp ativo ou não existe` });
      }
    } catch (numErr) {
      console.warn(`[send-message] Não conseguiu validar número ${normalizedPhone}:`, numErr.message);
      return res.status(400).json({ error: `Não foi possível validar número: ${numErr.message}` });
    }
    
    // Agora tenta enviar
    let sentMsg;
    try {
      sentMsg = await client.sendMessage(waId, message);
    } catch (sendErr) {
      console.error(`[send-message] Erro ao enviar para ${waId}:`, sendErr.message);
      return res.status(500).json({ error: `Falha ao enviar: ${sendErr.message}` });
    }

    // Mapeia msgId -> conversa CORRETA (para message_create usar a mesma)
    if (sentMsg?.id?._serialized) {
      sentMsgConversationMap.set(sentMsg.id._serialized, targetConv);
      setTimeout(() => sentMsgConversationMap.delete(sentMsg.id._serialized), 10 * 60 * 1000);
    }
    
    // Registra alias para consistência (usar últimos 11 dígitos)
    const aliasKey = normalizedPhone.replace(/\D/g, "").slice(-11);
    phoneAliasMap.set(aliasKey, targetConv);

    // Salva mensagem usando conversa retornada pelo syncLead
    await saveMessage({
      telefone: normalizedPhone,
      body: message,
      fromMe: true,
      msgId: sentMsg?.id?._serialized || `api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      targetConversation: targetConv,
    });

    console.log(`[send-message] Mensagem enviada para ${targetConv}: ${message}`);
    res.json({ success: true });
  } catch (e) {
    console.error("[send-message] Erro:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// API: status
app.get("/status", (req, res) => {
  const info = client.info;
  res.json({ connected: !!info, number: info?.wid?.user || null });
});

// API: QR Code para autenticacao no CRM
app.get("/qr", (req, res) => {
  res.json({ qr: currentQR, connected: isConnected });
});

// API: marcar como lido
app.post("/mark-read", async (req, res) => {
  const { telefone } = req.body;
  if (!telefone) return res.status(400).json({ error: "telefone obrigatorio" });
  try {
    const normalizedPhone = telefone.replace(/\D/g, "");
    
    // Encontra a conversa correta (pode ter ID diferente)
    let targetPhone = normalizedPhone;
    const last11 = normalizedPhone.slice(-11);
    
    // Tenta com ID exato primeiro
    const directSnap = await db.collection("conversations").doc(normalizedPhone).get();
    if (!directSnap.exists) {
      // Procura por últimos 11 dígitos (mais preciso)
      const allConvs = await db.collection("conversations").get();
      for (const doc of allConvs.docs) {
        const docDigits = doc.id.replace(/\D/g, "");
        if (docDigits.length >= 11 && last11.length >= 11 && docDigits.slice(-11) === last11) {
          targetPhone = doc.id;
          break;
        }
      }
    }
    
    await db.collection("conversations").doc(targetPhone).update({ unreadCount: 0 });
    const msgsRef = db.collection("conversations").doc(targetPhone).collection("messages");
    const unread = await msgsRef.where("read", "==", false).get();
    const batch = db.batch();
    unread.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: limpar leads com telefone inválido (menos de 12 dígitos)
app.get("/cleanup-invalid-leads", async (req, res) => {
  try {
    const crmRef = db.collection("crm_data").doc("shared");
    const doc = await crmRef.get();
    const leads = doc.exists ? doc.data()?.leads || [] : [];
    
    const invalid = leads.filter((l) => {
      const digits = (l.telefone || "").replace(/\D/g, "");
      return digits.length < 12;
    });
    
    if (invalid.length === 0) {
      return res.json({ message: "Nenhum lead inválido encontrado", cleaned: 0 });
    }
    
    const cleaned = leads.filter((l) => {
      const digits = (l.telefone || "").replace(/\D/g, "");
      return digits.length >= 12;
    });
    
    await crmRef.update({ leads: cleaned });
    console.log(`[cleanup] Removidos ${invalid.length} leads com telefone inválido`);
    
    res.json({
      message: `Removidos ${invalid.length} leads com telefone inválido`,
      cleaned: invalid.length,
      removedLeads: invalid.map((l) => ({ nome: l.nome, telefone: l.telefone })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: próximos disparos agendados (para dashboard em tempo real)
app.get("/api/next-sends", (req, res) => {
  try {
    const nextSendsFile = join(__dirname, "next-sends.json");
    
    if (!existsSync(nextSendsFile)) {
      return res.json([]);
    }
    
    const data = readFileSync(nextSendsFile, "utf8");
    const nextSends = JSON.parse(data);
    
    res.json(nextSends || []);
  } catch (e) {
    console.error("[/api/next-sends]", e.message);
    res.json([]);
  }
});

// API: falhas de envio (para alertas de reconexão)
app.get("/api/send-failures", (req, res) => {
  try {
    const failuresFile = join(__dirname, "send-failures.json");
    
    if (!existsSync(failuresFile)) {
      return res.json({});
    }
    
    const data = readFileSync(failuresFile, "utf8");
    const failures = JSON.parse(data);
    
    res.json(failures || {});
  } catch (e) {
    console.error("[/api/send-failures]", e.message);
    res.json({});
  }
});

app.listen(PORT, () => {
  console.log(`\nServidor CRM WhatsApp na porta ${PORT}\n`);
});

console.log("Iniciando WhatsApp... aguarde o QR Code...\n");
client.initialize();
