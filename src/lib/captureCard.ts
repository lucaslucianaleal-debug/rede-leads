import html2canvas from "html2canvas";
import { toast } from "sonner";

export interface CardCaptureData {
  nome: string;
  telefone: string;
  telefone2?: string;
  servico?: string;
  fonte?: string;
  local?: string;
  agendamento?: string;
  briefing?: string;
}

// Odontocompany primary green: hsl(135, 57%, 36%) ≈ #2d8f44
const GREEN     = "#2d8f44";
const GREEN_BG  = "#f0faf2";
const GREEN_MED = "#166534";
const GRAY_50   = "#f9fafb";
const GRAY_100  = "#f3f4f6";
const GRAY_400  = "#9ca3af";
const DARK      = "#111827";
const BLUE_LABEL = "#2d6a9f";
const BLUE_BG   = "#eff6ff";

// Lucide SVG paths (stroke only, 24x24 viewBox)
const SVG = {
  phone: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${GREEN}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 14 19.79 19.79 0 0 1 1.62 5.24 2 2 0 0 1 3.59 3h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.91a16 16 0 0 0 6.06 6.06l1.07-1.07a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  stethoscope: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${GREEN}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>`,
  share2: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${GREEN}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
  mapPin: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${GREEN}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  calendarCheck: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${GREEN}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>`,
  user: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${GREEN}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  userCheck: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${GREEN}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>`,
  whatsapp: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#ffffff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`,
};

function row(icon: string, label: string, value: string, opts: { highlight?: boolean; blueLabel?: boolean; extra?: string } = {}) {
  const bg     = opts.highlight ? GREEN_BG  : GRAY_50;
  const border = opts.highlight ? "#bbf7d0" : GRAY_100;
  const lcolor = opts.blueLabel ? BLUE_LABEL : (opts.highlight ? GREEN_MED : GRAY_400);
  const vcolor = opts.highlight ? GREEN_MED : DARK;
  return `
    <div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:10px 12px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">
        ${icon}
        <span style="font-size:11px;color:${lcolor};font-weight:600;letter-spacing:0.03em;">${label}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:14px;font-weight:600;color:${vcolor};line-height:1.5;">${value}</span>
        ${opts.extra ?? ""}
      </div>
    </div>`;
}

export async function captureCardAsImage(data: CardCaptureData): Promise<void> {
  const container = document.createElement("div");
  container.style.cssText = `
    position:fixed;left:-9999px;top:0;
    width:320px;
    background:#ffffff;
    border-radius:14px;
    padding:18px 16px 16px;
    font-family:'DM Sans','Segoe UI',sans-serif;
    border:1px solid ${GRAY_100};
    box-shadow:0 4px 24px rgba(0,0,0,0.08);
  `;

  const tel = data.telefone2 ? `${data.telefone} / ${data.telefone2}` : data.telefone;

  const rows: string[] = [];

  rows.push(row(SVG.phone, "Telefone", tel, {
    extra: `<div style="width:28px;height:28px;border-radius:50%;background:${GREEN};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${SVG.whatsapp}</div>`
  }));

  if (data.servico)
    rows.push(row(SVG.stethoscope, "Serviço", data.servico));

  if (data.fonte)
    rows.push(row(SVG.share2, "Fonte", data.fonte));

  if (data.local)
    rows.push(row(SVG.mapPin, "Local", data.local));

  if (data.agendamento) {
    // normalise "dd/MM/yyyyHH:mm" → "dd/MM/yyyy HH:mm" in case stored without space
    const agendamentoFmt = data.agendamento.replace(/(\d{2}\/\d{2}\/\d{4})(\d{2}:\d{2})/, "$1 $2");
    rows.push(row(SVG.calendarCheck, "Agendamento", agendamentoFmt, { highlight: true }));
  }

  if (data.briefing)
    rows.push(row(SVG.user, "Briefing (Recepção)", data.briefing, { blueLabel: true }));

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
      ${SVG.userCheck}
      <span style="font-size:16px;font-weight:700;color:${DARK};line-height:1.3;flex:1;">${data.nome}</span>
    </div>
    ${rows.join("")}
  `;

  document.body.appendChild(container);

  // Wait for DM Sans (and any other custom fonts) to finish loading
  // so html2canvas captures correct glyphs and letter-spacing.
  try { await document.fonts.load("700 16px 'DM Sans'"); } catch { /* non-fatal */ }
  try { await document.fonts.ready; } catch { /* non-fatal */ }

  try {
    const canvas = await html2canvas(container, {
      backgroundColor: "#ffffff",
      scale: 2,
      allowTaint: true,
      useCORS: true,
      logging: false,
      width: 320,
      height: container.scrollHeight,
    });
    canvas.toBlob((blob) => {
      if (blob) {
        navigator.clipboard
          .write([new ClipboardItem({ "image/png": blob })])
          .then(() => toast.success("Screenshot copiado!"))
          .catch(() => toast.error("Erro ao copiar imagem"));
      }
    });
  } catch {
    toast.error("Erro ao capturar imagem");
  } finally {
    document.body.removeChild(container);
  }
}
