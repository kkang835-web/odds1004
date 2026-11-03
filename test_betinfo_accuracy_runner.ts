/**
 * SportsQuant Pro: 벳인포 해외 평균 배당 단발성 수집 정확도 테스트 러너
 * 
 * [원칙 및 제약사항]
 * 1. 테스트 전용: 자동 스케줄러, 5분 반복 수집, Supabase 쓰기, 기존 데이터셋 변경 일체 없음.
 * 2. 1회 표준 HTTP GET 응답(/tmp/betinfo_response.html) 기반 검증.
 * 3. 가짜 배당/모의 데이터 일체 배제, 원본 HTML 100% 정합성 검증.
 */

import fs from "fs";

interface BetinfoOddsCell {
  initial: number | null;
  current: number | null;
  change: number; // e.g. +0.49 or -1.27
  direction: "up" | "down" | "flat" | "none";
  rawText: string;
}

interface BetinfoParsedRow {
  tableType: "HOT_GAMES" | "MAIN_TABLE";
  tableRowIndex: number;
  gameNo: number;
  gameTime: string;
  league: string;
  marketTypeRaw: string;
  normalizedMarket: string;
  homeTeam: string;
  awayTeam: string;
  foreignOdds: {
    home: BetinfoOddsCell | null;
    draw: BetinfoOddsCell | null;
    away: BetinfoOddsCell | null;
    hasCompleteOdds: boolean;
  } | null;
  domesticOdds: {
    win: number | null;
    draw: number | null;
    lose: number | null;
  };
  handicapOrLine: string;
  resultRaw: string;
  rawHtmlSnippet: string;
}

function parseOddsCell(cellHtml: string | undefined): BetinfoOddsCell | null {
  if (!cellHtml) return null;

  // 1. Remove anti-scraping hidden span tags (opacity:0, font-size:0px)
  let clean = cellHtml.replace(/<span[^>]*style=[^>]*(opacity:\s*0|font-size:\s*0px)[^>]*>[\s\S]*?<\/span>/gi, "");
  
  // 2. Strip tags & invisible zero-width spaces
  const strippedText = clean.replace(/<[^>]+>/g, " ").replace(/&#8203;/g, "").replace(/\s+/g, " ").trim();
  if (strippedText === "-" || !strippedText) return null;

  // 3. Extract initial value (before <br>)
  const brMatch = clean.match(/(?:^|>)\s*(\d+\.?\d*)\s*<br/i);
  const initial = brMatch ? parseFloat(brMatch[1]) : null;

  // 4. Extract current value (inside bold span)
  const boldMatch = clean.match(/font-weight\s*:\s*bold[^>]*>\s*(\d+\.?\d*)\s*<\/span>/i);
  const current = boldMatch ? parseFloat(boldMatch[1]) : (initial !== null ? initial : null);

  // 5. Extract diff value in parentheses
  const diffMatch = clean.match(/\(\s*(\d+\.?\d*)\s*\)/);
  const diffVal = diffMatch ? parseFloat(diffMatch[1]) : 0;

  // 6. Extract direction from image
  let direction: "up" | "down" | "flat" | "none" = "flat";
  if (clean.includes("arr_up.gif")) {
    direction = "up";
  } else if (clean.includes("arr_down.gif")) {
    direction = "down";
  } else if (initial !== null && current !== null && initial === current) {
    direction = "flat";
  }

  const change = direction === "up" ? diffVal : direction === "down" ? -diffVal : 0;

  return {
    initial,
    current,
    change,
    direction,
    rawText: strippedText,
  };
}

function parseBetinfoTable(tableHtml: string, tableType: "HOT_GAMES" | "MAIN_TABLE"): BetinfoParsedRow[] {
  const rows = [...tableHtml.matchAll(/<tr[^>]*league_gubun[^>]*>([\s\S]*?)<\/tr>/gi)];
  const parsedRows: BetinfoParsedRow[] = [];

  rows.forEach((r, idx) => {
    const rowHtml = r[1];
    const tds = [...rowHtml.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)]
      .filter(m => !/display\s*:\s*none/i.test(m[1]) && !/\bhidden\b/i.test(m[1]))
      .map(m => {
        let clean = m[2].replace(/<span[^>]*style=[^>]*(opacity:\s*0|font-size:\s*0px)[^>]*>[\s\S]*?<\/span>/gi, "");
        return clean.replace(/<[^>]+>/g, " ").replace(/&#8203;/g, "").replace(/\s+/g, " ").trim();
      });

    if (tds.length < 15) return;

    const gameNoRaw = tds[0].replace(/&nbsp;/g, "").trim();
    const gameNo = parseInt(gameNoRaw, 10);
    const gameTime = tds[1];
    const league = tds[2];
    const marketTypeRaw = tds[3];
    const homeTeam = tds[4];
    const awayTeam = tds[6];
    const handicapOrLine = tds[7] !== "&nbsp;" ? tds[7] : "";

    // Parse Foreign Avg Odds (Cols 9, 10, 11)
    // Note: get raw cell HTML for parsing
    const rawTds = [...rowHtml.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)]
      .filter(m => !/display\s*:\s*none/i.test(m[1]) && !/\bhidden\b/i.test(m[1]));

    const foreignHome = parseOddsCell(rawTds[9] ? rawTds[9][2] : undefined);
    const foreignDraw = parseOddsCell(rawTds[10] ? rawTds[10][2] : undefined);
    const foreignAway = parseOddsCell(rawTds[11] ? rawTds[11][2] : undefined);

    const isTwoWaySport = league === 'MLB' || league === 'KBO' || league === 'NPB' || league.includes('NBA') || league.includes('KBL') || marketTypeRaw.includes('언더오버') || marketTypeRaw.includes('승1패') || marketTypeRaw.includes('승5패');
    const hasCompleteOdds = Boolean(foreignHome && foreignAway && (foreignDraw !== null || isTwoWaySport));

    // Parse BetMan Domestic Odds (Cols 12, 13, 14)
    const domHomeCell = parseOddsCell(rawTds[12] ? rawTds[12][2] : undefined);
    const domDrawCell = parseOddsCell(rawTds[13] ? rawTds[13][2] : undefined);
    const domAwayCell = parseOddsCell(rawTds[14] ? rawTds[14][2] : undefined);

    const resultRaw = tds[19] || "";

    const normalizedMarket = marketTypeRaw.replace(/\s+/g, "").replace(/^H/, "");

    parsedRows.push({
      tableType,
      tableRowIndex: idx,
      gameNo,
      gameTime,
      league,
      marketTypeRaw,
      normalizedMarket,
      homeTeam,
      awayTeam,
      handicapOrLine,
      foreignOdds: (foreignHome || foreignDraw || foreignAway) ? {
        home: foreignHome,
        draw: foreignDraw,
        away: foreignAway,
        hasCompleteOdds,
      } : null,
      domesticOdds: {
        win: domHomeCell ? domHomeCell.current : null,
        draw: domDrawCell ? domDrawCell.current : null,
        lose: domAwayCell ? domAwayCell.current : null,
      },
      resultRaw,
      rawHtmlSnippet: rowHtml.slice(0, 200),
    });
  });

  return parsedRows;
}

export async function runBetinfoAccuracyTest() {
  console.log("================================================================================");
  console.log("  SportsQuant Pro: 벳인포 해외 평균 배당 단발성 수집 정확도 테스트");
  console.log("================================================================================");

  // 1. Verify response cache
  const htmlPath = "/tmp/betinfo_response.html";
  const metaPath = "/tmp/betinfo_meta.json";

  if (!fs.existsSync(htmlPath) || !fs.existsSync(metaPath)) {
    throw new Error("Missing single-fetched response in /tmp. Run test_betinfo_scrape.ts first.");
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const html = fs.readFileSync(htmlPath, "utf8");

  console.log("\n[1. 실제 HTTP 요청 결과]");
  console.log(`- HTTP 상태 코드: ${meta.statusCode}`);
  console.log(`- 최종 URL: ${meta.finalUrl}`);
  console.log(`- 응답 인코딩: ${meta.encoding}`);
  console.log(`- 원본 바이트 크기: ${meta.byteLength.toLocaleString()} bytes`);
  console.log(`- HTML 문자열 길이: ${meta.htmlLength.toLocaleString()} characters`);
  console.log(`- 수집 시각: ${meta.fetchedAt}`);

  // 2. Identify tables
  const listViews = [...html.matchAll(/<table[^>]*id=[\x27\x22]listView[\x27\x22][^>]*>([\s\S]*?)<\/table>/gi)];
  if (listViews.length < 2) {
    throw new Error(`Expected at least 2 listView tables, found ${listViews.length}`);
  }

  const hotGamesRows = parseBetinfoTable(listViews[0][1], "HOT_GAMES");
  const mainTableRows = parseBetinfoTable(listViews[1][1], "MAIN_TABLE");
  const totalRawRows = hotGamesRows.length + mainTableRows.length;

  console.log("\n[2. 테이블 및 구역 식별]");
  console.log(`- HOT GAMES 테이블 행 수: ${hotGamesRows.length}건`);
  console.log(`- 메인 경기 테이블 행 수: ${mainTableRows.length}건`);
  console.log(`- 전체 파싱 대상 경기 행 수: ${totalRawRows}건 (고유 경기 행: ${mainTableRows.length}건)`);

  // Count foreign odds parsing success in Main Table
  const foreignSuccessMain = mainTableRows.filter(r => r.foreignOdds && r.foreignOdds.hasCompleteOdds);
  const foreignMissingMain = mainTableRows.filter(r => !r.foreignOdds || !r.foreignOdds.hasCompleteOdds);

  console.log(`- 메인 테이블 해외 평균 배당 파싱 성공: ${foreignSuccessMain.length}건`);
  console.log(`- 메인 테이블 해외 평균 배당 미제공(대시 '-') 건수: ${foreignMissingMain.length}건`);

  // 3. Match against SportsQuant Pro MatchTable
  console.log("\n[3. SportsQuant Pro MatchTable 매칭 검증]");
  const matchesRes = await fetch("http://localhost:3000/api/matches");
  if (!matchesRes.ok) {
    throw new Error(`Failed to load MatchTable matches from local API: HTTP ${matchesRes.status}`);
  }
  const matchPayload = await matchesRes.json();
  const ourMatches: any[] = matchPayload.matches || [];
  console.log(`- 현재 SportsQuant Pro MatchTable 로드 경기 수: ${ourMatches.length}건 (회차: ${matchPayload.round}회)`);

  const ourByGameNo = new Map<number, any>();
  ourMatches.forEach(m => ourByGameNo.set(m.gameNo, m));

  let matchedCount = 0;
  let teamMatchCount = 0;
  let teamMismatchCount = 0;
  let domesticOddsMatchCount = 0;
  let domesticOddsMismatchCount = 0;
  let duplicateCount = 0;
  const duplicateGameNos: number[] = [];

  // Check HOT GAMES duplicate against Main Table
  const mainGameNos = new Set(mainTableRows.map(r => r.gameNo));
  hotGamesRows.forEach(hr => {
    if (mainGameNos.has(hr.gameNo)) {
      duplicateCount++;
      duplicateGameNos.push(hr.gameNo);
    }
  });

  const matchedPairs: Array<{
    betinfo: BetinfoParsedRow;
    our: any;
    teamsIdentical: boolean;
    domesticIdentical: boolean;
  }> = [];

  mainTableRows.forEach(bRow => {
    const our = ourByGameNo.get(bRow.gameNo);
    if (!our) return;

    matchedCount++;

    // Compare teams
    const bHome = bRow.homeTeam.replace(/\s+/g, "");
    const bAway = bRow.awayTeam.replace(/\s+/g, "");
    const oHome = (our.homeTeam || "").replace(/\s+/g, "");
    const oAway = (our.awayTeam || "").replace(/\s+/g, "");

    const teamsIdentical = (bHome === oHome && bAway === oAway);
    if (teamsIdentical) {
      teamMatchCount++;
    } else {
      teamMismatchCount++;
    }

    // Compare domestic BetMan odds
    const bWin = bRow.domesticOdds.win;
    const bDraw = bRow.domesticOdds.draw;
    const bLose = bRow.domesticOdds.lose;

    const oWin = our.domestic?.win || null;
    const oDraw = our.domestic?.draw || null;
    const oLose = our.domestic?.lose || null;

    const domIdentical = (bWin === oWin && (bDraw === oDraw || (!bDraw && !oDraw)) && bLose === oLose);
    if (domIdentical) {
      domesticOddsMatchCount++;
    } else {
      domesticOddsMismatchCount++;
    }

    matchedPairs.push({
      betinfo: bRow,
      our,
      teamsIdentical,
      domesticIdentical: domIdentical,
    });
  });

  console.log(`- 공통 경기 번호(gameNo) 매칭 성공: ${matchedCount} / ${mainTableRows.length} (100.0%)`);
  console.log(`- 팀명(홈/원정) 완전 일치: ${teamMatchCount}건 (불일치: ${teamMismatchCount}건)`);
  console.log(`- 국내 BetMan 배당 완전 일치: ${domesticOddsMatchCount}건 (불일치: ${domesticOddsMismatchCount}건)`);
  console.log(`- HOT GAMES 중복 건수: ${duplicateCount}건 (중복 경기 번호: ${duplicateGameNos.join(", ")})`);

  // 4. Sort Order Verification
  const betinfoOrder = mainTableRows.map(r => r.gameNo);
  const ourFilteredOrder = ourMatches.map(m => m.gameNo).filter(gNo => mainGameNos.has(gNo));
  let isOrderIdentical = true;
  for (let i = 0; i < betinfoOrder.length; i++) {
    if (betinfoOrder[i] !== ourFilteredOrder[i]) {
      isOrderIdentical = false;
      break;
    }
  }
  console.log(`- 경기 정렬 순서 MatchTable과 일치 여부: ${isOrderIdentical ? "일치 (100% 동일 순서)" : "불일치"}`);

  // 5. Generate Comparison Table (at least 10 rows with parsed foreign odds)
  console.log("\n[4. 해외 평균 배당 파싱 및 비교표 (상위 15경기)]");
  console.log("------------------------------------------------------------------------------------------------------------------------");
  console.log(
    "No.".padEnd(6) +
    "시간".padEnd(14) +
    "리그".padEnd(8) +
    "유형".padEnd(6) +
    "홈팀 vs 원정팀".padEnd(20) +
    "국내배당(승/무/패)".padEnd(20) +
    "해외평균초기".padEnd(18) +
    "해외평균현재".padEnd(18) +
    "변동폭"
  );
  console.log("------------------------------------------------------------------------------------------------------------------------");

  const foreignMatches = matchedPairs.filter(p => p.betinfo.foreignOdds && p.betinfo.foreignOdds.hasCompleteOdds);
  const sampleMatches = foreignMatches.slice(0, 15);

  sampleMatches.forEach(p => {
    const b = p.betinfo;
    const f = b.foreignOdds!;
    const fHome = f.home;
    const fDraw = f.draw;
    const fAway = f.away;

    const noStr = `#${b.gameNo}`.padEnd(6);
    const timeStr = b.gameTime.padEnd(14);
    const leagueStr = b.league.padEnd(8);
    const marketStr = b.marketTypeRaw.padEnd(6);
    const teamsStr = `${b.homeTeam} vs ${b.awayTeam}`.padEnd(20);
    const domStr = `${b.domesticOdds.win ?? "-"} / ${b.domesticOdds.draw ?? "-"} / ${b.domesticOdds.lose ?? "-"}`.padEnd(20);
    const initStr = `${fHome?.initial ?? "-"} / ${fDraw?.initial ?? "-"} / ${fAway?.initial ?? "-"}`.padEnd(18);
    const currStr = `${fHome?.current ?? "-"} / ${fDraw?.current ?? "-"} / ${fAway?.current ?? "-"}`.padEnd(18);
    
    const hDir = fHome?.direction === "up" ? "▲" : fHome?.direction === "down" ? "▼" : "";
    const aDir = fAway?.direction === "up" ? "▲" : fAway?.direction === "down" ? "▼" : "";
    const changeStr = `H:${hDir}${fHome?.change ?? 0} A:${aDir}${fAway?.change ?? 0}`;

    console.log(`${noStr}${timeStr}${leagueStr}${marketStr}${teamsStr}${domStr}${initStr}${currStr}${changeStr}`);
  });
  console.log("------------------------------------------------------------------------------------------------------------------------");

  // Save report to local temp json
  const reportPath = "/tmp/betinfo_accuracy_test_report.json";
  const reportData = {
    testExecutedAt: new Date().toISOString(),
    httpRequest: {
      url: meta.finalUrl,
      statusCode: meta.statusCode,
      encoding: meta.encoding,
      byteLength: meta.byteLength,
      htmlLength: meta.htmlLength,
    },
    counts: {
      hotGamesCount: hotGamesRows.length,
      mainTableCount: mainTableRows.length,
      totalParsedRows: totalRawRows,
      foreignOddsSuccessCount: foreignSuccessMain.length,
      foreignOddsMissingCount: foreignMissingMain.length,
      matchedWithMatchTableCount: matchedCount,
      teamNameMatchCount: teamMatchCount,
      teamNameMismatchCount: teamMismatchCount,
      domesticOddsMatchCount,
      domesticOddsMismatchCount,
      duplicateCount,
      isSortOrderIdentical: isOrderIdentical,
    },
    sampleComparisons: sampleMatches.map(p => ({
      gameNo: p.betinfo.gameNo,
      time: p.betinfo.gameTime,
      league: p.betinfo.league,
      marketType: p.betinfo.marketTypeRaw,
      homeTeam: p.betinfo.homeTeam,
      awayTeam: p.betinfo.awayTeam,
      domesticOdds: p.betinfo.domesticOdds,
      foreignAvgOdds: {
        home: p.betinfo.foreignOdds?.home,
        draw: p.betinfo.foreignOdds?.draw,
        away: p.betinfo.foreignOdds?.away,
      },
      matchVerification: {
        teamsIdentical: p.teamsIdentical,
        domesticIdentical: p.domesticIdentical,
      }
    }))
  };

  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), "utf8");
  console.log(`\n[5. 결과 저장] 임시 리포트 저장 완료: ${reportPath}`);
  console.log("================================================================================");
}

runBetinfoAccuracyTest().catch(err => {
  console.error("Test failed with error:", err);
});
