/**
 * SportsQuant Pro — Real PROTO Integrity Validator
 * 
 * [ABSOLUTE GUARDRAILS]
 * 1. Strict validation of all PROTO matches against simulated/synthetic data.
 * 2. Deduplication check: Blocks identical matchId / matchNo inside a round.
 * 3. Enforces real source provenance.
 * 4. Missing score -> UNAVAILABLE status (never synthetic).
 */

import { RealProtoMatch, RealProtoIntegrityStatus, RealProtoRoundSummary } from "./realProtoHistoryTypes.js";

export interface ValidationResult {
  status: RealProtoIntegrityStatus;
  reasons: string[];
}

export function validateProtoMatchIntegrity(
  match: RealProtoMatch,
  seenMatchNos: Set<number>,
  seenMatchIds: Set<string>
): ValidationResult {
  const reasons: string[] = [];

  // 1. Synthetic / Simulation Guard
  const rawObj = match as unknown as Record<string, unknown>;
  if (match.dataSource !== "real") {
    reasons.push(`Invalid dataSource: expected 'real', got '${match.dataSource}'`);
    return { status: "SYNTHETIC", reasons };
  }
  if (rawObj.isSimulated === true) {
    reasons.push("isSimulated is true");
    return { status: "SYNTHETIC", reasons };
  }
  if (rawObj.syntheticUsed === true) {
    reasons.push("syntheticUsed is true");
    return { status: "SYNTHETIC", reasons };
  }
  if (rawObj.fallbackUsed === true) {
    reasons.push("fallbackUsed is true");
    return { status: "SYNTHETIC", reasons };
  }

  // 2. Provenance Check
  if (!match.provenance || !match.provenance.sourceUrl || !match.provenance.collectedAt || !match.masterSeq) {
    reasons.push("Missing real provenance metadata or source URL");
    return { status: "UNAVAILABLE", reasons };
  }

  // 3. Duplicate Check
  if (seenMatchNos.has(match.matchNo)) {
    reasons.push(`Duplicate matchNo detected: ${match.matchNo}`);
    return { status: "DUPLICATE", reasons };
  }
  if (seenMatchIds.has(match.matchId)) {
    reasons.push(`Duplicate matchId detected: ${match.matchId}`);
    return { status: "DUPLICATE", reasons };
  }

  // 4. Team Names Check
  if (!match.homeTeam || !match.awayTeam || match.homeTeam.trim().length === 0 || match.awayTeam.trim().length === 0) {
    reasons.push("Missing home or away team name");
    return { status: "MISMATCH", reasons };
  }

  // 5. Domestic Odds Check
  const { win, lose } = match.domesticOdds;
  if (win === null || lose === null || isNaN(win) || isNaN(lose) || win <= 1.0 || lose <= 1.0) {
    reasons.push(`Invalid domestic odds: win=${win}, lose=${lose}`);
    return { status: "INVALID_ODDS", reasons };
  }

  // 6. Score & Result Confirmation Check
  if (match.score === null && match.outcome === null && match.outcomeTag === null) {
    reasons.push("Game outcome and score not yet confirmed (pending/future)");
    return { status: "UNAVAILABLE", reasons };
  }

  return { status: "VALID", reasons };
}

/**
 * Aggregates summary counts for a set of matches in a round
 */
export function summarizeProtoRound(
  year: number,
  round: number,
  masterSeq: string,
  matches: RealProtoMatch[]
): RealProtoRoundSummary {
  let validCount = 0;
  let unavailableCount = 0;
  let mismatchCount = 0;
  let duplicateCount = 0;
  let syntheticCount = 0;
  let invalidOddsCount = 0;
  const sportsBreakdown: Record<string, number> = {};

  for (const m of matches) {
    sportsBreakdown[m.sport] = (sportsBreakdown[m.sport] || 0) + 1;

    switch (m.integrityStatus) {
      case "VALID":
        validCount++;
        break;
      case "UNAVAILABLE":
        unavailableCount++;
        break;
      case "MISMATCH":
        mismatchCount++;
        break;
      case "DUPLICATE":
        duplicateCount++;
        break;
      case "SYNTHETIC":
        syntheticCount++;
        break;
      case "INVALID_ODDS":
        invalidOddsCount++;
        break;
    }
  }

  return {
    year,
    round,
    masterSeq,
    expectedMatchCount: matches.length,
    actualMatchCount: matches.length,
    validCount,
    unavailableCount,
    mismatchCount,
    duplicateCount,
    syntheticCount,
    invalidOddsCount,
    fallbackUsedCount: 0,
    collectedAt: new Date().toISOString(),
    sportsBreakdown
  };
}
