import { RealHistoricalMatch, RealIntegrityStatus } from "./realHistoryTypes.js";

/**
 * Normalizes team names for fuzzy comparison while preventing different teams from collapsing.
 * Preserves core identity (e.g. Manchester City vs United, SSG vs LG, etc.)
 */
export function normalizeTeamName(raw: string): string {
  if (!raw) return "";
  let name = raw.trim()
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();

  // Strip common decorative prefixes/suffixes if standard
  name = name.replace(/^FC/, "").replace(/FC$/, "");
  name = name.replace(/_H$/, "").replace(/_A$/, "");
  return name;
}

/**
 * Validates cross-source match integrity between toto_calc market data and get_toto_list result data
 */
export function validateMatchIntegrity(
  marketMatch: {
    sport: string;
    year: number;
    round: number;
    matchNo: number;
    matchDate: string;
    homeTeam: string;
    awayTeam: string;
  },
  resultMatch: {
    homeTeam: string;
    awayTeam: string;
    homeScore: number | null;
    awayScore: number | null;
    outcomeTag: string | null;
  } | null,
  seenMatchKeys: Set<string>
): { status: RealIntegrityStatus; notes: string[] } {
  const notes: string[] = [];
  const matchKey = `${marketMatch.sport}_${marketMatch.year}_${marketMatch.round}_${marketMatch.matchNo}`;

  // 1. Duplicate check
  if (seenMatchKeys.has(matchKey)) {
    notes.push(`Duplicate match key detected: ${matchKey}`);
    return { status: "DUPLICATE", notes };
  }
  seenMatchKeys.add(matchKey);

  // 2. Result availability check
  if (!resultMatch || (!resultMatch.outcomeTag && resultMatch.homeScore === null && resultMatch.awayScore === null)) {
    notes.push("Result data not found or empty in historical archive");
    return { status: "UNAVAILABLE", notes };
  }

  // 3. Team cross-validation
  const normMarketH = normalizeTeamName(marketMatch.homeTeam);
  const normMarketA = normalizeTeamName(marketMatch.awayTeam);
  const normResultH = normalizeTeamName(resultMatch.homeTeam);
  const normResultA = normalizeTeamName(resultMatch.awayTeam);

  // Allow partial substring matching if one is abbreviated (e.g. "C삿포로" vs "삿포로", "요코하마FC" vs "요코FC")
  const homeMatch = normMarketH === normResultH ||
    (normMarketH.length >= 2 && normResultH.includes(normMarketH)) ||
    (normResultH.length >= 2 && normMarketH.includes(normResultH));

  const awayMatch = normMarketA === normResultA ||
    (normMarketA.length >= 2 && normResultA.includes(normMarketA)) ||
    (normResultA.length >= 2 && normMarketA.includes(normResultA));

  if (!homeMatch || !awayMatch) {
    notes.push(`Team mismatch: Market [${marketMatch.homeTeam} vs ${marketMatch.awayTeam}] !== Result [${resultMatch.homeTeam} vs ${resultMatch.awayTeam}]`);
    return { status: "MISMATCH", notes };
  }

  return { status: "VALID", notes };
}
