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

// Catálogo padrão exibido para contas do módulo "corretor" (imobiliária)
// que ainda não tenham uma lista de serviços própria salva.
export const DEFAULT_CORRETOR_SERVICE_LIBRARY = [
  "Venda de imóveis",
  "Locação/Aluguel",
  "Avaliação imobiliária",
  "Consultoria imobiliária",
  "Financiamento imobiliário",
  "Permuta de imóveis",
  "Imóveis comerciais",
  "Lançamentos/Imóveis na planta",
  "Terrenos/Lotes",
];

export type ServiceCatalogContext = {
  id?: string;
  name?: string;
  module?: "clinica" | "corretor";
  // Campo realmente persistido no Firestore (ClinicRecord.customServices).
  customServices?: string[];
  // Mantido por compatibilidade com chamadas antigas/testes que usam "services".
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
    // Prioriza o campo real do Firestore (customServices); aceita "services"
    // por compatibilidade; se nenhum estiver definido, usa o catálogo padrão
    // de imobiliária em vez de deixar a lista vazia.
    const rawCustom = Array.isArray(clinic?.customServices)
      ? clinic.customServices
      : Array.isArray(clinic?.services)
        ? clinic.services
        : null;

    const custom = (rawCustom ?? [])
      .map((service) => service?.trim())
      .filter((service): service is string => Boolean(service));

    if (custom.length > 0) return custom;
    if (rawCustom !== null) return custom; // lista explicitamente vazia definida pelo usuário
    return DEFAULT_CORRETOR_SERVICE_LIBRARY;
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

export function removeCustomService(existing: string[], value: string): string[] {
  const normalized = value.trim();
  if (!normalized) return existing;
  return existing.filter((item) => item.trim().toLowerCase() !== normalized.toLowerCase());
}
