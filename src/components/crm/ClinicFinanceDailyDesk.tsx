import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, MessageCircle, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { openFinancePatient } from "@/lib/clinicFinanceEvents";
import { toast } from "sonner";

type DeskMode = "today" | "tomorrow" | "recovery";
type Installment = { document: string; emission: string; dueDate: string; original: number; current: number; observation?: string };
type PatientDebt = { id: string; name: string; cpf: string; phones: string[]; installments: Installment[] };
type FinanceStore = { version: 1; fileName: string; importedAt: string; period: string; receiptsFile?: string | null; patients: PatientDebt[] };
type RecoveryCase = { patientId: string; status?: string; nextActionDate?: string | null; promiseDate?: string | null; lastContactAt?: string | null; optOutWhatsapp?: boolean };
type DailyAction = { id: string; patientId: string; mode: DeskMode; dayKey: string; status: string; completedAt?: string };
type DeskRow = { patient: PatientDebt; due: Installment[]; overdue: Installment[]; open: Installment[]; amount: number; overdueAmount: number; oldest: number; recovery: RecoveryCase; action?: DailyAction };

const storeKey = (clinicId: string) => `clinic_finance_store_v4_${clinicId}`;
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function loadStore(clinicId: string | null): FinanceStore | null {
  if (!clinicId || typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(storeKey(clinicId)) || "null") as FinanceStore | null;
    return parsed?.version === 1 && Array.isArray(parsed.patients) ? parsed : null;
  } catch { return null; }
}
function parseBrDate(value: string) { const [d,m,y] = String(value || "").split("/").map(Number); if (!d || !m || !y) return null; const date = new Date(y,m-1,d,12); return Number.isNaN(date.getTime()) ? null : date; }
function brDate(date: Date) { return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(date); }
function dayKey(date = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
function addDays(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate()+days); return next; }
function daysLate(value: string) { const due = parseBrDate(value); if (!due) return 0; const now = new Date(); const today = new Date(now.getFullYear(),now.getMonth(),now.getDate(),12); return Math.max(0,Math.floor((today.getTime()-due.getTime())/86400000)); }
function phoneDigits(value: string) { let digits = String(value || "").replace(/\D/g,""); if (digits.startsWith("55")) digits = digits.slice(2); return digits.length >= 10 ? digits : ""; }
function firstName(value: string) { const first = String(value || "").trim().split(/\s+/)[0] || ""; return first ? first.charAt(0).toUpperCase()+first.slice(1).toLowerCase() : ""; }
function safeId(value: string) { return String(value || "").replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,180); }
function promiseFuture(item: RecoveryCase) { return item.status === "promised" && item.promiseDate && item.promiseDate > dayKey(); }
function recentContact(value?: string | null) { if (!value) return false; const parsed = Date.parse(value); return Number.isFinite(parsed) && Date.now()-parsed < 3*86400000; }

function buildMessage(mode: DeskMode, row: DeskRow) {
  const name = firstName(row.patient.name);
  const dueAmount = row.due.reduce((s,i)=>s+i.current,0);
  const overdueCount = row.overdue.length;
  const overdueAmount = row.overdueAmount;
  const openCount = row.open.length;
  if (mode === "tomorrow") {
    const extra = overdueCount ? `\n\nAlém desse vencimento, identificamos ${overdueCount} parcela(s) vencida(s), totalizando ${brl.format(overdueAmount)}. Se precisar, podemos conversar para organizar esses débitos.` : openCount > row.due.length ? `\n\nConstam ${openCount} parcelas em aberto no seu cadastro. Se precisar de qualquer orientação sobre os pagamentos, estamos à disposição.` : "";
    return `Olá, ${name}! 💚\n\nPassando para lembrar que você possui ${row.due.length > 1 ? `${row.due.length} parcelas` : "uma parcela"} com vencimento amanhã na OdontoCompany Olímpia, no valor de ${brl.format(dueAmount)}.${extra}\n\nSe já estiver tudo programado, desconsidere esta mensagem. Qualquer dúvida, pode falar comigo por aqui.`;
  }
  if (mode === "today") {
    const extra = overdueCount ? `\n\nAlém do vencimento de hoje, identificamos ${overdueCount} parcela(s) vencida(s), totalizando ${brl.format(overdueAmount)}. Podemos verificar uma forma de organizar esses débitos com você.` : openCount > row.due.length ? `\n\nConstam ${openCount} parcelas em aberto no seu cadastro. Se precisar, podemos conferir o quadro completo com você.` : "";
    return `Olá, ${name}! 💚\n\nPassando para lembrar que você possui ${row.due.length > 1 ? `${row.due.length} parcelas` : "uma parcela"} com vencimento hoje na OdontoCompany Olímpia, no valor de ${brl.format(dueAmount)}.${extra}\n\nSe o pagamento já foi realizado, pode me avisar por aqui para conferirmos a baixa.`;
  }
  const oldest = row.oldest ? ` A parcela mais antiga está com ${row.oldest} dias de atraso.` : "";
  const debt = overdueCount > 1 ? `Identificamos ${overdueCount} parcelas vencidas, que hoje somam ${brl.format(overdueAmount)}.${oldest}` : `Identificamos uma parcela vencida no valor atualizado de ${brl.format(overdueAmount)}.${oldest}`;
  const negotiation = overdueCount > 1 || openCount > overdueCount ? " Queremos entender a melhor forma de regularizar o saldo e podemos conversar sobre a organização desses débitos." : " Podemos verificar a melhor forma de regularizar essa pendência.";
  return `Olá, ${name}! 💚\n\nEstou entrando em contato pelo financeiro da OdontoCompany Olímpia. ${debt}${negotiation}\n\nPode me responder por aqui para conferirmos juntos?`;
}

function DeskCard({ title, value, helper, tone, onClick }: { title: string; value: string; helper: string; tone: "amber"|"blue"|"red"; onClick: ()=>void }) {
  const classes = tone === "red" ? "border-red-200 bg-red-50/50" : tone === "amber" ? "border-amber-200 bg-amber-50/50" : "border-blue-200 bg-blue-50/50";
  return <button className="text-left" onClick={onClick}><Card className={`h-full transition hover:-translate-y-0.5 hover:shadow-md ${classes}`}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</div><div className="mt-2 text-2xl font-bold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{helper}</div></div><ChevronRight className="mt-1 h-5 w-5 text-muted-foreground" /></div></CardContent></Card></button>;
}

export function ClinicFinanceDailyDesk() {
  const { currentClinic } = useAuth();
  const [store,setStore] = useState<FinanceStore|null>(null);
  const [cases,setCases] = useState<Record<string,RecoveryCase>>({});
  const [actions,setActions] = useState<Record<string,DailyAction>>({});
  const [mode,setMode] = useState<DeskMode|null>(null);

  useEffect(()=>{ const reload=()=>setStore(loadStore(currentClinic)); reload(); window.addEventListener("storage",reload); window.addEventListener("clinic-finance-snapshot-updated",reload as EventListener); return()=>{window.removeEventListener("storage",reload);window.removeEventListener("clinic-finance-snapshot-updated",reload as EventListener);}; },[currentClinic]);
  useEffect(()=>{ if(!currentClinic)return; return onSnapshot(collection(db,"clinics",currentClinic,"financeRecoveryCases"),(snap)=>{const next:Record<string,RecoveryCase>={};snap.docs.forEach((d)=>{const x=d.data() as RecoveryCase;next[x.patientId||d.id]={...x,patientId:x.patientId||d.id};});setCases(next);});},[currentClinic]);
  useEffect(()=>{ if(!currentClinic)return; return onSnapshot(collection(db,"clinics",currentClinic,"financeDailyActions"),(snap)=>{const today=dayKey();const next:Record<string,DailyAction>={};snap.docs.forEach((d)=>{const x={id:d.id,...(d.data() as Omit<DailyAction,"id">)};if(x.dayKey===today)next[`${x.mode}:${x.patientId}`]=x;});setActions(next);});},[currentClinic]);

  const rows = useMemo(()=>{
    const today=brDate(new Date()); const tomorrow=brDate(addDays(new Date(),1));
    const all=(store?.patients||[]).map((patient)=>{const overdue=patient.installments.filter((i)=>daysLate(i.dueDate)>0);const recovery=cases[patient.id]||{patientId:patient.id,status:"pending"};return{patient,overdue,open:patient.installments,overdueAmount:overdue.reduce((s,i)=>s+i.current,0),oldest:overdue.length?Math.max(...overdue.map((i)=>daysLate(i.dueDate))):0,recovery};});
    const dueRows=(date:string,deskMode:DeskMode):DeskRow[]=>all.map((base)=>{const due=base.patient.installments.filter((i)=>i.dueDate===date);return{...base,due,amount:due.reduce((s,i)=>s+i.current,0),action:actions[`${deskMode}:${base.patient.id}`]};}).filter((r)=>r.due.length>0&&!r.recovery.optOutWhatsapp).sort((a,b)=>b.amount-a.amount);
    const dueToday=dueRows(today,"today"); const dueTomorrow=dueRows(tomorrow,"tomorrow"); const protectedIds=new Set([...dueToday,...dueTomorrow].map((r)=>r.patient.id));
    const recovery=all.filter((r)=>r.overdue.length>0&&!protectedIds.has(r.patient.id)&&r.recovery.status!=="settled"&&!r.recovery.optOutWhatsapp&&!promiseFuture(r.recovery)).filter((r)=>!r.recovery.nextActionDate||r.recovery.nextActionDate<=dayKey()).filter((r)=>!recentContact(r.recovery.lastContactAt)).map((r):DeskRow=>({...r,due:[],amount:r.overdueAmount,action:actions[`recovery:${r.patient.id}`]})).sort((a,b)=>b.oldest-a.oldest||b.overdueAmount-a.overdueAmount).slice(0,30);
    return{today:dueToday,tomorrow:dueTomorrow,recovery};
  },[store,cases,actions]);

  async function markDone(row:DeskRow, deskMode:DeskMode){ if(!currentClinic)return; const id=safeId(`${dayKey()}_${deskMode}_${row.patient.id}`); await setDoc(doc(db,"clinics",currentClinic,"financeDailyActions",id),{patientId:row.patient.id,patientName:row.patient.name,mode:deskMode,dayKey:dayKey(),status:"contacted",completedAt:new Date().toISOString(),amount:deskMode==="recovery"?row.overdueAmount:row.amount},{merge:true}); toast.success("Contato marcado como realizado hoje."); }
  function openWhatsapp(row:DeskRow, deskMode:DeskMode){ const phone=phoneDigits(row.patient.phones[0]||""); if(!phone){toast.error("Paciente sem telefone válido.");return;} const text=encodeURIComponent(buildMessage(deskMode,row)); window.open(`https://wa.me/55${phone}?text=${text}`,"_blank"); }
  if(!store?.patients?.length)return null;
  const activeRows=mode?rows[mode]:[];
  const pendingCount=(list:DeskRow[])=>list.filter((r)=>!r.action).length;
  const doneCount=(list:DeskRow[])=>list.filter((r)=>r.action).length;
  const total=(list:DeskRow[],field:"amount"|"overdueAmount")=>list.reduce((s,r)=>s+r[field],0);

  return <>
    <section className="space-y-3"><div><h2 className="text-lg font-bold">Prioridades financeiras de hoje</h2><p className="text-sm text-muted-foreground">Escolha a fila e trabalhe paciente por paciente. A ficha completa decide se está pronto para cobrar ou se falta lastro.</p></div><div className="grid gap-3 lg:grid-cols-3">
      <DeskCard title="Cobrar hoje" value={`${pendingCount(rows.today)} pendente(s)`} helper={`${brl.format(total(rows.today,"amount"))} • ${doneCount(rows.today)} trabalhado(s)`} tone="amber" onClick={()=>setMode("today")}/>
      <DeskCard title="Preparar amanhã" value={`${pendingCount(rows.tomorrow)} pendente(s)`} helper={`${brl.format(total(rows.tomorrow,"amount"))} • ${doneCount(rows.tomorrow)} trabalhado(s)`} tone="blue" onClick={()=>setMode("tomorrow")}/>
      <DeskCard title="Recuperação de hoje" value={`${pendingCount(rows.recovery)} pendente(s)`} helper={`${brl.format(total(rows.recovery,"overdueAmount"))} • top 30 prioritários`} tone="red" onClick={()=>setMode("recovery")}/>
    </div></section>

    {mode&&<div className="fixed inset-0 z-[95] bg-black/45 p-3 sm:p-6"><div className="mx-auto flex h-full max-w-[1280px] flex-col overflow-hidden rounded-2xl bg-background shadow-2xl"><div className="flex items-center justify-between border-b p-4"><div><h3 className="text-xl font-bold">{mode==="today"?"Cobranças com vencimento hoje":mode==="tomorrow"?"Lembretes de amanhã":"Recuperação de contas — fila do dia"}</h3><p className="text-sm text-muted-foreground">{activeRows.length} paciente(s) • {pendingCount(activeRows)} ainda pendente(s). Abra a ficha antes de cobrar quando houver dúvida de lastro.</p></div><Button size="icon" variant="ghost" onClick={()=>setMode(null)}><X className="h-5 w-5"/></Button></div><div className="flex-1 overflow-auto divide-y">
      {activeRows.map((row)=>{const phone=row.patient.phones[0]||"";const amount=mode==="recovery"?row.overdueAmount:row.amount;return <div key={row.patient.id} className={`grid gap-3 p-4 md:grid-cols-[1fr_190px_330px] md:items-center ${row.action?"bg-emerald-50/40":""}`}><div><button className="font-semibold text-left hover:underline" onClick={()=>openFinancePatient(row.patient.id)}>{row.patient.name}</button><div className="mt-1 text-xs text-muted-foreground">{phone||"Sem telefone"} • {row.open.length} parcela(s) em aberto{row.overdue.length?` • ${row.overdue.length} vencida(s)`:""}</div>{row.overdue.length>1&&<div className="mt-1 text-xs font-medium text-red-700">Existem vários débitos: revise a ficha para negociar o conjunto.</div>}</div><div><div className="font-semibold">{brl.format(amount)}</div><div className="text-xs text-muted-foreground">{mode==="recovery"?`${row.oldest} dias de maior atraso`:`${row.due.length} parcela(s) desta fila`}</div></div><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" onClick={()=>openFinancePatient(row.patient.id)}>Ficha completa</Button>{row.action?<span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5"/>Trabalhado hoje</span>:<><Button size="sm" variant="outline" className="gap-2" onClick={()=>openWhatsapp(row,mode)} disabled={!phoneDigits(phone)}><MessageCircle className="h-4 w-4"/>WhatsApp</Button><Button size="sm" onClick={()=>void markDone(row,mode)}>Marcar feito</Button></>}</div></div>;})}
      {!activeRows.length&&<div className="flex flex-col items-center justify-center gap-2 p-12 text-center text-muted-foreground">{mode==="recovery"?<AlertTriangle className="h-7 w-7"/>:<CalendarClock className="h-7 w-7"/>}<div>Nenhum paciente nesta fila hoje.</div></div>}
    </div></div></div>}
  </>;
}
