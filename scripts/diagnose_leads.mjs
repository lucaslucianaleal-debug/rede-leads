import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Ajuste este caminho se sua chave estiver em outro local
const SERVICE_ACCOUNT_PATH = path.resolve('C:/Users/leall/Downloads/rede-leads-firebase-adminsdk-fbsvc-dc9fb0de05.json');
const OUT_PATH = path.resolve('./scripts/diagnose_remaining.json');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('Service account não encontrada em', SERVICE_ACCOUNT_PATH);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, '');
  if (!digits) return null;
  return digits.startsWith('55') ? digits : `55${digits}`;
}

async function main() {
  const out = { timestamp: new Date().toISOString(), issues: [] };
  console.log('Consultando coleção leads...');
  const leadsSnap = await db.collection('leads').get();
  console.log('Leads encontrados:', leadsSnap.size);

  let processed = 0;
  for (const doc of leadsSnap.docs) {
    processed++;
    const data = doc.data();
    const leadId = doc.id;
    const raw = data.telefone || data.telefone_raw || data.phone || null;
    const norm = data.telefone_norm || normalizePhone(raw);
    const last10 = (raw && String(raw).replace(/\D+/g, '').slice(-10)) || null;

    const issue = { leadId, nome: data.nome || null, telefone_raw: raw || null, telefone_norm: norm || null, last10 };

    let convExists = false;
    if (norm) {
      const convSnap = await db.collection('conversations').doc(norm).get();
      convExists = convSnap.exists;
      issue.convExistsAtNorm = convExists;
    } else {
      issue.convExistsAtNorm = false;
    }

    // also check if there's a conversation with last10 id (short form)
    if (last10) {
      const convShort = await db.collection('conversations').doc(last10).get();
      issue.convExistsAtLast10 = convShort.exists;
    } else {
      issue.convExistsAtLast10 = false;
    }

    // collect if problem: missing norm or no conversation at normalized id
    if (!norm || !issue.convExistsAtNorm) {
      out.issues.push(issue);
    }
    if (processed % 200 === 0) console.log(`Processed ${processed}/${leadsSnap.size}`);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  console.log('Relatório salvo em', OUT_PATH, 'issues:', out.issues.length);
}

main().catch((e) => {
  console.error('Erro:', e);
  process.exit(1);
});
