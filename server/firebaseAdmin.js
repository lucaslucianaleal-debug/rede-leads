import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let firestoreDb = null;

function ensureAdminApp() {
  if (getApps().length) return getApps()[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    const missing = [
      !projectId ? "FIREBASE_PROJECT_ID" : null,
      !clientEmail ? "FIREBASE_CLIENT_EMAIL" : null,
      !privateKey ? "FIREBASE_PRIVATE_KEY" : null,
    ].filter(Boolean).join(", ");
    throw new Error(`Firebase Admin credentials missing: ${missing}`);
  }

  privateKey = privateKey.replace(/\\n/g, "\n");
  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export function getAdminDb() {
  ensureAdminApp();
  if (!firestoreDb) {
    firestoreDb = getFirestore();
    // Dados opcionais do CRM/Meta podem existir como undefined em objetos JS.
    // O Firestore não aceita undefined por padrão; ignorá-los evita que um campo
    // opcional derrube toda a sincronização de uma campanha/anúncio.
    firestoreDb.settings({ ignoreUndefinedProperties: true });
  }
  return firestoreDb;
}

export function getAdminAuth() {
  ensureAdminApp();
  return getAuth();
}
