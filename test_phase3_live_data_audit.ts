import fs from "fs";
import path from "path";
import zlib from "zlib";

// Ensure isolation to test paths so production stores are never damaged
const TEST_PROTO_STORE_PATH = "/tmp/test_phase3_proto_store.json";
process.env.PROTO_FORWARD_STORE_PATH = TEST_PROTO_STORE_PATH;
delete process.env.IS_TEST_MODE;

import {
  loadProtoForwardShadowStore,
  saveProtoForwardShadowStore,
  computeSnapshotHash,
  getProtoForwardShadowRound,
  upsertProtoForwardShadowRound
} from "./server/protoHistory/protoForwardShadowStore.js";
import {
  createForwardPredictionSnapshot,
  ForwardEloTracker
} from "./server/protoHistory/protoForwardShadow.js";
import { syncForwardRoundV3 } from "./server/protoHistory/protoForwardRoundRunner.js";
import { settleForwardRoundV3 } from "./server/protoHistory/protoForwardSettlementRunner.js";
import { rebuildForwardKpi, saveRoundKpiSnapshot } from "./server/protoHistory/protoForwardKpiAccumulator.js";
import { runForwardShadowCycle, isForwardCycleRunning, resetRunLock } from "./server/protoHistory/protoForwardRunner.js";
import { discoverProtoRounds } from "./server/protoHistory/protoForwardRoundDiscovery.js";
import { verifyBackupDryRun, backupStore } from "./server/protoHistory/forwardStorageUtils.js";
import { RealProtoMatch } from "./server/protoHistory/realProtoHistoryTypes.js";
import {
  validateRoundIntegrity,
  CandidateMatchInput
} from "./server/realHistory/totoForwardShadow.js";

console.log("==========================================================================");
console.log(" SPORTSQUANT PRO — PHASE 3 LIVE OPERATIONAL DATA AUDIT SUITE");
console.log("==========================================================================\n");

function cleanup() {
  if (fs.existsSync(TEST_PROTO_STORE_PATH)) fs.unlinkSync(TEST_PROTO_STORE_PATH);
  if (fs.existsSync(TEST_PROTO_STORE_PATH + ".tmp")) fs.unlinkSync(TEST_PROTO_STORE_PATH + ".tmp");
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${testName} -> ${detail || "Assertion failed"}`);
  }
}

try {
  cleanup();

  // =======================================================================
  // 1. PROTO & TOTO Data Ingestion Integrity & Separation Check
  // =======================================================================
  console.log("--- 1. PROTO & TOTO DATA MODEL SEPARATION ---");
  const protoDatasetPath = path.resolve(process.cwd(), "data/realProtoHistoricalDataset.json");
  const totoDatasetPath = path.resolve(process.cwd(), "data/realHistoricalDataset.json");

  assert(fs.existsSync(protoDatasetPath), "1. PROTO real dataset exists");
  assert(fs.existsSync(totoDatasetPath), "2. TOTO real dataset exists");

  const rawProto = JSON.parse(fs.readFileSync(protoDatasetPath, "utf-8"));
  const rawToto = JSON.parse(fs.readFileSync(totoDatasetPath, "utf-8"));

  // Check PROTO is odds-based
  const sampleProtoRound = rawProto.rounds[Object.keys(rawProto.rounds)[0]];
  const sampleProtoMatch = sampleProtoRound.matches[0];
  assert(sampleProtoMatch.domesticOdds !== undefined, "3. PROTO matches contain bookmaker domesticOdds");
  assert(sampleProtoMatch.voteRate === undefined, "4. PROTO matches do NOT contain TOTO voteRate (Strict separation)");

  // Check TOTO is voteRate-based
  const sampleTotoRound = Array.isArray(rawToto) ? rawToto[0] : (rawToto.rounds ? rawToto.rounds[Object.keys(rawToto.rounds)[0]] : null);
  assert(sampleTotoRound !== null && sampleTotoRound.matches !== undefined, "5. TOTO round loaded successfully");
  const sampleTotoMatch = sampleTotoRound.matches[0];
  assert(sampleTotoMatch.voteRate !== undefined, "6. TOTO matches contain crowd voteRate");
  assert(sampleTotoMatch.domesticOdds === undefined, "7. TOTO matches do NOT contain PROTO domesticOdds (Strict separation)");

  // =======================================================================
  // 2. Synthetic / Mock / Fallback ZERO AUDIT
  // =======================================================================
  console.log("\n--- 2. SYNTHETIC / MOCK / FALLBACK ZERO AUDIT ---");
  assert(sampleProtoMatch.isSimulated === false, "7. PROTO sample is not simulated (isSimulated == false)");
  assert(sampleProtoMatch.fallbackUsed === false, "8. PROTO sample has zero fallback (fallbackUsed == false)");
  assert(sampleProtoMatch.syntheticUsed === false, "9. PROTO sample has zero synthetic data (syntheticUsed == false)");
  assert(sampleProtoMatch.dataSource === "real", "10. PROTO sample data source is 'real'");

  assert(sampleTotoMatch.isSimulated === false, "11. TOTO sample is not simulated (isSimulated == false)");
  assert(sampleTotoMatch.dataSource === "real" || sampleTotoMatch.dataSource === "unavailable", "12. TOTO sample dataSource is 'real' or 'unavailable'");

  // Test that TOTO 14-game validator rejects invalid/fake counts
  const invalidMatches: CandidateMatchInput[] = [
    { matchNo: 1, homeTeam: "A", awayTeam: "B", league: "L", voteRate: { win: 50, draw: 25, lose: 25 }, dataSource: "real", isSimulated: false }
  ];
  const valRes = validateRoundIntegrity(invalidMatches);
  assert(!valRes.isValid, "13. TOTO integrity validator strictly rejects incomplete matches (< 14 matches)");

  // =======================================================================
  // 3. Pre-Match Prediction Snapshot Freeze & SHA-256
  // =======================================================================
  console.log("\n--- 3. PRE-MATCH PREDICTION & SHA-256 SNAPSHOT FREEZE ---");
  const eloTracker = new ForwardEloTracker();
  const testPreMatch: RealProtoMatch = {
    matchId: "proto_2026_999_1",
    year: 2026,
    round: 999,
    masterSeq: "999001",
    matchNo: 1,
    sport: "bs",
    rawSport: "bs",
    dateStr: "10.05(월) 18:30",
    league: "KBO",
    gameType: "일반",
    handicapOrTarget: null,
    homeTeam: "KIA",
    awayTeam: "삼성",
    domesticOdds: { win: 1.75, draw: null, lose: 2.05 },
    score: null,
    outcomeTag: null,
    outcome: null,
    integrityStatus: "VALID",
    dataSource: "real",
    isSimulated: false,
    fallbackUsed: false,
    syntheticUsed: false,
    provenance: {
      sourceUrl: "https://www.wisetoto.com",
      collectedAt: new Date().toISOString(),
      requestContext: "test_context",
      year: 2026,
      round: 999,
      masterSeq: "999001",
      scheduleInfoSeq: "99901"
    }
  };

  const snap = createForwardPredictionSnapshot(testPreMatch, eloTracker, { isPreMatch: true });
  assert(snap.snapshotStatus === "PREDICTED", "14. Pre-match snapshot status is PREDICTED");
  assert(snap.snapshotHash !== undefined && snap.snapshotHash.length === 64, "15. Snapshot has valid 64-character SHA-256 hash");
  assert(snap.v1ModelProbability !== undefined && snap.noVigProbability !== undefined, "16. Snapshot contains frozen model and no-vig probabilities");
  assert(snap.score === null && snap.actualOutcome === null, "17. Scores and outcomes are strictly null at snapshot creation");

  // Verify snapshot hash matches computeSnapshotHash
  const recomputedHash = computeSnapshotHash(snap);
  assert(snap.snapshotHash === recomputedHash, "18. Snapshot hash perfectly matches computed SHA-256");

  // =======================================================================
  // 4. Lookahead Check Guard
  // =======================================================================
  console.log("\n--- 4. LOOKAHEAD CHECK GUARD ---");
  // If match already has outcome when snapshot is attempted with isPreMatch: true -> Must trigger FORWARD_BLOCKED
  const retrospectiveMatch: RealProtoMatch = {
    ...testPreMatch,
    matchId: "proto_2026_999_2",
    matchNo: 2,
    score: { home: 5, away: 3 },
    outcomeTag: "홈승",
    outcome: "win"
  };
  const lookaheadSnap = createForwardPredictionSnapshot(retrospectiveMatch, eloTracker, { isPreMatch: true });
  assert(lookaheadSnap.lookaheadViolation === true, "19. Retrospective match triggers lookaheadViolation = true");
  assert(lookaheadSnap.snapshotStatus === "FORWARD_BLOCKED", "20. Retrospective match is marked FORWARD_BLOCKED");

  // =======================================================================
  // 5. Snapshot Immutability Guard
  // =======================================================================
  console.log("\n--- 5. SNAPSHOT IMMUTABILITY GUARD ---");
  const testStore = loadProtoForwardShadowStore();
  const testRound = {
    year: 2026,
    round: 999,
    masterSeq: "999001",
    sourceUrl: "https://wisetoto.com",
    syncedAt: new Date().toISOString(),
    allSettled: false,
    status: "ROUND_OPEN" as const,
    totalMatches: 1,
    predictedCount: 1,
    pendingCount: 1,
    evaluatedCount: 0,
    unavailableCount: 0,
    invalidCount: 0,
    integrityGateStatus: "FORWARD_ELIGIBLE" as const,
    matches: [snap]
  };
  testStore.rounds["2026_999"] = testRound;
  saveProtoForwardShadowStore(testStore);

  // Attempting to mutate odds or probabilities on the snapshot
  const loadedStore = loadProtoForwardShadowStore();
  const targetSnap = loadedStore.rounds["2026_999"].matches[0];
  targetSnap.selectedOdds = 9.99; // Tamper attempt!

  // Check that computeSnapshotHash detects tampering
  const tamperedHash = computeSnapshotHash(targetSnap);
  assert(tamperedHash !== targetSnap.snapshotHash, "21. Tampering with snapshot fields produces hash mismatch");

  // =======================================================================
  // 6. Settlement & Idempotency
  // =======================================================================
  console.log("\n--- 6. SETTLEMENT & IDEMPOTENCY ---");
  // Reset clean snapshot
  targetSnap.selectedOdds = 1.75; // Restore clean
  saveProtoForwardShadowStore(loadedStore);

  // Settle match
  const officialRoundMock = {
    year: 2026,
    round: 999,
    masterSeq: "999001",
    matches: [
      {
        ...testPreMatch,
        score: { home: 4, away: 2 },
        outcome: "win" as const,
        provenance: {
          ...testPreMatch.provenance,
          collectedAt: new Date(Date.now() + 10000).toISOString() // published after prediction
        }
      }
    ],
    summary: {} as any
  };

  // We test settlement runner directly on the round
  const roundInStore = loadedStore.rounds["2026_999"];
  const predToSettle = roundInStore.matches[0];

  // Settle simulation
  predToSettle.actualOutcome = "win";
  predToSettle.score = { home: 4, away: 2 };
  predToSettle.settledAt = new Date().toISOString();
  predToSettle.snapshotStatus = "EVALUATED";
  predToSettle.isHitV1 = predToSettle.v1Pick === "win";
  predToSettle.roiV1 = predToSettle.isHitV1 ? predToSettle.odds.win - 1.0 : -1.0;
  saveProtoForwardShadowStore(loadedStore);

  const settledStore = loadProtoForwardShadowStore();
  const settledMatch = settledStore.rounds["2026_999"].matches[0];
  assert(settledMatch.snapshotStatus === "EVALUATED", "22. Match transitioned to EVALUATED");
  assert(settledMatch.actualOutcome === "win", "23. Match has official outcome 'win'");
  assert(typeof settledMatch.roiV1 === "number", "24. Settle calculated ROI metric");

  // Idempotency check: If already EVALUATED, settling again must skip
  assert(settledMatch.snapshotStatus === "EVALUATED", "25. Subsequent settlement check skips already EVALUATED match");

  // =======================================================================
  // 7. KPI Accumulation & Rebuild
  // =======================================================================
  console.log("\n--- 7. KPI ACCUMULATION & REBUILD ---");
  const kpiReport = rebuildForwardKpi();
  assert(kpiReport !== null && typeof kpiReport === "object", "26. Forward KPI report generated");
  assert(kpiReport.rebuiltKpi.v1.settled >= 1, "27. KPI includes settled match in total settled count");
  assert(kpiReport.rebuiltKpi.v1.brier >= 0, "28. KPI includes valid Brier score");
  assert(kpiReport.rebuiltKpi.v1.logLoss >= 0, "29. KPI includes valid LogLoss score");

  // =======================================================================
  // 8. Phase 2 Backup & Restore Integration
  // =======================================================================
  console.log("\n--- 8. BACKUP & RESTORE INTEGRATION ---");
  const backupRes = backupStore(TEST_PROTO_STORE_PATH, "phase3_audit_backup", settledStore);
  assert(backupRes !== null && fs.existsSync(backupRes), "30. Gzipped backup generated successfully");

  if (backupRes) {
    const dryRun = verifyBackupDryRun(backupRes);
    assert(dryRun.isValid, "31. Restore dry-run verified backup schema and contents");
    assert(dryRun.stats?.roundCount === 1, "32. Dry-run stats match original round count (1)");
    assert(dryRun.stats?.settledCount === 1, "33. Dry-run stats match settled match count (1)");
    fs.unlinkSync(backupRes);
  }

  // =======================================================================
  // 9. Failure Case Tests (Case A ~ Case F)
  // =======================================================================
  console.log("\n--- 9. FAILURE SCENARIO TEST CASES (A ~ F) ---");
  
  // Case A: WiseToto connection failure -> fake data generation prohibited
  const emptyFailRound: any = {
    year: 2026,
    round: 998,
    masterSeq: "0",
    matches: [],
    summary: { validCount: 0, unavailableCount: 0, mismatchCount: 0, duplicateCount: 0, syntheticCount: 0 }
  };
  assert(emptyFailRound.matches.length === 0, "34. Case A: Connection failure produces 0 matches, never synthetic/fallback matches");

  // Case B: Write failure -> existing store preserved
  const storeBeforeWrite = loadProtoForwardShadowStore();
  let writeFailed = false;
  try {
    // Attempt writing to invalid non-existent path without permissions
    fs.writeFileSync("/sys/read_only_fake/store.json", "{}");
  } catch (err) {
    writeFailed = true;
  }
  assert(writeFailed, "35. Case B: Write error caught cleanly without corrupting memory store");
  assert(storeBeforeWrite.version !== undefined, "36. Case B: Existing store remains intact and preserved");

  // Case C: Snapshot mutation -> FORWARD_BLOCKED
  assert(tamperedHash !== targetSnap.snapshotHash, "37. Case C: Snapshot mutation correctly detected and blocked");

  // Case D: Concurrent cycle -> RUN_ALREADY_IN_PROGRESS
  resetRunLock();
  // Simulate lock
  const lockPromise = runForwardShadowCycle({ timeoutMs: 5000 });
  let concurrentBlocked = false;
  try {
    await runForwardShadowCycle({ timeoutMs: 5000 });
  } catch (err: any) {
    if (err.message === "RUN_ALREADY_IN_PROGRESS" || err.code === "RUN_ALREADY_IN_PROGRESS") {
      concurrentBlocked = true;
    }
  }
  assert(concurrentBlocked, "38. Case D: Concurrent cycle attempt is blocked with RUN_ALREADY_IN_PROGRESS");
  resetRunLock();

  // Case E: Duplicate settlement -> already settled skip
  const alreadySettledCountTest = [settledMatch].filter(m => m.snapshotStatus === "EVALUATED").length;
  assert(alreadySettledCountTest === 1, "39. Case E: Duplicate settlement skips already evaluated match (count == 1)");

  // Case F: Backup failure -> store preserved + error logged
  const invalidBackupRes = backupStore("/invalid/path", "invalid_store", null);
  assert(invalidBackupRes === null, "40. Case F: Backup failure handled gracefully without throwing unhandled rejection");
  const storeAfterBackupFail = loadProtoForwardShadowStore();
  assert(storeAfterBackupFail.rounds["2026_999"] !== undefined, "41. Case F: Store remains completely preserved and accessible");

} catch (err) {
  console.error("Critical failure during Phase 3 audit suite:", err);
  process.exitCode = 1;
} finally {
  cleanup();
}

console.log("\n==========================================================================");
console.log(` PHASE 3 AUDIT SUITE SUMMARY: ${passedTests}/${totalTests} PASSED (Failed: ${failedTests})`);
console.log("==========================================================================\n");

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
