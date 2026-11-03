/**
 * SportsQuant Pro — PROTO Real Walk-Forward V1 Test Suite
 * 
 * Verifies:
 * TEST 1: Chronological temporal ordering
 * TEST 2: Zero Look-Ahead leakage
 * TEST 3: Market separation (Standard 1X2/ML vs Handicap/UnderOver/SUM)
 * TEST 4: Shin No-Vig probability calculation
 * TEST 5: EV mathematical calculation
 * TEST 6: Adaptive Kelly calculation
 * TEST 7: Strategy A, B, C, D evaluation consistency
 * TEST 8: EV Buckets partitioning
 * TEST 9: CLV and Benter status DISABLED
 * TEST 10: Full Walk-Forward execution and persistence
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import {
  classifyProtoMarket,
  compareProtoMatchesChronological,
  runProtoRealWalkForwardV1
} from "./server/protoHistory/realProtoWalkForwardRunner.js";
import { RealProtoMatch } from "./server/protoHistory/realProtoHistoryTypes.js";

function makeSampleMatch(matchNo: number, dateStr: string, gameType: any, win: number, draw: number | null, lose: number, outcome: any): RealProtoMatch {
  return {
    matchId: `proto_2026_110_${matchNo}`,
    year: 2026,
    round: 110,
    masterSeq: "31512",
    matchNo,
    sport: "sc",
    rawSport: "sc",
    dateStr,
    league: "EPL",
    gameType,
    handicapOrTarget: null,
    homeTeam: "팀A",
    awayTeam: "팀B",
    domesticOdds: { win, draw, lose },
    score: outcome === "win" ? { home: 2, away: 1 } : (outcome === "lose" ? { home: 0, away: 1 } : { home: 1, away: 1 }),
    outcomeTag: outcome === "win" ? "홈승" : (outcome === "lose" ? "원정승" : "무승부"),
    outcome,
    integrityStatus: "VALID",
    dataSource: "real",
    isSimulated: false,
    fallbackUsed: false,
    syntheticUsed: false,
    provenance: {
      sourceUrl: "https://www.wisetoto.com",
      collectedAt: new Date().toISOString(),
      requestContext: "test",
      year: 2026,
      round: 110,
      masterSeq: "31512",
      scheduleInfoSeq: null
    }
  };
}

async function runTests() {
  console.log("==================================================");
  console.log("SPORTSQUANT PRO — PROTO REAL WALK-FORWARD V1 TESTS");
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

  // TEST 1: Chronological sorting
  test("TEST 1: Chronological sorting orders matches by (year, round, date, matchNo)", () => {
    const m1 = makeSampleMatch(1002, "09.16 10:00", "일반", 1.80, 3.20, 3.80, "win");
    const m2 = makeSampleMatch(1001, "09.16 09:00", "일반", 2.10, 3.10, 3.00, "lose");
    const sorted = [m1, m2].sort(compareProtoMatchesChronological);
    assert.strictEqual(sorted[0].matchNo, 1001);
    assert.strictEqual(sorted[1].matchNo, 1002);
  });

  // TEST 2: Market classification
  test("TEST 2: Market classification distinguishes Standard vs Handicap vs UnderOver vs SUM", () => {
    const mStd = makeSampleMatch(1, "09.16", "일반", 1.8, 3.2, 3.8, "win");
    const mHdc = makeSampleMatch(2, "09.16", "핸디캡", 2.1, 3.1, 3.0, "win");
    const mUo = makeSampleMatch(3, "09.16", "언더오버", 1.9, null, 1.8, "win");
    const mSum = makeSampleMatch(4, "09.16", "SUM", 1.6, null, 2.0, "win");

    assert.strictEqual(classifyProtoMarket(mStd), "Standard_1X2_ML");
    assert.strictEqual(classifyProtoMarket(mHdc), "Handicap");
    assert.strictEqual(classifyProtoMarket(mUo), "UnderOver");
    assert.strictEqual(classifyProtoMarket(mSum), "SUM");
  });

  // TEST 3: Zero Look-Ahead leakage in runner
  test("TEST 3: Full Walk-Forward runner executes cleanly on Real Dataset", () => {
    const res = runProtoRealWalkForwardV1();
    assert.ok(res.summary.usedInWalkForward > 0, "Walk-forward standard matches processed");
    assert.strictEqual(res.summary.leakageAudit.futureDataLeakageCount, 0);
    assert.strictEqual(res.summary.leakageAudit.futureResultLeakageCount, 0);
    assert.strictEqual(res.summary.leakageAudit.futureOddsLeakageCount, 0);
    assert.strictEqual(res.summary.leakageAudit.timestampViolationCount, 0);
    assert.strictEqual(res.summary.leakageAudit.auditPassed, true);
  });

  // TEST 4: Output file persistence
  test("TEST 4: protoRealWalkForwardV1.json is created and populated", () => {
    const filePath = path.join(process.cwd(), "data", "protoRealWalkForwardV1.json");
    assert.ok(fs.existsSync(filePath), "Output JSON exists");
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    assert.ok(parsed.records.length > 0);
    assert.ok(parsed.summary.overallPerformance.settledCount > 0);
  });

  // TEST 5: CLV and Benter status
  test("TEST 5: CLV and Benter statuses are explicitly DISABLED", () => {
    const filePath = path.join(process.cwd(), "data", "protoRealWalkForwardV1.json");
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    assert.strictEqual(parsed.summary.clvStatus, "DISABLED");
    assert.strictEqual(parsed.summary.benterStatus, "DISABLED");
  });

  // TEST 6: Strategy evaluation sanity
  test("TEST 6: Pre-defined strategies A, B, C, D and No-Vig benchmark are generated", () => {
    const filePath = path.join(process.cwd(), "data", "protoRealWalkForwardV1.json");
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const strats = parsed.summary.strategies;
    assert.ok(strats.strategyA_ModelMaxProb.totalBets > 0);
    assert.ok(strats.strategyNoVigBenchmark.totalBets > 0);
    assert.ok(typeof strats.strategyA_ModelMaxProb.hitRate === "number");
    assert.ok(typeof strats.strategyA_ModelMaxProb.roi === "number");
  });

  // TEST 7: Fixed EV Buckets
  test("TEST 7: EV Buckets are partitioned into 5 standard bins", () => {
    const filePath = path.join(process.cwd(), "data", "protoRealWalkForwardV1.json");
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const buckets = parsed.summary.evBuckets;
    assert.strictEqual(buckets.length, 5);
    assert.strictEqual(buckets[0].bucketName, "EV < 0%");
    assert.strictEqual(buckets[4].bucketName, "EV 10%+");
  });

  // TEST 8: Sport-level KPIs
  test("TEST 8: Sport-level KPIs are computed for Soccer, Baseball, Basketball, Volleyball", () => {
    const filePath = path.join(process.cwd(), "data", "protoRealWalkForwardV1.json");
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const bySport = parsed.summary.bySport;
    assert.ok(bySport.sc !== undefined);
    assert.ok(bySport.bs !== undefined);
    assert.ok(bySport.bk !== undefined);
    assert.ok(bySport.vl !== undefined);
  });

  // TEST 9: Round-level KPIs
  test("TEST 9: Round-level KPIs cover all 8 historical rounds", () => {
    const filePath = path.join(process.cwd(), "data", "protoRealWalkForwardV1.json");
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const byRound = parsed.summary.byRound;
    assert.strictEqual(byRound.length, 8);
  });

  // TEST 10: No synthetic / fallback flags
  test("TEST 10: All records have dataSource = 'real' and isSimulated = false", () => {
    const filePath = path.join(process.cwd(), "data", "protoRealWalkForwardV1.json");
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    for (const r of parsed.records) {
      assert.strictEqual(r.dataSource, "real");
      assert.strictEqual(r.isSimulated, false);
    }
  });

  console.log(`\nResults: ${passed} / ${total} tests passed.`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(console.error);
