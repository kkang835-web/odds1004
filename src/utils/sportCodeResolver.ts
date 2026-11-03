/**
 * SportsQuant Pro — Canonical Sport Code Single Source of Truth
 * 
 * Strict specifications:
 * - sc -> soccer
 * - bs -> baseball
 * - bk -> basketball
 * - vl -> volleyball
 * - bb -> INVALID / UNKNOWN (throws or returns null depending on resolver variant)
 */

export type CanonicalSport = 'soccer' | 'baseball' | 'basketball' | 'volleyball';

export const CANONICAL_SPORT_CODES: Record<string, CanonicalSport> = {
  sc: 'soccer',
  bs: 'baseball',
  bk: 'basketball',
  vl: 'volleyball'
};

/**
 * Resolves a raw sport code to its canonical representation.
 * Returns null for invalid codes (such as 'bb', '', null, undefined).
 */
export function resolveCanonicalSportCode(raw: string | null | undefined): CanonicalSport | null {
  if (!raw || typeof raw !== 'string') return null;
  const clean = raw.trim().toLowerCase();

  // Strict mapping
  if (clean === 'sc' || clean === 'soccer') return 'soccer';
  if (clean === 'bs' || clean === 'baseball') return 'baseball';
  if (clean === 'bk' || clean === 'basketball') return 'basketball';
  if (clean === 'vl' || clean === 'volleyball') return 'volleyball';

  // Explicit invalid codes like 'bb'
  return null;
}

/**
 * Strict resolver that throws if the code is invalid or unknown.
 */
export function resolveCanonicalSportCodeStrict(raw: string | null | undefined): CanonicalSport {
  const resolved = resolveCanonicalSportCode(raw);
  if (!resolved) {
    throw new Error(`[SPORT_CODE_ERROR] Invalid or unsupported sport code: "${raw}". Allowed: sc, bs, bk, vl.`);
  }
  return resolved;
}
