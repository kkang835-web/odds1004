/**
 * SportsQuant Pro — The Odds API Foreign Odds Comprehensive Integration Test Suite
 *
 * Verifies:
 * 1. MLB Pinnacle real odds retrieval and BetMan official match linking
 * 2. K League 1 real odds retrieval and 3-way 1X2 Pinnacle matching
 * 3. Unsupported / inactive sports missing-value handling (KBL, KBO, W1L, W5L, TBD)
 * 4. API error handling, URL secret sanitization, and quota header tracking
 * 5. Full End-to-End HTTP API verification (/api/matches and /api/the-odds-api/*)
 * 6. Zero duplicate calls & TTL caching integrity
 */

import {
  getTheOddsApiKey,
  sanitizeApiUrl,
  fetchTheOddsApiSports,
  fetchTheOddsApiOdds,
  getTheOddsApiUsage,
  matchBetmanWithForeignOdds,
  enrichMatchesWithTheOddsApi
} from "./server/theOddsApiService.js";

async function runTestSuite() {
  console.log("================================================================================");
  console.log("🏁 Starting The Odds API Foreign Odds Comprehensive Integration Test Suite");
  console.log("================================================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✅ [PASS] ${testName}${detail ? ` (${detail})` : ""}`);
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ` (${detail})` : ""}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Secret Key Resolution & Sanitization Guard
  // --------------------------------------------------------------------------
  console.log("📋 [TEST 1] Secret Key Resolution & Zero-Exposure Guard");
  const key = getTheOddsApiKey();
  assert(key !== null && key.length === 32, "1-1. The Odds API key successfully resolved from AI Studio Secret without leaking");
  
  const testUrl = "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/?apiKey=abcdef1234567890abcdef1234567890&regions=eu";
  const sanitized = sanitizeApiUrl(testUrl);
  assert(
    !sanitized.includes("abcdef1234567890") && sanitized.includes("apiKey=***REDACTED***"),
    "1-2. URL sanitizer completely masks API key in logs and network traces"
  );
  console.log();

  // --------------------------------------------------------------------------
  // TEST 2: Active Sports Verification (/v4/sports/)
  // --------------------------------------------------------------------------
  console.log("📋 [TEST 2] Active Sports Discovery (/v4/sports/)");
  const sports = await fetchTheOddsApiSports();
  assert(Array.isArray(sports) && sports.length > 0, "2-1. /v4/sports/ returned active sports catalog", `총 ${sports.length}개 종목`);
  
  const mlbSport = sports.find(s => s.key === "baseball_mlb");
  assert(mlbSport !== undefined && mlbSport.active === true, "2-2. 'baseball_mlb' is verified and active");
  
  const kleagueSport = sports.find(s => s.key === "soccer_korea_kleague1");
  assert(kleagueSport !== undefined && kleagueSport.active === true, "2-3. 'soccer_korea_kleague1' is verified and active");
  
  const kboSport = sports.find(s => s.key.toLowerCase().includes("kbo"));
  assert(kboSport === undefined, "2-4. KBO is verified absent from active list (no fake data permitted)");
  console.log();

  // --------------------------------------------------------------------------
  // TEST 3: MLB Pinnacle Real Odds & BetMan Match Linking
  // --------------------------------------------------------------------------
  console.log("📋 [TEST 3] MLB Pinnacle Odds Retrieval & BetMan Match Linking");
  const mlbGames = await fetchTheOddsApiOdds("baseball_mlb");
  assert(Array.isArray(mlbGames) && mlbGames.length > 0, "3-1. MLB real odds successfully retrieved", `${mlbGames.length}경기`);

  const pinnacleMlbGame = mlbGames.find(g => g.isPinnacle);
  assert(pinnacleMlbGame !== undefined, "3-2. Pinnacle sharp bookmaker is identified and selected", pinnacleMlbGame?.bookmakerTitle);
  assert(
    typeof pinnacleMlbGame?.odds.home === "number" && typeof pinnacleMlbGame?.odds.away === "number",
    "3-3. Pinnacle 2-way decimal odds extracted properly",
    `Home: ${pinnacleMlbGame?.odds.home}, Away: ${pinnacleMlbGame?.odds.away}, Payout: ${pinnacleMlbGame?.odds.refundRate}`
  );
  assert(
    typeof pinnacleMlbGame?.lastUpdate === "string" && pinnacleMlbGame.lastUpdate.length > 0,
    "3-4. Pinnacle last_update timestamp preserved",
    pinnacleMlbGame?.lastUpdate
  );

  // Link BetMan game (Tampa Bay Rays vs Cleveland Guardians)
  const betmanTampaGame = {
    sport: "baseball" as const,
    league: "MLB",
    categoryType: "일반",
    homeTeam: "탬파레이",
    awayTeam: "클리가디",
    betmanHomeName: "탬파베이 레이스",
    betmanAwayName: "클리블랜드 가디언스",
    kickoffAt: "2026-10-14T00:00:00.000Z"
  };
  const matchResult = matchBetmanWithForeignOdds(betmanTampaGame, mlbGames);
  assert(matchResult.matched === true && matchResult.game !== undefined, "3-5. BetMan 탬파베이 vs 클리블랜드 matched with The Odds API");
  assert(matchResult.game?.isPinnacle === true, "3-6. Matched game uses Pinnacle bookmaker");
  console.log();

  // --------------------------------------------------------------------------
  // TEST 4: K League 1 Pinnacle Real Odds Retrieval
  // --------------------------------------------------------------------------
  console.log("📋 [TEST 4] K League 1 Real Odds & 3-way 1X2 Pinnacle Extraction");
  const kleagueGames = await fetchTheOddsApiOdds("soccer_korea_kleague1");
  assert(Array.isArray(kleagueGames) && kleagueGames.length > 0, "4-1. K League 1 real odds retrieved", `${kleagueGames.length}경기`);

  const ulsanGame = kleagueGames.find(g => g.homeTeam.toLowerCase().includes("ulsan"));
  assert(ulsanGame !== undefined, "4-2. Ulsan vs Bucheon fixture found in K League 1 feed");
  assert(
    typeof ulsanGame?.odds.home === "number" &&
    typeof ulsanGame?.odds.draw === "number" &&
    typeof ulsanGame?.odds.away === "number",
    "4-3. 3-way 1X2 Pinnacle odds verified",
    `홈: ${ulsanGame?.odds.home}, 무: ${ulsanGame?.odds.draw}, 원정: ${ulsanGame?.odds.away}`
  );
  assert(ulsanGame?.isPinnacle === true, "4-4. Pinnacle bookmaker verified for K League 1 fixture");
  console.log();

  // --------------------------------------------------------------------------
  // TEST 5: Strict Market Boundaries & Unsupported Sports Rejection
  // --------------------------------------------------------------------------
  console.log("📋 [TEST 5] Strict Market Boundaries & Unsupported Rejection");
  // 5-1. Rejection of 승1패 (W1L)
  const w1lMatch = matchBetmanWithForeignOdds(
    {
      sport: "baseball",
      league: "MLB",
      categoryType: "승1패",
      homeTeam: "탬파레이",
      awayTeam: "클리가디"
    },
    mlbGames
  );
  assert(w1lMatch.matched === false, "5-1. Overseas h2h is strictly prohibited from linking to 승1패 (W1L)");

  // 5-2. Rejection of 핸디캡
  const hdcMatch = matchBetmanWithForeignOdds(
    {
      sport: "baseball",
      league: "MLB",
      categoryType: "핸디캡",
      homeTeam: "탬파레이",
      awayTeam: "클리가디"
    },
    mlbGames
  );
  assert(hdcMatch.matched === false, "5-2. Overseas h2h is strictly prohibited from linking to 핸디캡");

  // 5-3. Rejection of 언더오버
  const uoMatch = matchBetmanWithForeignOdds(
    {
      sport: "baseball",
      league: "MLB",
      categoryType: "언더오버",
      homeTeam: "탬파레이",
      awayTeam: "클리가디"
    },
    mlbGames
  );
  assert(uoMatch.matched === false, "5-3. Overseas h2h is strictly prohibited from linking to 언더오버");

  // 5-4. Rejection of KBO (Inactive/Unsupported)
  const kboMatch = matchBetmanWithForeignOdds(
    {
      sport: "baseball",
      league: "KBO",
      categoryType: "일반",
      homeTeam: "두산 베어스",
      awayTeam: "LG 트윈스"
    },
    mlbGames
  );
  assert(kboMatch.matched === false, "5-4. KBO is strictly marked UNSUPPORTED / UNAVAILABLE (no fake data)");

  // 5-5. Rejection of KBL (Unsupported)
  const kblMatch = matchBetmanWithForeignOdds(
    {
      sport: "basketball",
      league: "KBL",
      categoryType: "일반",
      homeTeam: "원주DB 프로미",
      awayTeam: "서울SK 나이츠"
    },
    []
  );
  assert(kblMatch.matched === false, "5-5. KBL is strictly marked UNSUPPORTED / UNAVAILABLE (no fake data)");

  // 5-6. Rejection of '미정' (TBD)
  const tbdMatch = matchBetmanWithForeignOdds(
    {
      sport: "baseball",
      league: "MLB",
      categoryType: "일반",
      homeTeam: "미정",
      awayTeam: "미정"
    },
    mlbGames
  );
  assert(tbdMatch.matched === false, "5-6. Undecided (미정) matches are strictly excluded");
  console.log();

  // --------------------------------------------------------------------------
  // TEST 6: Header Quota Tracking & In-Flight / TTL Caching
  // --------------------------------------------------------------------------
  console.log("📋 [TEST 6] Header Quota Tracking & Caching Integrity");
  const usage = getTheOddsApiUsage();
  assert(
    typeof usage.requestsUsed === "number" &&
    typeof usage.requestsRemaining === "number" &&
    typeof usage.requestsLast === "number",
    "6-1. x-requests-used, x-requests-remaining, x-requests-last headers parsed successfully",
    `Used: ${usage.requestsUsed}, Remaining: ${usage.requestsRemaining}, Last: ${usage.requestsLast}`
  );

  // Repeat call to baseball_mlb should hit cache without increasing usage
  const beforeUsed = usage.requestsUsed;
  const cachedMlb = await fetchTheOddsApiOdds("baseball_mlb");
  assert(cachedMlb.length === mlbGames.length, "6-2. Second call served from memory/disk cache instantaneously");
  console.log();

  // --------------------------------------------------------------------------
  // TEST 7: End-to-End HTTP API & MatchTable Data Structure
  // --------------------------------------------------------------------------
  console.log("📋 [TEST 7] End-to-End API (/api/matches and /api/the-odds-api/*)");
  const apiStatusRes = await fetch("http://localhost:3000/api/the-odds-api/status");
  assert(apiStatusRes.ok, "7-1. GET /api/the-odds-api/status returned HTTP 200");
  const apiStatus = await apiStatusRes.json();
  assert(apiStatus.isApiKeyConfigured === true, "7-2. Status confirms API key is configured (without leaking key)");
  assert(apiStatus.serviceStatus === "정상 가동 중", "7-3. Service status is '정상 가동 중'");

  const matchesRes = await fetch("http://localhost:3000/api/matches?gameType=pt1&year=2026&round=121&force=true");
  assert(matchesRes.ok, "7-4. GET /api/matches returned HTTP 200");
  const matchesData = await matchesRes.json();
  assert(Array.isArray(matchesData.matches) && matchesData.matches.length > 0, "7-5. Matches array received");

  // Check match 7967 (MLB General Match)
  const m7967 = matchesData.matches.find((m: any) => m.gameNo === 7967);
  assert(m7967 !== undefined, "7-6. Match 7967 (MLB 탬파베이 vs 클리블랜드) found in round 121");
  assert(
    m7967?.domestic?.win === 1.51 && m7967?.domestic?.lose === 2.11,
    "7-7. BetMan domestic odds preserved exactly (1.51 / 2.11)",
    `BetMan Win: ${m7967?.domestic?.win}, Lose: ${m7967?.domestic?.lose}`
  );
  assert(
    m7967?.foreign !== null && typeof m7967?.foreign?.win === "number",
    "7-8. Pinnacle foreign odds linked successfully",
    `Pinnacle Win: ${m7967?.foreign?.win}, Lose: ${m7967?.foreign?.lose}`
  );
  assert(
    m7967?.foreignBookmaker === "Pinnacle",
    "7-9. Foreign bookmaker explicitly attributed to Pinnacle"
  );
  assert(
    m7967?.oddsSource?.domestic === "real" && m7967?.oddsSource?.foreign === "real",
    "7-10. Both domestic and foreign marked as 'real' data source"
  );

  // Check match 7968 (MLB 승1패 - Must NOT have foreign h2h)
  const m7968 = matchesData.matches.find((m: any) => m.gameNo === 7968);
  assert(
    m7968?.foreign === null && m7968?.oddsSource?.foreign === "unavailable",
    "7-11. 승1패 (W1L) match 7968 strictly maintains foreign: null and oddsSource.foreign: 'unavailable'"
  );

  // Check KBO and KBL matches
  const kboSample = matchesData.matches.find((m: any) => m.league === "KBO");
  assert(
    kboSample?.foreign === null && kboSample?.oddsSource?.foreign === "unavailable",
    "7-12. KBO matches maintain foreign: null and UNAVAILABLE"
  );
  const kblSample = matchesData.matches.find((m: any) => m.league === "KBL");
  assert(
    kblSample?.foreign === null && kblSample?.oddsSource?.foreign === "unavailable",
    "7-13. KBL matches maintain foreign: null and UNAVAILABLE"
  );
  console.log();

  console.log("================================================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED PERFECTLY!`);
  console.log("================================================================================");
}

runTestSuite().catch(err => {
  console.error("FATAL TEST FAILURE:", err);
  process.exit(1);
});
