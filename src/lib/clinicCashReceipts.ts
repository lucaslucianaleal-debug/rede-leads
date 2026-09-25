export type CashReceipt={document:string;patient:string;amount:number;method:string};
function money(v:string){const n=String(v||"").replace(/\./g,"").replace(",",".").replace(/[^\d.-]/g,"");const x=Number(n);return Number.isFinite(x)?x:0;}
function docKey(v:string){return String(v||"").replace(/\s/g,"").toUpperCase();}
export async function parseCashReceipts(file:File):Promise<CashReceipt[]>{
 const pdfjs:any=await import(/* @vite-ignore */"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
 pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
 const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;const lines:string[]=[];
 for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const content=await page.getTextContent();const items=(content.items as any[]).map(i=>({text:String(i.str||"").trim(),x:Number(i.transform?.[4]||0),y:Number(i.transform?.[5]||0)})).filter(i=>i.text).sort((a,b)=>b.y-a.y||a.x-b.x);const groups:Array<{y:number;items:Array<{x:number;text:string}>}>=[];for(const i of items){const g=groups[groups.length-1];if(!g||Math.abs(g.y-i.y)>1.5)groups.push({y:i.y,items:[i]});else g.items.push(i);}lines.push(...groups.map(g=>g.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(" ").replace(/\s+/g," ").trim()));}
 const all=lines.join("\n");if(!/CAIXA\s*[-–]?\s*LAN[CÇ]AMENTOS/i.test(all)&&!/REC\s*CRED/i.test(all))throw new Error("Este PDF não parece ser o relatório Caixa - Lançamentos.");
 const rows:CashReceipt[]=[];let method="";
 for(const line of lines){const upper=line.toUpperCase();if(/REC\s*CRED/.test(upper))method=upper.includes("PIX")?"PIX":upper.includes("DINHEIRO")?"Dinheiro":upper.includes("DEBIT")?"Cartão débito":upper.includes("CART")?"Cartão crédito":"Crediário";if(!method)continue;const m=line.match(/REC\s*[-:]?\s*(\d{2,8}\s*\/\s*[\w.-]+)\s*[-–:]\s*(.+?)\s+(-?[\d.]+,\d{2})(?:\s|$)/i)||line.match(/(\d{2,8}\s*\/\s*[\w.-]+).*?(-?[\d.]+,\d{2})(?:\s|$)/);if(!m)continue;const document=docKey(m[1]);const amount=money(m[m.length-1]);const patient=m.length>3?m[2].trim():"";if(document&&amount>0&&!rows.some(r=>r.document===document&&r.amount===amount))rows.push({document,patient,amount,method});}
 if(!rows.length)throw new Error("Li o Movimento do Caixa, mas não encontrei recebimentos REC CRED com DOC/parcela.");return rows;
}
