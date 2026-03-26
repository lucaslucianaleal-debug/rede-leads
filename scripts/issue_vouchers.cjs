#!/usr/bin/env node
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Init Firebase admin (use serviceAccountKey.json if present)
const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'serviceAccountKey.json');
if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  const sa = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
} else {
  admin.initializeApp();
}

const db = admin.firestore();
const { blockIfEmptyArray, attachLastWriter } = require('../whatsapp-server/lib/crmGuard.cjs');

// Tiers: highest first to avoid double-issuing lower tiers
const TIERS = [
  { months: 3, amount: 500, image: path.join(process.cwd(), 'Voucher', 'Voucher de 500.jpeg') },
  { months: 2, amount: 300, image: path.join(process.cwd(), 'Voucher', 'Voucher de 300.jpeg') },
  { months: 1, amount: 200, image: path.join(process.cwd(), 'Voucher', 'Voucher 200.jpeg') },
];

const SERVICE_KEYWORDS = ['implante', 'implantes', 'protocolo', 'protocolos'];

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const EXPORT_CSV = args.includes('--export-csv');

function parseDMY(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.split('/').map(s => s.trim());
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const y = parseInt(parts[2], 10);
  if (Number.isNaN(d) || Number.isNaN(m) || Number.isNaN(y)) return null;
  return new Date(y, m, d);
}

function monthsBetween(from, to) {
  // from >= to => positive months
  const years = from.getFullYear() - to.getFullYear();
  const months = from.getMonth() - to.getMonth();
  return years * 12 + months;
}

function genCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

async function run() {
  console.log(`Running issue_vouchers (dryRun=${DRY_RUN})`);
  const crmRef = db.collection('crm_data').doc('shared');
  const snap = await crmRef.get();
  if (!snap.exists) {
    console.error('crm_data/shared document not found');
    process.exit(1);
  }
  const data = snap.data() || {};
  const leads = Array.isArray(data.leads) ? data.leads : [];

  const now = new Date();
  let totalFound = 0;
  let totalIssued = 0;
  const candidates = [];

  for (const lead of leads) {
    const serv = String(lead.servicoProcurado || '').toLowerCase();
    if (!SERVICE_KEYWORDS.some(k => serv.includes(k))) continue;

    // prefer dataAgendamento, fallback to dataCriacao
    const dateStr = lead.dataAgendamento || lead.dataCriacao;
    const refDate = parseDMY(dateStr);
    if (!refDate) continue;

    const months = monthsBetween(now, refDate);
    if (months < 1) continue; // only consider >= 1 month

    totalFound++;

    // Check tiers highest-first
    for (const tier of TIERS) {
      if (months >= tier.months) {
        const lastTier = (lead.voucherLastIssuedTier || 0);
        if (lastTier >= tier.months) {
          // already issued this or higher tier
          break;
        }


        const candidate = {
          id: lead.id || '',
          nome: lead.nome || '',
          telefone: lead.telefone || '',
          months,
          tier: tier.months,
          amount: tier.amount,
          imagePath: tier.image,
          expiry: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          message: `Olá ${lead.nome || ''}, temos um voucher de R$${tier.amount} válido até ${new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString()} para você agendar seu procedimento de ${lead.servicoProcurado || ''}. Responda \"EUQUERO\" para garantir.`,
        };

        console.log(`${DRY_RUN ? '[DRY]' : '[APPLY]'} Eligible: lead=${candidate.id || candidate.telefone || '(no-id)'} name="${candidate.nome}" months=${months} -> tier=${candidate.tier} amount=${candidate.amount}`);

        candidates.push(candidate);

        if (!DRY_RUN) {
          // run a transaction to create voucher and update lead in crm_data/shared
          try {
            await db.runTransaction(async (tx) => {
              const s = await tx.get(crmRef);
              if (!s.exists) throw new Error('crm_data/shared disappeared');
              const curr = s.data() || {};
              const currLeads = Array.isArray(curr.leads) ? curr.leads.slice() : [];

              // find index for this lead (by id if present, else by telefone)
              const idx = currLeads.findIndex(l => (l.id && lead.id && l.id === lead.id) || (l.telefone && lead.telefone && l.telefone === lead.telefone));

              // create voucher doc
              const voucherRef = db.collection('vouchers').doc();
              const voucherObj = {
                leadId: lead.id || null,
                leadNome: lead.nome || null,
                amount: tier.amount,
                tierMonths: tier.months,
                code: genCode(),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                status: 'issued',
                imageLocalPath: tier.image,
                issuedByJob: true,
              };
              tx.set(voucherRef, voucherObj);

              // update lead entry in array if found
              if (idx >= 0) {
                const updatedLead = Object.assign({}, currLeads[idx], {
                  voucherLastIssuedTier: tier.months,
                  voucherLastIssuedAt: new Date().toISOString(),
                  voucherPending: true,
                });
                currLeads[idx] = updatedLead;
                // Centralized guard: block if empty and attach lastWriter metadata
                blockIfEmptyArray(currLeads, 'issue_vouchers.cjs');
                tx.update(crmRef, attachLastWriter({ leads: currLeads }, 'issue_vouchers.cjs', 'issue_vouchers.cjs'));
              } else {
                // Lead not found in the array (unexpected) - still proceed
                // No array update in this case
              }
            });
            totalIssued++;
          } catch (e) {
            console.error('Transaction failed for lead', lead.id, e.message || e);
          }
        }

        break; // issued or would issue this tier, do not try lower tiers
      }
    }
  }

  console.log(`Found ${totalFound} candidates. ${DRY_RUN ? 'No vouchers were written in dry-run.' : `Issued ${totalIssued} vouchers.`}`);

  if (EXPORT_CSV) {
    try {
      const outPath = path.join(__dirname, 'voucher_candidates.csv');
      const header = ['id','nome','telefone','months','tier','amount','imagePath','expiry','message'];
      const rows = [header.join(',')];
      for (const c of candidates) {
        const row = [c.id, c.nome, c.telefone, String(c.months), String(c.tier), String(c.amount), c.imagePath, c.expiry, `"${c.message.replace(/"/g,'""')}"`];
        rows.push(row.join(','));
      }
      fs.writeFileSync(outPath, rows.join('\n'), 'utf8');
      console.log('CSV written to', outPath);
    } catch (e) {
      console.error('Failed to write CSV', e.message || e);
    }
  }
}

run().catch((e) => {
  console.error('Fatal error', e);
  process.exit(1);
});
