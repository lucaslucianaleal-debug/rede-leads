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

const BATCH_LIMIT = 400; // Firestore batch limit is 500 ops

async function mergeDuplicateConversations() {
  console.log("[Start] Buscando conversas duplicadas...\n");

  const conversationsRef = db.collection("conversations");
  const snapshot = await conversationsRef.get();

  // Group documents by phone number
  const byPhone = {};

  snapshot.forEach(doc => {
    const data = doc.data();
    const phone = (data.phone || "").replace(/\D/g, "");
    if (!phone) return;

    if (!byPhone[phone]) byPhone[phone] = [];
    byPhone[phone].push({ id: doc.id, data });
  });

  let mergeCount = 0;

  for (const [phone, docs] of Object.entries(byPhone)) {
    if (docs.length < 2) continue;

    // "Name doc" = ID contains non-digit characters
    // "Number doc" = ID is purely numeric
    const numberDocs = docs.filter(d => /^\d+$/.test(d.id));
    const nameDocs = docs.filter(d => !/^\d+$/.test(d.id));

    if (numberDocs.length === 0 || nameDocs.length === 0) continue;

    // Use the first name doc as target; if multiple, pick longest named
    const target = nameDocs.sort((a, b) => b.id.length - a.id.length)[0];

    for (const source of numberDocs) {
      console.log(`[Processing] phone=${phone} | source="${source.id}" → target="${target.id}"`);

      const sourceMessagesRef = conversationsRef.doc(source.id).collection("messages");
      const targetMessagesRef = conversationsRef.doc(target.id).collection("messages");

      // Fetch all source messages ordered by timestamp
      const messagesSnap = await sourceMessagesRef.orderBy("timestamp").get();

      if (messagesSnap.empty) {
        console.log(`  Nenhuma mensagem em "${source.id}", apenas deletando documento.`);
      } else {
        console.log(`  Movendo ${messagesSnap.size} mensagem(ns)...`);

        // Write in batches to respect Firestore 500-op limit
        let batch = db.batch();
        let opCount = 0;

        for (const msgDoc of messagesSnap.docs) {
          const newRef = targetMessagesRef.doc(msgDoc.id);
          batch.set(newRef, msgDoc.data(), { merge: true });
          opCount++;

          if (opCount >= BATCH_LIMIT) {
            await batch.commit();
            batch = db.batch();
            opCount = 0;
          }
        }

        if (opCount > 0) await batch.commit();
      }

      // Delete source document (subcollection docs were already overwritten, not needed to delete individually for Firestore)
      await conversationsRef.doc(source.id).delete();
      console.log(`[Merge] Mensagens de ${source.id} movidas para o contato ${target.id}`);
      mergeCount++;
    }
  }

  if (mergeCount === 0) {
    console.log("\n[Complete] Nenhuma duplicata encontrada. Tudo limpo!");
  } else {
    console.log(`\n[Complete] ${mergeCount} documento(s) duplicado(s) mesclado(s) com sucesso.`);
  }
}

mergeDuplicateConversations().catch(err => {
  console.error("[Error]", err.message ?? err);
  process.exit(1);
});