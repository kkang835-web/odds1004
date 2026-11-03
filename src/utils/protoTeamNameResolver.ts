import dictionaryData from '../../data/mappings/protoTeamNameDictionary.json';

export interface TeamResolutionResult {
  displayName: string;
  originalName: string;
  status: 'VERIFIED' | 'UNVERIFIED' | 'CONFLICT';
  officialEvidence?: string;
}

const mappings = (dictionaryData as any).mappings || {};
const matchOverrides = (dictionaryData as any).matchOverrides || {};

/**
 * Resolves a potentially corrupted team name to its official clean Korean display name.
 * ONLY 'VERIFIED' mappings are translated.
 * 'UNVERIFIED' or 'CONFLICT' or unlisted names strictly return the original string unchanged.
 */
export function resolveDisplayTeamName(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') return rawName;
  const entry = mappings[rawName];
  if (entry && entry.status === 'VERIFIED' && entry.cleanName) {
    return entry.cleanName;
  }
  return rawName;
}

/**
 * Returns full resolution audit information for a team string.
 */
export function getTeamResolutionInfo(rawName: string): TeamResolutionResult {
  if (!rawName || typeof rawName !== 'string') {
    return { displayName: rawName, originalName: rawName, status: 'UNVERIFIED' };
  }
  const entry = mappings[rawName];
  if (entry && entry.status === 'VERIFIED') {
    return {
      displayName: entry.cleanName,
      originalName: rawName,
      status: 'VERIFIED',
      officialEvidence: entry.officialEvidence
    };
  }
  return {
    displayName: rawName,
    originalName: rawName,
    status: (entry?.status as any) || 'UNVERIFIED',
    officialEvidence: entry?.officialEvidence
  };
}

/**
 * Resolves home and away display names for a match, checking matchOverrides first.
 */
export function resolveMatchDisplayTeams(match: {
  year?: number;
  round?: number;
  matchNo?: number;
  homeTeam: string;
  awayTeam: string;
}): { homeDisplayName: string; awayDisplayName: string; isOverrideApplied: boolean } {
  if (match.year && match.round && match.matchNo) {
    const overrideKey = `${match.year}_${match.round}_${match.matchNo}`;
    const override = matchOverrides[overrideKey];
    if (override && override.status === 'VERIFIED') {
      return {
        homeDisplayName: override.homeTeam,
        awayDisplayName: override.awayTeam,
        isOverrideApplied: true
      };
    }
  }

  return {
    homeDisplayName: resolveDisplayTeamName(match.homeTeam),
    awayDisplayName: resolveDisplayTeamName(match.awayTeam),
    isOverrideApplied: false
  };
}
