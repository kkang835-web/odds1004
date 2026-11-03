import fs from "fs";
import path from "path";
import zlib from "zlib";

// Isolate PROTO store via custom environment variable (unsetting IS_TEST_MODE to bypass fallback)
delete process.env.IS_TEST_MODE;
process.env.PROTO_FORWARD_STORE_PATH = "/tmp/clean_test_proto_store.json";

import {
  loadProtoForwardShadowStore,
  saveProtoForwardShadowStore,
  getProtoForwardShadowRound,
  upsertProtoForwardShadowRound
} from "./server/protoHistory/protoForwardShadowStore.js";
import {
  atomicWrite,
  handleCorruptedFile,
  backupStore,
  rotateBackups,
  verifyBackupDryRun
} from "./server/protoHistory/forwardStorageUtils.js";
import {
  loadForwardShadowStore,
  saveForwardShadowStore,
  saveForwardShadowRound
} from "./server/realHistory/totoForwardShadowStore.js";

const TEST_PROTO_STORE_PATH = "/tmp/clean_test_proto_store.json";
const DATA_DIR = path.resolve(process.cwd(), "data");
const TOTO_STORE_PATH = path.join(DATA_DIR, "totoForwardShadowStore.json");
const TOTO_BACKUP_PATH = path.join(DATA_DIR, "totoForwardShadowStore.json.bak");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");

console.log("==========================================================================");
console.log(" SPORTSQUANT PRO — PHASE 2 STORAGE STABILIZATION TEST SUITE");
console.log("==========================================================================\n");

// Backup live TOTO store to prevent pollution
if (fs.existsSync(TOTO_STORE_PATH)) {
  fs.copyFileSync(TOTO_STORE_PATH, TOTO_BACKUP_PATH);
}

function cleanupTestFiles() {
  if (fs.existsSync(TEST_PROTO_STORE_PATH)) fs.unlinkSync(TEST_PROTO_STORE_PATH);
  if (fs.existsSync(TEST_PROTO_STORE_PATH + ".tmp")) fs.unlinkSync(TEST_PROTO_STORE_PATH + ".tmp");
  if (fs.existsSync(TOTO_STORE_PATH)) fs.unlinkSync(TOTO_STORE_PATH);
  if (fs.existsSync(TOTO_STORE_PATH + ".tmp")) fs.unlinkSync(TOTO_STORE_PATH + ".tmp");
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
  cleanupTestFiles();

  // =======================================================================
  // Test A: 정상 저장 (Normal Save & Load)
  // =======================================================================
  console.log("--- TEST A: NORMAL SAVE & LOAD ---");
  const initialStore = loadProtoForwardShadowStore();
  assert(initialStore !== null && typeof initialStore === "object", "1. Load empty default proto store succeeds");
  assert(initialStore.environment === "LIVE_SHADOW", "2. Store environment defaults to LIVE_SHADOW");

  const mockRound: any = {
    year: 2026,
    round: 110,
    masterSeq: "31512",
    integrityGateStatus: "FORWARD_ELIGIBLE",
    matches: [
      {
        matchId: "proto_2026_110_2016",
        year: 2026,
        round: 110,
        matchNo: 2016,
        homeTeam: "토론토",
        awayTeam: "디트로이트",
        odds: { win: 1.65, draw: null, lose: 1.89 },
        selectedOutcome: "win",
        selectedOdds: 1.65,
        noVigProbability: { win: 0.53, draw: null, lose: 0.47 },
        v1ModelProbability: { win: 0.55, draw: null, lose: 0.45 },
        exp01Probability: { win: 0.54, draw: null, lose: 0.46 },
        exp02Probability: { win: 0.56, draw: null, lose: 0.44 },
        v1EV: 0.08,
        exp01EV: 0.06,
        exp02EV: 0.10,
        predictionCreatedAt: new Date().toISOString(),
        snapshotStatus: "PREDICTED",
        dataSource: "real",
        market: "Standard_1X2_ML"
      }
    ]
  };

  upsertProtoForwardShadowRound(mockRound);

  const reloadedStore = loadProtoForwardShadowStore();
  const reloadedRound = getProtoForwardShadowRound(2026, 110);
  assert(reloadedRound !== null, "3. Upserted round successfully persisted and retrieved");
  assert(reloadedRound?.matches[0].homeTeam === "토론토", "4. Retained correct match details (homeTeam: '토론토')");

  // =======================================================================
  // Test B: Atomic Write (tmp written then renamed)
  // =======================================================================
  console.log("\n--- TEST B: ATOMIC WRITE VERIFICATION ---");
  const testFilePath = "/tmp/atomic_test.json";
  if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);

  atomicWrite(testFilePath, JSON.stringify({ test: "atomic" }));
  assert(fs.existsSync(testFilePath), "5. Atomic write file exists");
  assert(!fs.existsSync(testFilePath + ".tmp"), "6. Atomic temp file .tmp is successfully cleaned up");
  const content = JSON.parse(fs.readFileSync(testFilePath, "utf-8"));
  assert(content.test === "atomic", "7. Atomic file contents match original string");
  fs.unlinkSync(testFilePath);

  // =======================================================================
  // Test C: Corrupted JSON Protected (Overwrite Prevention)
  // =======================================================================
  console.log("\n--- TEST C: CORRUPTED JSON PROTECTION ---");
  // Write a corrupted/malformed JSON string directly to the test store path
  fs.writeFileSync(TEST_PROTO_STORE_PATH, "{\n  \"version\": \"1.0.0-corrupt\",\n  \"rounds\": { \n", "utf-8");

  let caughtError = false;
  try {
    loadProtoForwardShadowStore();
  } catch (err: any) {
    caughtError = true;
    assert(err.message.includes("CORRUPTED_JSON_DETECTED"), "8. Parsing corrupted JSON throws explicit, informative error");
  }
  assert(caughtError, "9. Prevented program from running or overwriting corrupted store with a default blank store");

  // Verify a corrupted copy has been preserved with timestamp
  const filesInTmp = fs.readdirSync("/tmp");
  const corruptedBackups = filesInTmp.filter(f => f.includes("clean_test_proto_store.json.corrupted"));
  assert(corruptedBackups.length > 0, `10. Original corrupted file was cloned to backup file: ${corruptedBackups[0]}`);

  // Cleanup corrupted files in /tmp
  for (const f of corruptedBackups) {
    fs.unlinkSync(path.join("/tmp", f));
  }
  // Restore normal test store file
  cleanupTestFiles();
  saveProtoForwardShadowStore(reloadedStore);

  // =======================================================================
  // Test D: Backup Snapshot Creation (Gzip verification)
  // =======================================================================
  console.log("\n--- TEST D: BACKUP SNAPSHOT & GZIP VERIFICATION ---");
  const backupPath = backupStore(TEST_PROTO_STORE_PATH, "protoForwardShadowStore_test", reloadedStore);
  assert(backupPath !== null && fs.existsSync(backupPath), "11. Gzipped backup snapshot created successfully");

  const isGzip = backupPath ? backupPath.endsWith(".json.gz") : false;
  assert(isGzip, "12. Backup file has correct .json.gz extension");

  const stat = backupPath ? fs.statSync(backupPath) : null;
  assert(stat !== null && stat.size > 0, `13. Gzipped backup size is greater than 0 bytes (${stat?.size} bytes)`);

  // =======================================================================
  // Test E: Restore Dry-Run Verification (Ungzip & Parse)
  // =======================================================================
  console.log("\n--- TEST E: RESTORE DRY-RUN CHECK ---");
  if (backupPath) {
    const dryRunRes = verifyBackupDryRun(backupPath);
    assert(dryRunRes.isValid, "14. Backup dry-run validation succeeded");
    assert(dryRunRes.stats !== undefined, "15. Dry-run stats retrieved correctly");
    if (dryRunRes.stats) {
      assert(dryRunRes.stats.roundCount === 1, `16. Restored round count matches perfectly (${dryRunRes.stats.roundCount} == 1)`);
      assert(dryRunRes.stats.matchCount === 1, `17. Restored match count matches perfectly (${dryRunRes.stats.matchCount} == 1)`);
      assert(dryRunRes.stats.predictionCount === 1, `18. Restored prediction count matches perfectly (${dryRunRes.stats.predictionCount} == 1)`);
    }

    // Clean up test backup file
    fs.unlinkSync(backupPath);
  }

  // =======================================================================
  // Test F: Idempotency (Duplicate Prevention & KPI Stability)
  // =======================================================================
  console.log("\n--- TEST F: IDEMPOTENCY & GUARDRAIL INTEGRITY ---");
  // Ingest the same round again to verify idempotency
  upsertProtoForwardShadowRound(mockRound);

  const doubleReloadedStore = loadProtoForwardShadowStore();
  const doubleReloadedRound = getProtoForwardShadowRound(2026, 110);
  assert(doubleReloadedRound?.matches.length === 1, "19. Upserting duplicate round retains exactly 1 match (duplicate matches prevented)");
  assert(doubleReloadedStore.auditTotals.totalSnapshots === 1, `20. auditTotals count is unchanged (totalSnapshots: ${doubleReloadedStore.auditTotals.totalSnapshots} == 1)`);

  // =======================================================================
  // Test G: Backup Rotation (Retains up to 30 files)
  // =======================================================================
  console.log("\n--- TEST G: BACKUP ROTATION VERIFICATION ---");
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
  // Clear any existing test backups for clean rotation test
  const existingFiles = fs.readdirSync(BACKUPS_DIR).filter(f => f.startsWith("test_rotation_store_"));
  for (const f of existingFiles) {
    fs.unlinkSync(path.join(BACKUPS_DIR, f));
  }

  // Create 35 dummy backup files
  const baseTime = Date.now();
  for (let i = 0; i < 35; i++) {
    // Format timestamp as YYYYMMDD_HHMMSS
    const dateStr = "20261002";
    const timeStr = String(100000 + i); // e.g., 100000, 100001, etc.
    const bName = `test_rotation_store_${dateStr}_${timeStr}.json.gz`;
    const bPath = path.join(BACKUPS_DIR, bName);
    
    // Write standard dummy compressed content
    const compressed = zlib.gzipSync(Buffer.from(JSON.stringify({ rounds: {} }), "utf-8"));
    fs.writeFileSync(bPath, compressed);

    // Artificially change mtime to make them sorted chronologically
    const targetMtime = new Date(baseTime + i * 1000);
    fs.utimesSync(bPath, targetMtime, targetMtime);
  }

  // Run rotation
  rotateBackups("test_rotation_store", 30);

  const remainingFiles = fs.readdirSync(BACKUPS_DIR).filter(f => f.startsWith("test_rotation_store_"));
  assert(remainingFiles.length === 30, `21. Backup rotation keeps exactly 30 backups (Count: ${remainingFiles.length} == 30, deleted 5 oldest files)`);

  // Verify the deleted ones are indeed the oldest (index 0 to 4)
  const pattern = /^test_rotation_store_\d{8}_(\d{6})\.json\.gz$/;
  const remainingTimes = remainingFiles
    .map(f => {
      const match = f.match(pattern);
      return match ? Number(match[1]) : 0;
    })
    .sort((a, b) => a - b);

  assert(remainingTimes[0] === 100005, `22. Oldest backups (100000 to 100004) were removed cleanly, oldest remaining is ${remainingTimes[0]}`);

  // Clean up rotation test files
  for (const f of remainingFiles) {
    fs.unlinkSync(path.join(BACKUPS_DIR, f));
  }

  // =======================================================================
  // Test H: Regression Suites Verification
  // =======================================================================
  console.log("\n--- TEST H: REGRESSION SUITE VERIFICATION ---");
  // Verify TOTO Forward Shadow store preserves all features cleanly
  const initialTotoStore = loadForwardShadowStore();
  assert(initialTotoStore !== null && typeof initialTotoStore === "object", "23. TOTO store loads cleanly with atomic backup protection");

  const mockTotoRound: any = {
    sport: "soccer",
    year: 2026,
    round: 45,
    validationStatus: "VALID",
    predictionCreatedAt: new Date().toISOString(),
    evaluatedAt: null,
    allResultsConfirmed: false,
    matches: []
  };
  saveForwardShadowRound(mockTotoRound);
  const reloadedTotoStore = loadForwardShadowStore();
  assert(reloadedTotoStore.rounds["soccer_2026_45"] !== undefined, "24. TOTO store round upserted and saved atomically");

} catch (err: any) {
  console.error("\n[CRITICAL ERROR] Storage test suite threw uncaught exception:", err);
  process.exit(1);
} finally {
  cleanupTestFiles();
  // Restore live TOTO store from backup
  if (fs.existsSync(TOTO_BACKUP_PATH)) {
    fs.copyFileSync(TOTO_BACKUP_PATH, TOTO_STORE_PATH);
    fs.unlinkSync(TOTO_BACKUP_PATH);
  }
}

console.log("\n==========================================================================");
console.log(` STORAGE STABILIZATION AUDIT SUMMARY: ${passedTests}/${totalTests} PASSED (Failed: ${failedTests})`);
console.log("==========================================================================");

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
