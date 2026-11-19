import * as cheerio from 'cheerio';

/**
 * Multi-Site Anti-Block HTML/DOM Scraper (Zero Private API Endpoints)
 *
 * Targets:
 *  1. killtoto.com (SSR HTML + HTML fragment tabs): Proto schedule, domestic odds,
 *     odds history ticks, betting vote rates, stadium, recent 5/30 form, H2H,
 *     league standings, and player leaders.
 *  2. www.scorebase.kr/odds?sport=betman (HTML probe + Cloudflare challenge guard):
 *     Never hits private JSON APIs; detects Cloudflare 403/Turnstile and trips
 *     a per-host circuit breaker immediately so requests never hammer or get blocked.
 *  3. app.betsgo-sports.com/live (HTML probe + CSR SPA shell guard):
 *     Never hits Betsgo's private backend APIs; respects HTML-only constraint and
 *     marks CSR-only shell cleanly without retry storms.
 */

export interface HostAntiBlockState {
  host: string;
  status: 'HEALTHY' | 'CIRCUIT_OPEN_CLOUDFLARE' | 'CIRCUIT_OPEN_RATE_LIMIT' | 'CSR_SHELL_NO_BROWSER' | 'DEGRADED';
  consecutiveFailures: number;
  circuitOpenUntil: number | null;
  lastCheckedAt: string | null;
  lastStatusCode: number | null;
  lastNote: string;
  requestsSent: number;
  cacheHits: number;
}

export interface KilltotoProtoMatch {
  matchSeq: number;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  leagueName: string;
  leagueCode: string;
  stadium?: string;
  gameDate: string;
  homeScore?: number | null;
  awayScore?: number | null;
  score?: string;
  betTypeName: string;
  handicap: number;
  allot: { win?: number; draw?: number; lose?: number };
  vote?: { win?: number; draw?: number; lose?: number; total?: number };
  oddsHist?: Array<[number, number, number, number]>;
  outcome?: string;
  analysisPath?: string | null;
  analysisId?: number | null;
  analysisSport?: 'SC' | 'BK' | 'BS' | null;
}

export interface KilltotoRoundResult {
  source: 'killtoto_ssr_html';
  gmTs: number;
  round: number;
  year: number;
  roundLabel: string;
  saleStartAt?: string;
  saleEndAt?: string;
  live?: boolean;
  fetchedAt: string;
  matches: KilltotoProtoMatch[];
}

export interface KilltotoRecentGame {
  date: string;
  league: string;
  isHome: boolean;
  opponent: string;
  result: '승' | '무' | '패';
  score: string;
  scoreFor: number;
  scoreAgainst: number;
  oddsText?: string;
}

export interface KilltotoLeaderItem {
  category: string;
  homePlayer?: { name: string; value: string; position?: string };
  awayPlayer?: { name: string; value: string; position?: string };
}

export interface KilltotoStandingRow {
  rank: number;
  team: string;
  played: number;
  win: number;
  draw: number;
  lose: number;
  winPct?: string;
  avgFor?: number;
  avgAgainst?: number;
  diff?: string;
  homeRecord?: string;
  awayRecord?: string;
  last5?: string[];
}

export interface KilltotoAnalysisDetail {
  analysisUrl: string;
  fetchedAt: string;
  sport: 'SC' | 'BK' | 'BS';
  homeRecent: KilltotoRecentGame[];
  awayRecent: KilltotoRecentGame[];
  h2hMatches: Array<{
    date: string;
    league: string;
    isHome: boolean;
    result: string;
    score: string;
    scoreFor: number;
    scoreAgainst: number;
  }>;
  standings: KilltotoStandingRow[];
  leaders: KilltotoLeaderItem[];
  foreignSampleStats?: {
    handicapSampleText?: string;
    uoSampleText?: string;
  };
}

// ============================================================================
// Anti-Block Infrastructure: Jitter Rate Limiter, UA Pool, Cache, Circuit Breaker
// ============================================================================

const DESKTOP_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
];

let uaCursor = 0;
function nextUserAgent(): string {
  const ua = DESKTOP_USER_AGENTS[uaCursor % DESKTOP_USER_AGENTS.length];
  uaCursor++;
  return ua;
}

const hostStates = new Map<string, HostAntiBlockState>();
const hostLastRequestAt = new Map<string, number>();
const hostTailQueue = new Map<string, Promise<void>>();
const inFlightFetches = new Map<string, Promise<any>>();

interface CacheRecord<T> {
  data: T;
  fetchedAt: number;
  expiresAt: number;
  staleUntil: number;
}

const htmlDataCache = new Map<string, CacheRecord<any>>();

function getOrCreateHostState(host: string): HostAntiBlockState {
  let st = hostStates.get(host);
  if (!st) {
    st = {
      host,
      status: 'HEALTHY',
      consecutiveFailures: 0,
      circuitOpenUntil: null,
      lastCheckedAt: null,
      lastStatusCode: null,
      lastNote: '초기 대기 상태',
      requestsSent: 0,
      cacheHits: 0
    };
    hostStates.set(host, st);
  }
  return st;
}

/**
 * Per-host serialized spacing + human-like randomized jitter (600ms ~ 1400ms).
 * Prevents burst scraping bursts that trigger WAF / IP blocks.
 */
async function scheduleHostSlot(host: string, minGapMs = 650, jitterMs = 650): Promise<void> {
  const prev = hostTailQueue.get(host) || Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>(resolve => {
    release = resolve;
  });
  hostTailQueue.set(host, next);

  await prev;
  try {
    const last = hostLastRequestAt.get(host) || 0;
    const waitTarget = minGapMs + Math.floor(Math.random() * jitterMs);
    const elapsed = Date.now() - last;
    if (elapsed < waitTarget) {
      await new Promise(r => setTimeout(r, waitTarget - elapsed));
    }
    hostLastRequestAt.set(host, Date.now());
  } finally {
    release();
  }
}

function isCloudflareChallengeHtml(status: number, body: string): boolean {
  if (status === 403 || status === 503) {
    const low = body.toLowerCase();
    if (
      low.includes('just a moment') ||
      low.includes('challenges.cloudflare.com') ||
      low.includes('cf-browser-verification') ||
      low.includes('attention required! | cloudflare')
    ) {
      return true;
    }
  }
  return false;
}

function isCsrEmptyShell(body: string): boolean {
  const cleanLen = body.replace(/\s+/g, ' ').trim().length;
  const hasAppMount =
    body.includes('<div id="root"') ||
    body.includes('<div id="app"') ||
    body.includes('id="__nuxt"') ||
    body.includes('_app/immutable') ||
    body.includes('__sveltekit') ||
    body.includes('display: contents');
  const hasNoTables = !body.includes('<table') && !body.includes('"matchSeq"') && !body.includes('"scMap"');
  return cleanLen < 7000 && hasNoTables && (hasAppMount || body.includes('<script type="module"'));
}

/**
 * Fetches HTML respectfully with per-host rate limiting, UA rotation,
 * single-flight deduplication, stale-while-revalidate cache, and circuit breaker.
 */
async function fetchHtmlAntiBlock(
  url: string,
  options: {
    referer?: string;
    timeoutMs?: number;
    minGapMs?: number;
    bypassCache?: boolean;
  } = {}
): Promise<{ ok: boolean; status: number; html: string; blockedReason?: string }> {
  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const st = getOrCreateHostState(host);

  // Circuit breaker check
  if (st.circuitOpenUntil && Date.now() < st.circuitOpenUntil) {
    return {
      ok: false,
      status: st.lastStatusCode || 403,
      html: '',
      blockedReason: `CIRCUIT_OPEN (${st.status})`
    };
  }

  // Deduplicate concurrent identical HTML requests
  const flightKey = `GET:${url}`;
  if (!options.bypassCache && inFlightFetches.has(flightKey)) {
    return inFlightFetches.get(flightKey)!;
  }

  const execPromise = (async () => {
    await scheduleHostSlot(host, options.minGapMs ?? 650, 650);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 6500);
    st.requestsSent++;
    st.lastCheckedAt = new Date().toISOString();

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': nextUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Referer': options.referer || `${parsedUrl.origin}/`
        },
        signal: controller.signal
      });

      const html = await res.text();
      st.lastStatusCode = res.status;

      if (res.status === 429) {
        st.consecutiveFailures++;
        const backoffMs = Math.min(30 * 60 * 1000, 3 * 60 * 1000 * Math.pow(2, st.consecutiveFailures - 1));
        st.status = 'CIRCUIT_OPEN_RATE_LIMIT';
        st.circuitOpenUntil = Date.now() + backoffMs;
        st.lastNote = `HTTP 429 레이트 리밋 감지 — ${Math.round(backoffMs / 60000)}분간 요청 중단`;
        return { ok: false, status: res.status, html: '', blockedReason: st.lastNote };
      }

      if (isCloudflareChallengeHtml(res.status, html)) {
        st.consecutiveFailures++;
        st.status = 'CIRCUIT_OPEN_CLOUDFLARE';
        st.circuitOpenUntil = Date.now() + 20 * 60 * 1000;
        st.lastNote = 'Cloudflare JS/Turnstile 챌린지(403) 감지 — 차단 방지를 위해 20분 쿨다운 전환 (API 미사용)';
        return { ok: false, status: res.status, html: '', blockedReason: st.lastNote };
      }

      if (!res.ok) {
        st.consecutiveFailures++;
        if (st.consecutiveFailures >= 3) {
          st.status = 'DEGRADED';
          st.circuitOpenUntil = Date.now() + 5 * 60 * 1000;
        }
        st.lastNote = `HTTP ${res.status} 응답 오류`;
        return { ok: false, status: res.status, html: '', blockedReason: st.lastNote };
      }

      if (host.includes('betsgo-sports.com') && isCsrEmptyShell(html)) {
        st.status = 'CSR_SHELL_NO_BROWSER';
        st.circuitOpenUntil = Date.now() + 15 * 60 * 1000;
        st.lastNote = 'CSR 전용 SPA HTML(3KB) 확인 — 사설 JSON API 미사용 원칙 준수로 HTML 직접 파싱 보류';
        return { ok: false, status: res.status, html, blockedReason: st.lastNote };
      }

      // Healthy HTML response
      st.consecutiveFailures = 0;
      st.circuitOpenUntil = null;
      st.status = 'HEALTHY';
      st.lastNote = `정상 SSR HTML 수신 (${html.length.toLocaleString()} bytes)`;
      return { ok: true, status: res.status, html };
    } catch (err: any) {
      st.consecutiveFailures++;
      if (st.consecutiveFailures >= 3) {
        st.status = 'DEGRADED';
        st.circuitOpenUntil = Date.now() + 5 * 60 * 1000;
      }
      st.lastNote = err?.name === 'AbortError' ? '요청 타임아웃' : (err?.message || '네트워크 오류');
      return { ok: false, status: 0, html: '', blockedReason: st.lastNote };
    } finally {
      clearTimeout(timer);
      inFlightFetches.delete(flightKey);
    }
  })();

  if (!options.bypassCache) {
    inFlightFetches.set(flightKey, execPromise);
  }
  return execPromise;
}

// ============================================================================
// Killtoto SSR HTML & Fragment Parsers
// ============================================================================

/**
 * Extracts a balanced JSON literal object from an inline HTML <script> after a token such as "round:".
 */
function extractBalancedJsonObject(scriptText: string, markerRegex: RegExp): any | null {
  const m = markerRegex.exec(scriptText);
  if (!m) return null;
  let start = m.index + m[0].length;
  while (start < scriptText.length && /\s/.test(scriptText[start])) start++;
  if (scriptText[start] !== '{') return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < scriptText.length; i++) {
    const ch = scriptText[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const jsonStr = scriptText.slice(start, i + 1);
        try {
          return JSON.parse(jsonStr);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function formatKilltotoGmTs(year: number, round: number): number {
  const yy = year >= 2000 ? year % 100 : year;
  return yy * 10000 + round;
}

/**
 * Scrapes Killtoto's SSR HTML Proto page (/proto/G101/{gmTs} or /proto).
 * Zero API calls: parses embedded SSR script state directly from HTML.
 */
export async function scrapeKilltotoProtoRound(
  year?: number,
  round?: number,
  forceRefresh = false
): Promise<KilltotoRoundResult | null> {
  const gmTs = year && round ? formatKilltotoGmTs(year, round) : 0;
  const cacheKey = `killtoto_round_${gmTs || 'live'}`;
  const now = Date.now();
  const cached = htmlDataCache.get(cacheKey);

  if (!forceRefresh && cached) {
    if (now < cached.expiresAt) {
      const st = getOrCreateHostState('killtoto.com');
      st.cacheHits++;
      return cached.data;
    }
  }

  const targetUrl = gmTs > 0
    ? `https://killtoto.com/proto/G101/${gmTs}`
    : `https://killtoto.com/proto`;

  const res = await fetchHtmlAntiBlock(targetUrl, {
    referer: 'https://killtoto.com/proto',
    timeoutMs: 7500,
    minGapMs: 700,
    bypassCache: forceRefresh
  });

  if (!res.ok || !res.html) {
    if (cached && now < cached.staleUntil) {
      return cached.data;
    }
    return null;
  }

  const $ = cheerio.load(res.html);
  let targetScript = '';
  $('script').each((_, el) => {
    const content = $(el).html() || '';
    if (content.includes('function resultView') && content.includes('"matchSeq"')) {
      targetScript = content;
    }
  });

  if (!targetScript) {
    if (cached && now < cached.staleUntil) return cached.data;
    return null;
  }

  const roundObj = extractBalancedJsonObject(targetScript, /\bround\s*:\s*/);
  if (!roundObj || !Array.isArray(roundObj.matches)) {
    if (cached && now < cached.staleUntil) return cached.data;
    return null;
  }

  const scMap = extractBalancedJsonObject(targetScript, /\bscMap\s*:\s*/) || {};
  const bbMap = extractBalancedJsonObject(targetScript, /\bbbMap\s*:\s*/) || {};

  const parsedMatches: KilltotoProtoMatch[] = roundObj.matches.map((m: any) => {
    const leagueCode = String(m.leagueCode || '');
    const mapKey = `${leagueCode}|${m.homeId}|${m.awayId}|${m.gameDate}`;
    let analysisPath: string | null = null;
    let analysisId: number | null = null;
    let analysisSport: 'SC' | 'BK' | 'BS' | null = null;

    if (['BS001', 'BS002', 'BS004'].includes(leagueCode) && m.homeId && m.awayId && m.gameDate) {
      const kst = new Date(new Date(m.gameDate).getTime() + 9 * 3600 * 1000);
      const ymd = kst.toISOString().slice(0, 10).replace(/-/g, '');
      const bkId = bbMap && !Array.isArray(bbMap) ? bbMap[mapKey] : null;
      analysisPath = `/baseball/analysis/${bkId || `${ymd}${m.awayId}${m.homeId}0`}`;
      analysisSport = 'BS';
    } else if (scMap && scMap[mapKey]) {
      const entry = scMap[mapKey];
      if (typeof entry === 'object' && entry.id) {
        analysisId = Number(entry.id);
        analysisSport = entry.sp === 'BK' ? 'BK' : 'SC';
        analysisPath = entry.sp === 'BK'
          ? `/basketball/analysis/${entry.id}`
          : `/soccer/analysis/${entry.id}`;
      } else if (typeof entry === 'number' || typeof entry === 'string') {
        analysisId = Number(entry);
        analysisSport = 'SC';
        analysisPath = `/soccer/analysis/${entry}`;
      }
    }

    return {
      matchSeq: Number(m.matchSeq),
      homeId: String(m.homeId || ''),
      awayId: String(m.awayId || ''),
      homeName: String(m.homeName || '').trim(),
      awayName: String(m.awayName || '').trim(),
      leagueName: String(m.leagueName || '').trim(),
      leagueCode,
      stadium: m.stadium ? String(m.stadium).trim() : undefined,
      gameDate: String(m.gameDate || ''),
      homeScore: typeof m.homeScore === 'number' ? m.homeScore : null,
      awayScore: typeof m.awayScore === 'number' ? m.awayScore : null,
      score: m.score ? String(m.score) : undefined,
      betTypeName: String(m.betTypeName || '').trim(),
      handicap: Number(m.handicap || 0),
      allot: {
        win: typeof m.allot?.win === 'number' ? m.allot.win : undefined,
        draw: typeof m.allot?.draw === 'number' && m.allot.draw > 0 ? m.allot.draw : undefined,
        lose: typeof m.allot?.lose === 'number' ? m.allot.lose : undefined
      },
      vote: m.vote ? {
        win: Number(m.vote.win || 0),
        draw: Number(m.vote.draw || 0),
        lose: Number(m.vote.lose || 0),
        total: Number(m.vote.total || 0)
      } : undefined,
      oddsHist: Array.isArray(m.oddsHist) ? m.oddsHist : undefined,
      outcome: m.outcome ? String(m.outcome) : undefined,
      analysisPath,
      analysisId,
      analysisSport
    };
  });

  const result: KilltotoRoundResult = {
    source: 'killtoto_ssr_html',
    gmTs: Number(roundObj.gmTs || gmTs),
    round: Number(roundObj.round || round || 0),
    year: Number(roundObj.roundYear || year || new Date().getFullYear()),
    roundLabel: String(roundObj.roundLabel || ''),
    saleStartAt: roundObj.saleStartAt,
    saleEndAt: roundObj.saleEndAt,
    live: Boolean(roundObj.live),
    fetchedAt: new Date().toISOString(),
    matches: parsedMatches
  };

  htmlDataCache.set(cacheKey, {
    data: result,
    fetchedAt: now,
    expiresAt: now + 3 * 60 * 1000, // 3 min fresh
    staleUntil: now + 30 * 60 * 1000 // 30 min stale fallback
  });

  // Also index by exact resolved gmTs when fetched via /proto
  if (!gmTs && result.gmTs) {
    htmlDataCache.set(`killtoto_round_${result.gmTs}`, {
      data: result,
      fetchedAt: now,
      expiresAt: now + 3 * 60 * 1000,
      staleUntil: now + 30 * 60 * 1000
    });
  }

  return result;
}

function parseScorePair(scoreText: string): { s1: number; s2: number } | null {
  const m = String(scoreText || '').match(/(\d+)\s*[:\-]\s*(\d+)/);
  if (!m) return null;
  return { s1: parseInt(m[1], 10), s2: parseInt(m[2], 10) };
}

function parseKilltotoBasketballRecentHtml(html: string): {
  homeRecent: KilltotoRecentGame[];
  awayRecent: KilltotoRecentGame[];
} {
  const $ = cheerio.load(html);
  const rcSection = $('[data-rc="승패"]').first();
  const tables = (rcSection.length ? rcSection.find('table.an-t') : $('table.an-t')).toArray();

  const extractTable = (tbl: any, limit = 10): KilltotoRecentGame[] => {
    const out: KilltotoRecentGame[] = [];
    $(tbl).find('tbody tr').each((_, tr) => {
      if (out.length >= limit) return;
      const tds = $(tr).find('td');
      if (tds.length < 7) return;
      const date = $(tds[0]).text().trim();
      const league = $(tds[1]).text().trim();
      const loc = $(tds[2]).text().trim();
      const opponent = $(tds[3]).text().trim();
      const oddsText = $(tds[4]).text().trim();
      const resRaw = $(tds[5]).text().trim();
      const scoreRaw = $(tds[6]).text().trim();
      const sp = parseScorePair(scoreRaw);
      if (!sp) return;
      const isHome = loc.includes('홈');
      // In Killtoto basketball recent table, score is listed TeamScore:OppScore or Home:Away — check result letter
      let scoreFor = sp.s1;
      let scoreAgainst = sp.s2;
      const resChar: '승' | '무' | '패' = resRaw.includes('승') ? '승' : resRaw.includes('무') ? '무' : '패';
      if (resChar === '승' && scoreFor < scoreAgainst) {
        [scoreFor, scoreAgainst] = [scoreAgainst, scoreFor];
      } else if (resChar === '패' && scoreFor > scoreAgainst) {
        [scoreFor, scoreAgainst] = [scoreAgainst, scoreFor];
      }
      out.push({
        date,
        league,
        isHome,
        opponent,
        result: resChar,
        score: `${scoreFor}:${scoreAgainst}`,
        scoreFor,
        scoreAgainst,
        oddsText
      });
    });
    return out;
  };

  return {
    homeRecent: tables[0] ? extractTable(tables[0], 10) : [],
    awayRecent: tables[1] ? extractTable(tables[1], 10) : []
  };
}

function parseKilltotoBasketballH2hHtml(html: string) {
  const $ = cheerio.load(html);
  const hhSection = $('[data-hh="승패"]').first();
  const table = (hhSection.length ? hhSection.find('table.an-t') : $('table.an-t')).first();
  const matches: KilltotoAnalysisDetail['h2hMatches'] = [];

  table.find('tbody tr').each((_, tr) => {
    if (matches.length >= 10) return;
    const tds = $(tr).find('td');
    if (tds.length < 6) return;
    const date = $(tds[0]).text().trim();
    const league = $(tds[1]).text().trim();
    const loc = $(tds[2]).text().trim();
    const resRaw = $(tds[4]).text().trim();
    const scoreRaw = $(tds[5]).text().trim();
    const sp = parseScorePair(scoreRaw);
    if (!sp) return;
    matches.push({
      date,
      league,
      isHome: loc.includes('홈'),
      result: resRaw.includes('승') ? '홈승' : resRaw.includes('무') ? '무' : '원정승',
      score: `${sp.s1}:${sp.s2}`,
      scoreFor: sp.s1,
      scoreAgainst: sp.s2
    });
  });

  return matches;
}

function parseKilltotoRankHtml(html: string): KilltotoStandingRow[] {
  const $ = cheerio.load(html);
  const rows: KilltotoStandingRow[] = [];
  $('table.kr-t tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 6) return;
    const rankNum = parseInt($(tds[0]).text().trim(), 10);
    if (!Number.isFinite(rankNum)) return;
    const team = $(tds[1]).text().trim();
    const texts = tds.map((__, td) => $(td).text().trim()).get();

    // Handle either separate columns (played, win, draw, lose) OR combined "11-3" win-lose cell
    let played = 0;
    let win = 0;
    let draw = 0;
    let lose = 0;
    const col2 = texts[2] || '';
    const wlMatch = col2.match(/^(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?$/);
    if (wlMatch) {
      win = parseInt(wlMatch[1], 10) || 0;
      if (wlMatch[3] !== undefined) {
        draw = parseInt(wlMatch[2], 10) || 0;
        lose = parseInt(wlMatch[3], 10) || 0;
      } else {
        lose = parseInt(wlMatch[2], 10) || 0;
      }
      played = win + draw + lose;
    } else {
      played = parseInt(texts[2], 10) || 0;
      win = parseInt(texts[3], 10) || 0;
      lose = parseInt(texts[4], 10) || 0;
    }

    const avgForIdx = texts.findIndex((t, idx) => idx >= 4 && /^\d{2,3}(\.\d+)?$/.test(t));
    const avgFor = avgForIdx >= 0 ? parseFloat(texts[avgForIdx]) : undefined;
    const avgAgainst = avgForIdx >= 0 && texts[avgForIdx + 1] && /^\d{2,3}(\.\d+)?$/.test(texts[avgForIdx + 1])
      ? parseFloat(texts[avgForIdx + 1])
      : undefined;

    const last5: string[] = [];
    $(tr).find('.kr-l5 i').each((__, icon) => {
      const ch = $(icon).text().trim();
      if (ch) last5.push(ch);
    });
    if (last5.length === 0) {
      const formCell = texts.find(t => /^[승무패]{3,5}$/.test(t));
      if (formCell) {
        for (const ch of formCell) last5.push(ch);
      }
    }

    rows.push({
      rank: rankNum,
      team,
      played,
      win,
      draw,
      lose,
      avgFor,
      avgAgainst,
      last5: last5.slice(0, 5)
    });
  });
  return rows;
}

function parseKilltotoPlayersHtml(html: string): KilltotoLeaderItem[] {
  const $ = cheerio.load(html);
  const leaders: KilltotoLeaderItem[] = [];
  $('.kp-ld').each((_, el) => {
    const category = $(el).find('.lb').first().text().trim();
    const hName = $(el).find('.side.h .nm').first().text().trim();
    const hVal = $(el).find('.side.h .v').first().text().trim();
    const aName = $(el).find('.side.a .nm').first().text().trim();
    const aVal = $(el).find('.side.a .v').first().text().trim();
    if (category && (hName || aName)) {
      leaders.push({
        category,
        homePlayer: hName ? { name: hName, value: hVal } : undefined,
        awayPlayer: aName ? { name: aName, value: aVal } : undefined
      });
    }
  });
  return leaders;
}

/**
 * Fetches rich match analysis HTML fragments from Killtoto (/basketball/analysis/{id}/ov?sec=... or /soccer/analysis/{id}).
 * Uses strict single-flight + 15-minute caching + polite sequential pacing so bulk requests never trigger bans.
 */
export async function scrapeKilltotoMatchAnalysis(
  analysisPath: string,
  sport: 'SC' | 'BK' | 'BS'
): Promise<KilltotoAnalysisDetail | null> {
  if (!analysisPath) return null;
  const cacheKey = `killtoto_analysis_${analysisPath}`;
  const now = Date.now();
  const cached = htmlDataCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    const st = getOrCreateHostState('killtoto.com');
    st.cacheHits++;
    return cached.data;
  }

  const baseUrl = `https://killtoto.com${analysisPath.startsWith('/') ? analysisPath : `/${analysisPath}`}`;
  const detail: KilltotoAnalysisDetail = {
    analysisUrl: baseUrl,
    fetchedAt: new Date().toISOString(),
    sport,
    homeRecent: [],
    awayRecent: [],
    h2hMatches: [],
    standings: [],
    leaders: []
  };

  if (sport === 'BK') {
    // Sequential polite fetches (uses per-host 650ms+jitter queue)
    const [recentRes, h2hRes, rankRes, playersRes] = await Promise.all([
      fetchHtmlAntiBlock(`${baseUrl}/ov?sec=recent`, { referer: baseUrl }),
      fetchHtmlAntiBlock(`${baseUrl}/ov?sec=h2h`, { referer: baseUrl }),
      fetchHtmlAntiBlock(`${baseUrl}/ov?sec=rank`, { referer: baseUrl }),
      fetchHtmlAntiBlock(`${baseUrl}/ov?sec=players`, { referer: baseUrl })
    ]);

    if (recentRes.ok && recentRes.html) {
      const rec = parseKilltotoBasketballRecentHtml(recentRes.html);
      detail.homeRecent = rec.homeRecent;
      detail.awayRecent = rec.awayRecent;
    }
    if (h2hRes.ok && h2hRes.html) {
      detail.h2hMatches = parseKilltotoBasketballH2hHtml(h2hRes.html);
    }
    if (rankRes.ok && rankRes.html) {
      detail.standings = parseKilltotoRankHtml(rankRes.html);
    }
    if (playersRes.ok && playersRes.html) {
      detail.leaders = parseKilltotoPlayersHtml(playersRes.html);
    }
  } else {
    const mainRes = await fetchHtmlAntiBlock(baseUrl, { referer: 'https://killtoto.com/proto' });
    if (mainRes.ok && mainRes.html) {
      const $ = cheerio.load(mainRes.html);
      const allTables = $('table.an-t').toArray();
      const parseSoccerTeamTable = (tbl: any): KilltotoRecentGame[] => {
        const list: KilltotoRecentGame[] = [];
        $(tbl).find('tbody tr').each((_, tr) => {
          if (list.length >= 10) return;
          const tds = $(tr).find('td');
          if (tds.length < 4) return;
          const rowTxt = $(tr).text().replace(/\s+/g, ' ').trim();
          const dateMatch = rowTxt.match(/(20\d{2}-\d{2}-\d{2}|\d{2}-\d{2}-\d{2})/);
          const scoreMatch = rowTxt.match(/(\d+)\s*-\s*(\d+)/);
          if (!dateMatch || !scoreMatch) return;
          const homeCell = $(tds[2]).text().trim();
          const isHome = homeCell.includes('*');
          const opponent = isHome ? $(tds[4]).text().trim().replace(/\*/g, '') : homeCell.replace(/\*/g, '');
          const sH = parseInt(scoreMatch[1], 10);
          const sA = parseInt(scoreMatch[2], 10);
          const sf = isHome ? sH : sA;
          const sa = isHome ? sA : sH;
          const result: '승' | '무' | '패' = sf > sa ? '승' : sf === sa ? '무' : '패';
          list.push({
            date: dateMatch[1],
            league: $(tds[0]).text().trim(),
            isHome,
            opponent: opponent || '상대팀',
            result,
            score: `${sf}:${sa}`,
            scoreFor: sf,
            scoreAgainst: sa
          });
        });
        return list;
      };

      // Soccer analysis page contains large history tables in order: H2H (small), Home recent, Away recent
      if (allTables.length >= 3) {
        const recentCandidates = allTables.filter(t => $(t).find('tbody tr').length >= 3);
        if (recentCandidates[0]) detail.homeRecent = parseSoccerTeamTable(recentCandidates[0]);
        if (recentCandidates[1]) detail.awayRecent = parseSoccerTeamTable(recentCandidates[1]);
      }
    }
  }

  htmlDataCache.set(cacheKey, {
    data: detail,
    fetchedAt: now,
    expiresAt: now + 15 * 60 * 1000,
    staleUntil: now + 2 * 60 * 60 * 1000
  });

  return detail;
}

/**
 * Finds the matching Killtoto Proto match + scrapes its detail analysis page if available.
 */
export async function fetchKilltotoMatchIntel(
  homeTeam: string,
  awayTeam: string,
  year?: number,
  round?: number,
  gameNo?: number | string
): Promise<{ protoMatch: KilltotoProtoMatch | null; analysis: KilltotoAnalysisDetail | null }> {
  const roundRes = await scrapeKilltotoProtoRound(year, round, false);
  if (!roundRes || !roundRes.matches.length) {
    return { protoMatch: null, analysis: null };
  }

  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const hNorm = norm(homeTeam);
  const aNorm = norm(awayTeam);
  const gNoNum = gameNo ? Number(gameNo) : NaN;

  let matched = Number.isFinite(gNoNum)
    ? roundRes.matches.find(m => m.matchSeq === gNoNum) || null
    : null;

  if (!matched) {
    matched = roundRes.matches.find(m => {
      const mh = norm(m.homeName);
      const ma = norm(m.awayName);
      return (mh === hNorm || mh.includes(hNorm) || hNorm.includes(mh)) &&
             (ma === aNorm || ma.includes(aNorm) || aNorm.includes(ma));
    }) || null;
  }

  if (!matched) return { protoMatch: null, analysis: null };

  // Find another line of same physical match if this row lacked analysisPath
  let analysisPath = matched.analysisPath;
  let analysisSport = matched.analysisSport;
  if (!analysisPath) {
    const sibling = roundRes.matches.find(
      m => m.homeName === matched!.homeName && m.awayName === matched!.awayName && m.analysisPath
    );
    if (sibling) {
      analysisPath = sibling.analysisPath;
      analysisSport = sibling.analysisSport;
    }
  }

  const analysis = analysisPath && analysisSport
    ? await scrapeKilltotoMatchAnalysis(analysisPath, analysisSport).catch(() => null)
    : null;

  return { protoMatch: matched, analysis };
}

/**
 * Polite HTML availability probes for Scorebase & Betsgo (Zero private API calls).
 * Respects Cloudflare 403 and CSR SPA shells without hammering hosts.
 */
export async function probeSecondarySitesHtmlHealth(): Promise<{
  killtoto: HostAntiBlockState;
  scorebase: HostAntiBlockState;
  betsgo: HostAntiBlockState;
}> {
  await Promise.all([
    fetchHtmlAntiBlock('https://www.scorebase.kr/odds?sport=betman', { timeoutMs: 4500 }),
    fetchHtmlAntiBlock('https://app.betsgo-sports.com/live', { timeoutMs: 4500 })
  ]);
  return getMultiSiteScraperStates();
}

export function getMultiSiteScraperStates(): {
  killtoto: HostAntiBlockState;
  scorebase: HostAntiBlockState;
  betsgo: HostAntiBlockState;
} {
  return {
    killtoto: getOrCreateHostState('killtoto.com'),
    scorebase: getOrCreateHostState('www.scorebase.kr'),
    betsgo: getOrCreateHostState('app.betsgo-sports.com')
  };
}
