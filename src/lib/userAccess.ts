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

export function isGlobalAdminProfile(profile: any | null | undefined): boolean {
  if (!profile || profile.role !== "admin") return false;
  const bindings = normalizeUserClinicBindings(profile);
  return bindings.hasWildcard || bindings.explicit.length === 0;
}

export function filterVisibleUsersForProfile<
  T extends { uid?: string; clinicId?: string | null; clinicIds?: string[]; clinics?: string[]; role?: string },
>(profile: any | null | undefined, users: T[] = []): T[] {
  if (!profile) return [];

  const bindings = normalizeUserClinicBindings(profile);
  const currentUid = profile.uid || profile.userId || null;
  const role = profile.role;

  // Admin global (sem vínculo com nenhuma clínica específica, ou com wildcard "*")
  // enxerga todo mundo. Um admin "de conta" (ex.: dono de uma conta de corretor,
  // vinculado a um clinicId especifico) e tratado igual a qualquer outro perfil:
  // so ve o que pertence as clinicas dele.
  if (role === "admin" && (bindings.hasWildcard || bindings.explicit.length === 0)) {
    return users;
  }

  if (bindings.explicit.length === 0) {
    return currentUid ? users.filter((user) => user?.uid === currentUid) : [];
  }

  const allowedClinicIds = new Set(bindings.explicit);

  return users.filter((user) => {
    if (!user) return false;
    if (currentUid && user.uid === currentUid) return true;
    if (user?.role === "admin") return false;

    const userBindings = normalizeUserClinicBindings(user);
    if (userBindings.explicit.length === 0) return false;
    if (bindings.hasWildcard) return true;

    return userBindings.explicit.some((clinicId) => allowedClinicIds.has(clinicId));
  });
}

export function filterVisibleClinicsForProfile<T extends { id: string }>(
  profile: any | null | undefined,
  clinics: T[] = [],
): T[] {
  if (!profile) return [];

  if (isGlobalAdminProfile(profile)) return clinics;

  const bindings = normalizeUserClinicBindings(profile);
  if (bindings.explicit.length === 0) return [];

  const allowedClinicIds = new Set(bindings.explicit);
  return clinics.filter((clinic) => allowedClinicIds.has(clinic.id));
}
