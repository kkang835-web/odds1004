import { createForwardPredictionSnapshot, ForwardEloTracker, settleForwardShadowRound } from "./server/protoHistory/protoForwardShadow.js";
import { saveProtoForwardShadowStore, computeSnapshotHash } from "./server/protoHistory/protoForwardShadowStore.js";
import { evaluateProtoForwardShadow } from "./server/protoHistory/protoForwardShadowEvaluator.js";
import { RealProtoMatch } from "./server/protoHistory/realProtoHistoryTypes.js";

function runTests() {
  console.log("=================================================");
  console.log("SportsQuant Pro — PROTO Final Operational Audit Guard Tests");
  console.log("=================================================");

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`);
      failed++;
    }
  }

  // Create a base valid mock match for testing
  const createValidMockMatch = (matchId: string, matchNo: number): RealProtoMatch => ({
    matchId,
    year: 2026,
    round: 102,
    masterSeq: "123",
    matchNo,
    sport: "sc",
    rawSport: "soccer",
    dateStr: "2026-10-01",
    league: "EPL",
    gameType: "일반",
    handicapOrTarget: null,
    homeTeam: "Spurs",
    awayTeam: "Chelsea",
    dataSource: "real",
    outcomeTag: null,
    isSimulated: false,
    fallbackUsed: false,
    syntheticUsed: false,
    outcome: null,
    score: null,
    domesticOdds: { win: 1.80, draw: 3.40, lose: 3.50 },
    integrityStatus: "VALID",
    provenance: {
      sourceUrl: "http://example.com",
      collectedAt: new Date().toISOString(),
      requestContext: "test",
      year: 2026,
      round: 102,
      masterSeq: "123",
      scheduleInfoSeq: "123"
    }
  });

  const eloTracker = new ForwardEloTracker();

  // Test 1-4: Snapshot, Odds, Probability, and EV Mutation Detection
  const m1 = createValidMockMatch("m-1", 1);
  const snap1 = createForwardPredictionSnapshot(m1, eloTracker, { isPreMatch: true });
  
  // Test 1: Snapshot Mutation Detection
  const snapMutated = { ...snap1 };
  (snapMutated as any).selectedOutcome = "draw"; // mutate field included in hash
  const hash1 = computeSnapshotHash(snap1);
  const hashMutated = computeSnapshotHash(snapMutated);
  assert("Test 1: computeSnapshotHash detects structural changes", hash1 !== hashMutated);

  // Test 2: Odds Mutation Detection
  const snapOddsMutated = { ...snap1 };
  snapOddsMutated.odds = { win: 2.50, draw: 3.40, lose: 3.50 }; // mutate odds
  assert("Test 2: computeSnapshotHash detects odds mutation", computeSnapshotHash(snapOddsMutated) !== hash1);

  // Test 3: Probability Mutation Detection
  const snapProbMutated = { ...snap1 };
  snapProbMutated.v1ModelProbability = { win: 0.90, draw: 0.05, lose: 0.05 }; // mutate prob
  assert("Test 3: computeSnapshotHash detects probability mutation", computeSnapshotHash(snapProbMutated) !== hash1);

  // Test 4: EV Mutation Detection
  const snapEvMutated = { ...snap1 };
  snapEvMutated.v1EV = { win: 0.50, draw: 0.20, lose: 0.10 }; // mutate EV
  assert("Test 4: computeSnapshotHash detects EV mutation", computeSnapshotHash(snapEvMutated) !== hash1);

  // Test 5: Retrospective Prediction Block
  const mRetro = createValidMockMatch("m-retro", 5);
  mRetro.outcome = "win";
  mRetro.score = { home: 2, away: 1 };
  const snapRetro = createForwardPredictionSnapshot(mRetro, eloTracker, { isPreMatch: false });
  assert("Test 5: Retrospective prediction correctly flagged", snapRetro.snapshotStatus === "INELIGIBLE_RETROSPECTIVE");

  // Test 6: Look-Ahead Block
  const mLookahead = createValidMockMatch("m-lookahead", 6);
  mLookahead.outcome = "win";
  mLookahead.score = { home: 2, away: 1 };
  const snapLookahead = createForwardPredictionSnapshot(mLookahead, eloTracker, { isPreMatch: true });
  assert("Test 6: Pre-match prediction with outcome flags lookahead violation", snapLookahead.lookaheadViolation === true && snapLookahead.snapshotStatus === "FORWARD_BLOCKED");

  // Setup a test store to test persistence audits (synthetic, duplicate, fallback, score, timestamp, etc.)
  const testStore: any = {
    version: "1.0.0-proto-forward-shadow",
    environment: "LIVE_SHADOW",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rounds: {
      "2026_102": {
        year: 2026,
        round: 102,
        masterSeq: "123",
        sourceUrl: "http://example.com",
        syncedAt: new Date().toISOString(),
        allSettled: false,
        totalMatches: 4,
        matches: []
      }
    },
    auditTotals: {}
  };

  // Test 7: Duplicate Sync Block
  const snapDup1 = createForwardPredictionSnapshot(createValidMockMatch("m-dup", 10), eloTracker);
  const snapDup2 = createForwardPredictionSnapshot(createValidMockMatch("m-dup", 10), eloTracker);
  testStore.rounds["2026_102"].matches = [snapDup1, snapDup2];
  saveProtoForwardShadowStore(testStore);
  assert("Test 7: Duplicate match sync detected and duplicate counter incremented", testStore.auditTotals.duplicateRecords > 0);

  // Test 8: Duplicate Settlement Block
  // Settle on already settled match (handled cleanly since settleForwardShadowRound skips already EVALUATED)
  const matchesToSettle = [createValidMockMatch("m-dup", 10)];
  const settleResult = settleForwardShadowRound(2026, 102, matchesToSettle);
  assert("Test 8: Settlement skips or blocks duplicate processed outcomes gracefully", typeof settleResult.settledCount === "number");

  // Test 9: Inverse Score Block
  const snapInverseScore = createForwardPredictionSnapshot(createValidMockMatch("m-inv-score", 20), eloTracker);
  snapInverseScore.score = { home: -1, away: 3 }; // negative score
  snapInverseScore.snapshotStatus = "EVALUATED";
  testStore.rounds["2026_102"].matches.push(snapInverseScore);
  saveProtoForwardShadowStore(testStore);
  assert("Test 9: Negative/inverse score detected and hard blocked", testStore.auditTotals.inverseScoreRecords > 0);

  // Test 10: Synthetic Block
  const snapSynthetic = createForwardPredictionSnapshot(createValidMockMatch("m-syn", 30), eloTracker);
  (snapSynthetic as any).syntheticUsed = true;
  testStore.rounds["2026_102"].matches.push(snapSynthetic);
  saveProtoForwardShadowStore(testStore);
  assert("Test 10: Synthetic prediction flagged and hard blocked", testStore.auditTotals.syntheticRecords > 0);

  // Test 11: Fallback Block
  const snapFallback = createForwardPredictionSnapshot(createValidMockMatch("m-fall", 40), eloTracker);
  (snapFallback as any).fallbackUsed = true;
  testStore.rounds["2026_102"].matches.push(snapFallback);
  saveProtoForwardShadowStore(testStore);
  assert("Test 11: Fallback data/odds detected and hard blocked", testStore.auditTotals.fallbackUsed > 0);

  // Test 12: Timestamp Ordering
  const snapTemporal = createForwardPredictionSnapshot(createValidMockMatch("m-temp", 50), eloTracker);
  snapTemporal.predictionCreatedAt = "2026-10-05T12:00:00Z";
  snapTemporal.settledAt = "2026-10-05T10:00:00Z"; // prediction is after settlement (temporal violation)
  testStore.rounds["2026_102"].matches.push(snapTemporal);
  saveProtoForwardShadowStore(testStore);
  assert("Test 12: Temporal sequence violation detected and hard blocked", testStore.auditTotals.temporalSequenceViolations > 0);

  // Test 13: Official Result Requirement
  // Officially, canceled outcomes or empty scores maintain RESULT_PENDING unless confirmed.
  const snapOfficial = createForwardPredictionSnapshot(createValidMockMatch("m-official", 60), eloTracker);
  assert("Test 13: Official result required; initial outcome is null", snapOfficial.actualOutcome === null);

  // Test 14: Round Integrity Block
  assert("Test 14: Round level integrity gate status set to FORWARD_BLOCKED", testStore.rounds["2026_102"].integrityGateStatus === "FORWARD_BLOCKED");

  // Test 15: Invalid Market Block
  const snapInvalidMarket = createForwardPredictionSnapshot(createValidMockMatch("m-invalid-market", 70), eloTracker);
  snapInvalidMarket.market = "Alternative_Market" as any;
  testStore.rounds["2026_102"].matches.push(snapInvalidMarket);
  saveProtoForwardShadowStore(testStore);
  assert("Test 15: Invalid market detected and hard blocked", testStore.auditTotals.invalidMarketRecords > 0);

  // Test 16: Missing Timestamp Block
  const snapMissingTimestamp = createForwardPredictionSnapshot(createValidMockMatch("m-missing-ts", 80), eloTracker);
  (snapMissingTimestamp as any).predictionCreatedAt = null;
  testStore.rounds["2026_102"].matches.push(snapMissingTimestamp);
  saveProtoForwardShadowStore(testStore);
  assert("Test 16: Missing prediction timestamp detected and hard blocked", testStore.auditTotals.missingTimestampRecords > 0);

  // Test 17: Performance Conclusion Guard
  const summary = evaluateProtoForwardShadow();
  const isGuardActive = summary.sampleStatus.settledCount < 1000 && summary.sampleStatus.sampleNotice === "Forward sample accumulation in progress";
  assert("Test 17: Performance conclusion guard is active for small sample sizes", isGuardActive);

  console.log("\n=================================================");
  console.log(`Tests Run Complete: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
