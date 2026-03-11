/**
 * migrate-conversations.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Percorre a coleção "conversations" do Firestore e renomeia todos os documentos
 * cujo ID tenha 13 dígitos começando com "55" para o ID canônico de 10 dígitos.
 *
 * O que é feito:
 *  1. Lista todos os docs de "conversations"
 *  2. Para cada doc cujo ID tem exatamente 13 dígitos e começa com "55":
 *     a. Calcula o ID canônico (últimos 10 dígitos)
 *     b. Verifica se já existe um doc com esse ID canônico
 *        - Se existir:  move as mensagens do doc 13-dig para o 10-dig, depois deleta o 13-dig
 *        - Se não existir: cria o doc 10-dig com os mesmos dados, migra mensagens, deleta 13-dig
 *  3. Exibe resumo detalhado de tudo que foi feito / ignorado / erros
 *
 * Uso:
 *   node migrate-conversations.js         → modo DRY-RUN (mostra o que faria, sem alterar nada)
 *   node migrate-conversations.js --apply → EXECUTA as alterações no Firestore
 *
 * IMPORTANTE: Faça backup do Firestore antes de rodar com --apply!
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, "serviceAccountKey.json"), "utf8")
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DRY_RUN = !process.argv.includes("--apply");

// ─── helpers ──────────────────────────────────────────────────────────────────
function onlyDigits(str) {
  return String(str || "").replace(/\D/g, "");
}

/** Retorna true para IDs de 13 dígitos que começam com "55" */
function is13DigitBR(id) {
  const d = onlyDigits(id);
  return d.length === 13 && d.startsWith("55");
}

/** Converte telefone para ID canônico de 10 dígitos (remove 55 e o 9 extra quando presente)
 * Ex: "5517991164762" -> "1791164762" (10 dígitos canônicos)
 */
function toCanonical10(id) {
  const d = onlyDigits(id);
  // Remover código do país
  const withoutCC = d.startsWith('55') ? d.slice(2) : d;
  // Se for 11 e tem 9 na posição 3, remover o 9 para formar o ID canônico de 10
  if (withoutCC.length === 11 && withoutCC[2] === '9') {
    return withoutCC.slice(0,2) + withoutCC.slice(3);
  }
  // Fallback: pegar últimos 10
  if (withoutCC.length >= 10) return withoutCC.slice(-10);
  return withoutCC;
}

// ─── copia subcoleção "messages" de srcDocRef para dstDocRef ──────────────────
async function migrateMessages(srcDocRef, dstDocRef, dryRun) {
  const snap = await srcDocRef.collection("messages").get();
  if (snap.empty) return 0;

  let migrated = 0;
  for (const msgDoc of snap.docs) {
    const msgData = msgDoc.data();
    if (!dryRun) {
      const dstMsgRef = dstDocRef.collection("messages").doc(msgDoc.id);
      const exists = await dstMsgRef.get();
      if (!exists.exists) {
        await dstMsgRef.set(msgData);
        migrated++;
      } else {
        console.log(`    [SKIP msg] ${msgDoc.id} já existe no destino`);
      }
    } else {
      migrated++;
    }
  }
  return migrated;
}

// ─── main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  migrate-conversations.js`);
  console.log(`  Modo: ${DRY_RUN ? "DRY-RUN (nenhuma alteração será feita)" : "⚠️  APPLY – alterando Firestore!"}`);
  console.log(`${"═".repeat(60)}\n`);

  const allConvs = await db.collection("conversations").get();
  console.log(`Total de conversations no Firestore: ${allConvs.size}\n`);

  let countMigrated = 0;
  let countMerged = 0;
  let countSkipped = 0;
  let countErrors = 0;

  for (const docSnap of allConvs.docs) {
    const id = docSnap.id;

    // Só processa IDs de 13 dígitos com prefixo "55"
    if (!is13DigitBR(id)) {
      continue;
    }

    const canonical = toCanonical10(id);
    const srcRef = db.collection("conversations").doc(id);
    const dstRef = db.collection("conversations").doc(canonical);

    console.log(`\n─── ${id}  →  ${canonical}`);

    try {
      const [srcData, dstSnap] = await Promise.all([
        docSnap.data(),
        dstRef.get(),
      ]);

      const msgCount = await migrateMessages(srcRef, dstRef, DRY_RUN);
      console.log(`    Mensagens: ${msgCount} a migrar`);

      if (dstSnap.exists) {
      // Documento canônico já existe → apenas migra as mensagens e apaga o 13-dig
      console.log(`    Destino "${canonical}" já existe — mesclando mensagens`);
        if (!DRY_RUN) {
          // Atualiza campos que podem ter vindo do 13-dig (sem sobrescrever dados bons)
          await dstRef.set(
            { telefone: canonical, ...srcData, telefone: canonical },
            { merge: true }
          );
          await srcRef.delete();
          console.log(`    ✅ Mesclado + deletado ${id}`);
        } else {
          console.log(`    [DRY] Iria mesclar mensagens em "${canonical}" e deletar "${id}"`);
        }
        countMerged++;
      } else {
        // Documento canônico não existe → cria com dados do 13-dig
        console.log(`    Destino "${canonical}" NÃO existe — criando`);
        if (!DRY_RUN) {
          const newData = { ...srcData, telefone: canonical };
          await dstRef.set(newData);
          await srcRef.delete();
          console.log(`    ✅ Criado "${canonical}" e deletado "${id}"`);
        } else {
          console.log(`    [DRY] Iria criar "${canonical}" com dados de "${id}" e deletá-lo`);
        }
        countMigrated++;
      }
    } catch (err) {
      console.error(`    ❌ ERRO ao processar ${id}: ${err.message}`);
      countErrors++;
    }
  }

  // ─── Verificação de integridade final ──────────────────────────────────
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RESUMO`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  Migrados (novo doc 10-dig criado):     ${countMigrated}`);
  console.log(`  Mesclados (10-dig já existia):         ${countMerged}`);
  console.log(`  Ignorados (já era 10-dig ou inválido): ${countSkipped}`);
  console.log(`  Erros:                                 ${countErrors}`);
  console.log(`  Modo: ${DRY_RUN ? "DRY-RUN — rode com --apply para executar" : "APLICADO ✅"}`);
  console.log(`${"═".repeat(60)}\n`);

  // Verifica se ainda existem IDs de 13 dígitos (só faz sentido pós-apply)
  if (!DRY_RUN) {
    const verify = await db.collection("conversations").get();
    const remaining13 = verify.docs.filter((d) => is13DigitBR(d.id));
    if (remaining13.length > 0) {
      console.warn(`⚠️  Ainda existem ${remaining13.length} documento(s) com ID de 13 dígitos:`);
      remaining13.forEach((d) => console.warn(`   - ${d.id}`));
    } else {
      console.log(`✅ Nenhum documento com ID de 13 dígitos restante. Migração completa!`);
    }
  }
}

run().catch((e) => {
  console.error("Erro fatal:", e);
  process.exit(1);
});
