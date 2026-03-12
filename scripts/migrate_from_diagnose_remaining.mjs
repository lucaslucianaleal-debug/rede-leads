import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Service account path (adjust if needed)
const SERVICE_ACCOUNT_PATH = path.resolve('C:/Users/leall/Downloads/rede-leads-firebase-adminsdk-fbsvc-dc9fb0de05.json');
const DIAGNOSE_PATH = path.resolve('./scripts/diagnose_remaining.json');
const LOG_PATH = path.resolve('./scripts/migrate_remaining_log.txt');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('Service account não encontrada em', SERVICE_ACCOUNT_PATH);
  process.exit(1);
}
if (!fs.existsSync(DIAGNOSE_PATH)) {
  console.error('Arquivo de diagnose não encontrado em', DIAGNOSE_PATH);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function log(...args) {
  const line = `[${new Date().toISOString()}] ` + args.join(' ');
  console.log(line);
  fs.appendFileSync(LOG_PATH, line + '\n');
}

async function migrate(oldId, newId, crmName) {
  try {
    const oldRef = db.collection('conversations').doc(oldId);
    const newRef = db.collection('conversations').doc(newId);

    const oldSnap = await oldRef.get();
    if (!oldSnap.exists) {
      log('[Ignorado] Documento antigo não existe:', oldId);
      return { status: 'ignored', reason: 'old-not-exists', oldId, newId };
    }

    const oldData = oldSnap.data() || {};
    const newData = { ...oldData, nome: crmName };

    // copy meta
    const batchMeta = db.batch();
    batchMeta.set(newRef, newData, { merge: true });
    await batchMeta.commit();

    // copy messages
    const msgsSnap = await oldRef.collection('messages').get();
    const msgs = msgsSnap.docs;
    if (msgs.length) {
      const CHUNK = 400;
      for (let i = 0; i < msgs.length; i += CHUNK) {
        const chunk = msgs.slice(i, i + CHUNK);
        const b = db.batch();
        chunk.forEach((d) => {
          const newMsgRef = newRef.collection('messages').doc(d.id);
          b.set(newMsgRef, d.data());
        });
        await b.commit();
      }
    }

    // delete old messages
    if (msgs.length) {
      const CHUNK = 400;
      for (let i = 0; i < msgs.length; i += CHUNK) {
        const chunk = msgs.slice(i, i + CHUNK);
        const bdel = db.batch();
        chunk.forEach((d) => {
          const oldMsgRef = oldRef.collection('messages').doc(d.id);
          bdel.delete(oldMsgRef);
        });
        await bdel.commit();
      }
    }

    // delete old conversation doc
    await oldRef.delete();

    log('[Migrado] ', oldId, '->', newId, `(${msgs.length} mensagens)`);
    return { status: 'migrated', oldId, newId, messages: msgs.length };
  } catch (e) {
    log('[Erro] Falha ao migrar', oldId, '->', newId, e.message || e);
    return { status: 'error', oldId, newId, error: String(e) };
  }
}

async function main() {
  fs.writeFileSync(LOG_PATH, '');
  const raw = fs.readFileSync(DIAGNOSE_PATH, 'utf8');
  const report = JSON.parse(raw);
  const issues = report.issues || [];
  const toMigrate = issues.filter((it) => it.convExistsAtLast10 === true && it.telefone_norm);
  log('Found', toMigrate.length, 'items to migrate (convExistsAtLast10=true)');

  const results = [];
  for (const it of toMigrate) {
    const oldId = it.last10;
    const newId = it.telefone_norm;
    const name = it.nome || null;
    log('Migrating', oldId, '->', newId, 'name:', name);
    const res = await migrate(oldId, newId, name);
    results.push(res);
  }

  const summary = { timestamp: new Date().toISOString(), total: toMigrate.length, results };
  fs.writeFileSync(path.resolve('./scripts/migrate_remaining_results.json'), JSON.stringify(summary, null, 2), 'utf8');
  log('Done. Summary saved to scripts/migrate_remaining_results.json');
}

main().catch((e) => { console.error('Fatal', e); process.exit(1); });
