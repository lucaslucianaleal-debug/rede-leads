export type LastWriter = {
  uid: string | null;
  ts: string; // ISO timestamp
  ua: string;
};

export function makeLastWriter(uid?: string | null): LastWriter {
  const ua = typeof navigator !== 'undefined' && navigator?.userAgent ? navigator.userAgent : 'unknown';
  return {
    uid: uid ?? null,
    ts: new Date().toISOString(),
    ua,
  };
}

// Attach lastWriter metadata to a payload (returns a shallow-cloned object)
export function attachLastWriter<T extends Record<string, any>>(payload: T, uid?: string | null): T & { lastWriter: LastWriter } {
  const lw = makeLastWriter(uid);
  return Object.assign({}, payload, { lastWriter: lw });
}
