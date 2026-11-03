import { RealHistoricalMatch } from "./realHistoryTypes.js";
import { getAllRealMatches, getRealHistoryStoreSummary } from "./realHistoryStore.js";

export interface RealWalkForwardSplit {
  trainSet: RealHistoricalMatch[];
  valSet: RealHistoricalMatch[];
  testSet: RealHistoricalMatch[];
  totalMatches: number;
  syntheticCount: 0;
  verifiedReal: true;
}

/**
 * Splits verified REAL historical matches into time-ordered Walk-Forward slices.
 * Excludes any UNAVAILABLE, MISMATCH, or DUPLICATE matches to preserve pure mathematical integrity.
 */
export function getRealHistoricalWalkForwardDataset(
  trainRatio = 0.6,
  valRatio = 0.2
): RealWalkForwardSplit {
  const allMatches = getAllRealMatches()
    .filter(m => m.integrityStatus === "VALID" && m.outcome !== null && !m.isSimulated);

  // Sort strictly by year, round, matchNo
  allMatches.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.round !== b.round) return a.round - b.round;
    return a.matchNo - b.matchNo;
  });

  const total = allMatches.length;
  const trainEnd = Math.floor(total * trainRatio);
  const valEnd = Math.floor(total * (trainRatio + valRatio));

  return {
    trainSet: allMatches.slice(0, trainEnd),
    valSet: allMatches.slice(trainEnd, valEnd),
    testSet: allMatches.slice(valEnd),
    totalMatches: total,
    syntheticCount: 0,
    verifiedReal: true
  };
}

export function getRealWalkForwardSummary() {
  const storeSummary = getRealHistoryStoreSummary();
  const split = getRealHistoricalWalkForwardDataset();

  return {
    ...storeSummary,
    walkForward: {
      trainMatches: split.trainSet.length,
      valMatches: split.valSet.length,
      testMatches: split.testSet.length,
      syntheticCount: 0
    }
  };
}
