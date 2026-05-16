/**
 * audit_incoherent_states.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Lê todos os leads de todas as clínicas e identifica estados incoerentes:
 *
 *   1. etapaLead = "Avaliação agendada"  E dataAgendamento vazio
 *   2. comparecimento = "COMPARECEU"     E etapaLead ≠ "Finalizado"
 *   3. comparecimento = "NÃO COMPARECEU" E dataFollowUp vazio
 *   4. status = "FRIO"                   E respostaLead = "RESPONDEU"
 *   5. dataAgendamento preenchido        E comparecimento = "" (nunca marcado)
 *
 * Uso (só leitura — NÃO altera nada):
 *   node scripts/audit_incoherent_states.mjs
 *
 * Para aplicar as correções automáticas seguras, passe --fix:
 *   node scripts/audit_incoherent_states.mjs --fix
 *
 * Correções automáticas disponíveis:
 *   - Regra 1: etapaLead → "Em contato" (remove etapa incoerente)
 *   - Regra 2: etapaLead → "Finalizado"
 *   - Regra 3: dataFollowUp → hoje
 *   - Regra 5: comparecimento → "AGUARDANDO DATA"
 *   NÃO corrige regra 4 automaticamente (requer julgamento humano)
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';

const SERVICE_ACCOUNT_PATH = path.resolve('C:/Users/leall/Downloads/rede-leads-firebase-adminsdk-fbsvc-dc9fb0de05.json');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('❌  Service account não encontrada em', SERVICE_ACCOUNT_PATH);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const FIX_MODE = process.argv.includes('--fix');
const today = format(new Date(), 'dd/MM/yyyy');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const isEmpty = (v) => !v || String(v).trim() === '';

function check(lead, clinicId) {
  const issues = [];

  // Regra 1: etapa "Avaliação agendada" sem data
  if (lead.etapaLead === 'Avaliação agendada' && isEmpty(lead.dataAgendamento)) {
    issues.push({
      rule: 1,
      desc: 'etapa "Avaliação agendada" sem dataAgendamento',
      fix: { etapaLead: 'Em contato' },
    });
  }

  // Regra 2: compareceu mas etapa ≠ Finalizado
  if (lead.comparecimento === 'COMPARECEU' && lead.etapaLead !== 'Finalizado') {
    issues.push({
      rule: 2,
      desc: `comparecimento=COMPARECEU mas etapaLead="${lead.etapaLead}"`,
      fix: { etapaLead: 'Finalizado' },
    });
  }

  // Regra 3: não compareceu sem dataFollowUp
  if (lead.comparecimento === 'NÃO COMPARECEU' && isEmpty(lead.dataFollowUp)) {
    issues.push({
      rule: 3,
      desc: 'comparecimento=NÃO COMPARECEU sem dataFollowUp',
      fix: { dataFollowUp: today },
    });
  }

  // Regra 4: FRIO + RESPONDEU (não corrige automaticamente)
  if (lead.status === 'FRIO' && lead.respostaLead === 'RESPONDEU') {
    issues.push({
      rule: 4,
      desc: 'status=FRIO mas respostaLead=RESPONDEU (contradição — revisar manualmente)',
      fix: null,
    });
  }

  // Regra 5: tem dataAgendamento mas comparecimento não foi marcado
  if (!isEmpty(lead.dataAgendamento) && isEmpty(lead.comparecimento)) {
    issues.push({
      rule: 5,
      desc: 'dataAgendamento preenchido mas comparecimento está vazio',
      fix: { comparecimento: 'AGUARDANDO DATA' },
    });
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍  Modo: ${FIX_MODE ? '⚠️  CORRIGIR (--fix)' : 'só leitura'}`);
  console.log('─'.repeat(60));

  // Listar todas as clínicas
  const clinicsSnap = await db.collection('clinics').get();
  const clinicIds = clinicsSnap.docs.map(d => d.id);
  console.log(`📋  ${clinicIds.length} clínica(s) encontrada(s): ${clinicIds.join(', ')}\n`);

  const report = {
    geradoEm: new Date().toISOString(),
    totalLeads: 0,
    totalProblemas: 0,
    porRegra: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    clinicas: {},
  };

  for (const clinicId of clinicIds) {
    // Ler o array de leads do documento compartilhado
    const sharedRef = db.doc(`clinics/${clinicId}/shared/shared`);
    const sharedSnap = await sharedRef.get();
    if (!sharedSnap.exists) continue;

    const data = sharedSnap.data();
    const leads = Array.isArray(data?.leads) ? data.leads : [];
    report.totalLeads += leads.length;

    const problemLeads = [];
    const fixes = {}; // leadIndex → updates

    leads.forEach((lead, idx) => {
      const issues = check(lead, clinicId);
      if (issues.length > 0) {
        problemLeads.push({ idx, id: lead.id, nome: lead.nome, telefone: lead.telefone, issues });
        issues.forEach(i => {
          report.porRegra[i.rule] = (report.porRegra[i.rule] || 0) + 1;
          report.totalProblemas++;
          if (FIX_MODE && i.fix) {
            fixes[idx] = { ...(fixes[idx] || {}), ...i.fix };
          }
        });
      }
    });

    // Imprimir no console
    if (problemLeads.length > 0) {
      console.log(`\n📌  Clínica: ${clinicId}  (${problemLeads.length} leads com problema)`);
      problemLeads.forEach(({ id, nome, telefone, issues }) => {
        console.log(`   • ${nome || 'sem nome'} (${telefone || 'sem fone'})  id=${id}`);
        issues.forEach(i => console.log(`     ↳ [Regra ${i.rule}] ${i.desc}`));
      });
    }

    report.clinicas[clinicId] = { totalLeads: leads.length, problemas: problemLeads.length };

    // Aplicar correções se --fix
    if (FIX_MODE && Object.keys(fixes).length > 0) {
      const updatedLeads = leads.map((lead, idx) =>
        fixes[idx] ? { ...lead, ...fixes[idx] } : lead
      );
      await sharedRef.update({ leads: updatedLeads });
      console.log(`   ✅  ${Object.keys(fixes).length} leads corrigidos na clínica ${clinicId}`);
    }
  }

  // Resumo final
  console.log('\n' + '═'.repeat(60));
  console.log('📊  RESUMO DA AUDITORIA');
  console.log('═'.repeat(60));
  console.log(`Total de leads:    ${report.totalLeads}`);
  console.log(`Total de problemas:${report.totalProblemas}`);
  console.log('Por regra:');
  for (const [rule, count] of Object.entries(report.porRegra)) {
    if (count > 0) console.log(`  Regra ${rule}: ${count}`);
  }

  const outPath = path.resolve('./scripts/audit_incoherent_states_result.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n📄  Relatório salvo em: ${outPath}`);
  console.log(FIX_MODE ? '\n✅  Correções aplicadas.' : '\n💡  Rode com --fix para corrigir automaticamente os casos seguros.');
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
