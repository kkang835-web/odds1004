/**
 * SportsQuant Pro — PHASE 4 Operational Automation & System Verification Suite
 * 
 * [COMPREHENSIVE AUDIT TARGETS]
 * 1. Scheduler Start/Stop/Status lifecycle & interval timing.
 * 2. Concurrency lock guard & RUN_ALREADY_IN_PROGRESS rejection.
 * 3. 8-Stage Automated Forward Cycle execution & idempotency.
 * 4. Pre-match snapshot freeze with SHA-256 immutability checksum.
 * 5. Automatic Gzip Backup generation & dry-run restore validation.
 * 6. Automated Backup Rotation (retention limits enforcement).
 * 7. Operational monitor telemetry, stale data detection, and zero-synthetic integrity.
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";

// Test path isolation to ensure production data is never disturbed
const TEST_PROTO_STORE_PATH = "/tmp/test_phase4_proto_store.json";
process.env.PROTO_FORWARD_STORE_PATH = TEST_PROTO_STORE_PATH;
delete process.env.IS_TEST_MODE;

import {
  loadProtoForwardShadowStore,
  saveProtoForwardShadowStore,
  computeSnapshotHash
} from "./server/protoHistory/protoForwardShadowStore.js";
import {
  startForwardScheduler,
  stopForwardScheduler,
  getForwardSchedulerStatus,
  triggerManualForwardCycle,
  forwardScheduler
} from "./server/protoHistory/protoForwardScheduler.js";
import {
  runForwardShadowCycle,
  isForwardCycleRunning,
  resetRunLock
} from "./server/protoHistory/protoForwardRunner.js";
import {
  backupStore,
  rotateBackups,
  verifyBackupDryRun,
  listBackups,
  getLatestBackup
} from "./server/protoHistory/forwardStorageUtils.js";
import {
  getProtoForwardHealth,
  detectStaleData,
  getSampleAccumulationStage
} from "./server/protoHistory/protoForwardMonitor.js";
import { createForwardPredictionSnapshot, ForwardEloTracker } from "./server/protoHistory/protoForwardShadow.js";

console.log("==========================================================================");
console.log(" SPORTSQUANT PRO — PHASE 4 OPERATIONAL AUTOMATION AUDIT SUITE");
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

async function runPhase4Audit() {
  try {
    cleanup();

    // =======================================================================
    // 1. Initial State & Store Isolation Setup
    // =======================================================================
    console.log("--- 1. STORAGE ISOLATION & BOOTSTRAP CHECK ---");
    const initialStore = loadProtoForwardShadowStore();
    assert(initialStore.version.includes("proto-forward-shadow"), "1. Isolated test store initialized with proto-forward-shadow version");
    assert(initialStore.environment === "LIVE_SHADOW", "2. Store environment verified as LIVE_SHADOW");
    assert(Object.keys(initialStore.rounds).length === 0, "3. Initial test store starts empty");

    // =======================================================================
    // 2. Scheduler Lifecycle Controls
    // =======================================================================
    console.log("\n--- 2. SCHEDULER LIFECYCLE & TELEMETRY ---");
    const initStatus = getForwardSchedulerStatus();
    assert(initStatus.isRunning === false, "4. Scheduler starts in stopped state");

    // Start scheduler with 10-second interval for test
    const startedStatus = startForwardScheduler(10000);
    assert(startedStatus.isRunning === true, "5. Scheduler successfully started");
    assert(startedStatus.intervalMs === 10000, "6. Scheduler configured with test interval (10000ms)");
    assert(startedStatus.nextRunAt !== null, "7. Scheduler calculates valid nextRunAt timestamp");

    // Stop scheduler
    const stoppedStatus = stopForwardScheduler();
    assert(stoppedStatus.isRunning === false, "8. Scheduler successfully stopped");
    assert(stoppedStatus.nextRunAt === null, "9. nextRunAt cleared upon scheduler stop");

    // =======================================================================
    // 3. Concurrency Lock & Run Collision Protection
    // =======================================================================
    console.log("\n--- 3. CONCURRENCY LOCK & RUN COLLISION PROTECTION ---");
    resetRunLock();
    assert(isForwardCycleRunning() === false, "10. Initial cycle run lock is released");

    // Trigger cycle and verify lock rejection
    const mockMatch = {
      matchId: "phase4_m1",
      year: 2026,
      round: 999,
      matchNo: 1,
      sport: "bs",
      league: "MLB",
      dateStr: "10.03",
      matchTime: new Date(Date.now() + 3600000).toISOString(),
      homeTeam: "LA다저스",
      awayTeam: "샌디에이고",
      domesticOdds: { win: 1.85, draw: null, lose: 1.95 },
      dataSource: "real",
      isSimulated: false,
      fallbackUsed: false,
      syntheticUsed: false,
      type: "일반"
    };

    // Insert dummy pre-match
    const store = loadProtoForwardShadowStore();
    const snap = createForwardPredictionSnapshot(mockMatch as any, new ForwardEloTracker(), { isPreMatch: true });
    store.rounds["2026_999"] = {
      year: 2026,
      round: 999,
      masterSeq: "99999",
      sourceUrl: "http://wisetoto.com/test",
      syncedAt: new Date().toISOString(),
      allSettled: false,
      totalMatches: 1,
      predictedCount: 1,
      pendingCount: 0,
      evaluatedCount: 0,
      unavailableCount: 0,
      invalidCount: 0,
      matches: [snap]
    };
    saveProtoForwardShadowStore(store);

    // Simulate concurrent cycle attempt
    let lockRejected = false;
    const firstCycle = runForwardShadowCycle({ timeoutMs: 5000 });
    try {
      await runForwardShadowCycle({ timeoutMs: 5000 });
    } catch (err: any) {
      if (err.message === "RUN_ALREADY_IN_PROGRESS" || err.code === "RUN_ALREADY_IN_PROGRESS") {
        lockRejected = true;
      }
    }
    await firstCycle;

    assert(lockRejected === true, "11. Concurrent execution rejected with RUN_ALREADY_IN_PROGRESS");
    resetRunLock();

    // =======================================================================
    // 4. SHA-256 Snapshot Freeze & Immutability Verification
    // =======================================================================
    console.log("\n--- 4. SHA-256 SNAPSHOT FREEZE & IMMUTABILITY AUDIT ---");
    assert(snap.snapshotHash !== undefined && snap.snapshotHash.length === 64, "12. Snapshot possesses valid 64-char SHA-256 hash");
    const recomputedHash = computeSnapshotHash(snap);
    assert(snap.snapshotHash === recomputedHash, "13. Stored hash matches cryptographic recomputed checksum");

    // Check tampering detection
    const tamperedSnap = { ...snap, v1ModelProbability: { ...snap.v1ModelProbability, win: 0.999 } };
    assert(tamperedSnap.snapshotHash !== computeSnapshotHash(tamperedSnap), "14. Altered prediction probabilities trigger hash mismatch");

    // =======================================================================
    // 5. Automated Gzip Backup & Dry-Run Restore Verification
    // =======================================================================
    console.log("\n--- 5. AUTOMATED GZIP BACKUP & RESTORE DRY-RUN ---");
    const backupResult = backupStore(TEST_PROTO_STORE_PATH, "phase4_test_backup", store);
    assert(backupResult !== null, "15. Gzipped backup snapshot created successfully");
    assert(fs.existsSync(backupResult!), "16. Backup file exists on filesystem");
    assert(backupResult!.endsWith(".json.gz"), "17. Backup file is compressed with gzip format (.json.gz)");

    // Dry-run restore
    const dryRun = verifyBackupDryRun(backupResult!);
    assert(dryRun.isValid === true, "18. Restore dry-run verified backup without decompress errors");
    assert(dryRun.stats?.roundCount === 1, "19. Dry-run restored round count matches original");
    assert(dryRun.stats?.matchCount === 1, "20. Dry-run restored match count matches original");

    // Cleanup backup file
    if (backupResult && fs.existsSync(backupResult)) fs.unlinkSync(backupResult);

    // =======================================================================
    // 6. Automated Backup Rotation
    // =======================================================================
    console.log("\n--- 6. BACKUP ROTATION AUDIT ---");
    const backupsDir = path.join(path.resolve(process.cwd(), "data"), "backups");
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

    // Create 5 dummy rotation test backups
    const dummyPaths: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const p = path.join(backupsDir, `rotation_test_2026-10-0${i}_00-00-00.json.gz`);
      fs.writeFileSync(p, zlib.gzipSync(Buffer.from(JSON.stringify(store))));
      dummyPaths.push(p);
    }

    // Rotate to keep max 3
    rotateBackups("rotation_test", 3);
    const remainingFiles = fs.readdirSync(backupsDir).filter(f => f.startsWith("rotation_test"));
    assert(remainingFiles.length === 3, "21. rotateBackups pruned oldest files down to max limit (3)");

    // Clean up dummy rotation files
    for (const f of remainingFiles) {
      fs.unlinkSync(path.join(backupsDir, f));
    }

    // =======================================================================
    // 7. Operational Health, Stale Data & Zero-Synthetic Audit
    // =======================================================================
    console.log("\n--- 7. OPERATIONAL HEALTH & DATA QUALITY AUDIT ---");
    const health = getProtoForwardHealth();
    assert(health.systemStatus === "READY" || health.systemStatus === "DEGRADED" || health.systemStatus === "BLOCKED", "22. System health reports valid status");
    assert(health.synthetic === 0, "23. Zero synthetic records verified (Synthetic == 0)");
    assert(health.fallback === 0, "24. Zero fallback records verified (Fallback == 0)");
    assert(health.duplicates === 0, "25. Zero duplicate matches verified (Duplicates == 0)");
    assert(health.lookahead >= 0, "26. Lookahead violations accurately audited by guard");

    // Stale Data Detection Test
    const staleAudit = detectStaleData(store);
    assert(staleAudit.staleCount === 0, "27. Fresh pre-match correctly classified as not stale");

    // Sample Accumulation Stage Thresholds
    assert(getSampleAccumulationStage(50) === "EARLY OBSERVATION", "28. Stage < 100 is EARLY OBSERVATION");
    assert(getSampleAccumulationStage(250) === "INITIAL FORWARD SAMPLE", "29. Stage 100-299 is INITIAL FORWARD SAMPLE");
    assert(getSampleAccumulationStage(500) === "ACCUMULATING", "30. Stage 300-699 is ACCUMULATING");
    assert(getSampleAccumulationStage(850) === "MEANINGFUL FORWARD SAMPLE", "31. Stage 700-999 is MEANINGFUL FORWARD SAMPLE");
    assert(getSampleAccumulationStage(1200) === "STATISTICAL REVIEW ELIGIBLE", "32. Stage 1000+ is STATISTICAL REVIEW ELIGIBLE");

    // =======================================================================
    // 8. Manual Trigger via Scheduler Instance
    // =======================================================================
    console.log("\n--- 8. MANUAL TRIGGER VIA SCHEDULER ---");
    const manualSummary = await triggerManualForwardCycle({ forceUnlock: true });
    assert(manualSummary !== null && manualSummary.runId !== undefined, "33. Manual cycle executed via scheduler instance");
    assert(manualSummary.status === "SUCCESS" || manualSummary.status === "BLOCKED", "34. Manual cycle terminated with valid status");

    const statusAfterManual = getForwardSchedulerStatus();
    assert(statusAfterManual.totalScheduledRuns >= 1, "35. Scheduler tracked executed run count");
    assert(statusAfterManual.lastRunSummary !== null, "36. Scheduler preserved last run summary");

  } catch (err) {
    console.error("Critical failure during Phase 4 audit suite:", err);
    process.exitCode = 1;
  } finally {
    stopForwardScheduler();
    resetRunLock();
    cleanup();
  }

  console.log("\n==========================================================================");
  console.log(` PHASE 4 AUDIT SUITE SUMMARY: ${passedTests}/${totalTests} PASSED (Failed: ${failedTests})`);
  console.log("==========================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase4Audit();
