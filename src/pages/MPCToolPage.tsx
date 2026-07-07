import React from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

export default function MPCToolPage() {
  const { currentClinic } = useAuth();
  const clinicId = currentClinic || "odontocompany-olimpia";
  const toolUrl = `/mpc-tool-standalone.html?clinicId=${encodeURIComponent(clinicId)}`;

  return (
    <div className="h-screen bg-slate-950 flex flex-col">
      <div className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Ferramenta paralela</p>
            <h1 className="text-lg font-semibold text-slate-900">MPC Tool enviada por voce</h1>
            <p className="text-xs text-slate-500">Estrutura original carregada em pagina separada - clinica: {clinicId}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar ao CRM
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <a href={toolUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir ferramenta em nova aba
              </a>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <iframe
          title="MPC Tool Standalone"
          src={toolUrl}
          className="w-full h-full border-0"
        />
      </div>
    </div>
  );
}
