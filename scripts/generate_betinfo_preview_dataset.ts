/**
 * ODDSALGO — 해외 평균 배당 MatchTable 연동 1단계
 * 검증 데이터셋 생성 스크립트 (test-only)
 * 
 * [안전 보장]
 * - 기존 운영 데이터셋, 백업, .env, DB 일체 수정 없음
 * - 단발성 수집 원본(/tmp/betinfo_response.html) 기반 읽기 전용
 * - data/test_betinfo_foreign_odds_dataset.json 및 /tmp에만 생성
 */

import fs from "fs";

export interface VerifiedForeignOddsItem {
  gameNo: number;
  marketType: string;
  homeTeam: string;
  awayTeam: string;
  initialOdds: {
    win: number | null;
    draw: number | null;
    lose: number | null;
  } | null;
  currentOdds: {
    win: number | null;
    draw: number | null;
    lose: number | null;
  } | null;
  oddsChange: {
    win: number | null;
    draw: number | null;
    lose: number | null;
    direction: {
      home: "up" | "down" | "flat" | "none";
      draw: "up" | "down" | "flat" | "none";
      away: "up" | "down" | "flat" | "none";
    };
  } | null;
  status: "OK" | "NOT_PROVIDED" | "PARSE_ERROR" | "MATCH_ERROR";
  scrapedAt: string;
  matchVerification?: {
    matchedGameNo: boolean;
    teamNameMatched: boolean;
    league: string;
    isTwoWay: boolean;
    domesticOddsMatched: boolean;
  };
}

function parseCell(cellHtml: string | undefined): {
  initial: number | null;
  current: number | null;
  change: number | null;
  direction: "up" | "down" | "flat" | "none";
  isProvided: boolean;
  isParseError: boolean;
} {
  if (!cellHtml) {
    return { initial: null, current: null, change: null, direction: "none", isProvided: false, isParseError: false };
  }

  // Remove anti-scraping hidden span tags
  const clean = cellHtml.replace(/<span[^>]*style=[^>]*(opacity:\s*0|font-size:\s*0px)[^>]*>[\s\S]*?<\/span>/gi, "");
  const stripped = clean.replace(/<[^>]+>/g, " ").replace(/&#8203;/g, "").replace(/\s+/g, " ").trim();

  if (stripped === "-" || !stripped) {
    return { initial: null, current: null, change: null, direction: "none", isProvided: false, isParseError: false };
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
    const direction: "up" | "down" | "flat" | "none" = isUp ? "up" : isDown ? "down" : "flat";

    if (initial === null || current === null) {
      return { initial, current, change: null, direction, isProvided: true, isParseError: true };
    }

    const calculatedDiff = parseFloat((current - initial).toFixed(2));
    const finalChange = rawDiff !== null ? (isDown ? -rawDiff : rawDiff) : calculatedDiff;

    return {
      initial,
      current,
      change: finalChange,
      direction,
      isProvided: true,
      isParseError: false,
    };
  } catch {
    return { initial: null, current: null, change: null, direction: "none", isProvided: true, isParseError: true };
  }
}

export async function generateVerifiedDataset() {
  const htmlPath = "/tmp/betinfo_response.html";
  const metaPath = "/tmp/betinfo_meta.json";

  if (!fs.existsSync(htmlPath) || !fs.existsSync(metaPath)) {
    throw new Error("Missing single-fetched response in /tmp. Required files not found.");
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const html = fs.readFileSync(htmlPath, "utf8");

  // Fetch current MatchTable matches from local API for verification
  let ourByGameNo = new Map<number, any>();
  try {
    const res = await fetch("http://localhost:3000/api/matches");
    if (res.ok) {
      const data = await res.json();
      (data.matches || []).forEach((m: any) => ourByGameNo.set(m.gameNo, m));
    }
  } catch (e) {
    console.warn("Could not fetch /api/matches, continuing with offline matching");
  }

  const listViews = [...html.matchAll(/<table[^>]*id=[\x27\x22]listView[\x27\x22][^>]*>([\s\S]*?)<\/table>/gi)];
  if (listViews.length < 2) {
    throw new Error("Could not find Main Table in HTML");
  }

  const mainTable = listViews[1][1];
  const mainRows = [...mainTable.matchAll(/<tr[^>]*league_gubun[^>]*>([\s\S]*?)<\/tr>/gi)];

  const dataset: VerifiedForeignOddsItem[] = [];

  let countOK = 0;
  let countNotProvided = 0;
  let countParseError = 0;
  let countMatchError = 0;

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

    const isTwoWay = league === 'MLB' || league === 'KBO' || league === 'NPB' ||
                     league.includes('NBA') || league.includes('KBL') ||
                     marketTypeRaw.includes('언더오버') || marketTypeRaw.includes('승1패') || marketTypeRaw.includes('승5패');

    // Parse foreign cells (9, 10, 11)
    const homeParsed = parseCell(tds[9] ? tds[9][2] : undefined);
    const drawParsed = parseCell(tds[10] ? tds[10][2] : undefined);
    const awayParsed = parseCell(tds[11] ? tds[11][2] : undefined);

    // Cross check with our MatchTable
    const our = ourByGameNo.get(gameNo);
    let matchedGameNo = Boolean(our);
    let teamNameMatched = false;
    let domesticOddsMatched = false;

    if (our) {
      const bHome = homeTeam.replace(/\s+/g, "");
      const bAway = awayTeam.replace(/\s+/g, "");
      const oHome = (our.homeTeam || "").replace(/\s+/g, "");
      const oAway = (our.awayTeam || "").replace(/\s+/g, "");
      teamNameMatched = (bHome === oHome && bAway === oAway);

      const dWin = our.domestic?.win || null;
      const dDraw = our.domestic?.draw || null;
      const dLose = our.domestic?.lose || null;
      const domCellHome = parseCell(tds[12] ? tds[12][2] : undefined);
      const domCellDraw = parseCell(tds[13] ? tds[13][2] : undefined);
      const domCellAway = parseCell(tds[14] ? tds[14][2] : undefined);
      domesticOddsMatched = (domCellHome.current === dWin && (domCellDraw.current === dDraw || (!domCellDraw.current && !dDraw)) && domCellAway.current === dLose);
    }

    // Determine status
    let status: "OK" | "NOT_PROVIDED" | "PARSE_ERROR" | "MATCH_ERROR" = "NOT_PROVIDED";

    if (matchedGameNo && !teamNameMatched) {
      status = "MATCH_ERROR";
      countMatchError++;
    } else if (homeParsed.isParseError || drawParsed.isParseError || awayParsed.isParseError) {
      status = "PARSE_ERROR";
      countParseError++;
    } else if (homeParsed.isProvided && awayParsed.isProvided && (drawParsed.isProvided || isTwoWay)) {
      status = "OK";
      countOK++;
    } else {
      status = "NOT_PROVIDED";
      countNotProvided++;
    }

    const hasOdds = status === "OK";

    dataset.push({
      gameNo,
      marketType: marketTypeRaw.replace(/\s+/g, ""),
      homeTeam,
      awayTeam,
      initialOdds: hasOdds ? {
        win: homeParsed.initial,
        draw: isTwoWay ? null : drawParsed.initial,
        lose: awayParsed.initial,
      } : null,
      currentOdds: hasOdds ? {
        win: homeParsed.current,
        draw: isTwoWay ? null : drawParsed.current,
        lose: awayParsed.current,
      } : null,
      oddsChange: hasOdds ? {
        win: homeParsed.change,
        draw: isTwoWay ? null : drawParsed.change,
        lose: awayParsed.change,
        direction: {
          home: homeParsed.direction,
          draw: isTwoWay ? "none" : drawParsed.direction,
          away: awayParsed.direction,
        }
      } : null,
      status,
      scrapedAt: meta.fetchedAt,
      matchVerification: {
        matchedGameNo,
        teamNameMatched,
        league,
        isTwoWay,
        domesticOddsMatched,
      }
    });
  });

  const targetPath1 = "data/test_betinfo_foreign_odds_dataset.json";
  const targetPath2 = "/tmp/test_betinfo_foreign_odds_dataset.json";

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceFile: htmlPath,
    scrapedAt: meta.fetchedAt,
    totalCount: dataset.length,
    counts: {
      OK: countOK,
      NOT_PROVIDED: countNotProvided,
      PARSE_ERROR: countParseError,
      MATCH_ERROR: countMatchError,
    },
    items: dataset,
  };

  fs.writeFileSync(targetPath1, JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(targetPath2, JSON.stringify(payload, null, 2), "utf8");

  console.log(`[Success] Verified dataset generated:`);
  console.log(`- File 1: ${targetPath1}`);
  console.log(`- File 2: ${targetPath2}`);
  console.log(`- Total Games: ${dataset.length}`);
  console.log(`- OK (정상 해외평균배당): ${countOK}`);
  console.log(`- NOT_PROVIDED (미제공 대시): ${countNotProvided}`);
  console.log(`- PARSE_ERROR (파싱오류): ${countParseError}`);
  console.log(`- MATCH_ERROR (매칭실패): ${countMatchError}`);
}

generateVerifiedDataset().catch(console.error);
