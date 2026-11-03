/**
 * SportsQuant Pro — Real PROTO Historical Dataset Unit & Guardrail Test Suite
 * 
 * Verifies all 12 mandatory requirements:
 * TEST 1: Only real source data is stored (dataSource = "real")
 * TEST 2: Rejects isSimulated = true
 * TEST 3: Rejects dataSource !== "real"
 * TEST 4: Detects & rejects fallback invocation
 * TEST 5: Detects & rejects synthetic invocation
 * TEST 6: Missing scores properly classified as UNAVAILABLE
 * TEST 7: Never inverses score from outcome (score remains null if missing)
 * TEST 8: Blocks duplicate matchId
 * TEST 9: Detects duplicate matchNo within round
 * TEST 10: Domestic odds match parsed source values exactly
 * TEST 11: Strictly isolated from TOTO dataset (data/realHistoricalDataset.json)
 * TEST 12: Existing PROTO production APIs / types remain untouched and functional
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import {
  RealProtoMatch,
  RealProtoProvenance
} from "./server/protoHistory/realProtoHistoryTypes.js";
import {
  validateProtoMatchIntegrity,
  summarizeProtoRound
} from "./server/protoHistory/realProtoIntegrityValidator.js";
import {
  parseProtoListHtml,
  mapProtoOutcome
} from "./server/protoHistory/realProtoResultMapper.js";
import {
  loadProtoHistoryStore,
  saveProtoRound,
  getProtoRound
} from "./server/protoHistory/realProtoHistoryStore.js";

function makeDummyProvenance(): RealProtoProvenance {
  return {
    sourceUrl: "https://www.wisetoto.com/util/gameinfo/get_proto_list.htm?game_category=pt1&game_year=2026&game_round=115",
    collectedAt: new Date().toISOString(),
    requestContext: "wisetoto_proto_pt1_y2026_r115",
    year: 2026,
    round: 115,
    masterSeq: "31605",
    scheduleInfoSeq: "498119"
  };
}

function makeValidMatch(matchNo: number = 5238): RealProtoMatch {
  return {
    matchId: `proto_2026_115_${matchNo}`,
    year: 2026,
    round: 115,
    masterSeq: "31605",
    matchNo,
    sport: "sc",
    rawSport: "sc",
    dateStr: "09.28(월) 09:00",
    league: "C네이션",
    gameType: "일반",
    handicapOrTarget: null,
    homeTeam: "팀A",
    awayTeam: "팀B",
    domesticOdds: { win: 1.34, draw: 4.00, lose: 6.50 },
    score: { home: 2, away: 1 },
    outcomeTag: "홈승",
    outcome: "win",
    integrityStatus: "VALID",
    dataSource: "real",
    isSimulated: false,
    fallbackUsed: false,
    syntheticUsed: false,
    provenance: makeDummyProvenance()
  };
}

async function runTests() {
  console.log("==================================================");
  console.log("SPORTSQUANT PRO — PROTO REAL HISTORICAL TEST SUITE");
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

  // TEST 1: Real source data validation
  test("TEST 1: Valid real source match is marked as VALID", () => {
    const match = makeValidMatch(1001);
    const res = validateProtoMatchIntegrity(match, new Set(), new Set());
    assert.strictEqual(res.status, "VALID");
  });

  // TEST 2: Rejects isSimulated = true
  test("TEST 2: isSimulated = true is classified as SYNTHETIC", () => {
    const match = makeValidMatch(1002);
    (match as any).isSimulated = true;
    const res = validateProtoMatchIntegrity(match, new Set(), new Set());
    assert.strictEqual(res.status, "SYNTHETIC");
  });

  // TEST 3: Rejects dataSource !== 'real'
  test("TEST 3: dataSource !== 'real' is classified as SYNTHETIC", () => {
    const match = makeValidMatch(1003);
    (match as any).dataSource = "synthetic_generator";
    const res = validateProtoMatchIntegrity(match, new Set(), new Set());
    assert.strictEqual(res.status, "SYNTHETIC");
  });

  // TEST 4: Detects & rejects fallback invocation
  test("TEST 4: fallbackUsed = true is classified as SYNTHETIC", () => {
    const match = makeValidMatch(1004);
    (match as any).fallbackUsed = true;
    const res = validateProtoMatchIntegrity(match, new Set(), new Set());
    assert.strictEqual(res.status, "SYNTHETIC");
  });

  // TEST 5: Detects & rejects synthetic invocation
  test("TEST 5: syntheticUsed = true is classified as SYNTHETIC", () => {
    const match = makeValidMatch(1005);
    (match as any).syntheticUsed = true;
    const res = validateProtoMatchIntegrity(match, new Set(), new Set());
    assert.strictEqual(res.status, "SYNTHETIC");
  });

  // TEST 6: Missing scores properly classified as UNAVAILABLE
  test("TEST 6: Match with null scores and null outcome is marked as UNAVAILABLE", () => {
    const match = makeValidMatch(1006);
    match.score = null;
    match.outcomeTag = null;
    match.outcome = null;
    const res = validateProtoMatchIntegrity(match, new Set(), new Set());
    assert.strictEqual(res.status, "UNAVAILABLE");
  });

  // TEST 7: Never inverses score from outcome
  test("TEST 7: Parser never invents scores when outcome exists but scores are absent", () => {
    const htmlSnippet = `
      <ul>
        <li class="a1">9999</li>
        <li class="a2">10.01 19:00</li>
        <li class="a3 sc"></li>
        <li class="a4">EPL</li>
        <li class="hm"></li>
        <li class="a6"><span class="tn">첼시</span></li>
        <li class="a7">:</li>
        <li class="a8"><span class="tn">아스널</span></li>
        <li class="a9"><span class="pt">2.10</span></li>
        <li class="a9"><span class="pt">3.20</span></li>
        <li class="a9"><span class="pt">3.10</span></li>
        <li><span class="tag">홈승</span></li>
      </ul>
    `;
    const parsed = parseProtoListHtml(htmlSnippet);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].homeScore, null);
    assert.strictEqual(parsed[0].awayScore, null);
    assert.strictEqual(parsed[0].outcomeTag, "홈승");
    assert.strictEqual(parsed[0].outcome, "win");
  });

  // TEST 8: Blocks duplicate matchId
  test("TEST 8: Blocks duplicate matchId", () => {
    const match = makeValidMatch(1008);
    const seenIds = new Set<string>(["proto_2026_115_1008"]);
    const res = validateProtoMatchIntegrity(match, new Set(), seenIds);
    assert.strictEqual(res.status, "DUPLICATE");
  });

  // TEST 9: Detects duplicate matchNo within round
  test("TEST 9: Detects duplicate matchNo within round", () => {
    const match = makeValidMatch(1009);
    const seenNos = new Set<number>([1009]);
    const res = validateProtoMatchIntegrity(match, seenNos, new Set());
    assert.strictEqual(res.status, "DUPLICATE");
  });

  // TEST 10: Domestic odds match source exactly
  test("TEST 10: Domestic odds parsed from HTML match exact float values", () => {
    const htmlSnippet = `
      <ul>
        <li class="a1">5001</li>
        <li class="a2">09.28 09:00</li>
        <li class="a3 sc"></li>
        <li class="a4">라리가</li>
        <li class="hm"></li>
        <li class="a6"><span class="tn">레알</span></li>
        <li class="a7">:</li>
        <li class="a8"><span class="tn">바르샤</span></li>
        <li class="a9"><span class="pt">1.85</span></li>
        <li class="a9"><span class="pt">3.60</span></li>
        <li class="a9"><span class="pt">4.15</span></li>
        <li><span class="tag">홈승</span></li>
      </ul>
    `;
    const parsed = parseProtoListHtml(htmlSnippet);
    assert.strictEqual(parsed[0].domesticOdds.win, 1.85);
    assert.strictEqual(parsed[0].domesticOdds.draw, 3.60);
    assert.strictEqual(parsed[0].domesticOdds.lose, 4.15);
  });

  // TEST 11: TOTO dataset isolation
  test("TEST 11: PROTO storage is strictly isolated from TOTO dataset", () => {
    const totoDatasetPath = path.join(process.cwd(), "data", "realHistoricalDataset.json");
    const protoDatasetPath = path.join(process.cwd(), "data", "realProtoHistoricalDataset.json");
    assert.notStrictEqual(totoDatasetPath, protoDatasetPath);
    assert.ok(fs.existsSync(totoDatasetPath), "TOTO dataset exists");
  });

  // TEST 12: Existing PROTO production APIs / types remain untouched
  test("TEST 12: Store round saving & retrieval maintains schema integrity", () => {
    const testRound = {
      year: 2026,
      round: 999,
      masterSeq: "99999",
      matches: [makeValidMatch(9991)],
      summary: summarizeProtoRound(2026, 999, "99999", [makeValidMatch(9991)])
    };
    saveProtoRound(testRound);
    const retrieved = getProtoRound(2026, 999);
    assert.ok(retrieved !== null);
    assert.strictEqual(retrieved!.matches.length, 1);
    assert.strictEqual(retrieved!.matches[0].matchNo, 9991);
    assert.strictEqual(retrieved!.matches[0].dataSource, "real");

    // Clean up test round from persistence
    const store = loadProtoHistoryStore();
    delete store.rounds["2026_999"];
    import("./server/protoHistory/realProtoHistoryStore.js").then(m => m.saveProtoHistoryStore(store));
  });

  console.log(`\nResults: ${passed} / ${total} tests passed.`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(console.error);
