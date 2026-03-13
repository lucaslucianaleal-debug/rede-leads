import React from "react";
import { useAuth } from "@/hooks/useAuth";
import { Avatar } from "./ui/avatar";

export function ClinicChip() {
  const { clinicMeta } = useAuth();
  if (!clinicMeta) return null;

  const name = clinicMeta.name || clinicMeta.id || "Clínica";
  const color = clinicMeta.color || "#E6FFFA"; // fallback light green
  const logo = clinicMeta.logoUrl;

  const initials = name
    .split(" ")
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex items-center gap-2 mr-0 md:mr-3">
      <div
        style={{ backgroundColor: color }}
        className="h-7 w-7 rounded-full flex items-center justify-center overflow-hidden border"
      >
        {logo ? (
          <img src={logo} alt={name} className="h-7 w-7 object-cover" />
        ) : (
          <span className="text-xs font-semibold text-gray-700">{initials}</span>
        )}
      </div>
      <div className="hidden md:flex items-baseline gap-2">
        <span className="text-sm font-semibold truncate max-w-[220px]">{name}</span>
      </div>
    </div>
  );
}
