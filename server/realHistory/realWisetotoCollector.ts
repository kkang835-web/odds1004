import https from "https";
import iconv from "iconv-lite";
import { RealSportType, RealHistoricalMatch, RealHistoricalRound } from "./realHistoryTypes.js";
import { resolveMasterSeq } from "./realMasterSeqResolver.js";
import { parseTotoListResults } from "./realResultMapper.js";
import { validateMatchIntegrity } from "./realIntegrityValidator.js";

function fetchBuffer(url: string, headers: Record<string, string> = {}): Promise<{ status: number; buf: Buffer; cookies: string[] }> {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...headers
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      const setCookies = (res.headers["set-cookie"] || []).map(s => s.split(";")[0]);
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({
          status: res.statusCode || 500,
          buf: Buffer.concat(chunks),
          cookies: setCookies
        });
      });
    }).on("error", () => resolve({ status: 500, buf: Buffer.alloc(0), cookies: [] }));
  });
}

/**
 * Initializes WiseToto AJAX session with nonce/token
 */
async function initWisetotoSession(): Promise<{ cookie: string; ajaxHeaders: Record<string, string> }> {
  const refererUrl = "https://www.wisetoto.com/index.htm?tab_type=toto";
  const r0 = await fetchBuffer(refererUrl);
  const cookie = r0.cookies[0] || "";

  const rNonce = await fetchBuffer("https://www.wisetoto.com/util/common/generateNonce.htm", {
    "Referer": refererUrl,
    "Cookie": cookie
  });
  const nonce = iconv.decode(rNonce.buf, "utf-8").trim();

  await fetchBuffer("https://www.wisetoto.com/util/common/requestToken.htm", {
    "Referer": refererUrl,
    "Cookie": cookie,
    "X-Requested-Token": nonce
  });

  return {
    cookie,
    ajaxHeaders: {
      "Referer": refererUrl,
      "Cookie": cookie,
      "X-Requested-With": "XMLHttpRequest"
    }
  };
}

/**
 * Collects a single real historical round from WiseToto
 */
export async function collectRealHistoricalRound(
  sport: RealSportType,
  year: number,
  round: number,
  session?: { cookie: string; ajaxHeaders: Record<string, string> }
): Promise<RealHistoricalRound> {
  const sess = session || await initWisetotoSession();

  // 1. Fetch Market Data from toto_calc.htm
  const calcUrl = `https://www.wisetoto.com/gameinfo/toto_calc.htm?game_category=${sport}&game_year=${year}&game_round=${round}`;
  const rCalc = await fetchBuffer(calcUrl);
  const calcText = iconv.decode(rCalc.buf, "euc-kr");

  const rows = calcText.match(/<tr bgcolor="#ffffff" style="height: 24px;">[\s\S]*?<\/tr>/gi) || [];
  const marketMatches = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const matchNo = idx + 1;
    const dateMatch = row.match(/<td[^>]*align="center"[^>]*>(\d{2}\.\d{2}\([^)]+\)\s+\d{2}:\d{2})<\/td>/);
    const leagueMatch = row.match(/<td width="10%" align="center">([^<]+)<\/td>/);
    const homeMatch = row.match(/<td width="30%" align="right">([^<]+)<\/td>/);
    const awayMatch = row.match(/<td width="30%" align="left">([^<]+)<\/td>/);

    const c1 = (row.match(/id=["\x27]toto_count\d+_1["\x27][^>]*value=["\x27](\d+)["\x27]/) || [])[1];
    const c2 = (row.match(/id=["\x27]toto_count\d+_2["\x27][^>]*value=["\x27](\d+)["\x27]/) || [])[1];
    const c3 = (row.match(/id=["\x27]toto_count\d+_3["\x27][^>]*value=["\x27](\d+)["\x27]/) || [])[1];

    const countW = c1 ? parseInt(c1, 10) : 0;
    const countD = c2 ? parseInt(c2, 10) : 0;
    const countL = c3 ? parseInt(c3, 10) : 0;
    const totalCount = countW + countD + countL;

    const spanMatches = [...row.matchAll(/<span>\(([\d,]+)\)\s+([\d.]+)%<\/span>/g)];
    const rateW = spanMatches[0] ? parseFloat(spanMatches[0][2]) : (totalCount > 0 ? +(countW / totalCount * 100).toFixed(1) : null);
    const rateD = spanMatches[1] ? parseFloat(spanMatches[1][2]) : (totalCount > 0 ? +(countD / totalCount * 100).toFixed(1) : null);
    const rateL = spanMatches[2] ? parseFloat(spanMatches[2][2]) : (totalCount > 0 ? +(countL / totalCount * 100).toFixed(1) : null);

    marketMatches.push({
      matchNo,
      date: dateMatch ? dateMatch[1].trim() : "",
      league: leagueMatch ? leagueMatch[1].trim() : "",
      homeTeam: homeMatch ? homeMatch[1].trim() : "",
      awayTeam: awayMatch ? awayMatch[1].trim() : "",
      voteRate: { win: rateW, draw: rateD, lose: rateL, winCount: countW, drawCount: countD, loseCount: countL, totalCount }
    });
  }

  // 2. Resolve MasterSeq
  const { masterSeq } = await resolveMasterSeq(sport, year, round, marketMatches, sess.ajaxHeaders);

  // 3. Fetch Results from Archive if MasterSeq resolved
  let resultMatches: any[] = [];
  let resultFetchStatus = 0;
  let resultUrl: string | null = null;

  if (masterSeq) {
    resultUrl = `https://www.wisetoto.com/util/gameinfo/get_toto_list.htm?game_category=${sport}&game_info_master_seq=${masterSeq}&tab_type=toto`;
    const rList = await fetchBuffer(resultUrl, sess.ajaxHeaders);
    resultFetchStatus = rList.status;
    const listText = iconv.decode(rList.buf, "euc-kr");
    resultMatches = parseTotoListResults(listText);
  }

  // 4. Validate and assemble matches
  const seenKeys = new Set<string>();
  const finalMatches: RealHistoricalMatch[] = [];

  let validCount = 0;
  let unavailableCount = 0;
  let mismatchCount = 0;
  let duplicateCount = 0;

  for (const m of marketMatches) {
    const resM = resultMatches.find(r => r.matchNo === m.matchNo) || null;
    const { status, notes } = validateMatchIntegrity({
      sport, year, round, matchNo: m.matchNo, matchDate: m.date, homeTeam: m.homeTeam, awayTeam: m.awayTeam
    }, resM, seenKeys);

    if (status === "VALID") validCount++;
    else if (status === "UNAVAILABLE") unavailableCount++;
    else if (status === "MISMATCH") mismatchCount++;
    else if (status === "DUPLICATE") duplicateCount++;

    const isAvailable = status === "VALID" && resM !== null && resM.outcome !== null;

    finalMatches.push({
      matchId: `${sport}_${year}_${round}_${m.matchNo}`,
      year,
      round,
      sport,
      matchNo: m.matchNo,
      matchDate: m.date,
      league: m.league,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      voteRate: m.voteRate,
      homeScore: isAvailable && resM ? resM.homeScore : null,
      awayScore: isAvailable && resM ? resM.awayScore : null,
      outcomeTag: isAvailable && resM ? resM.outcomeTag : null,
      outcome: isAvailable && resM ? resM.outcome : null,
      masterSeq,
      marketSource: calcUrl,
      resultSource: resultUrl,
      dataSource: isAvailable ? "real" : "unavailable",
      isSimulated: false,
      integrityStatus: status,
      validationNotes: notes.length > 0 ? notes : undefined
    });
  }

  return {
    sport,
    year,
    round,
    masterSeq,
    marketFetchStatus: rCalc.status,
    resultFetchStatus,
    matchCount: finalMatches.length,
    validCount,
    unavailableCount,
    mismatchCount,
    duplicateCount,
    syntheticCount: 0,
    matches: finalMatches,
    collectedAt: new Date().toISOString()
  };
}
