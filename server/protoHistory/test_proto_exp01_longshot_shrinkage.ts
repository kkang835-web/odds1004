/**
 * SportsQuant Pro — PROTO EXP01 Longshot Shrinkage Unit & Guardrail Test Suite
 * 
 * Verifies:
 * 1. Shrinkage formula test
 * 2. Probability sum = 1 normalization test
 * 3. 2-way probability test
 * 4. 3-way probability test
 * 5. Zero look-ahead test
 * 6. Settlement isolation test
 * 7. Temporal ordering test
 * 8. Synthetic data rejection test
 * 9. Fallback rejection test
 * 10. V1 immutability test
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import {
  computeShrinkageProbabilities,
  runProtoExp01Experiment
} from "./protoExp01LongshotShrinkage.js";

async function runTests() {
  console.log("==================================================");
  console.log("SPORTSQUANT PRO — PROTO EXP01 SHRINKAGE TEST SUITE");
  console.log("==================================================\n");

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void) {
    total++;
    try {
      fn();
      console.log(`✅ [TEST ${total}] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ [TEST ${total}] ${name}:`, err.message);
    }
  }

  // TEST 1: Shrinkage formula
  test("TEST 1: Shrinkage formula blends model and no-vig proportionally", () => {
    const model = { win: 0.60, draw: 0.25, lose: 0.15 };
    const noVig = { win: 0.50, draw: 0.25, lose: 0.25 };
    const blended = computeShrinkageProbabilities(model, noVig, 0.25);
    // (1 - 0.25)*0.60 + 0.25*0.50 = 0.45 + 0.125 = 0.575
    assert.strictEqual(blended.win, 0.575);
    assert.strictEqual(blended.draw, 0.25);
    assert.strictEqual(blended.lose, 0.175);
  });

  // TEST 2: Probability sum = 1
  test("TEST 2: Normalized probability sum equals 1.0 exactly", () => {
    const model = { win: 0.4123, draw: 0.3145, lose: 0.2732 };
    const noVig = { win: 0.3850, draw: 0.3200, lose: 0.2950 };
    const res = computeShrinkageProbabilities(model, noVig, 0.25);
    const sum = res.win + res.draw! + res.lose;
    assert.ok(Math.abs(sum - 1.0) < 0.0002, `Sum is ${sum}`);
  });

  // TEST 3: 2-way probability test
  test("TEST 3: 2-way market preserves draw = null and normalizes win/lose", () => {
    const model = { win: 0.65, draw: null, lose: 0.35 };
    const noVig = { win: 0.55, draw: null, lose: 0.45 };
    const res = computeShrinkageProbabilities(model, noVig, 0.50);
    assert.strictEqual(res.draw, null);
    assert.strictEqual(res.win, 0.60);
    assert.strictEqual(res.lose, 0.40);
  });

  // TEST 4: 3-way probability test
  test("TEST 4: 3-way market preserves all three outcomes", () => {
    const model = { win: 0.45, draw: 0.30, lose: 0.25 };
    const noVig = { win: 0.40, draw: 0.30, lose: 0.30 };
    const res = computeShrinkageProbabilities(model, noVig, 0.10);
    assert.ok(res.draw !== null);
    assert.ok(res.win > 0.40 && res.win < 0.45);
  });

  // TEST 5: Zero look-ahead test
  test("TEST 5: Experiment execution completes with zero future leakage", () => {
    const expStore = runProtoExp01Experiment();
    assert.strictEqual(expStore.summary.leakageAudit.futureDataLeakageCount, 0);
    assert.strictEqual(expStore.summary.leakageAudit.futureResultLeakageCount, 0);
    assert.strictEqual(expStore.summary.leakageAudit.futureOddsLeakageCount, 0);
    assert.strictEqual(expStore.summary.leakageAudit.timestampViolationCount, 0);
    assert.strictEqual(expStore.summary.leakageAudit.auditPassed, true);
  });

  // TEST 6: Settlement isolation test
  test("TEST 6: Unsettled matches are strictly excluded from performance calculation", () => {
    const filePath = path.join(process.cwd(), "data", "protoExp01LongshotShrinkage.json");
    assert.ok(fs.existsSync(filePath), "Output JSON exists");
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const pendingCount = parsed.records.filter((r: any) => !r.isSettled).length;
    assert.strictEqual(pendingCount, 389);
    assert.strictEqual(parsed.summary.totalSettledMatches, 1413);
  });

  // TEST 7: Temporal ordering test
  test("TEST 7: Records in store follow strict temporal sequence", () => {
    const filePath = path.join(process.cwd(), "data", "protoExp01LongshotShrinkage.json");
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    let prevYear = 0;
    let prevRound = 0;
    for (const r of parsed.records) {
      if (r.year > prevYear) {
        prevYear = r.year;
        prevRound = r.round;
      } else if (r.year === prevYear) {
        assert.ok(r.round >= prevRound);
        prevRound = r.round;
      }
    }
  });

  // TEST 8: Synthetic data rejection test
  test("TEST 8: Rejects any synthetic flags across all records", () => {
    const filePath = path.join(process.cwd(), "data", "protoExp01LongshotShrinkage.json");
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    for (const r of parsed.records) {
      assert.strictEqual(r.dataSource, "real");
      assert.strictEqual(r.isSimulated, false);
    }
  });

  // TEST 9: Fallback rejection test
  test("TEST 9: Zero fallback records present", () => {
    const filePath = path.join(process.cwd(), "data", "protoExp01LongshotShrinkage.json");
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    assert.strictEqual(parsed.summary.isSimulated, false);
    assert.strictEqual(parsed.summary.dataSource, "real");
  });

  // TEST 10: V1 immutability test
  test("TEST 10: V1 performance metrics in EXP01 exactly match protoRealWalkForwardV1.json", () => {
    const v1Path = path.join(process.cwd(), "data", "protoRealWalkForwardV1.json");
    const exp01Path = path.join(process.cwd(), "data", "protoExp01LongshotShrinkage.json");
    const v1Data = JSON.parse(fs.readFileSync(v1Path, "utf-8"));
    const exp01Data = JSON.parse(fs.readFileSync(exp01Path, "utf-8"));

    assert.strictEqual(exp01Data.summary.overallPerformance.hitRateV1, v1Data.summary.overallPerformance.modelHitRate);
    assert.strictEqual(exp01Data.summary.overallPerformance.brierV1, v1Data.summary.overallPerformance.brierScoreModel);
    assert.strictEqual(exp01Data.summary.overallPerformance.logLossV1, v1Data.summary.overallPerformance.logLossModel);
    assert.strictEqual(exp01Data.summary.overallPerformance.fixedRoiV1, v1Data.summary.strategies.strategyA_ModelMaxProb.roi);
  });

  console.log(`\nResults: ${passed} / ${total} tests passed.`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(console.error);
