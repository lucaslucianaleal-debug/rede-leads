import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT || path.resolve('C:/Users/leall/Downloads/rede-leads-firebase-adminsdk-fbsvc-dc9fb0de05.json');
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('Service account not found at', SERVICE_ACCOUNT_PATH);
  process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const convId = '551781041260';
const leadId = '1781041260';
const LOG = path.resolve('./scripts/update_conversation_log.txt');

function log(...args) {
  const line = `[${new Date().toISOString()}] ` + args.join(' ');
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

async function main() {
  try {
    const leadSnap = await db.collection('leads').doc(leadId).get();
    if (!leadSnap.exists) {
      log('Lead not found:', leadId);
      process.exit(1);
    }
    const lead = leadSnap.data() || {};
    const updates = {
      leadId: leadId,
      leadNome: lead.nome || null,
      telefone: lead.telefone || null,
      nome: lead.nome || null
    };

    await db.collection('conversations').doc(convId).set(updates, { merge: true });
    log('Updated conversation', convId, 'with', JSON.stringify(updates));

    // verify
    const convSnap = await db.collection('conversations').doc(convId).get();
    log('Verify exists=', convSnap.exists, 'data=', JSON.stringify(convSnap.data()));

    log('Done');
  } catch (e) {
    log('Error', String(e));
    process.exit(1);
  }
}

main();
