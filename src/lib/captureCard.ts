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

export async function captureCardAsImage(data: CardCaptureData): Promise<void> {
  const container = document.createElement("div");
  container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 320px;
    background: #ffffff;
    border-radius: 12px;
    padding: 20px 20px 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    border: 1px solid #e5e7eb;
  `;

  type Field = { emoji: string; label: string; value: string; highlight?: boolean };
  const fields: Field[] = [];

  if (data.telefone) {
    const tel = data.telefone2 ? `${data.telefone} / ${data.telefone2}` : data.telefone;
    fields.push({ emoji: "📱", label: "Telefone", value: tel });
  }
  if (data.servico)     fields.push({ emoji: "🦷", label: "Serviço",              value: data.servico });
  if (data.fonte)       fields.push({ emoji: "📡", label: "Fonte",                value: data.fonte });
  if (data.local)       fields.push({ emoji: "📍", label: "Local",                value: data.local });
  if (data.agendamento) fields.push({ emoji: "📅", label: "Agendamento",          value: data.agendamento, highlight: true });
  if (data.briefing)    fields.push({ emoji: "💬", label: "Briefing (Recepção)",  value: data.briefing });

  container.innerHTML = `
    <div style="font-size:17px;font-weight:700;color:#111827;padding-bottom:14px;margin-bottom:14px;border-bottom:1px solid #f3f4f6;">
      ${data.nome}
    </div>
    ${fields.map(f => `
      <div style="
        background:${f.highlight ? '#f5f3ff' : '#f9fafb'};
        border:1px solid ${f.highlight ? '#e9d5ff' : '#f3f4f6'};
        border-radius:8px;
        padding:10px 14px;
        margin-bottom:10px;
      ">
        <div style="font-size:11px;color:${f.highlight ? '#7c3aed' : '#9ca3af'};font-weight:600;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em;">
          ${f.emoji} ${f.label}
        </div>
        <div style="font-size:14px;font-weight:600;color:${f.highlight ? '#4c1d95' : '#111827'};line-height:1.5;">
          ${f.value}
        </div>
      </div>
    `).join("")}
  `;

  document.body.appendChild(container);

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
