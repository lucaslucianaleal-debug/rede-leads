import admin from "firebase-admin";
import serviceAccount from "../whatsapp-server/serviceAccountKey.json" assert { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

async function fixDuplicatedConversation() {
  const sourceId = "00654266473";
  const targetId = "17981271059";

  const sourceRef = db
    .collection("conversations")
    .doc(sourceId)
    .collection("messages");

  const targetRef = db
    .collection("conversations")
    .doc(targetId)
    .collection("messages");

  const snapshot = await sourceRef.get();

  let migrated = 0;
  let skipped = 0;

  for (const doc of snapshot.docs) {
    const msgId = doc.id;
    const data = doc.data();

    const exists = await targetRef.doc(msgId).get();
    if (exists.exists) {
      skipped++;
      continue;
    }
    await targetRef.doc(msgId).set(data);
    migrated++;
  }

  console.log("Migração concluída");
  console.log("Mensagens migradas:", migrated);
  console.log("Mensagens ignoradas:", skipped);
}

await fixDuplicatedConversation();
process.exit();
