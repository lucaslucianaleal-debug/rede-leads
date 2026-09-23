import React from "react";
import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function ClinicChip() {
  const { clinicMeta } = useAuth();
  if (!clinicMeta) return null;

  const name = clinicMeta.name || clinicMeta.id || "Clínica";
  const color = clinicMeta.color || "#E6FFFA";
  const logo = clinicMeta.logoUrl;

  const initials = name
    .split(" ")
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Link
      to="/clinica"
      className="group flex items-center gap-2 rounded-lg border border-transparent px-2 py-1 transition-colors hover:border-border hover:bg-muted/60 mr-0 md:mr-3"
      title="Abrir módulo Clínica"
      aria-label={`Abrir módulo Clínica - ${name}`}
    >
      <div
        style={{ backgroundColor: color }}
        className="h-7 w-7 rounded-full flex items-center justify-center overflow-hidden border shrink-0"
      >
        {logo ? (
          <img src={logo} alt={name} className="h-7 w-7 object-cover" />
        ) : (
          <span className="text-xs font-semibold text-gray-700">{initials}</span>
        )}
      </div>
      <div className="hidden md:flex min-w-0 items-center gap-2">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground group-hover:text-primary">Clínica</span>
        <span className="text-sm font-semibold truncate max-w-[190px]">{name}</span>
      </div>
    </Link>
  );
}
