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

// Função para limpar lastMessage (remove nomes técnicos de arquivos)
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
  if (body.includes(".ogg") || body.includes(".mp3")) return "🎤 Áudio";
  return body;
}

async function fixLabels() {
  console.log("[fix-labels] Iniciando limpeza de lastMessage...\n");

  const conversationsRef = db.collection("conversations");
  const snapshot = await conversationsRef.get();

  let updated = 0;
  let unchanged = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const oldMessage = data.lastMessage || "";
    const newMessage = cleanLastMessage(oldMessage);

    if (oldMessage !== newMessage) {
      await doc.ref.update({ lastMessage: newMessage });
      console.log(
        `[fix-labels] ✓ ${doc.id}: "${oldMessage.substring(0, 40)}..." → "${newMessage}"`
      );
      updated++;
    } else {
      unchanged++;
    }
  }

  console.log(
    `\n[fix-labels] Concluído! Atualizadas: ${updated} | Sem mudanças: ${unchanged}`
  );
}

fixLabels().catch((err) => {
  console.error("[fix-labels] Erro:", err.message);
  process.exit(1);
});
