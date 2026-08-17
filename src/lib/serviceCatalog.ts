export const LEGACY_SERVICE_LIBRARY = [
  "Implante",
  "Prótese",
  "Protocolo",
  "Facetas",
  "Ortodontia",
  "Clínico geral",
  "Harmonização facial",
  "Clareamento",
  "Limpeza",
];

export type ServiceCatalogContext = {
  id?: string;
  name?: string;
  module?: "clinica" | "corretor";
  services?: string[];
};

export function isCorretorProfile(clinic: ServiceCatalogContext | null | undefined): boolean {
  if (!clinic) return false;
  if (clinic.module === "corretor") return true;
  if (clinic.module === "clinica") return false;

  const identifier = `${clinic.id ?? ""} ${clinic.name ?? ""}`.toLowerCase();
  return identifier.includes("corretor") || identifier.includes("henrique");
}

export function resolveServiceOptions(
  clinic: ServiceCatalogContext | null | undefined,
  fallbackServices: string[] = LEGACY_SERVICE_LIBRARY,
): string[] {
  const isCorretor = isCorretorProfile(clinic);

  if (isCorretor) {
    const custom = Array.isArray(clinic?.services) ? clinic.services : [];
    return custom
      .map((service) => service?.trim())
      .filter((service): service is string => Boolean(service));
  }

  return Array.isArray(fallbackServices) && fallbackServices.length > 0
    ? fallbackServices
    : LEGACY_SERVICE_LIBRARY;
}

export function addCustomService(existing: string[], value: string): string[] {
  const normalized = value.trim();
  if (!normalized) return existing;
  const next = existing.filter((item) => item.trim().toLowerCase() !== normalized.toLowerCase());
  return [...next, normalized];
}
