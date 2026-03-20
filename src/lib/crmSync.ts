import { db as defaultDb } from '@/lib/firebase';
import {
  doc,
  getDoc,
  setDoc,
  writeBatch,
  collection,
  getDocs,
  deleteDoc,
  updateDoc,
  Firestore,
} from 'firebase/firestore';

export function normalizePhone(raw: string) {
  if (!raw) throw new Error('Telefone vazio');
  const digits = String(raw).replace(/\D+/g, '');
  if (!digits) throw new Error('Telefone inválido');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export async function saveLeadWithSync(
  db: Firestore = defaultDb,
  lead: Record<string, any> = {},
  opts: { previousPhone?: string | null } = {}
) {
  if (!lead) throw new Error('Lead vazio');
  const rawPhone = lead.telefone || lead.telefone_raw || lead.phone;
  if (!rawPhone) throw new Error('Lead deve conter telefone');
  const normalized = normalizePhone(rawPhone);

  let previousNormalized: string | null = null;
  if (opts.previousPhone) {
    previousNormalized = normalizePhone(opts.previousPhone);
  } else if (lead.id) {
    // try to infer: if lead.id looks like phone, use it
    const digits = String(lead.id).replace(/\D+/g, '');
    if (digits) previousNormalized = digits.startsWith('55') ? digits : `55${digits}`;
  }

  // Update lead document in 'leads'
  const leadRef = doc(db, 'leads', normalized);
  // Sanitize lead object: remove any `undefined` fields (Firestore rejects them)
  const rawLead = { ...lead, telefone_norm: normalized };
  const sanitizedLead = JSON.parse(JSON.stringify(rawLead));
  await setDoc(leadRef, sanitizedLead, { merge: true });

  const convNewRef = doc(db, 'conversations', normalized);

    if (!previousNormalized || previousNormalized === normalized) {
    // only update name on conversation if exists
    const convSnap = await getDoc(convNewRef);
    if (convSnap.exists()) {
      const conv = convSnap.data() as any;
      if (lead.nome && lead.nome !== conv.nome) {
        await updateDoc(convNewRef, { nome: lead.nome });
      }
    }
    return { status: 'ok', action: 'lead-updated-only', id: normalized };
  }

  // phone changed: copy-and-delete
  const convOldRef = doc(db, 'conversations', previousNormalized);
  const convOldSnap = await getDoc(convOldRef);
  if (!convOldSnap.exists()) {
    const simple = { nome: lead.nome };
    const sanitizedSimple = JSON.parse(JSON.stringify(simple));
    await setDoc(convNewRef, sanitizedSimple, { merge: true });
    return { status: 'ok', action: 'lead-updated-no-old-conversation', id: normalized };
  }

  const oldData = convOldSnap.data() as any;
  const newConvData = { ...oldData, nome: lead.nome };

  // set conversation meta on new doc
  const sanitizedNewConv = JSON.parse(JSON.stringify(newConvData));
  await setDoc(convNewRef, sanitizedNewConv, { merge: true });

  // copy messages
  const msgsSnap = await getDocs(collection(db, 'conversations', previousNormalized, 'messages'));
  if (!msgsSnap.empty) {
    const docs = msgsSnap.docs;
    const CHUNK = 400;
    for (let i = 0; i < docs.length; i += CHUNK) {
      const chunk = docs.slice(i, i + CHUNK);
      const b = writeBatch(db);
      chunk.forEach((d) => {
        const newMsgRef = doc(db, 'conversations', normalized, 'messages', d.id);
        b.set(newMsgRef, d.data());
      });
      await b.commit();
    }

    // delete old messages
    for (let i = 0; i < docs.length; i += CHUNK) {
      const chunk = docs.slice(i, i + CHUNK);
      const bdel = writeBatch(db);
      chunk.forEach((d) => {
        const oldMsgRef = doc(db, 'conversations', previousNormalized!, 'messages', d.id);
        bdel.delete(oldMsgRef);
      });
      await bdel.commit();
    }
  }

  // delete old conversation document
  await deleteDoc(convOldRef);

  return { status: 'ok', action: 'migrated-conversation', from: previousNormalized, to: normalized };
}
