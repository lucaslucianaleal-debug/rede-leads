import React from "react";
import { useLeads } from "@/hooks/useLeads";
import { ScoreLeadCard } from "@/components/crm/ScoreLeadCard";
import { LeadMorrendoCard } from "@/components/crm/LeadMorrendoCard";
import { RankingRecepcionistasCard } from "@/components/crm/RankingRecepcionistasCard";
import { PrevisaoFaturamentoCard } from "@/components/crm/PrevisaoFaturamentoCard";
import { IQFCard } from "@/components/crm/IQFCard";
import { RiscoNoShowCard } from "@/components/crm/RiscoNoShowCard";
import { CACCard } from "@/components/crm/CACCard";
import { ConsultoriaCard } from "@/components/crm/ConsultoriaCard";

// Blocos de exemplo (substitua por componentes reais depois)
// O ScoreLeadCard real será usado abaixo


  const { leads } = useLeads();
  return (
    <div className="grid gap-6 md:gap-8 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      <ScoreLeadCard leads={leads} />
      <LeadMorrendoCard leads={leads} />
      <RankingRecepcionistasCard leads={leads} />
      <PrevisaoFaturamentoCard leads={leads} />
      <IQFCard leads={leads} />
      <RiscoNoShowCard leads={leads} />
      <CACCard leads={leads} />
      <ConsultoriaCard leads={leads} />
    </div>
  );
}
