export type CashReceipt={document:string;patient:string;amount:number;method:string};
function money(v:string){const n=String(v||"").replace(/\./g,"").replace(",",".").replace(/[^\d.-]/g,"");const x=Number(n);return Number.isFinite(x)?x:0;}
function docKey(v:string){const m=String(v||"").match(/(\d{2,8})\s*\/\s*([\w.-]+)/);return m?`${m[1]}/${m[2]}`.toUpperCase():"";}
function clean(v:string){return String(v||"").replace(/\s+/g," ").trim();}
function receiptMethod(v:string){const u=v.toUpperCase();if(/PIX/.test(u))return"PIX";if(/DINHEIRO/.test(u))return"Dinheiro";if(/D[EÉ]BIT/.test(u))return"Cartão débito";if(/CR[EÉ]DIT|CART/.test(u))return"Cartão crédito";return"Crediário";}
export async function parseCashReceipts(file:File):Promise<CashReceipt[]>{
 const pdfjs:any=await import(/* @vite-ignore */"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
 const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;const lines:string[]=[];
 for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const content=await page.getTextContent();const items=(content.items as any[]).map(i=>({text:String(i.str||"").trim(),x:Number(i.transform?.[4]||0),y:Number(i.transform?.[5]||0)})).filter(i=>i.text).sort((a,b)=>b.y-a.y||a.x-b.x);const groups:Array<{y:number;items:Array<{x:number;text:string}>}>=[];for(const i of items){let g=groups.find(x=>Math.abs(x.y-i.y)<=2.5);if(!g){g={y:i.y,items:[]};groups.push(g);}g.items.push(i);}groups.sort((a,b)=>b.y-a.y);lines.push(...groups.map(g=>clean(g.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(" "))));}
 const all=lines.join("\n");if(!/CAIXA/i.test(all)&&!/REC\s*CRED/i.test(all))throw new Error("Este PDF não parece ser o Movimento do Caixa.");
 const rows:CashReceipt[]=[];let method="Crediário";let recSection=false;
 for(let i=0;i<lines.length;i++){const line=lines[i],upper=line.toUpperCase();if(/REC\s*CRED/.test(upper)){recSection=true;method=receiptMethod(upper);}else if(recSection&&/^(VENDA|MAN\b|ENVELOPE|SANGRIA|SUPRIMENTO|TOTAL\s+GERAL)/.test(upper)&&!/REC/.test(upper)){recSection=false;}
  const neighborhood=clean([lines[i-1]||"",line,lines[i+1]||""].join(" "));const source=/REC\s*CRED/i.test(neighborhood)||/\bREC\s*[-:]?/i.test(line)||recSection?neighborhood:"";if(!source)continue;
  const dm=source.match(/(?:REC\s*[-:]?\s*)?(\d{2,8}\s*\/\s*[\w.-]+)/i);if(!dm)continue;const document=docKey(dm[1]);if(!document)continue;
  const after=source.slice((dm.index||0)+dm[0].length);const amounts=Array.from(after.matchAll(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g)).map(m=>m[0]);if(!amounts.length)continue;const amount=money(amounts[amounts.length-1]);if(amount<=0)continue;
  let patient=after.replace(/[-–:]+/g," ").replace(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g," ").replace(/\b(?:PIX|DINHEIRO|CART[AÃ]O|CREDITO|CR[EÉ]DITO|DEBITO|D[EÉ]BITO|REC\s*CRED)\b/gi," ");patient=clean(patient).slice(0,160);
  if(!rows.some(r=>r.document===document&&Math.abs(r.amount-amount)<0.01))rows.push({document,patient,amount,method:receiptMethod(neighborhood)});
 }
 if(!rows.length)throw new Error("Li o Movimento do Caixa, mas não consegui localizar DOC/parcela nos recebimentos. Me envie este PDF para ajustarmos o layout.");return rows;
}
