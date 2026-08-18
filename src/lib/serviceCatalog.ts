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

export const CORRETOR_SERVICE_LIBRARY = [
  "Comprar imóvel",
  "💰 Vender imóvel",
  "🔑 Alugar imóvel",
  "📋 Anunciar imóvel para locação",
  "🌳 Comprar terreno",
  "📐 Vender terreno",
  "🏢 Imóvel comercial",
  "🏗️ Imóvel na planta / lançamento",
  "💼 Investimento imobiliário",
  "🔄 Permuta",
  "💳 Financiamento imobiliário",
  "📑 Avaliação de imóvel",
  "📝 Assessoria imobiliária",
  "❓ Outro",
];

const CLINIC_SERVICE_PATTERNS = [
  "implante",
  "prótese",
  "protocolo",
  "facetas",
  "ortodontia",
  "clínico geral",
  "harmonização facial",
  "clareamento",
  "limpeza",
  "consulta",
  "dent",
  "odonto",
];

export type ServiceCatalogContext = {
  id?: string;
  name?: string;
  module?: "clinica" | "corretor";
  // Campo realmente persistido no Firestore (ClinicRecord.customServices).
  customServices?: string[];
  // Mantido por compatibilidade com chamadas antigas/testes que usam "services".
  services?: string[];
  customFields?: Record<string, any>;
};

export function isCorretorProfile(clinic: ServiceCatalogContext | null | undefined): boolean {
  if (!clinic) return false;
  if (clinic.module === "corretor") return true;
  if (clinic.module === "clinica") return false;

  const identifier = `${clinic.id ?? ""} ${clinic.name ?? ""}`.toLowerCase();
  if (identifier.includes("corretor") || identifier.includes("henrique") || identifier.includes("imobili")) return true;
  if (identifier.includes("odontocompany")) return false;

  const customFields = clinic.customFields || {};
  if (customFields.creci || customFields.corretor || customFields.imovel) return true;

  const services = Array.isArray(clinic.services) ? clinic.services : [];
  const normalizedServices = services.map((service) => String(service || "").trim().toLowerCase()).filter(Boolean);
  if (normalizedServices.some((service) => CORRETOR_SERVICE_LIBRARY.some((base) => base.toLowerCase() === service))) return true;

  // Fallback para cadastros legados sem módulo explícito: evita classificar corretores
  // como clínica quando o ID não pertence ao namespace odontocompany.
  return Boolean(clinic.id) && !String(clinic.id).toLowerCase().includes("odontocompany");
}

export function resolveServiceOptions(
  clinic: ServiceCatalogContext | null | undefined,
  fallbackServices: string[] = LEGACY_SERVICE_LIBRARY,
): string[] {
  const isCorretor = isCorretorProfile(clinic);

  if (isCorretor) {
    // Prioriza customServices (Firestore), aceita services por compatibilidade.
    const rawCustom = Array.isArray(clinic?.customServices)
      ? clinic.customServices
      : Array.isArray(clinic?.services)
        ? clinic.services
        : [];

    const cleanedCustom = rawCustom
      .map((service) => service?.trim())
      .filter((service): service is string => Boolean(service))
      .filter((service) => !CLINIC_SERVICE_PATTERNS.some((pattern) => service.toLowerCase().includes(pattern)));

    return Array.from(new Set([...CORRETOR_SERVICE_LIBRARY, ...cleanedCustom]));
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
