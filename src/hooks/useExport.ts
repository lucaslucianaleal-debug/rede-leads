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
        scale: 1.5,
        useCORS: true,
        backgroundColor: "#0f0f0f",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      // Header
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("OdontoCompany — Briefing Executivo", 14, 12);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Período: ${period} · Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 18);

      // Dashboard screenshot
      pdf.addImage(imgData, "PNG", 0, 22, pdfWidth, pdfHeight);
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
