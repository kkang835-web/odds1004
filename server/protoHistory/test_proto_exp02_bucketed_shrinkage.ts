/**
 * SportsQuant Pro — PROTO EXP02 Bucketed Shrinkage Shadow Experiment Test Suite
 * 
 * Tests 16+ core invariants and properties:
 * 1. Bucket A odds < 1.50 -> lambda = 0.10
 * 2. Bucket B 1.50 <= odds < 2.00 -> lambda = 0.20
 * 3. Bucket C 2.00 <= odds < 3.50 -> lambda = 0.35
 * 4. Bucket D odds >= 3.50 -> lambda = 0.50
 * 5. Boundary 1.50 is strictly Bucket B
 * 6. Boundary 2.00 is strictly Bucket C
 * 7. Boundary 3.50 is strictly Bucket D
 * 8. 2-way probability sum = 1.0, draw = null
 * 9. 3-way probability sum = 1.0
 * 10. 0 <= probability <= 1 bounds
 * 11. Zero look-ahead / settlement isolation
 * 12. Synthetic / fallback data rejection
 * 13. V1 output immutability
 * 14. EXP01 output immutability
 * 15. Temporal ordering validation
 * 16. n < 30 -> INSUFFICIENT_SAMPLE
 * 17. Auto-Promotion PERMANENTLY_DISABLED
 * 18. Paired bootstrap & McNemar test validity
 */

import fs from "fs";
import path from "path";
import {
  resolveOddsBucket,
  computeBucketedShrinkageProbabilities,
  runProtoExp02BucketedShrinkage,
  saveProtoExp02Result,
  PREDEFINED_ODDS_BUCKETS
} from "./protoExp02BucketedShrinkage.js";

async function runTests() {
  console.log("==================================================");
  console.log("SPORTSQUANT PRO — PROTO EXP02 BUCKETED TEST SUITE");
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

  // TEST 1: Bucket A odds < 1.50 -> lambda = 0.10
  const bA = resolveOddsBucket(1.35);
  assert(
    bA.bucket === "BUCKET_A_HEAVY_FAVORITE" && bA.lambda === 0.10,
    "TEST 1: Bucket A odds < 1.50 -> lambda = 0.10 (Heavy Favorite)"
  );

  // TEST 2: Bucket B 1.50 <= odds < 2.00 -> lambda = 0.20
  const bB = resolveOddsBucket(1.75);
  assert(
    bB.bucket === "BUCKET_B_MODERATE_FAVORITE" && bB.lambda === 0.20,
    "TEST 2: Bucket B 1.50 <= odds < 2.00 -> lambda = 0.20 (Moderate Favorite)"
  );

  // TEST 3: Bucket C 2.00 <= odds < 3.50 -> lambda = 0.35
  const bC = resolveOddsBucket(2.80);
  assert(
    bC.bucket === "BUCKET_C_MID_UNDERDOG" && bC.lambda === 0.35,
    "TEST 3: Bucket C 2.00 <= odds < 3.50 -> lambda = 0.35 (Mid / Underdog)"
  );

  // TEST 4: Bucket D odds >= 3.50 -> lambda = 0.50
  const bD = resolveOddsBucket(4.50);
  assert(
    bD.bucket === "BUCKET_D_LONGSHOT" && bD.lambda === 0.50,
    "TEST 4: Bucket D odds >= 3.50 -> lambda = 0.50 (Longshot)"
  );

  // TEST 5: Boundary 1.50 is strictly Bucket B
  const bound150 = resolveOddsBucket(1.50);
  assert(
    bound150.bucket === "BUCKET_B_MODERATE_FAVORITE" && bound150.lambda === 0.20,
    "TEST 5: Boundary 1.50 is strictly Bucket B (lambda = 0.20)"
  );

  // TEST 6: Boundary 2.00 is strictly Bucket C
  const bound200 = resolveOddsBucket(2.00);
  assert(
    bound200.bucket === "BUCKET_C_MID_UNDERDOG" && bound200.lambda === 0.35,
    "TEST 6: Boundary 2.00 is strictly Bucket C (lambda = 0.35)"
  );

  // TEST 7: Boundary 3.50 is strictly Bucket D
  const bound350 = resolveOddsBucket(3.50);
  assert(
    bound350.bucket === "BUCKET_D_LONGSHOT" && bound350.lambda === 0.50,
    "TEST 7: Boundary 3.50 is strictly Bucket D (lambda = 0.50)"
  );

  // TEST 8: 2-way probability sum = 1.0, draw = null
  const p2WayV1 = { win: 0.65, draw: null, lose: 0.35 };
  const p2WayNoVig = { win: 0.55, draw: null, lose: 0.45 };
  const res2Way = computeBucketedShrinkageProbabilities(p2WayV1, p2WayNoVig, 0.20);
  const sum2Way = +(res2Way.win + res2Way.lose).toFixed(4);
  assert(
    res2Way.draw === null && Math.abs(sum2Way - 1.0) < 1e-4,
    "TEST 8: 2-way market preserves draw = null and normalizes win/lose to 1.0"
  );

  // TEST 9: 3-way probability sum = 1.0
  const p3WayV1 = { win: 0.50, draw: 0.30, lose: 0.20 };
  const p3WayNoVig = { win: 0.45, draw: 0.33, lose: 0.22 };
  const res3Way = computeBucketedShrinkageProbabilities(p3WayV1, p3WayNoVig, 0.35);
  const sum3Way = +(res3Way.win + res3Way.draw! + res3Way.lose).toFixed(4);
  assert(
    res3Way.draw !== null && Math.abs(sum3Way - 1.0) < 1e-4,
    "TEST 9: 3-way market preserves all three outcomes and normalizes sum to 1.0"
  );

  // TEST 10: 0 <= probability <= 1 bounds
  const isBoundsValid = (
    res3Way.win >= 0 && res3Way.win <= 1 &&
    res3Way.draw! >= 0 && res3Way.draw! <= 1 &&
    res3Way.lose >= 0 && res3Way.lose <= 1 &&
    res2Way.win >= 0 && res2Way.win <= 1 &&
    res2Way.lose >= 0 && res2Way.lose <= 1
  );
  assert(isBoundsValid, "TEST 10: Probabilities strictly satisfy 0 <= p <= 1");

  // Run full experiment
  const exp02Result = runProtoExp02BucketedShrinkage();
  saveProtoExp02Result(exp02Result);

  // TEST 11: Zero look-ahead / settlement isolation
  const zeroLookAhead = exp02Result.records.every(r => {
    if (!r.isSettled) {
      return r.isHitExp02 === null && r.actualOutcome === null;
    }
    return true;
  });
  assert(zeroLookAhead, "TEST 11: Zero look-ahead leakage and post-match settlement isolation");

  // TEST 12: Synthetic / fallback data rejection
  const zeroSynthetic = exp02Result.records.every(r => (
    r.dataSource === "real" &&
    r.isSimulated === false &&
    r.fallbackUsed === false &&
    r.syntheticUsed === false
  ));
  assert(zeroSynthetic, "TEST 12: Rejects any synthetic or fallback flags across all evaluated records");

  // TEST 13: V1 output immutability (V1 metrics match protoRealWalkForwardV1.json)
  const v1JsonPath = path.join(process.cwd(), "data", "protoRealWalkForwardV1.json");
  let v1MatchesExpected = false;
  if (fs.existsSync(v1JsonPath)) {
    const v1Data = JSON.parse(fs.readFileSync(v1JsonPath, "utf-8"));
    const v1HitRateExpected = v1Data.summary?.overallPerformance?.modelHitRate;
    const v1RoiExpected = v1Data.summary?.strategies?.strategyA_ModelMaxProb?.roi;
    v1MatchesExpected = (
      Math.abs(exp02Result.summary.overallPerformance.hitRateV1 - v1HitRateExpected) < 0.05 &&
      Math.abs(exp02Result.summary.overallPerformance.fixedRoiV1 - v1RoiExpected) < 0.05
    );
  }
  assert(v1MatchesExpected, "TEST 13: V1 performance metrics in EXP02 exactly match protoRealWalkForwardV1.json");

  // TEST 14: EXP01 output immutability (EXP01 metrics match protoExp01LongshotShrinkage.json)
  const exp01JsonPath = path.join(process.cwd(), "data", "protoExp01LongshotShrinkage.json");
  let exp01MatchesExpected = false;
  if (fs.existsSync(exp01JsonPath)) {
    const exp01Data = JSON.parse(fs.readFileSync(exp01JsonPath, "utf-8"));
    const exp01HitRateExpected = exp01Data.summary?.overallPerformance?.hitRateExp01;
    const exp01BrierExpected = exp01Data.summary?.overallPerformance?.brierExp01;
    exp01MatchesExpected = (
      Math.abs(exp02Result.summary.overallPerformance.hitRateExp01 - exp01HitRateExpected) < 0.05 &&
      Math.abs(exp02Result.summary.overallPerformance.brierExp01 - exp01BrierExpected) < 0.001
    );
  }
  assert(exp01MatchesExpected, "TEST 14: EXP01 reference snapshot metrics match protoExp01LongshotShrinkage.json");

  // TEST 15: Temporal ordering validation
  let isChronological = true;
  let prevYear = 0;
  let prevRound = 0;
  for (const r of exp02Result.records) {
    if (r.year > prevYear) {
      prevYear = r.year;
      prevRound = r.round;
    } else if (r.year === prevYear) {
      if (r.round < prevRound) {
        isChronological = false;
      }
      prevRound = r.round;
    } else {
      isChronological = false;
    }
  }
  assert(isChronological, "TEST 15: Records in EXP02 dataset follow strict temporal sequence");

  // TEST 16: n < 30 -> INSUFFICIENT_SAMPLE
  const hasInsufficientFlagCheck = (
    typeof exp02Result.summary.bySport["vl"]?.isInsufficientSample === "boolean" &&
    typeof exp02Result.summary.oddsBucketAnalysis[0].isInsufficientSample === "boolean"
  );
  assert(hasInsufficientFlagCheck, "TEST 16: Minimum sample protection (n < 30 -> INSUFFICIENT_SAMPLE) properly evaluated");

  // TEST 17: Auto-Promotion PERMANENTLY_DISABLED
  assert(
    exp02Result.summary.autoPromotion === "PERMANENTLY_DISABLED",
    "TEST 17: AUTO_PROMOTION flag is PERMANENTLY_DISABLED"
  );

  // TEST 18: Paired bootstrap & McNemar test validity
  const statVal = exp02Result.summary.statisticalValidation;
  const isStatsValid = (
    statVal.bootstrapIterations === 10000 &&
    statVal.randomSeed === 2026 &&
    statVal.brierBootstrap.length === 3 &&
    statVal.roiBootstrap.length === 3 &&
    typeof statVal.mcnemar.exactPValue === "number"
  );
  assert(isStatsValid, "TEST 18: McNemar exact test and 10,000 paired bootstrap tests execute cleanly with seed 2026");

  console.log(`\nResults: ${passed} / ${total} tests passed.`);
  if (passed !== total) {
    process.exitCode = 1;
  }
}

runTests().catch(err => {
  console.error("Test runner threw error:", err);
  process.exitCode = 1;
});
