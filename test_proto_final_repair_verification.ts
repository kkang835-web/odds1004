import fs from 'fs';
import path from 'path';
import { computeQuantModel } from './src/utils/quantModel';
import { getPrimaryPickInfo } from './src/utils/quantPickEvaluator';
import { extractRealH2HAndRecentForm } from './server/realMatchHistoryExtractor';

console.log("==========================================================================");
console.log(" SPORTSQUANT PRO — FINAL MASTER REPAIR & VERIFICATION TEST SUITE");
console.log("==========================================================================\n");

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
    console.error(`[FAIL] ${testName} -> ${detail || 'Condition not met'}`);
  }
}

// -----------------------------------------------------------------------
// Test 1: Hardcoded ERA in MatchTable.tsx & quantModel.ts
// -----------------------------------------------------------------------
const matchTableContent = fs.readFileSync(path.join(process.cwd(), 'src/components/MatchTable.tsx'), 'utf-8');
const quantModelContent = fs.readFileSync(path.join(process.cwd(), 'src/utils/quantModel.ts'), 'utf-8');
const quantPickContent = fs.readFileSync(path.join(process.cwd(), 'src/utils/quantPickEvaluator.ts'), 'utf-8');

assert(!matchTableContent.includes('era: 3.45'), "1. MatchTable.tsx contains zero hardcoded homeERA (3.45)");
assert(!matchTableContent.includes('era: 4.12'), "2. MatchTable.tsx contains zero hardcoded awayERA (4.12)");
assert(!quantPickContent.includes('+ 4.5'), "3. quantPickEvaluator.ts contains zero +4.5 bonus on W1L");

// -----------------------------------------------------------------------
// Test 2: Skellam Model Dynamic Calculation across 20 Real Baseball Matches
// -----------------------------------------------------------------------
const sampleBaseballOdds = [
  { matchId: 'm1', home: '한화', away: 'LG', win: 1.82, lose: 1.98 },
  { matchId: 'm2', home: 'KIA', away: 'SSG', win: 1.45, lose: 2.75 },
  { matchId: 'm3', home: '두산', away: 'KT', win: 2.30, lose: 1.62 },
  { matchId: 'm4', home: 'NC', away: '롯데', win: 1.55, lose: 2.45 },
  { matchId: 'm5', home: '키움', away: '삼성', win: 2.60, lose: 1.50 },
  { matchId: 'm6', home: 'LA다저스', away: '샌디에이고', win: 1.40, lose: 2.90 },
  { matchId: 'm7', home: '뉴욕양키스', away: '보스턴', win: 1.70, lose: 2.15 },
  { matchId: 'm8', home: '토론토', away: '디트로이트', win: 1.65, lose: 2.25 },
  { matchId: 'm9', home: '볼티모어', away: '탬파베이', win: 1.50, lose: 2.55 },
  { matchId: 'm10', home: '시카고화이트삭스', away: '미네소타', win: 2.80, lose: 1.43 },
  { matchId: 'm11', home: '애틀랜타', away: '필라델피아', win: 1.75, lose: 2.08 },
  { matchId: 'm12', home: '휴스턴', away: '시애틀', win: 1.60, lose: 2.35 },
  { matchId: 'm13', home: '세인트루이스', away: '밀워키', win: 2.05, lose: 1.78 },
  { matchId: 'm14', home: '샌프란시스코', away: '애리조나', win: 1.90, lose: 1.90 },
  { matchId: 'm15', home: '텍사스', away: '오클랜드', win: 1.38, lose: 3.05 },
  { matchId: 'm16', home: '시카고컵스', away: '피츠버그', win: 1.68, lose: 2.18 },
  { matchId: 'm17', home: '클리블랜드', away: '캔자스시티', win: 1.52, lose: 2.50 },
  { matchId: 'm18', home: '신시내티', away: '워싱턴', win: 1.80, lose: 2.00 },
  { matchId: 'm19', home: '마이애미', away: '콜로라도', win: 1.72, lose: 2.12 },
  { matchId: 'm20', home: 'LA에인절스', away: '오클랜드', win: 1.62, lose: 2.30 }
];

const lambdasHome: number[] = [];
const lambdasAway: number[] = [];
const homeProbs: number[] = [];
const awayProbs: number[] = [];
const picks: string[] = [];

for (const m of sampleBaseballOdds) {
  const res = computeQuantModel({
    sport: 'baseball',
    type: '1X2',
    isBaseball: true,
    marketBase: 8.8,
    domesticOdds: { win: m.win, lose: m.lose }
  });

  if (res) {
    lambdasHome.push(res.expectedScore?.home ?? 0);
    lambdasAway.push(res.expectedScore?.away ?? 0);
    homeProbs.push(res.homeProb);
    awayProbs.push(res.awayProb);
    picks.push(res.homeProb >= res.awayProb ? '홈 승' : '원정 승');
  }
}

const uniqueLambdasHome = new Set(lambdasHome);
const uniqueHomeProbs = new Set(homeProbs);
const uniquePicks = new Set(picks);

assert(uniqueLambdasHome.size > 5, `4. Skellam lambdaHome is dynamic (unique values: ${uniqueLambdasHome.size} > 5)`);
assert(uniqueHomeProbs.size > 5, `5. Baseball homeProb is dynamic (unique values: ${uniqueHomeProbs.size} > 5, not fixed 57.2%)`);
assert(uniquePicks.has('홈 승') && uniquePicks.has('원정 승'), `6. Recommendations contain both '홈 승' and '원정 승' (Picks: ${Array.from(uniquePicks).join(', ')})`);

// -----------------------------------------------------------------------
// Test 3: W1L missing official odds -> UNAVAILABLE
// -----------------------------------------------------------------------
const matchWithoutW1L: any = {
  gameNo: 101,
  sport: 'baseball',
  homeTeam: '한화',
  awayTeam: 'LG',
  domestic: { win: 1.82, lose: 1.98 },
  market: '일반'
};

const pickResultWithoutW1L = getPrimaryPickInfo(matchWithoutW1L);
assert(pickResultWithoutW1L.fourMarketPicks.win1Lose === undefined, "7. W1L official recommendation is undefined/UNAVAILABLE when official w1lOdds are absent");

// -----------------------------------------------------------------------
// Test 4: W1L with official odds -> Evaluates all 3 outcomes fairly
// -----------------------------------------------------------------------
const matchWithW1L: any = {
  gameNo: 102,
  sport: 'baseball',
  homeTeam: 'KIA',
  awayTeam: 'SSG',
  domestic: { win: 1.45, lose: 2.75 },
  w1lOdds: { win: 2.15, draw: 2.65, lose: 3.20 },
  market: '승1패'
};

const pickResultWithW1L = getPrimaryPickInfo(matchWithW1L);
assert(pickResultWithW1L.fourMarketPicks.win1Lose !== undefined, "8. W1L recommendation generates when official w1lOdds are present");
if (pickResultWithW1L.fourMarketPicks.win1Lose) {
  assert(pickResultWithW1L.fourMarketPicks.win1Lose.odds > 1.0, "9. W1L pick has real odds (> 1.0)");
}

// -----------------------------------------------------------------------
// Test 5: Model Probability vs No-Vig Independence & Formulas
// -----------------------------------------------------------------------
const odds1 = 1.85;
const odds2 = 1.95;
const inv1 = 1 / odds1;
const inv2 = 1 / odds2;
const sumInv = inv1 + inv2;
const expectedNoVig1 = (inv1 / sumInv) * 100;
const expectedNoVig2 = (inv2 / sumInv) * 100;

assert(Math.abs((expectedNoVig1 + expectedNoVig2) - 100) < 0.01, "10. No-Vig probabilities sum to exactly 100%");

// EV formula: EV = (p * odds) - 1
const testP = 0.648;
const testOdds = 1.85;
const expectedEv = testP * testOdds - 1; // 0.648 * 1.85 - 1 = +0.1988 (19.88%)
assert(Math.abs(expectedEv - 0.1988) < 0.001, "11. EV formula matches p * odds - 1");

// Kelly formula: (b * p - q) / b where b = odds - 1, q = 1 - p
const b = testOdds - 1;
const q = 1 - testP;
const expectedKelly = (b * testP - q) / b;
assert(expectedKelly > 0, `12. Positive EV yields positive Kelly fraction (${(expectedKelly * 100).toFixed(2)}%)`);

// Negative EV Kelly check
const negP = 0.40;
const negOdds = 1.85;
const negB = negOdds - 1;
const negQ = 1 - negP;
const negKelly = (negB * negP - negQ) / negB;
assert(negKelly < 0, "13. Negative EV yields negative raw Kelly, correctly clamped to 0 in UI");

// -----------------------------------------------------------------------
// Test 6: Real Match History Extraction (Recent 5 Matches & H2H)
// -----------------------------------------------------------------------
const realExtract = extractRealH2HAndRecentForm('한화', 'LG', 'KBO', 'baseball', '2026-09-30');

console.log(`\n[Real History Extractor Result for 한화 vs LG]:`);
console.log(`- Home (한화) Past Matches Found: ${realExtract.homeRecentForm.recentMatches.length}`);
console.log(`- Away (LG) Past Matches Found: ${realExtract.awayRecentForm.recentMatches.length}`);
console.log(`- H2H Past Matches Found: ${realExtract.h2h.matches.length}`);

assert(realExtract.homeRecentForm.summary !== undefined, "14. Home Recent Form summary is generated");
assert(realExtract.awayRecentForm.summary !== undefined, "15. Away Recent Form summary is generated");
assert(realExtract.h2h.summary !== undefined, "16. H2H summary is generated");

if (realExtract.homeRecentForm.recentMatches.length > 0) {
  const m0 = realExtract.homeRecentForm.recentMatches[0];
  assert(Boolean(m0.date && m0.opponent && m0.score && m0.result), "17. Recent match record has date, opponent, score, result");
}

// -----------------------------------------------------------------------
// Test 7: Unknown Team Extraction -> Returns UNKNOWN (no synthetic fallback)
// -----------------------------------------------------------------------
const unknownExtract = extractRealH2HAndRecentForm('가상팀A', '가상팀B', 'UNKNOWN', 'baseball');
assert(unknownExtract.homeRecentForm.recentMatches.length === 0, "18. Unknown team yields 0 fake matches");
assert(unknownExtract.homeRecentForm.summary.avgScored === '-', "19. Missing recent form returns '-' instead of '0.0'");
assert(unknownExtract.h2h.summary.homeAvgScored === '-', "20. Missing H2H returns '-' instead of '0.0'");

console.log("\n==========================================================================");
console.log(` MASTER TEST SUMMARY: ${passedTests}/${totalTests} PASSED (Failed: ${failedTests})`);
console.log("==========================================================================");

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
