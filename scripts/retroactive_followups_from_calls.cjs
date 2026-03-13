const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Usage:
// node scripts/retroactive_followups_from_calls.cjs --from=10/03/2026 [--clinic=odontocompany-novohorizonte] [--apply]

const args = require('minimist')(process.argv.slice(2));
const FROM = args.from || '10/03/2026';
const CLINIC_ARG = args.clinic || null;
const APPLY = !!args.apply;

const backupsDir = path.join(__dirname, '..', 'backups', 'retro-followups');
fs.mkdirSync(backupsDir, { recursive: true });

function parseDateStr(s) {
  if (!s) return null;
  const m = s.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (!m) return null;
  const [d, M, y] = m[1].split('/').map(Number);
  return new Date(y, M - 1, d);
}

function dateGE(aStr, bStr) {
  const a = parseDateStr(aStr);
  const b = parseDateStr(bStr);
  if (!a || !b) return false;
  a.setHours(0,0,0,0); b.setHours(0,0,0,0);
  return a.getTime() >= b.getTime();
}

async function listClinics() {
  if (CLINIC_ARG) return [CLINIC_ARG];
  const snap = await db.collection('clinics').get();
  return snap.docs.map(d => d.id);
}

(async function main(){
  try {
    const clinics = await listClinics();
    console.log('Clinics to inspect:', clinics.join(', '));
    const report = [];

    const fromDateStr = FROM;

    for (const clinic of clinics) {
      const docRef = db.collection('clinics').doc(clinic).collection('shared').doc('shared');
      const snap = await docRef.get();
      if (!snap.exists) {
        report.push({ clinic, exists: false });
        continue;
      }
      const data = snap.data() || {};
      const leads = Array.isArray(data.leads) ? data.leads : (data.leads ? Object.values(data.leads) : []);

      const toUpdate = [];
      for (const l of leads) {
        // Candidate date from dataRetornoLigacao first
        let candidate = null;
        if (l.dataRetornoLigacao) {
          const possible = (l.dataRetornoLigacao || '').split(' ')[0];
          if (parseDateStr(possible) && dateGE(possible, fromDateStr)) candidate = possible;
        }
        // Fallback: look for date inside observacao
        if (!candidate && l.observacao) {
          const pd = parseDateStr(l.observacao);
          if (pd && dateGE(pd.toLocaleDateString('pt-BR'), fromDateStr)) {
            const m = l.observacao.match(/(\d{2}\/\d{2}\/\d{4})/);
            if (m) candidate = m[1];
          }
        }

        if (!candidate) continue;

        const already = (l.dataFollowUp && l.dataFollowUp.startsWith(candidate)) || (l.lastFollowUpDone && l.lastFollowUpDone.startsWith(candidate));
        if (already) continue;

        toUpdate.push({ id: l.id, candidate, lead: l });
      }

      report.push({ clinic, exists: true, leadsTotal: leads.length, matches: toUpdate.length, samples: toUpdate.slice(0,20) });

      if (APPLY && toUpdate.length > 0) {
        // backup
        const backupPath = path.join(backupsDir, `${clinic}-shared-${Date.now()}.json`);
        fs.writeFileSync(backupPath, JSON.stringify({ backedAt: new Date().toISOString(), data }, null, 2));
        console.log('Backup saved for', clinic, '->', backupPath);

        // apply updates
        const newLeads = leads.map(l => {
          const found = toUpdate.find(t => t.id === l.id);
          if (!found) return l;
          return { ...l, dataFollowUp: found.candidate, lastFollowUpDone: found.candidate };
        });

        await docRef.set({ ...data, leads: newLeads }, { merge: true });
        console.log(`Applied ${toUpdate.length} updates to clinic ${clinic}`);
      }
    }

    // Print summary
    console.log('\n--- Dry-run summary ---');
    for (const r of report) {
      if (!r.exists) console.log(`- ${r.clinic}: no shared doc`);
      else console.log(`- ${r.clinic}: leads=${r.leadsTotal}, matches=${r.matches}`);
      if (r.samples && r.samples.length) {
        console.log('  sample ids:', r.samples.map(s=>s.id).join(', '));
      }
    }

    if (!APPLY) console.log('\nDry-run complete. Re-run with --apply to write changes.');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();
