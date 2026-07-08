import { useCallback, useState } from "react";

export interface EmailSettings {
  email: string;
  time: string;
  frequency: "daily" | "weekly";
}

export function useExport() {
  const [exporting, setExporting] = useState(false);

  const exportPDF = useCallback(async (containerRef: React.RefObject<HTMLElement>, period: string) => {
    setExporting(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      const element = containerRef.current;
      if (!element) return;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#0f0f0f",
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const topMarginFirstPage = 22;
      const topMarginOtherPages = 10;
      const pxPerMm = canvas.width / pdfWidth;

      // Header
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("OdontoCompany — Briefing Executivo", 14, 12);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Período: ${period} · Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 18);

      // Paginação real do canvas para evitar truncamento
      let offsetYpx = 0;
      let isFirstPage = true;

      while (offsetYpx < canvas.height) {
        const topMargin = isFirstPage ? topMarginFirstPage : topMarginOtherPages;
        const availableHeightMm = pdfHeight - topMargin;
        const sliceHeightPx = Math.min(canvas.height - offsetYpx, Math.floor(availableHeightMm * pxPerMm));

        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeightPx;
        const ctx = pageCanvas.getContext("2d");
        if (!ctx) break;

        ctx.drawImage(
          canvas,
          0,
          offsetYpx,
          canvas.width,
          sliceHeightPx,
          0,
          0,
          canvas.width,
          sliceHeightPx
        );

        const imgData = pageCanvas.toDataURL("image/png");
        const renderedHeightMm = sliceHeightPx / pxPerMm;
        pdf.addImage(imgData, "PNG", 0, topMargin, pdfWidth, renderedHeightMm);

        offsetYpx += sliceHeightPx;
        isFirstPage = false;
        if (offsetYpx < canvas.height) {
          pdf.addPage();
        }
      }

      pdf.save(`OdontoCompany_Briefing_${new Date().toISOString().split("T")[0]}.pdf`);
    } finally {
      setExporting(false);
    }
  }, []);

  const saveDailyEmail = useCallback(async (settings: EmailSettings, unitId: string) => {
    // TODO: POST /api/email-settings
    console.log("[useExport] saveDailyEmail", settings, unitId);
    return { success: true };
  }, []);

  return { exportPDF, saveDailyEmail, exporting };
}
