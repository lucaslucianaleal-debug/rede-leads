export type UserClinicBindings = {
  clinicId: string | null;
  clinicIds: string[];
  clinics: string[];
  hasWildcard: boolean;
  explicit: string[];
};

export function normalizeUserClinicBindings(profile: any | null | undefined): UserClinicBindings {
  const raw = [
    ...(profile?.clinicId ? [profile.clinicId] : []),
    ...(Array.isArray(profile?.clinicIds) ? profile.clinicIds : []),
    ...(Array.isArray(profile?.clinics) ? profile.clinics : []),
  ]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map((value) => String(value).trim());

  const hasWildcard = raw.includes("*");
  const explicit = Array.from(new Set(raw.filter((value) => value !== "*")));

  return {
    clinicId: hasWildcard || explicit.length > 1 ? null : explicit[0] || null,
    clinicIds: explicit,
    clinics: explicit,
    hasWildcard,
    explicit,
  };
}
