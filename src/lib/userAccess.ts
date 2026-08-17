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

export function filterVisibleUsersForProfile(
  profile: any | null | undefined,
  users: Array<{ uid?: string; clinicId?: string | null; clinicIds?: string[]; clinics?: string[]; role?: string }> = [],
) {
  if (!profile) return [];

  const bindings = normalizeUserClinicBindings(profile);
  const currentUid = profile.uid || profile.userId || null;
  const role = profile.role;

  if (role === "admin") {
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
