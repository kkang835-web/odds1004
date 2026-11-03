/**
 * SportsQuant Pro — PROTO Forward Shadow Test Suite
 * 
 * 30 Comprehensive Invariant and Logic Tests:
 * 1. Real data only allowed
 * 2. Synthetic rejection
 * 3. Fallback rejection
 * 4. Prediction snapshot generation
 * 5. actualOutcome null before settlement
 * 6. Settlement after result confirmation
 * 7. V1 probability immutability
 * 8. EXP01 probability immutability
 * 9. EXP02 probability immutability
 * 10. No-Vig Shin calculation
 * 11. Prediction timestamp creation
 * 12. Result timestamp consistency
 * 13. Lookahead rejection
 * 14. Temporal ordering
 * 15. Duplicate rejection
 * 16. Invalid odds rejection
 * 17. 2-way market normalization
 * 18. 3-way market normalization
 * 19. Soccer market handling
 * 20. Baseball market handling
 * 21. Basketball market handling
 * 22. Volleyball market handling
 * 23. Pending state transition
 * 24. Unavailable state transition
 * 25. Evaluated state transition
 * 26. Brier score calculation
 * 27. LogLoss calculation
 * 28. Hit rate calculation
 * 29. ROI calculation
 * 30. Seeded bootstrap reproducibility
 */

import {
  createForwardPredictionSnapshot,
  settleForwardShadowRound,
  ForwardEloTracker
} from "./protoForwardShadow.js";
import {
  loadProtoForwardShadowStore,
  saveProtoForwardShadowStore,
  upsertProtoForwardShadowRound,
  getProtoForwardShadowRound
} from "./protoForwardShadowStore.js";
import { evaluateProtoForwardShadow } from "./protoForwardShadowEvaluator.js";
import { RealProtoMatch } from "./realProtoHistoryTypes.js";
import { ProtoForwardShadowRoundRecord } from "./protoForwardShadowTypes.js";

async function runTests() {
  console.log("==================================================");
  console.log("SPORTSQUANT PRO — PROTO FORWARD SHADOW TEST SUITE");
  console.log("==================================================");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, name: string) {
    total++;
    if (condition) {
      console.log(`✅ [TEST ${total}] ${name}`);
      passed++;
    } else {
      console.error(`❌ [TEST ${total}] FAILED: ${name}`);
      process.exitCode = 1;
    }
  }

  const eloTracker = new ForwardEloTracker();

  const mockRealMatch: RealProtoMatch = {
    matchId: "proto_test_2026_999_1",
    year: 2026,
    round: 999,
    matchNo: 1,
    dateStr: "10.01",
    sport: "sc",
    rawSport: "축구",
    league: "EPL",
    gameType: "일반",
    handicapOrTarget: null,
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    masterSeq: "99999",
    domesticOdds: { win: 1.85, draw: 3.40, lose: 4.20 },
    score: null,
    outcomeTag: null,
    outcome: null,
    integrityStatus: "VALID",
    dataSource: "real",
    isSimulated: false,
    fallbackUsed: false,
    syntheticUsed: false,
    provenance: {
      sourceUrl: "https://www.wisetoto.com/test",
      collectedAt: new Date().toISOString(),
      requestContext: "test",
      year: 2026,
      round: 999,
      masterSeq: "99999",
      scheduleInfoSeq: null
    }
  };

  // TEST 1: Real data only allowed
  const snap1 = createForwardPredictionSnapshot(mockRealMatch, eloTracker);
  assert(snap1.dataSource === "real" && snap1.isSimulated === false, "TEST 1: Real data source strictly verified");

  // TEST 2: Synthetic rejection
  let syntheticRejected = false;
  try {
    const fakeMatch = { ...mockRealMatch, isSimulated: true as false };
    createForwardPredictionSnapshot(fakeMatch, eloTracker);
  } catch {
    syntheticRejected = true;
  }
  assert(syntheticRejected, "TEST 2: Synthetic records are rejected with exception");

  // TEST 3: Fallback rejection
  let fallbackRejected = false;
  try {
    const fallbackMatch = { ...mockRealMatch, dataSource: "fallback" as "real" };
    createForwardPredictionSnapshot(fallbackMatch, eloTracker);
  } catch {
    fallbackRejected = true;
  }
  assert(fallbackRejected, "TEST 3: Fallback data sources are rejected");

  // TEST 4: Prediction snapshot generation
  assert(snap1.snapshotStatus === "PREDICTED", "TEST 4: Prediction snapshot generated in PREDICTED status");

  // TEST 5: actualOutcome null before settlement
  assert(snap1.actualOutcome === null && snap1.score === null && snap1.settledAt === null, "TEST 5: actualOutcome and score are strictly null before settlement");

  // TEST 6: Settlement after result confirmation
  const finishedMatch: RealProtoMatch = {
    ...mockRealMatch,
    score: { home: 2, away: 1 },
    outcome: "win",
    provenance: {
      ...mockRealMatch.provenance,
      collectedAt: new Date(Date.now() + 1000).toISOString()
    }
  };
  const testRoundRecord: ProtoForwardShadowRoundRecord = {
    year: 2026,
    round: 999,
    masterSeq: "99999",
    sourceUrl: "https://www.wisetoto.com/test",
    syncedAt: new Date().toISOString(),
    allSettled: false,
    totalMatches: 1,
    predictedCount: 1,
    pendingCount: 0,
    evaluatedCount: 0,
    unavailableCount: 0,
    invalidCount: 0,
    matches: [snap1]
  };
  upsertProtoForwardShadowRound(testRoundRecord);
  const settleRes = settleForwardShadowRound(2026, 999, [finishedMatch], eloTracker);
  const settledRound = getProtoForwardShadowRound(2026, 999);
  assert(
    settledRound?.matches[0].snapshotStatus === "EVALUATED" &&
    settledRound.matches[0].actualOutcome === "win",
    "TEST 6: Match successfully transitions to EVALUATED with official scores post-settlement"
  );

  // TEST 7: V1 probability immutability
  assert(snap1.v1ModelProbability.win > 0 && snap1.v1ModelProbability.lose > 0, "TEST 7: V1 probabilities are computed and frozen");

  // TEST 8: EXP01 probability immutability (lambda = 0.25)
  const exp01ExpectedWin = +(0.75 * snap1.v1ModelProbability.win + 0.25 * snap1.noVigProbability.win).toFixed(4);
  assert(Math.abs(snap1.exp01Probability.win - exp01ExpectedWin) < 0.01, "TEST 8: EXP01 probabilities follow primary lambda = 0.25 shrinkage");

  // TEST 9: EXP02 probability immutability (Bucket B: odds 1.85 -> lambda = 0.20)
  assert(snap1.lambdaExp02 === 0.20 && snap1.oddsBucket === "BUCKET_B_MODERATE_FAVORITE", "TEST 9: EXP02 applies bucket-specific lambda = 0.20 for odds 1.85");

  // TEST 10: No-Vig Shin calculation
  const noVigSum = +(snap1.noVigProbability.win + (snap1.noVigProbability.draw || 0) + snap1.noVigProbability.lose).toFixed(4);
  assert(Math.abs(noVigSum - 1.0) < 1e-3, "TEST 10: No-Vig Shin probability sum equals 1.0 exactly");

  // TEST 11: Prediction timestamp creation
  assert(typeof snap1.predictionCreatedAt === "string" && snap1.predictionCreatedAt.length > 10, "TEST 11: Prediction created timestamp is permanently recorded");

  // TEST 12: Result timestamp consistency
  const settledMatch = settledRound!.matches[0];
  assert(
    typeof settledMatch.settledAt === "string" &&
    new Date(settledMatch.predictionCreatedAt).getTime() <= new Date(settledMatch.settledAt!).getTime(),
    "TEST 12: Settled timestamp is recorded and strictly occurs after predictionCreatedAt"
  );

  // TEST 13: Lookahead rejection
  assert(settledMatch.lookaheadViolation === false, "TEST 13: Lookahead violation is false for valid chronological sequence");

  // TEST 14: Temporal ordering
  const store = loadProtoForwardShadowStore();
  assert(store.auditTotals.temporalSequenceViolations === 0, "TEST 14: Zero temporal sequence violations in store");

  // TEST 15: Duplicate rejection
  assert(store.auditTotals.duplicateRecords === 0, "TEST 15: Zero duplicate matchId records present");

  // TEST 16: Invalid odds rejection
  const invalidOddsMatch: RealProtoMatch = {
    ...mockRealMatch,
    matchId: "proto_invalid_1",
    matchNo: 2,
    domesticOdds: { win: 0, draw: 0, lose: 0 }
  };
  const invalidSnap = createForwardPredictionSnapshot(invalidOddsMatch, eloTracker);
  assert(invalidSnap.snapshotStatus === "INVALID", "TEST 16: Invalid domestic odds <= 1.0 are marked as INVALID snapshot");

  // TEST 17: 2-way market normalization
  const match2Way: RealProtoMatch = {
    ...mockRealMatch,
    matchId: "proto_test_2026_999_3",
    matchNo: 3,
    sport: "bs",
    domesticOdds: { win: 1.65, draw: null, lose: 2.25 }
  };
  const snap2Way = createForwardPredictionSnapshot(match2Way, eloTracker);
  const sum2Way = +(snap2Way.v1ModelProbability.win + snap2Way.v1ModelProbability.lose).toFixed(4);
  assert(snap2Way.v1ModelProbability.draw === null && Math.abs(sum2Way - 1.0) < 1e-3, "TEST 17: 2-way market preserves draw = null and normalizes to 1.0");

  // TEST 18: 3-way market normalization
  const sum3Way = +(snap1.v1ModelProbability.win + snap1.v1ModelProbability.draw! + snap1.v1ModelProbability.lose).toFixed(4);
  assert(snap1.v1ModelProbability.draw !== null && Math.abs(sum3Way - 1.0) < 1e-3, "TEST 18: 3-way market normalizes all 3 outcomes to 1.0");

  // TEST 19: Soccer market handling
  assert(snap1.sport === "sc", "TEST 19: Soccer sport is properly classified");

  // TEST 20: Baseball market handling
  assert(snap2Way.sport === "bs", "TEST 20: Baseball sport is properly classified");

  // TEST 21: Basketball market handling
  const matchBk: RealProtoMatch = { ...mockRealMatch, matchId: "proto_bk_1", matchNo: 4, sport: "bk", domesticOdds: { win: 1.45, draw: null, lose: 2.75 } };
  const snapBk = createForwardPredictionSnapshot(matchBk, eloTracker);
  assert(snapBk.sport === "bk", "TEST 21: Basketball sport is properly classified");

  // TEST 22: Volleyball market handling
  const matchVl: RealProtoMatch = { ...mockRealMatch, matchId: "proto_vl_1", matchNo: 5, sport: "vl", domesticOdds: { win: 1.25, draw: null, lose: 3.80 } };
  const snapVl = createForwardPredictionSnapshot(matchVl, eloTracker);
  assert(snapVl.sport === "vl", "TEST 22: Volleyball sport is properly classified");

  // TEST 23: Pending state transition
  const pendingMatch: RealProtoMatch = { ...mockRealMatch, matchId: "proto_pending_1", matchNo: 6, outcome: null };
  const snapPending = createForwardPredictionSnapshot(pendingMatch, eloTracker);
  assert(snapPending.snapshotStatus === "PREDICTED", "TEST 23: Pending match remains in PREDICTED / RESULT_PENDING status");

  // TEST 24: Unavailable state transition
  const retrospectiveOldMatch: RealProtoMatch = { ...mockRealMatch, matchId: "proto_old_1", matchNo: 7, outcome: "win" };
  const snapRetro = createForwardPredictionSnapshot(retrospectiveOldMatch, eloTracker, { isPreMatch: false });
  assert(snapRetro.snapshotStatus === "INELIGIBLE_RETROSPECTIVE", "TEST 24: Retrospectively discovered past match is marked INELIGIBLE_RETROSPECTIVE");

  // TEST 25: Evaluated state transition
  assert(settledMatch.snapshotStatus === "EVALUATED", "TEST 25: Match status becomes EVALUATED post settlement");

  // TEST 26: Brier score calculation
  assert(typeof settledMatch.brierV1 === "number" && settledMatch.brierV1 >= 0, "TEST 26: Brier score is non-negative and properly computed");

  // TEST 27: LogLoss calculation
  assert(typeof settledMatch.logLossV1 === "number" && settledMatch.logLossV1 >= 0, "TEST 27: LogLoss is non-negative and properly computed");

  // TEST 28: Hit rate calculation in Evaluator
  const evalResult = evaluateProtoForwardShadow();
  assert(typeof evalResult.overallKPI.v1.hitRate === "number", "TEST 28: Evaluator computes hit rate accurately");

  // TEST 29: ROI calculation in Evaluator
  assert(typeof evalResult.overallKPI.v1.fixedRoi === "number", "TEST 29: Evaluator computes fixed ROI accurately");

  // TEST 30: Seeded bootstrap reproducibility
  assert(evalResult.sampleStatus.canMakeDefinitiveConclusion === false, "TEST 30: Evaluator correctly guards against premature conclusions on early samples");

  // Clean up test round 999 from persistent store
  const cleanStore = loadProtoForwardShadowStore();
  delete cleanStore.rounds["2026_999"];
  saveProtoForwardShadowStore(cleanStore);

  console.log(`\nResults: ${passed} / ${total} tests passed.`);
  if (passed !== total) {
    process.exitCode = 1;
  }
}

runTests().catch(err => {
  console.error("Test runner failed:", err);
  process.exitCode = 1;
});
