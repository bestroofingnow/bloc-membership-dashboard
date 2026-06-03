/**
 * Demo mode is OFF by default. It is the ONLY switch that allows the
 * hardcoded static seed (src/data/*) to be shown. A real configured
 * reader that gets zero rows must see an empty state, never fabricated PII.
 * (Spec §1.2 anti-fabrication invariant; §2 P0-g.)
 */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}

export interface DataMode {
  isConfigured: boolean;
  isDemo: boolean;
}

/** Initial state before any fetch. Seed only when not configured or in demo. */
export function chooseInitialData<T>(seed: T[], mode: DataMode): T[] {
  if (!mode.isConfigured || mode.isDemo) return seed;
  return [];
}

/** After a fetch: real rows win; on zero rows, seed only in demo mode. */
export function resolveFetchResult<T>(rows: T[], seed: T[], mode: DataMode): T[] {
  if (rows.length > 0) return rows;
  if (mode.isDemo) return seed;
  return [];
}
