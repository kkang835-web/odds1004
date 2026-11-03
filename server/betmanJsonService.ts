import https from 'https';

/**
 * server/betmanJsonService.ts
 * 
 * Formal BetMan Official JSON Integration Module
 * Strictly isolated service for fetching public Proto G101 match schedules and
 * verified real odds change histories without altering existing WiseToto collectors.
 */

/**
 * Robust native HTTPS POST helper for BetMan endpoints.
 * Keeps strict TLS certificate verification intact (rejectUnauthorized: true)
 * while ensuring proper header handling, socket timeout, and retry on transient ECONNRESET.
 */
async function postBetmanJson(urlStr: string, payload: any, retryCount = 2): Promise<any> {
  let lastError: any = null;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const postData = JSON.stringify(payload);

        const req = https.request({
          hostname: u.hostname,
          port: 443,
          path: u.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'Content-Length': Buffer.byteLength(postData),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.betman.co.kr/main/mainPage/gamebuy/gameBuy.do',
            'Connection': 'close'
          },
          timeout: 10000
        }, (res) => {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            return reject(new Error(`BetMan HTTP ${res.statusCode} ${res.statusMessage || ''}`));
          }
          let body = '';
          res.setEncoding('utf8');
          res.on('data', chunk => { body += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              resolve(parsed);
            } catch (err: any) {
              reject(new Error(`BetMan JSON parse failed: ${err.message}`));
            }
          });
        });

        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy(new Error('BetMan request timed out (10s)'));
        });

        req.write(postData);
        req.end();
      });
    } catch (err: any) {
      lastError = err;
      if (attempt < retryCount) {
        // Exponential backoff wait before retrying transient network/TLS resets
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

export interface BetmanRawTooltipRecord {
  LST_USER_ID?: string;
  LST_CHG_DTM: string; // e.g. "20261012224612"
  ACHG_D_ODDS: number;
  BCHG_L_HANDI_RT: number;
  ACHG_D_HANDI_RT: number;
  FST_RGST_DTM?: string;
  BCHG_W_ODDS: number;
  DEL_YN?: string;
  FST_USER_ID?: string;
  BCHG_W_HANDI_RT: number;
  GM_ID: string;
  BCHG_D_ODDS: number;
  BCHG_D_HANDI_RT: number;
  BCHG_BUY_ISOL_CL_VAL?: any;
  ACHG_L_ODDS: number;
  ACHG_W_ODDS: number;
  ACHG_BUY_ISOL_CL_VAL?: any;
  ACHG_L_HANDI_RT: number;
  ACHG_W_HANDI_RT: number;
  BCHG_EVNT_ISOL_CL_CD?: any;
  CHG_DTM: string; // e.g. "20261012224612061149"
  GM_TS: number;
  GM_SEQ: number;
  BCHG_L_ODDS: number;
  ACHG_EVNT_ISOL_CL_CD?: any;
}

export interface BetmanStructuredOddsHistoryPoint {
  eventId: string; // unique event signature e.g. "20261012224612061149_7833"
  timestampKst: string; // ISO 8601 formatted KST string e.g. "2026-10-12T22:46:12+09:00"
  rawChangeDtm: string; // raw CHG_DTM
  beforeOdds: {
    win: number | null;
    draw: number | null;
    lose: number | null;
    handicapOrLine: number | null;
  };
  afterOdds: {
    win: number | null;
    draw: number | null;
    lose: number | null;
    handicapOrLine: number | null;
  };
  rawEncoding: {
    bchgW: number;
    bchgD: number;
    bchgL: number;
    achgW: number;
    achgD: number;
    achgL: number;
  };
}

export interface BetmanStructuredMatch {
  matchSeq: number; // Official game number
  betmanGameKey?: string;
  itemCode: string; // "SC", "BS", "BK", "VB"
  sportCategory: 'soccer' | 'baseball' | 'basketball' | 'volleyball' | 'other';
  leagueCode: string;
  leagueName: string;
  leagueShortName: string;
  gameDateEpoch: number;
  gameDateKst: string;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  betTypId: string;
  betTypNm: string; // "승무패", "승N패", "일반 소수핸디캡", "일반 언더오버", "일반 홀짝"
  betId: string;
  betNm: string; // "축구 승무패", "야구 승1패", "농구 승5패", "야구 핸디캡", "축구 핸디캡", etc.
  marketClassification: '1X2' | 'W1L' | 'W5L' | 'HANDICAP' | 'UNDER_OVER' | 'SUM' | 'OTHER';
  handicapLine: number | null;
  rawOdds: {
    winAllot: number;
    drawAllot: number;
    loseAllot: number;
  };
  standardizedOdds: {
    homeOrUnder: number | null;
    middleOrDraw: number | null;
    awayOrOver: number | null;
  };
  gameReject: string; // "0" normal
  buyReject: string; // "0" normal
  protoStatus: string; // "2": on sale, "3": closed
  isAvailable: boolean;
  oddsHistory: BetmanStructuredOddsHistoryPoint[];
  dataSource: 'betman_official_json';
  collectedAt: string;
}

export interface BetmanProtoRoundResult {
  gmId: string;
  gmTs: number;
  gmOsidTsYear: number;
  gmOsidTs: number;
  totalSellAmount: number;
  saleEndDateEpoch: number;
  selling: boolean;
  collectedAt: string;
  totalMarketCount: number;
  matches: BetmanStructuredMatch[];
}

export interface BetmanAvailableRoundItem {
  gmId: string;
  gameName: string;
  gmTs: number;
  gmOsidTsYear: number;
  gmOsidTs: number;
  totalSellAmount: number;
  selling: boolean;
}

const BETMAN_CACHE_TTL_MS = 60 * 1000; // 60 seconds memory cache
let cachedAvailableRounds: { data: BetmanAvailableRoundItem[]; timestamp: number } | null = null;
const roundMatchesCache = new Map<number, { data: BetmanProtoRoundResult; timestamp: number }>();
const inFlightRequests = new Map<string, Promise<any>>();

/**
 * Parses BetMan 14-digit / 20-digit timestamp into ISO 8601 string in KST (+09:00)
 * Example: "20261012224612" -> "2026-10-12T22:46:12+09:00"
 */
export function parseBetmanDtmToIsoKst(dtmStr: string): string {
  if (!dtmStr || dtmStr.length < 14) return new Date().toISOString();
  const year = dtmStr.slice(0, 4);
  const month = dtmStr.slice(4, 6);
  const day = dtmStr.slice(6, 8);
  const hour = dtmStr.slice(8, 10);
  const min = dtmStr.slice(10, 12);
  const sec = dtmStr.slice(12, 14);
  return `${year}-${month}-${day}T${hour}:${min}:${sec}+09:00`;
}

/**
 * Decodes 100x integer odds safely into a float or null
 * 0 indicates unavailable/non-existent odds slot (e.g. Draw in baseball)
 */
export function decodeBetmanIntOdds(intOdds: number): number | null {
  if (typeof intOdds !== 'number' || isNaN(intOdds) || intOdds <= 0) {
    return null;
  }
  return +(intOdds / 100).toFixed(2);
}

/**
 * Determines market classification from BetMan market name tags
 */
export function classifyMarketType(betTypNm: string, betNm: string): BetmanStructuredMatch['marketClassification'] {
  const combined = `${betTypNm || ''} ${betNm || ''}`.trim();
  if (combined.includes('승1패') || combined.includes('승N패') && combined.includes('야구')) return 'W1L';
  if (combined.includes('승5패') || combined.includes('승N패') && combined.includes('농구')) return 'W5L';
  if (combined.includes('핸디캡')) return 'HANDICAP';
  if (combined.includes('언더오버')) return 'UNDER_OVER';
  if (combined.includes('홀짝') || combined.includes('SUM')) return 'SUM';
  if (combined.includes('승무패') || combined.includes('승패')) return '1X2';
  return 'OTHER';
}

/**
 * Maps itemCode to standard sport category
 */
export function mapItemCodeToSport(itemCode: string): BetmanStructuredMatch['sportCategory'] {
  switch (itemCode?.toUpperCase()) {
    case 'SC': return 'soccer';
    case 'BS': return 'baseball';
    case 'BK': return 'basketball';
    case 'VB': return 'volleyball';
    default: return 'other';
  }
}

/**
 * Transforms raw tooltipList into structured, deduplicated, sorted history per matchSeq
 */
export function structureTooltipHistories(
  tooltips: BetmanRawTooltipRecord[]
): Map<number, BetmanStructuredOddsHistoryPoint[]> {
  const map = new Map<number, BetmanStructuredOddsHistoryPoint[]>();
  if (!Array.isArray(tooltips) || tooltips.length === 0) return map;

  for (const t of tooltips) {
    if (!t || typeof t.GM_SEQ !== 'number') continue;
    const seq = t.GM_SEQ;
    const changeDtm = String(t.CHG_DTM || t.LST_CHG_DTM || '');
    const eventId = `${changeDtm}_${seq}`;

    const point: BetmanStructuredOddsHistoryPoint = {
      eventId,
      timestampKst: parseBetmanDtmToIsoKst(t.LST_CHG_DTM || t.CHG_DTM),
      rawChangeDtm: changeDtm,
      beforeOdds: {
        win: decodeBetmanIntOdds(t.BCHG_W_ODDS),
        draw: decodeBetmanIntOdds(t.BCHG_D_ODDS),
        lose: decodeBetmanIntOdds(t.BCHG_L_ODDS),
        handicapOrLine: typeof t.BCHG_W_HANDI_RT === 'number' && t.BCHG_W_HANDI_RT !== 0 ? t.BCHG_W_HANDI_RT : null
      },
      afterOdds: {
        win: decodeBetmanIntOdds(t.ACHG_W_ODDS),
        draw: decodeBetmanIntOdds(t.ACHG_D_ODDS),
        lose: decodeBetmanIntOdds(t.ACHG_L_ODDS),
        handicapOrLine: typeof t.ACHG_W_HANDI_RT === 'number' && t.ACHG_W_HANDI_RT !== 0 ? t.ACHG_W_HANDI_RT : null
      },
      rawEncoding: {
        bchgW: t.BCHG_W_ODDS,
        bchgD: t.BCHG_D_ODDS,
        bchgL: t.BCHG_L_ODDS,
        achgW: t.ACHG_W_ODDS,
        achgD: t.ACHG_D_ODDS,
        achgL: t.ACHG_L_ODDS
      }
    };

    if (!map.has(seq)) map.set(seq, []);
    map.get(seq)!.push(point);
  }

  // Deduplicate and sort chronologically for each match
  for (const [seq, list] of map.entries()) {
    const seenEventIds = new Set<string>();
    const uniqueList: BetmanStructuredOddsHistoryPoint[] = [];

    for (const item of list) {
      if (!seenEventIds.has(item.eventId)) {
        seenEventIds.add(item.eventId);
        uniqueList.push(item);
      }
    }

    uniqueList.sort((a, b) => a.rawChangeDtm.localeCompare(b.rawChangeDtm));
    map.set(seq, uniqueList);
  }

  return map;
}

/**
 * Converts compSchedules.keys and datas into verified BetmanStructuredMatch list
 */
export function convertCompSchedulesToMatches(
  keys: string[],
  datas: any[][],
  tooltipsMap: Map<number, BetmanStructuredOddsHistoryPoint[]>,
  collectedAt: string
): BetmanStructuredMatch[] {
  if (!Array.isArray(keys) || !Array.isArray(datas) || keys.length !== 52) {
    throw new Error(`Invalid compSchedules structure: expected 52 keys, got ${keys?.length}`);
  }

  const keyIndexMap = new Map<string, number>();
  keys.forEach((k, idx) => keyIndexMap.set(k, idx));

  const getCol = (row: any[], colName: string) => {
    const idx = keyIndexMap.get(colName);
    return idx !== undefined ? row[idx] : undefined;
  };

  const matches: BetmanStructuredMatch[] = [];

  for (let rIdx = 0; rIdx < datas.length; rIdx++) {
    const row = datas[rIdx];
    if (!Array.isArray(row) || row.length !== keys.length) {
      console.warn(`[BetmanJsonService] Row length mismatch at index ${rIdx}: expected ${keys.length}, got ${row?.length}`);
      continue;
    }

    const matchSeq = Number(getCol(row, 'matchSeq'));
    if (isNaN(matchSeq) || matchSeq <= 0) continue;

    const itemCode = String(getCol(row, 'itemCode') || '');
    const sportCategory = mapItemCodeToSport(itemCode);
    const betTypNm = String(getCol(row, 'betTypNm') || '');
    const betNm = String(getCol(row, 'betNm') || '');
    const marketClass = classifyMarketType(betTypNm, betNm);

    const winAllotRaw = Number(getCol(row, 'winAllot') || 0);
    const drawAllotRaw = Number(getCol(row, 'drawAllot') || 0);
    const loseAllotRaw = Number(getCol(row, 'loseAllot') || 0);

    const winAllot = !isNaN(winAllotRaw) ? winAllotRaw : 0;
    const drawAllot = !isNaN(drawAllotRaw) ? drawAllotRaw : 0;
    const loseAllot = !isNaN(loseAllotRaw) ? loseAllotRaw : 0;

    const gameDateEpoch = Number(getCol(row, 'gameDate') || 0);
    const gameDateKst = gameDateEpoch > 0 ? new Date(gameDateEpoch).toISOString() : '';

    const gameReject = String(getCol(row, 'gameReject') ?? '0');
    const buyReject = String(getCol(row, 'buyReject') ?? '0');
    const protoStatus = String(getCol(row, 'protoStatus') ?? '');
    const isAvailable = gameReject === '0' && buyReject === '0' && protoStatus === '2';

    const winHandi = Number(getCol(row, 'winHandi'));
    const loseHandi = Number(getCol(row, 'loseHandi'));
    const handicapLine = !isNaN(winHandi) && winHandi !== 0 ? winHandi : (!isNaN(loseHandi) && loseHandi !== 0 ? loseHandi : null);

    const match: BetmanStructuredMatch = {
      matchSeq,
      betmanGameKey: String(getCol(row, 'gameKey') || ''),
      itemCode,
      sportCategory,
      leagueCode: String(getCol(row, 'leagueCode') || ''),
      leagueName: String(getCol(row, 'leagueName') || ''),
      leagueShortName: String(getCol(row, 'leagueShortName') || ''),
      gameDateEpoch,
      gameDateKst,
      homeId: String(getCol(row, 'homeId') || ''),
      awayId: String(getCol(row, 'awayId') || ''),
      homeName: String(getCol(row, 'homeName') || ''),
      awayName: String(getCol(row, 'awayName') || ''),
      betTypId: String(getCol(row, 'betTypId') || ''),
      betTypNm,
      betId: String(getCol(row, 'betId') || ''),
      betNm,
      marketClassification: marketClass,
      handicapLine,
      rawOdds: {
        winAllot,
        drawAllot,
        loseAllot
      },
      standardizedOdds: {
        homeOrUnder: winAllot > 1.0 ? winAllot : null,
        middleOrDraw: drawAllot > 1.0 ? drawAllot : null,
        awayOrOver: loseAllot > 1.0 ? loseAllot : null
      },
      gameReject,
      buyReject,
      protoStatus,
      isAvailable,
      oddsHistory: tooltipsMap.get(matchSeq) || [],
      dataSource: 'betman_official_json',
      collectedAt
    };

    matches.push(match);
  }

  return matches;
}

/**
 * 1. Queries available buyable Proto games list from BetMan
 * Strict TLS validation maintained (no certificate bypass).
 */
export async function fetchBetmanAvailableProtoRounds(force = false): Promise<BetmanAvailableRoundItem[]> {
  const now = Date.now();
  if (!force && cachedAvailableRounds && (now - cachedAvailableRounds.timestamp < BETMAN_CACHE_TTL_MS)) {
    return cachedAvailableRounds.data;
  }

  const cacheKey = 'available_rounds';
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const fetchPromise = (async () => {
    const url = 'https://www.betman.co.kr/buyPsblGame/inqCacheBuyAbleGameInfoList.do';
    const payload = {
      _sbmInfo: { debugMode: 'false' }
    };

    const json = await postBetmanJson(url, payload, 2);
    if (!json || typeof json !== 'object') {
      throw new Error('BetMan inqCacheBuyAbleGameInfoList returned non-JSON payload');
    }

    if (json.rsMsg?.statusCode !== 'S') {
      throw new Error(`BetMan API returned business failure: ${json.rsMsg?.message || 'Unknown error'}`);
    }

    const protoList = Array.isArray(json.protoGames) ? json.protoGames : [];
    const g101Games: BetmanAvailableRoundItem[] = protoList
      .filter((g: any) => g && g.gmId === 'G101')
      .map((g: any) => ({
        gmId: g.gmId,
        gameName: g.gameName,
        gmTs: Number(g.gmTs),
        gmOsidTsYear: Number(g.gmOsidTsYear),
        gmOsidTs: Number(g.gmOsidTs),
        totalSellAmount: Number(g.totalSellAmount || 0),
        selling: Boolean(g.gameMaster?.selling)
      }));

    cachedAvailableRounds = { data: g101Games, timestamp: Date.now() };
    return g101Games;
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

/**
 * 2. Queries full match schedules and real odds histories for a specific Proto round (gmTs)
 * Strict TLS validation maintained.
 */
export async function fetchBetmanProtoRoundMatches(
  gmTs: number,
  force = false
): Promise<BetmanProtoRoundResult> {
  if (!gmTs || isNaN(gmTs) || gmTs <= 0) {
    throw new Error(`Invalid BetMan gmTs parameter: ${gmTs}`);
  }

  const now = Date.now();
  const cached = roundMatchesCache.get(gmTs);
  if (!force && cached && (now - cached.timestamp < BETMAN_CACHE_TTL_MS)) {
    return cached.data;
  }

  const cacheKey = `round_${gmTs}`;
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const fetchPromise = (async () => {
    const url = 'https://www.betman.co.kr/buyPsblGame/gameInfoInq.do';
    const payload = {
      gmId: 'G101',
      gmTs: Number(gmTs),
      gameYear: '',
      _sbmInfo: { debugMode: 'false' }
    };

    const json = await postBetmanJson(url, payload, 2);
    if (!json || typeof json !== 'object') {
      throw new Error('BetMan gameInfoInq returned non-JSON response');
    }

    if (json.rsMsg?.statusCode !== 'S') {
      throw new Error(`BetMan gameInfoInq returned business status: ${json.rsMsg?.message || 'Unsuccessful'}`);
    }

    const collectedAt = new Date().toISOString();
    const tooltipsMap = structureTooltipHistories(json.tooltipList || []);

    const compSchedules = json.compSchedules;
    if (!compSchedules || !Array.isArray(compSchedules.keys) || !Array.isArray(compSchedules.datas)) {
      throw new Error('BetMan response missing compSchedules keys or datas');
    }

    const matches = convertCompSchedulesToMatches(
      compSchedules.keys,
      compSchedules.datas,
      tooltipsMap,
      collectedAt
    );

    const result: BetmanProtoRoundResult = {
      gmId: 'G101',
      gmTs,
      gmOsidTsYear: Number(json.currentLottery?.gmOsidTsYear || 2026),
      gmOsidTs: Number(json.currentLottery?.gmOsidTs || 0),
      totalSellAmount: Number(json.currentLottery?.totalSellAmount || 0),
      saleEndDateEpoch: Number(json.currentLottery?.saleEndDate || 0),
      selling: json.currentLottery?.saleStatus === 'SaleProgress',
      collectedAt,
      totalMarketCount: matches.length,
      matches
    };

    roundMatchesCache.set(gmTs, { data: result, timestamp: Date.now() });
    return result;
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}
