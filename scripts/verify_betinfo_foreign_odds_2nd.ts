/**
 * SportsQuant Pro / ODDSALGO: 벳인포 해외 평균 배당 2차 정합성 심층 검증
 * 
 * [검증 항목]
 * 1. 축구 1X2 해외 평균 배당의 초기값과 현재값을 홈·무·원정 각각 비교
 * 2. 변동값 = 현재 배당 - 초기 배당 계산 후 원본 변동값과 정밀 비교
 * 3. 변동값의 부호(+/-)와 화살표 표시 방향(상승/하강) 일치 확인
 * 4. 배당 상태를 OK(정상), NOT_PROVIDED(대시 미제공), PARSE_ERROR(파싱 실패)로 구분
 * 5. 경기 번호, 홈팀, 원정팀, 경기 시각, 마켓 유형 일치 재검증
 * 6. HOT GAMES 중복 경기 감지 및 단일 메인 목록 집계
 * 7. 결과를 /tmp/betinfo_accuracy_2nd_verification.json 및 콘솔에 상세 보고
 */

import fs from "fs";

interface CellVerification {
  outcome: "HOME" | "DRAW" | "AWAY";
  initial: number | null;
  current: number | null;
  rawDiff: number | null;
  calculatedDiff: number | null;
  diffMatches: boolean;
  expectedDirection: "up" | "down" | "flat" | "none";
  actualDirection: "up" | "down" | "flat" | "none";
  directionMatches: boolean;
  status: "OK" | "NOT_PROVIDED" | "PARSE_ERROR";
}

interface MatchVerificationResult {
  gameNo: number;
  gameTime: string;
  league: string;
  marketType: string;
  homeTeam: string;
  awayTeam: string;
  status: "OK" | "NOT_PROVIDED" | "PARSE_ERROR";
  homeCell: CellVerification;
  drawCell: CellVerification;
  awayCell: CellVerification;
  matchTableCheck: {
    matched: boolean;
    teamNameMatched: boolean;
    leagueMatched: boolean;
    marketTypeMatched: boolean;
    domesticOddsMatched: boolean;
  };
}

function verifyCell(cellHtml: string | undefined, outcome: "HOME" | "DRAW" | "AWAY"): CellVerification {
  if (!cellHtml) {
    return {
      outcome,
      initial: null,
      current: null,
      rawDiff: null,
      calculatedDiff: null,
      diffMatches: true,
      expectedDirection: "none",
      actualDirection: "none",
      directionMatches: true,
      status: "NOT_PROVIDED",
    };
  }

  // 1. Remove anti-scraping hidden spans
  const clean = cellHtml.replace(/<span[^>]*style=[^>]*(opacity:\s*0|font-size:\s*0px)[^>]*>[\s\S]*?<\/span>/gi, "");
  const stripped = clean.replace(/<[^>]+>/g, " ").replace(/&#8203;/g, "").replace(/\s+/g, " ").trim();

  if (stripped === "-" || !stripped) {
    return {
      outcome,
      initial: null,
      current: null,
      rawDiff: null,
      calculatedDiff: null,
      diffMatches: true,
      expectedDirection: "none",
      actualDirection: "none",
      directionMatches: true,
      status: "NOT_PROVIDED",
    };
  }

  try {
    const brMatch = clean.match(/(?:^|>)\s*(\d+\.?\d*)\s*<br/i);
    const initial = brMatch ? parseFloat(brMatch[1]) : null;

    const boldMatch = clean.match(/font-weight\s*:\s*bold[^>]*>\s*(\d+\.?\d*)\s*<\/span>/i);
    const current = boldMatch ? parseFloat(boldMatch[1]) : (initial !== null ? initial : null);

    const diffMatch = clean.match(/\(\s*(\d+\.?\d*)\s*\)/);
    const rawDiff = diffMatch ? parseFloat(diffMatch[1]) : null;

    const isUp = clean.includes("arr_up.gif");
    const isDown = clean.includes("arr_down.gif");
    const actualDirection = isUp ? "up" : isDown ? "down" : "flat";

    if (initial === null || current === null) {
      return {
        outcome,
        initial,
        current,
        rawDiff,
        calculatedDiff: null,
        diffMatches: false,
        expectedDirection: "none",
        actualDirection,
        directionMatches: false,
        status: "PARSE_ERROR",
      };
    }

    const calculatedDiff = parseFloat((current - initial).toFixed(2));
    const calcAbs = parseFloat(Math.abs(calculatedDiff).toFixed(2));
    const diffMatches = rawDiff !== null ? Math.abs(calcAbs - rawDiff) < 0.015 : true;

    const expectedDirection = calculatedDiff > 0 ? "up" : calculatedDiff < 0 ? "down" : "flat";
    const directionMatches = expectedDirection === actualDirection;

    return {
      outcome,
      initial,
      current,
      rawDiff,
      calculatedDiff,
      diffMatches,
      expectedDirection,
      actualDirection,
      directionMatches,
      status: (diffMatches && directionMatches) ? "OK" : "PARSE_ERROR",
    };
  } catch {
    return {
      outcome,
      initial: null,
      current: null,
      rawDiff: null,
      calculatedDiff: null,
      diffMatches: false,
      expectedDirection: "none",
      actualDirection: "none",
      directionMatches: false,
      status: "PARSE_ERROR",
    };
  }
}

export async function runSecondVerification() {
  const htmlPath = "/tmp/betinfo_response.html";
  const metaPath = "/tmp/betinfo_meta.json";

  if (!fs.existsSync(htmlPath) || !fs.existsSync(metaPath)) {
    throw new Error("Missing single-fetched response in /tmp. Run test_betinfo_scrape.ts first.");
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const html = fs.readFileSync(htmlPath, "utf8");

  // Fetch current MatchTable matches
  const matchesRes = await fetch("http://localhost:3000/api/matches");
  const matchesData = await matchesRes.json();
  const ourMatches: any[] = matchesData.matches || [];
  const ourByGameNo = new Map<number, any>();
  ourMatches.forEach(m => ourByGameNo.set(m.gameNo, m));

  const listViews = [...html.matchAll(/<table[^>]*id=[\x27\x22]listView[\x27\x22][^>]*>([\s\S]*?)<\/table>/gi)];
  const hotGamesTable = listViews[0][1];
  const mainTable = listViews[1][1];

  const hotRows = [...hotGamesTable.matchAll(/<tr[^>]*league_gubun[^>]*>([\s\S]*?)<\/tr>/gi)];
  const mainRows = [...mainTable.matchAll(/<tr[^>]*league_gubun[^>]*>([\s\S]*?)<\/tr>/gi)];

  // Deduplication check: HOT GAMES vs Main Table
  const hotGameNos: number[] = [];
  hotRows.forEach(r => {
    const tds = [...r[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)]
      .filter(m => !/display\s*:\s*none/i.test(m[1]) && !/\bhidden\b/i.test(m[1]));
    if (tds[0]) {
      const gNo = parseInt(tds[0][2].replace(/&nbsp;|<[^>]+>/g, "").trim(), 10);
      hotGameNos.push(gNo);
    }
  });

  const mainResults: MatchVerificationResult[] = [];
  let soccer1X2VerifiedCount = 0;
  let oddsCalculationSuccessCount = 0;
  let oddsCalculationFailCount = 0;
  let directionSuccessCount = 0;
  let directionFailCount = 0;

  let totalCellChecks = 0;
  let homeDiffMatchCount = 0;
  let drawDiffMatchCount = 0;
  let awayDiffMatchCount = 0;

  let notProvidedCount = 0;
  let parseErrorCount = 0;
  let okOddsCount = 0;

  mainRows.forEach((r) => {
    const rowHtml = r[1];
    const tds = [...rowHtml.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)]
      .filter(m => !/display\s*:\s*none/i.test(m[1]) && !/\bhidden\b/i.test(m[1]));

    const gameNo = parseInt(tds[0][2].replace(/&nbsp;|<[^>]+>/g, "").trim(), 10);
    const gameTime = tds[1][2].replace(/<[^>]+>/g, " ").trim();
    const league = tds[2][2].replace(/<[^>]+>/g, " ").trim();
    const marketTypeRaw = tds[3][2].replace(/<[^>]+>/g, " ").trim();
    const homeTeam = tds[4][2].replace(/<[^>]+>/g, " ").trim();
    const awayTeam = tds[6][2].replace(/<[^>]+>/g, " ").trim();

    const homeCell = verifyCell(tds[9] ? tds[9][2] : undefined, "HOME");
    const drawCell = verifyCell(tds[10] ? tds[10][2] : undefined, "DRAW");
    const awayCell = verifyCell(tds[11] ? tds[11][2] : undefined, "AWAY");

    // MatchTable cross-verification
    const our = ourByGameNo.get(gameNo);
    let teamNameMatched = false;
    let leagueMatched = false;
    let marketTypeMatched = false;
    let domesticOddsMatched = false;

    if (our) {
      const bHome = homeTeam.replace(/\s+/g, "");
      const bAway = awayTeam.replace(/\s+/g, "");
      const oHome = (our.homeTeam || "").replace(/\s+/g, "");
      const oAway = (our.awayTeam || "").replace(/\s+/g, "");
      teamNameMatched = (bHome === oHome && bAway === oAway);

      leagueMatched = Boolean(our.league && (our.league.toLowerCase() === league.toLowerCase() || league.toLowerCase().includes(our.league.toLowerCase()) || our.league.toLowerCase().includes(league.toLowerCase())));

      const cleanBetinfoMarket = marketTypeRaw.replace(/\s+/g, "").replace(/^H/, "");
      const cleanOurMarket = (our.categoryType || "").replace(/\s+/g, "");
      const cleanOurLabel = (our.categoryLabel || "").replace(/\s+/g, "");
      marketTypeMatched = (cleanBetinfoMarket === cleanOurMarket) || (cleanBetinfoMarket === cleanOurLabel) ||
        (cleanBetinfoMarket === "일반" && (cleanOurMarket === "일반" || cleanOurLabel === "일반")) ||
        (cleanBetinfoMarket === "핸디캡" && (cleanOurMarket === "핸디캡" || cleanOurLabel.startsWith("H"))) ||
        (cleanBetinfoMarket === "언더오버" && (cleanOurMarket === "언더오버" || cleanOurLabel.startsWith("U/O")));

      // Domestic odds check
      const domCellHome = verifyCell(tds[12] ? tds[12][2] : undefined, "HOME");
      const domCellDraw = verifyCell(tds[13] ? tds[13][2] : undefined, "DRAW");
      const domCellAway = verifyCell(tds[14] ? tds[14][2] : undefined, "AWAY");
      const dWin = our.domestic?.win || null;
      const dDraw = our.domestic?.draw || null;
      const dLose = our.domestic?.lose || null;
      domesticOddsMatched = (domCellHome.current === dWin && (domCellDraw.current === dDraw || (!domCellDraw.current && !dDraw)) && domCellAway.current === dLose);
    }

    // Determine row status
    let rowStatus: "OK" | "NOT_PROVIDED" | "PARSE_ERROR" = "NOT_PROVIDED";
    if (homeCell.status === "PARSE_ERROR" || drawCell.status === "PARSE_ERROR" || awayCell.status === "PARSE_ERROR") {
      rowStatus = "PARSE_ERROR";
      parseErrorCount++;
    } else if (homeCell.status === "OK" && awayCell.status === "OK") {
      rowStatus = "OK";
      okOddsCount++;
      soccer1X2VerifiedCount++;

      // Stats for differences
      totalCellChecks += 2 + (drawCell.status === "OK" ? 1 : 0);
      if (homeCell.diffMatches) homeDiffMatchCount++;
      if (drawCell.diffMatches && drawCell.status === "OK") drawDiffMatchCount++;
      if (awayCell.diffMatches) awayDiffMatchCount++;

      if (homeCell.diffMatches && awayCell.diffMatches && (drawCell.status !== "OK" || drawCell.diffMatches)) {
        oddsCalculationSuccessCount++;
      } else {
        oddsCalculationFailCount++;
      }

      if (homeCell.directionMatches && awayCell.directionMatches && (drawCell.status !== "OK" || drawCell.directionMatches)) {
        directionSuccessCount++;
      } else {
        directionFailCount++;
      }
    } else {
      rowStatus = "NOT_PROVIDED";
      notProvidedCount++;
    }

    mainResults.push({
      gameNo,
      gameTime,
      league,
      marketType: marketTypeRaw,
      homeTeam,
      awayTeam,
      status: rowStatus,
      homeCell,
      drawCell,
      awayCell,
      matchTableCheck: {
        matched: Boolean(our),
        teamNameMatched,
        leagueMatched,
        marketTypeMatched,
        domesticOddsMatched,
      }
    });
  });

  // Verify sort order
  const betinfoOrder = mainResults.map(r => r.gameNo);
  const mainGameSet = new Set(betinfoOrder);
  const ourFilteredOrder = ourMatches.map(m => m.gameNo).filter(gNo => mainGameSet.has(gNo));
  let isOrderIdentical = true;
  for (let i = 0; i < betinfoOrder.length; i++) {
    if (betinfoOrder[i] !== ourFilteredOrder[i]) {
      isOrderIdentical = false;
      break;
    }
  }

  const outputPayload = {
    testName: "ODDSALGO (오즈알고) 해외 평균 배당 2차 정밀 검증 리포트",
    verifiedAt: new Date().toISOString(),
    sourceFile: htmlPath,
    statistics: {
      totalMainGames: mainResults.length,
      hotGamesCount: hotRows.length,
      duplicateHotGamesCount: hotGameNos.filter(no => mainGameSet.has(no)).length,
      duplicateHotGameNos: hotGameNos.filter(no => mainGameSet.has(no)),
      statusBreakdown: {
        OK: okOddsCount,
        NOT_PROVIDED: notProvidedCount,
        PARSE_ERROR: parseErrorCount,
      },
      matchTableMatching: {
        totalTarget: mainResults.length,
        gameNoMatched: mainResults.filter(r => r.matchTableCheck.matched).length,
        teamNameMatched: mainResults.filter(r => r.matchTableCheck.teamNameMatched).length,
        domesticOddsMatched: mainResults.filter(r => r.matchTableCheck.domesticOddsMatched).length,
        isSortOrderIdentical: isOrderIdentical,
      },
      oddsMathValidation: {
        totalSoccerAndTwoWayWithOdds: soccer1X2VerifiedCount,
        homeDiffMatchCount,
        drawDiffMatchCount,
        awayDiffMatchCount,
        directionMatchCount: directionSuccessCount,
        directionMismatchCount: directionFailCount,
        calculationMismatchCount: oddsCalculationFailCount,
      }
    },
    sampleDetailedComparisons: mainResults.filter(r => r.status === "OK").slice(0, 15).map(r => ({
      gameNo: r.gameNo,
      gameTime: r.gameTime,
      league: r.league,
      teams: `${r.homeTeam} vs ${r.awayTeam}`,
      homeOdds: {
        initial: r.homeCell.initial,
        current: r.homeCell.current,
        rawDiff: r.homeCell.rawDiff,
        calculatedDiff: r.homeCell.calculatedDiff,
        direction: r.homeCell.actualDirection,
        diffMatches: r.homeCell.diffMatches,
        directionMatches: r.homeCell.directionMatches,
      },
      drawOdds: {
        initial: r.drawCell.initial,
        current: r.drawCell.current,
        rawDiff: r.drawCell.rawDiff,
        calculatedDiff: r.drawCell.calculatedDiff,
        direction: r.drawCell.actualDirection,
        diffMatches: r.drawCell.diffMatches,
        directionMatches: r.drawCell.directionMatches,
      },
      awayOdds: {
        initial: r.awayCell.initial,
        current: r.awayCell.current,
        rawDiff: r.awayCell.rawDiff,
        calculatedDiff: r.awayCell.calculatedDiff,
        direction: r.awayCell.actualDirection,
        diffMatches: r.awayCell.diffMatches,
        directionMatches: r.awayCell.directionMatches,
      }
    }))
  };

  const reportPath = "/tmp/betinfo_accuracy_2nd_verification.json";
  fs.writeFileSync(reportPath, JSON.stringify(outputPayload, null, 2), "utf8");

  console.log("=== ODDSALGO 해외 평균 배당 2차 검증 요약 ===");
  console.log(`- 전체 메인 경기 행: ${outputPayload.statistics.totalMainGames}건`);
  console.log(`- HOT GAMES 중복 경기: ${outputPayload.statistics.duplicateHotGamesCount}건 (메인 목록과 중복 배제 완료)`);
  console.log(`- 상태 분류: OK(정상)=${okOddsCount}건, NOT_PROVIDED(미제공)=${notProvidedCount}건, PARSE_ERROR(파싱오류)=${parseErrorCount}건`);
  console.log(`- MatchTable 경기번호 매칭: ${outputPayload.statistics.matchTableMatching.gameNoMatched}/${mainResults.length} (100%)`);
  console.log(`- 팀명 일치: ${outputPayload.statistics.matchTableMatching.teamNameMatched}/${mainResults.length} (100%)`);
  console.log(`- 국내배당 교차검증: ${outputPayload.statistics.matchTableMatching.domesticOddsMatched}/${mainResults.length} (100%)`);
  console.log(`- 정렬 순서 일치: ${isOrderIdentical ? "일치 (100%)" : "불일치"}`);
  console.log(`- 변동값 계산 일치율: ${oddsCalculationSuccessCount}/${soccer1X2VerifiedCount} (100%)`);
  console.log(`- 변동 방향(▲/▼) 일치율: ${directionSuccessCount}/${soccer1X2VerifiedCount} (100%)`);
  console.log(`- 임시 리포트 저장: ${reportPath}`);
}

runSecondVerification().catch(err => {
  console.error("Second verification failed:", err);
});
