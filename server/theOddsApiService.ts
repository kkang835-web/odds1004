/**
 * SportsQuant Pro — The Odds API Foreign Odds Integration Engine
 *
 * [STRICT CONSTRAINTS & COMPLIANCE]
 * 1. AI Studio Secret resolution: checks process.env and /app/.dev.env.json without leaking keys.
 * 2. API Key zero-exposure: Never log, serialize, or transmit API key to client or logs.
 * 3. Verified active sports only (/v4/sports/): 'baseball_mlb', 'soccer_korea_kleague1', verified EU leagues.
 * 4. Free plan optimization: markets=h2h, regions=eu, 1 request per query, tracked via usage headers.
 * 5. Pinnacle preservation: capture Pinnacle odds, refund rate, and last_update timestamp.
 * 6. Strict market boundaries: h2h is matched ONLY with 1X2 / 2-way Moneyline. NEVER attach to 승1패 / 승5패 / Handicap / UO.
 * 7. Unsupported leagues (KBO, KBL, KOVO) explicitly treated as UNAVAILABLE. Zero synthetic fallback odds.
 * 8. In-flight de-duplication + TTL memory/disk cache to prevent repeated API calls on page visits.
 * 9. No autonomous scheduler / auto-looping without explicit authorization.
 */

import fs from "fs";
import path from "path";

export interface TheOddsApiUsage {
  requestsUsed: number | null;
  requestsRemaining: number | null;
  requestsLast: number | null;
  lastCheckedAt: string | null;
  isQuotaExhausted?: boolean;
  quotaMessage?: string | null;
}

export interface TheOddsOutcome {
  name: string;
  price: number;
}

export interface TheOddsMarket {
  key: string; // 'h2h'
  last_update: string;
  outcomes: TheOddsOutcome[];
}

export interface TheOddsBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: TheOddsMarket[];
}

export interface TheOddsRawEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: TheOddsBookmaker[];
}

export interface TheOddsNormalizedGame {
  id: string;
  sportKey: string;
  sportTitle: string;
  commenceTime: string; // ISO UTC
  homeTeam: string;
  awayTeam: string;
  bookmakerKey: string;
  bookmakerTitle: string;
  lastUpdate: string;
  isPinnacle: boolean;
  odds: {
    home: number;
    draw: number | null;
    away: number;
    refundRate: string;
  };
  rawBookmakersCount: number;
  isCached?: boolean;
  cachedAt?: number;
}

export interface TheOddsSportInfo {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

// Memory Cache & In-flight request map
interface CachedOddsData {
  sportKey: string;
  games: TheOddsNormalizedGame[];
  cachedAt: number; // Date.now()
}

const MEMORY_CACHE = new Map<string, CachedOddsData>();
const IN_FLIGHT_REQUESTS = new Map<string, Promise<TheOddsNormalizedGame[]>>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL

// Disk cache directory
const CACHE_DIR = path.resolve(process.cwd(), "data", "theOddsApiCache");
const CACHE_FILE = path.join(CACHE_DIR, "theOddsApiCache.json");

let isQuotaExhausted = false;
let quotaExhaustedMessage: string | null = null;
let quotaExhaustedCheckedAt = 0;

let latestUsage: TheOddsApiUsage = {
  requestsUsed: null,
  requestsRemaining: null,
  requestsLast: null,
  lastCheckedAt: null,
  isQuotaExhausted: false,
  quotaMessage: null
};

export function getIsQuotaExhausted(): boolean {
  return isQuotaExhausted;
}

export function resetQuotaExhaustedStatus(): void {
  isQuotaExhausted = false;
  quotaExhaustedMessage = null;
  quotaExhaustedCheckedAt = 0;
  latestUsage.isQuotaExhausted = false;
  latestUsage.quotaMessage = null;
}

/**
 * Safely resolves The Odds API Key from process.env or /app/.dev.env.json
 * WITHOUT exposing the key anywhere in output or logs.
 */
export function getTheOddsApiKey(): string | null {
  const envKey = process.env["odds-api_KEY"] || process.env.ODDS_API_KEY || process.env.THE_ODDS_API_KEY;
  if (envKey && typeof envKey === "string" && envKey.trim().length > 0) {
    return envKey.trim();
  }

  const devEnvPath = "/app/.dev.env.json";
  if (fs.existsSync(devEnvPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(devEnvPath, "utf-8"));
      const secret = parsed["odds-api_KEY"] || parsed["ODDS_API_KEY"] || parsed["THE_ODDS_API_KEY"];
      if (secret && typeof secret === "string" && secret.trim().length > 0) {
        return secret.trim();
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Redacts any sensitive URL query parameters like apiKey=...
 */
export function sanitizeApiUrl(url: string): string {
  return url.replace(/apiKey=[^&]+/g, "apiKey=***REDACTED***");
}

/**
 * Returns current API credit usage metrics
 */
export function getTheOddsApiUsage(): TheOddsApiUsage {
  return {
    ...latestUsage,
    isQuotaExhausted,
    quotaMessage: quotaExhaustedMessage
  };
}

/**
 * Updates quota usage from HTTP headers
 */
function updateUsageHeaders(headers: Headers): void {
  const used = headers.get("x-requests-used");
  const remaining = headers.get("x-requests-remaining");
  const last = headers.get("x-requests-last");

  if (used !== null) latestUsage.requestsUsed = parseInt(used, 10);
  if (remaining !== null) {
    const rem = parseInt(remaining, 10);
    latestUsage.requestsRemaining = rem;
    if (rem <= 0) {
      isQuotaExhausted = true;
      quotaExhaustedCheckedAt = Date.now();
      quotaExhaustedMessage = "The Odds API 무료 쿼터 소진 (OUT_OF_USAGE_CREDITS)";
      latestUsage.isQuotaExhausted = true;
      latestUsage.quotaMessage = quotaExhaustedMessage;
    }
  }
  if (last !== null) latestUsage.requestsLast = parseInt(last, 10);
  latestUsage.lastCheckedAt = new Date().toISOString();
}

/**
 * Loads cache from disk on startup (retains all cached data as offline/quota fallback)
 */
function loadDiskCache(): void {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const content = fs.readFileSync(CACHE_FILE, "utf-8");
    const data: Record<string, CachedOddsData> = JSON.parse(content);
    for (const [sportKey, cached] of Object.entries(data)) {
      if (cached && Array.isArray(cached.games)) {
        cached.games.forEach(g => {
          g.isCached = true;
          if (!g.cachedAt) g.cachedAt = cached.cachedAt;
        });
        MEMORY_CACHE.set(sportKey, cached);
      }
    }
  } catch {
    // Quietly ignore invalid cache
  }
}

/**
 * Saves memory cache to disk
 */
function persistDiskCache(): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const data: Record<string, CachedOddsData> = {};
    for (const [k, v] of MEMORY_CACHE.entries()) {
      data[k] = v;
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // Quietly ignore disk write error
  }
}

// Initial cache load
loadDiskCache();

export interface TheOddsCacheStats {
  cachedSportsCount: number;
  totalCachedGames: number;
  isQuotaExhausted: boolean;
  freshnessTtlMs: number;
  sports: Array<{
    sportKey: string;
    gameCount: number;
    cachedAt: string;
    ageMinutes: number;
    isFresh: boolean;
    status: 'LIVE' | 'CACHED' | 'STALE' | 'EMPTY';
  }>;
}

export function getTheOddsCacheStats(): TheOddsCacheStats {
  const sports = [];
  let totalGames = 0;
  const now = Date.now();
  for (const [k, v] of MEMORY_CACHE.entries()) {
    const ageMs = Math.max(0, now - v.cachedAt);
    const ageMinutes = Math.round(ageMs / (60 * 1000));
    const isFresh = ageMs < CACHE_TTL_MS;
    const count = v.games ? v.games.length : 0;
    const status: 'LIVE' | 'CACHED' | 'STALE' | 'EMPTY' = 
      count === 0 ? 'EMPTY' : (isFresh ? 'CACHED' : 'STALE');

    sports.push({
      sportKey: k,
      gameCount: count,
      cachedAt: new Date(v.cachedAt).toISOString(),
      ageMinutes,
      isFresh,
      status
    });
    totalGames += count;
  }
  return {
    cachedSportsCount: MEMORY_CACHE.size,
    totalCachedGames: totalGames,
    isQuotaExhausted,
    freshnessTtlMs: CACHE_TTL_MS,
    sports
  };
}

/**
 * Verified Sports Map: maps BetMan/Proto league names to The Odds API sport_key
 */
export const SUPPORTED_SPORTS_MAP: Record<string, { sportKey: string; sport: 'baseball' | 'soccer' | 'basketball' }> = {
  // MLB Baseball
  "MLB": { sportKey: "baseball_mlb", sport: "baseball" },
  "메이저리그": { sportKey: "baseball_mlb", sport: "baseball" },

  // K League 1 Soccer
  "K리그1": { sportKey: "soccer_korea_kleague1", sport: "soccer" },
  "K리그 1": { sportKey: "soccer_korea_kleague1", sport: "soccer" },
  "K-리그1": { sportKey: "soccer_korea_kleague1", sport: "soccer" },
  "K-LEAGUE 1": { sportKey: "soccer_korea_kleague1", sport: "soccer" },

  // European Soccer (when present in Proto)
  "EPL": { sportKey: "soccer_epl", sport: "soccer" },
  "프리미어리그": { sportKey: "soccer_epl", sport: "soccer" },
  "잉글랜드 프리미어리그": { sportKey: "soccer_epl", sport: "soccer" },
  "잉글랜드 챔피언십": { sportKey: "soccer_efl_champ", sport: "soccer" },
  "EFL챔": { sportKey: "soccer_efl_champ", sport: "soccer" },
  "UCL": { sportKey: "soccer_uefa_champs_league", sport: "soccer" },
  "UEFA 챔피언스리그": { sportKey: "soccer_uefa_champs_league", sport: "soccer" },
  "라리가": { sportKey: "soccer_spain_la_liga", sport: "soccer" },
  "스페인 라리가": { sportKey: "soccer_spain_la_liga", sport: "soccer" },
  "세리에A": { sportKey: "soccer_italy_serie_a", sport: "soccer" },
  "이탈리아 세리에A": { sportKey: "soccer_italy_serie_a", sport: "soccer" },
  "분데스리가": { sportKey: "soccer_germany_bundesliga", sport: "soccer" },
  "독일 분데스리가": { sportKey: "soccer_germany_bundesliga", sport: "soccer" },
  "J리그": { sportKey: "soccer_japan_j_league", sport: "soccer" },
  "일본 J리그": { sportKey: "soccer_japan_j_league", sport: "soccer" },
  "MLS": { sportKey: "soccer_usa_mls", sport: "soccer" },
  "A리그": { sportKey: "soccer_australia_aleague", sport: "soccer" },

  // NBA Basketball
  "NBA": { sportKey: "basketball_nba", sport: "basketball" }
};

/**
 * List of leagues explicitly UNSUPPORTED by The Odds API (e.g. KBL, KBO, KOVO, NPB)
 * Foreign odds MUST remain UNAVAILABLE for these.
 */
export const EXPLICITLY_UNSUPPORTED_LEAGUES = new Set([
  "KBL", "KBO", "NPB", "KOVO컵", "KOVO컵 여자", "KOVO컵여", "WKBL", "V-리그", "일리그컵", "남농EASL", "ACL2", "ACLE"
]);

/**
 * Fetch list of all active sports from The Odds API
 */
export async function fetchTheOddsApiSports(): Promise<TheOddsSportInfo[]> {
  const fallbackList: TheOddsSportInfo[] = Object.entries(SUPPORTED_SPORTS_MAP).map(([title, item]) => ({
    key: item.sportKey,
    group: item.sport,
    title: title,
    description: `${title} (${item.sportKey})`,
    active: true,
    has_outrights: false
  }));

  const apiKey = getTheOddsApiKey();
  if (!apiKey || isQuotaExhausted) {
    return fallbackList;
  }

  try {
    const url = `https://api.the-odds-api.com/v4/sports/?apiKey=${apiKey}`;
    const res = await fetch(url);
    updateUsageHeaders(res.headers);

    if (!res.ok) {
      const errorText = await res.text();
      if (res.status === 401 || res.status === 429) {
        isQuotaExhausted = true;
        quotaExhaustedCheckedAt = Date.now();
        quotaExhaustedMessage = "The Odds API 무료 쿼터 소진 (OUT_OF_USAGE_CREDITS)";
        latestUsage.requestsRemaining = 0;
        latestUsage.isQuotaExhausted = true;
        latestUsage.quotaMessage = quotaExhaustedMessage;
      }
      return fallbackList;
    }

    return await res.json();
  } catch {
    return fallbackList;
  }
}

/**
 * Normalizes raw event from The Odds API, capturing Pinnacle as primary bookmaker
 */
function normalizeEvent(event: TheOddsRawEvent): TheOddsNormalizedGame | null {
  if (!event || !event.bookmakers || event.bookmakers.length === 0) {
    return null;
  }

  // Look for Pinnacle first (gold standard sharp bookmaker)
  const pinnacle = event.bookmakers.find(b => b.key.toLowerCase() === "pinnacle");
  // If Pinnacle is not found, fallback to next reliable sharp EU bookmaker
  const selectedBookmaker = pinnacle || event.bookmakers[0];
  if (!selectedBookmaker) return null;

  const h2hMarket = selectedBookmaker.markets?.find(m => m.key === "h2h");
  if (!h2hMarket || !h2hMarket.outcomes || h2hMarket.outcomes.length < 2) {
    return null;
  }

  const outcomes = h2hMarket.outcomes;
  const homeOutcome = outcomes.find(o => o.name.toLowerCase() === event.home_team.toLowerCase());
  const awayOutcome = outcomes.find(o => o.name.toLowerCase() === event.away_team.toLowerCase());
  const drawOutcome = outcomes.find(o => o.name.toLowerCase() === "draw");

  if (!homeOutcome || !awayOutcome) {
    return null;
  }

  const homePrice = homeOutcome.price;
  const awayPrice = awayOutcome.price;
  const drawPrice = drawOutcome ? drawOutcome.price : null;

  // Calculate refund rate (payout percentage)
  const invSum = (1 / homePrice) + (drawPrice ? (1 / drawPrice) : 0) + (1 / awayPrice);
  const refundRate = invSum > 0 ? `${((1 / invSum) * 100).toFixed(2)}%` : "95.51%";

  return {
    id: event.id,
    sportKey: event.sport_key,
    sportTitle: event.sport_title,
    commenceTime: event.commence_time,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    bookmakerKey: selectedBookmaker.key,
    bookmakerTitle: selectedBookmaker.title,
    lastUpdate: h2hMarket.last_update || selectedBookmaker.last_update || new Date().toISOString(),
    isPinnacle: selectedBookmaker.key.toLowerCase() === "pinnacle",
    odds: {
      home: homePrice,
      draw: drawPrice,
      away: awayPrice,
      refundRate
    },
    rawBookmakersCount: event.bookmakers.length
  };
}

/**
 * Fetches real odds for a verified sport with in-flight deduplication and memory/disk caching.
 * Does NOT call external API if cache is still fresh.
 */
export async function fetchTheOddsApiOdds(sportKey: string, force = false): Promise<TheOddsNormalizedGame[]> {
  const now = Date.now();
  const cached = MEMORY_CACHE.get(sportKey);

  if (!force && cached && (now - cached.cachedAt < CACHE_TTL_MS) && !isQuotaExhausted) {
    return cached.games;
  }

  // If quota is exhausted and not forced, return cached fallback or empty array without network attempt
  if (isQuotaExhausted && !force) {
    if (cached && cached.games.length > 0) {
      cached.games.forEach(g => {
        g.isCached = true;
        if (!g.cachedAt) g.cachedAt = cached.cachedAt;
      });
      return cached.games;
    }
    return [];
  }

  // Deduplicate concurrent in-flight requests for same sportKey
  if (IN_FLIGHT_REQUESTS.has(sportKey)) {
    return IN_FLIGHT_REQUESTS.get(sportKey)!;
  }

  const fetchPromise = (async () => {
    const apiKey = getTheOddsApiKey();
    if (!apiKey) {
      if (cached && cached.games.length > 0) {
        cached.games.forEach(g => {
          g.isCached = true;
          if (!g.cachedAt) g.cachedAt = cached.cachedAt;
        });
        return cached.games;
      }
      return [];
    }

    const url = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/odds/?apiKey=${apiKey}&regions=eu&markets=h2h`;

    try {
      const res = await fetch(url);
      updateUsageHeaders(res.headers);

      if (!res.ok) {
        const errorText = await res.text();
        const isQuotaErr = res.status === 401 && (
          errorText.includes("OUT_OF_USAGE_CREDITS") || 
          errorText.includes("Usage quota has been reached")
        ) || res.status === 429;

        if (isQuotaErr) {
          isQuotaExhausted = true;
          quotaExhaustedCheckedAt = Date.now();
          quotaExhaustedMessage = "The Odds API 사용량 한도 소진 (OUT_OF_USAGE_CREDITS)";
          latestUsage.requestsRemaining = 0;
          latestUsage.isQuotaExhausted = true;
          latestUsage.quotaMessage = quotaExhaustedMessage;

          // Gracefully serve cached games if present
          if (cached && cached.games.length > 0) {
            cached.games.forEach(g => {
              g.isCached = true;
              if (!g.cachedAt) g.cachedAt = cached.cachedAt;
            });
            return cached.games;
          }
          return [];
        }

        // For other HTTP errors, fallback to cached games if present
        if (cached && cached.games.length > 0) {
          cached.games.forEach(g => {
            g.isCached = true;
            if (!g.cachedAt) g.cachedAt = cached.cachedAt;
          });
          return cached.games;
        }
        return [];
      }

      // Successful response: reset quota flag
      isQuotaExhausted = false;
      latestUsage.isQuotaExhausted = false;
      latestUsage.quotaMessage = null;

      const rawEvents: TheOddsRawEvent[] = await res.json();
      const normalizedList: TheOddsNormalizedGame[] = [];

      for (const ev of rawEvents) {
        const norm = normalizeEvent(ev);
        if (norm) {
          norm.isCached = false;
          norm.cachedAt = now;
          normalizedList.push(norm);
        }
      }

      // Update cache
      MEMORY_CACHE.set(sportKey, {
        sportKey,
        games: normalizedList,
        cachedAt: Date.now()
      });
      persistDiskCache();

      return normalizedList;
    } catch {
      // Graceful network error fallback
      if (cached && cached.games.length > 0) {
        cached.games.forEach(g => {
          g.isCached = true;
          if (!g.cachedAt) g.cachedAt = cached.cachedAt;
        });
        return cached.games;
      }
      return [];
    } finally {
      IN_FLIGHT_REQUESTS.delete(sportKey);
    }
  })();

  IN_FLIGHT_REQUESTS.set(sportKey, fetchPromise);
  return fetchPromise;
}

// =========================================================================
// Team Name Normalization & Resolution
// =========================================================================

const MLB_TEAM_ALIASES: Record<string, string> = {
  // Tampa Bay Rays
  "tampa bay rays": "Tampa Bay Rays",
  "탬파베이 레이스": "Tampa Bay Rays",
  "탬파베이": "Tampa Bay Rays",
  "탬파레이": "Tampa Bay Rays",
  "tb": "Tampa Bay Rays",

  // Cleveland Guardians
  "cleveland guardians": "Cleveland Guardians",
  "클리블랜드 가디언스": "Cleveland Guardians",
  "클리블랜드": "Cleveland Guardians",
  "클리가디": "Cleveland Guardians",
  "cle": "Cleveland Guardians",

  // Milwaukee Brewers
  "milwaukee brewers": "Milwaukee Brewers",
  "밀워키 브루어스": "Milwaukee Brewers",
  "밀워키": "Milwaukee Brewers",
  "밀워브루": "Milwaukee Brewers",
  "mil": "Milwaukee Brewers",

  // Los Angeles Dodgers
  "los angeles dodgers": "Los Angeles Dodgers",
  "la 다저스": "Los Angeles Dodgers",
  "la다저스": "Los Angeles Dodgers",
  "로스앤젤레스 다저스": "Los Angeles Dodgers",
  "lad": "Los Angeles Dodgers",

  // New York Yankees
  "new york yankees": "New York Yankees",
  "뉴욕 양키스": "New York Yankees",
  "뉴욕양키": "New York Yankees",
  "nyy": "New York Yankees",

  // New York Mets
  "new york mets": "New York Mets",
  "뉴욕 메츠": "New York Mets",
  "뉴욕메츠": "New York Mets",
  "nym": "New York Mets",

  // Boston Red Sox
  "boston red sox": "Boston Red Sox",
  "보스턴 레드삭스": "Boston Red Sox",
  "보스레드": "Boston Red Sox",
  "bos": "Boston Red Sox",

  // Toronto Blue Jays
  "toronto blue jays": "Toronto Blue Jays",
  "토론토 블루제이스": "Toronto Blue Jays",
  "토론블루": "Toronto Blue Jays",
  "tor": "Toronto Blue Jays",

  // Baltimore Orioles
  "baltimore orioles": "Baltimore Orioles",
  "볼티모어 오리올스": "Baltimore Orioles",
  "볼티오리": "Baltimore Orioles",
  "볼티모어": "Baltimore Orioles",
  "bal": "Baltimore Orioles",

  // Chicago Cubs
  "chicago cubs": "Chicago Cubs",
  "시카고 컵스": "Chicago Cubs",
  "시카컵스": "Chicago Cubs",
  "chc": "Chicago Cubs",

  // Chicago White Sox
  "chicago white sox": "Chicago White Sox",
  "시카고 화이트삭스": "Chicago White Sox",
  "시카화이": "Chicago White Sox",
  "cws": "Chicago White Sox",

  // Houston Astros
  "houston astros": "Houston Astros",
  "휴스턴 애스트로스": "Houston Astros",
  "휴스애스": "Houston Astros",
  "휴스턴": "Houston Astros",
  "hou": "Houston Astros",

  // Texas Rangers
  "texas rangers": "Texas Rangers",
  "텍사스 레인저스": "Texas Rangers",
  "텍사레인": "Texas Rangers",
  "텍사스": "Texas Rangers",
  "tex": "Texas Rangers",

  // Seattle Mariners
  "seattle mariners": "Seattle Mariners",
  "시애틀 매리너스": "Seattle Mariners",
  "시애매리": "Seattle Mariners",
  "시애틀": "Seattle Mariners",
  "sea": "Seattle Mariners",

  // Philadelphia Phillies
  "philadelphia phillies": "Philadelphia Phillies",
  "필라델피아 필리스": "Philadelphia Phillies",
  "필라필리": "Philadelphia Phillies",
  "필라델피아": "Philadelphia Phillies",
  "phi": "Philadelphia Phillies",

  // Atlanta Braves
  "atlanta braves": "Atlanta Braves",
  "애틀랜타 브레이브스": "Atlanta Braves",
  "애틀브레": "Atlanta Braves",
  "애틀랜타": "Atlanta Braves",
  "atl": "Atlanta Braves",

  // San Diego Padres
  "san diego padres": "San Diego Padres",
  "샌디에이고 파드리스": "San Diego Padres",
  "샌디파드": "San Diego Padres",
  "샌디에이고": "San Diego Padres",
  "sd": "San Diego Padres",

  // San Francisco Giants
  "san francisco giants": "San Francisco Giants",
  "샌프란시스코 자이언츠": "San Francisco Giants",
  "샌프자이": "San Francisco Giants",
  "샌프란시스코": "San Francisco Giants",
  "sf": "San Francisco Giants",

  // Arizona Diamondbacks
  "arizona diamondbacks": "Arizona Diamondbacks",
  "애리조나 다이아몬드백스": "Arizona Diamondbacks",
  "애리다이": "Arizona Diamondbacks",
  "애리조나": "Arizona Diamondbacks",
  "ari": "Arizona Diamondbacks",

  // Minnesota Twins
  "minnesota twins": "Minnesota Twins",
  "미네소타 트윈스": "Minnesota Twins",
  "미네트윈": "Minnesota Twins",
  "미네소타": "Minnesota Twins",
  "min": "Minnesota Twins",

  // Detroit Tigers
  "detroit tigers": "Detroit Tigers",
  "디트로이트 타이거스": "Detroit Tigers",
  "디트타이": "Detroit Tigers",
  "디트로이트": "Detroit Tigers",
  "det": "Detroit Tigers",

  // Kansas City Royals
  "kansas city royals": "Kansas City Royals",
  "캔자스시티 로열스": "Kansas City Royals",
  "캔자로열": "Kansas City Royals",
  "캔자스시티": "Kansas City Royals",
  "kc": "Kansas City Royals",

  // Los Angeles Angels
  "los angeles angels": "Los Angeles Angels",
  "la 에인절스": "Los Angeles Angels",
  "la에인절스": "Los Angeles Angels",
  "la에인절": "Los Angeles Angels",
  "laa": "Los Angeles Angels",

  // Oakland Athletics
  "oakland athletics": "Oakland Athletics",
  "오클랜드 애슬레틱스": "Oakland Athletics",
  "오클애슬": "Oakland Athletics",
  "오클랜드": "Oakland Athletics",
  "oak": "Oakland Athletics",

  // St. Louis Cardinals
  "st. louis cardinals": "St. Louis Cardinals",
  "세인트루이스 카디널스": "St. Louis Cardinals",
  "세인카디": "St. Louis Cardinals",
  "세인트루이스": "St. Louis Cardinals",
  "stl": "St. Louis Cardinals",

  // Cincinnati Reds
  "cincinnati reds": "Cincinnati Reds",
  "신시내티 레즈": "Cincinnati Reds",
  "신시레즈": "Cincinnati Reds",
  "신시내티": "Cincinnati Reds",
  "cin": "Cincinnati Reds",

  // Pittsburgh Pirates
  "pittsburgh pirates": "Pittsburgh Pirates",
  "피츠버그 파이리츠": "Pittsburgh Pirates",
  "피츠파이": "Pittsburgh Pirates",
  "피츠버그": "Pittsburgh Pirates",
  "pit": "Pittsburgh Pirates",

  // Washington Nationals
  "washington nationals": "Washington Nationals",
  "워싱턴 내셔널스": "Washington Nationals",
  "워싱내셔": "Washington Nationals",
  "워싱턴": "Washington Nationals",
  "wsh": "Washington Nationals",

  // Miami Marlins
  "miami marlins": "Miami Marlins",
  "마이애미 말린스": "Miami Marlins",
  "마이말린": "Miami Marlins",
  "마이애미": "Miami Marlins",
  "mia": "Miami Marlins",

  // Colorado Rockies
  "colorado rockies": "Colorado Rockies",
  "콜로라도 로키스": "Colorado Rockies",
  "콜로로키": "Colorado Rockies",
  "콜로라도": "Colorado Rockies",
  "col": "Colorado Rockies"
};

const KLEAGUE1_TEAM_ALIASES: Record<string, string> = {
  // Ulsan HD FC / Ulsan Hyundai FC
  "ulsan hyundai fc": "Ulsan Hyundai FC",
  "ulsan hd fc": "Ulsan Hyundai FC",
  "ulsan hd": "Ulsan Hyundai FC",
  "울산 hd": "Ulsan Hyundai FC",
  "울산hdfc": "Ulsan Hyundai FC",
  "울산현대": "Ulsan Hyundai FC",
  "울산": "Ulsan Hyundai FC",

  // Bucheon FC 1995
  "bucheon fc 1995": "Bucheon FC 1995",
  "부천 fc 1995": "Bucheon FC 1995",
  "부천fc 1995": "Bucheon FC 1995",
  "부천fc": "Bucheon FC 1995",
  "부천": "Bucheon FC 1995",

  // Daejeon Citizen / Daejeon Hana Citizen
  "daejeon citizen": "Daejeon Citizen",
  "daejeon hana citizen": "Daejeon Citizen",
  "대전 하나시티즌": "Daejeon Citizen",
  "대전시티즌": "Daejeon Citizen",
  "대전": "Daejeon Citizen",

  // Gwangju FC
  "gwangju fc": "Gwangju FC",
  "광주 fc": "Gwangju FC",
  "광주fc": "Gwangju FC",
  "광주": "Gwangju FC",

  // Jeonbuk Hyundai Motors
  "jeonbuk hyundai motors": "Jeonbuk Hyundai Motors",
  "전북 현대 모터스": "Jeonbuk Hyundai Motors",
  "전북현대": "Jeonbuk Hyundai Motors",
  "전북": "Jeonbuk Hyundai Motors",

  // Jeju United FC
  "jeju united fc": "Jeju United FC",
  "jeju united": "Jeju United FC",
  "제주 유나이티드": "Jeju United FC",
  "제주skfc": "Jeju United FC",
  "제주": "Jeju United FC",

  // Pohang Steelers
  "pohang steelers": "Pohang Steelers",
  "포항 스틸러스": "Pohang Steelers",
  "포항스틸러스": "Pohang Steelers",
  "포항": "Pohang Steelers",

  // FC Anyang
  "fc anyang": "FC Anyang",
  "fc 안양": "FC Anyang",
  "fc안양": "FC Anyang",
  "안양": "FC Anyang",

  // FC Seoul
  "fc seoul": "FC Seoul",
  "fc 서울": "FC Seoul",
  "fc서울": "FC Seoul",
  "서울fc": "FC Seoul",
  "서울": "FC Seoul",

  // Sangju Sangmu FC / Gimcheon Sangmu
  "sangju sangmu fc": "Sangju Sangmu FC",
  "gimcheon sangmu fc": "Sangju Sangmu FC",
  "gimcheon sangmu": "Sangju Sangmu FC",
  "상주 상무": "Sangju Sangmu FC",
  "김천 상무": "Sangju Sangmu FC",
  "김천상무": "Sangju Sangmu FC",
  "상무": "Sangju Sangmu FC",

  // Gangwon FC
  "gangwon fc": "Gangwon FC",
  "강원 fc": "Gangwon FC",
  "강원fc": "Gangwon FC",
  "강원": "Gangwon FC",

  // Incheon United
  "incheon united": "Incheon United",
  "인천 유나이티드": "Incheon United",
  "인천utd": "Incheon United",
  "인천": "Incheon United",

  // Suwon FC
  "suwon fc": "Suwon FC",
  "수원 fc": "Suwon FC",
  "수원fc": "Suwon FC",

  // Daegu FC
  "daegu fc": "Daegu FC",
  "대구 fc": "Daegu FC",
  "대구fc": "Daegu FC"
};

/**
 * Normalizes team name to canonical name for matching
 */
export function normalizeTeamName(name: string, sport: 'baseball' | 'soccer' | 'basketball'): string {
  if (!name || typeof name !== "string") return "";
  const clean = name.trim().toLowerCase().replace(/\s+/g, " ");

  if (sport === "baseball") {
    if (MLB_TEAM_ALIASES[clean]) return MLB_TEAM_ALIASES[clean];
    for (const [alias, canonical] of Object.entries(MLB_TEAM_ALIASES)) {
      if (clean.includes(alias) || alias.includes(clean)) {
        return canonical;
      }
    }
  } else if (sport === "soccer") {
    if (KLEAGUE1_TEAM_ALIASES[clean]) return KLEAGUE1_TEAM_ALIASES[clean];
    for (const [alias, canonical] of Object.entries(KLEAGUE1_TEAM_ALIASES)) {
      if (clean.includes(alias) || alias.includes(clean)) {
        return canonical;
      }
    }
  }

  return name.trim();
}

/**
 * Matching Result Interface
 */
export interface ForeignOddsMatchResult {
  matched: boolean;
  reason?: string;
  game?: TheOddsNormalizedGame;
}

/**
 * Matches a BetMan/Proto match item with real foreign odds from The Odds API
 * Strictly enforces market boundaries and confidence rules.
 */
export function matchBetmanWithForeignOdds(
  betmanMatch: {
    sport: 'baseball' | 'soccer' | 'basketball' | 'volleyball';
    league: string;
    categoryType: string; // '일반' | '핸디캡' | '언더오버' | '승1패'
    categoryLabel?: string;
    homeTeam: string;
    awayTeam: string;
    betmanHomeName?: string;
    betmanAwayName?: string;
    kickoffAt?: string;
    rawDate?: string;
    date?: string;
  },
  foreignGames: TheOddsNormalizedGame[]
): ForeignOddsMatchResult {
  // 1. Explicitly unsupported sports/leagues check
  if (EXPLICITLY_UNSUPPORTED_LEAGUES.has(betmanMatch.league)) {
    return { matched: false, reason: `리그 [${betmanMatch.league}]는 The Odds API 미지원 종목입니다.` };
  }

  // 2. Strict market boundary: h2h ONLY matches general 1X2 / 2-way Moneyline
  const catLabel = (betmanMatch.categoryLabel || "").trim();
  const isSum = (betmanMatch.categoryType as string) === "SUM" || catLabel === "SUM" || catLabel.includes("홀짝");
  const isNonGeneral = betmanMatch.categoryType !== "일반" || isSum || catLabel.startsWith("H") || catLabel.startsWith("U") || catLabel.includes("핸디") || catLabel.includes("언더") || catLabel.includes("오버") || catLabel.includes("승1패") || catLabel.includes("승5패");

  if (isNonGeneral) {
    return {
      matched: false,
      reason: `해외 h2h 시장은 [${isSum ? 'SUM' : (betmanMatch.categoryType || catLabel)}] 시장과 동일하지 않습니다 (승1패/승5패/핸디캡/언더오버/SUM 제외).`
    };
  }

  // 3. Exclude '미정' (TBD) undecided matches
  const home = (betmanMatch.betmanHomeName || betmanMatch.homeTeam || "").trim();
  const away = (betmanMatch.betmanAwayName || betmanMatch.awayTeam || "").trim();
  if (!home || !away || home === "미정" || away === "미정" || home === "홈팀" || away === "원정팀") {
    return { matched: false, reason: "불확실한 경기(미정)로 해외배당 연결 제외" };
  }

  if (!foreignGames || foreignGames.length === 0) {
    return { matched: false, reason: "조회된 해외 배당 경기가 없습니다." };
  }

  // Canonicalize team names
  const normHome = normalizeTeamName(home, betmanMatch.sport as any);
  const normAway = normalizeTeamName(away, betmanMatch.sport as any);

  // Kickoff time anchor
  let matchTimeMs: number | null = null;
  if (betmanMatch.kickoffAt) {
    const t = new Date(betmanMatch.kickoffAt).getTime();
    if (!isNaN(t)) matchTimeMs = t;
  }

  for (const fg of foreignGames) {
    const fgNormHome = normalizeTeamName(fg.homeTeam, betmanMatch.sport as any);
    const fgNormAway = normalizeTeamName(fg.awayTeam, betmanMatch.sport as any);

    const isHomeMatch = normHome.toLowerCase() === fgNormHome.toLowerCase();
    const isAwayMatch = normAway.toLowerCase() === fgNormAway.toLowerCase();

    if (isHomeMatch && isAwayMatch) {
      // Check date tolerance if matchTimeMs is available (within 36 hours)
      if (matchTimeMs !== null) {
        const fgTimeMs = new Date(fg.commenceTime).getTime();
        if (!isNaN(fgTimeMs)) {
          const diffHours = Math.abs(matchTimeMs - fgTimeMs) / (1000 * 60 * 60);
          if (diffHours > 36) {
            continue; // Kickoff mismatch
          }
        }
      }

      return {
        matched: true,
        game: fg
      };
    }
  }

  return {
    matched: false,
    reason: `해외 배당 목록에서 일치하는 팀(${normHome} vs ${normAway})을 찾을 수 없습니다.`
  };
}

/**
 * Enriches an array of MatchItem objects with real foreign odds from The Odds API
 */
export async function enrichMatchesWithTheOddsApi(matches: any[], force = false): Promise<{
  enrichedCount: number;
  pinnacleCount: number;
  unsupportedCount: number;
}> {
  if (!matches || matches.length === 0) {
    return { enrichedCount: 0, pinnacleCount: 0, unsupportedCount: 0 };
  }

  const apiKey = getTheOddsApiKey();
  if (!apiKey) {
    // Gracefully leave foreign odds as unavailable if API key is not present
    for (const m of matches) {
      if (!m.oddsSource?.foreign || m.oddsSource.foreign === 'derived') {
        m.foreign = null;
        m.oddsSource = {
          domestic: m.oddsSource?.domestic || 'real',
          foreign: 'unavailable'
        };
        m.foreignSourceName = '해외배당 미제공 (API 키 미설정)';
      }
    }
    return { enrichedCount: 0, pinnacleCount: 0, unsupportedCount: 0 };
  }

  // Find unique active sports needed
  const requiredSports = new Set<string>();
  for (const m of matches) {
    const league = (m.league || "").trim();
    const sportInfo = SUPPORTED_SPORTS_MAP[league];
    if (sportInfo) {
      requiredSports.add(sportInfo.sportKey);
    }
  }

  // Fetch odds for all required sports
  const sportOddsMap = new Map<string, TheOddsNormalizedGame[]>();
  for (const sportKey of requiredSports) {
    try {
      const odds = await fetchTheOddsApiOdds(sportKey, force);
      sportOddsMap.set(sportKey, odds);
    } catch {
      // Graceful fallback to cache without logging triggering error strings
      const cached = MEMORY_CACHE.get(sportKey);
      sportOddsMap.set(sportKey, cached ? cached.games : []);
    }
  }

  let enrichedCount = 0;
  let pinnacleCount = 0;
  let unsupportedCount = 0;

  for (const m of matches) {
    const league = (m.league || "").trim();

    // Check if unsupported league (KBO, KBL, KOVO, NPB)
    if (EXPLICITLY_UNSUPPORTED_LEAGUES.has(league)) {
      m.foreign = null;
      m.foreignStatus = 'UNAVAILABLE';
      m.foreignIsQuotaExhausted = isQuotaExhausted;
      m.oddsSource = {
        domestic: m.oddsSource?.domestic || 'real',
        foreign: 'unavailable'
      };
      m.foreignSourceName = `해외배당 미제공 (${league} 해외북 미지원)`;
      m.foreignBookmaker = undefined;
      m.foreignLastUpdate = undefined;
      m.foreignCachedAt = undefined;
      unsupportedCount++;
      continue;
    }

    const sportInfo = SUPPORTED_SPORTS_MAP[league];
    if (!sportInfo) {
      m.foreign = null;
      m.foreignStatus = 'UNAVAILABLE';
      m.foreignIsQuotaExhausted = isQuotaExhausted;
      m.oddsSource = {
        domestic: m.oddsSource?.domestic || 'real',
        foreign: 'unavailable'
      };
      m.foreignSourceName = '해외배당 미제공 (UNAVAILABLE)';
      m.foreignBookmaker = undefined;
      m.foreignLastUpdate = undefined;
      m.foreignCachedAt = undefined;
      continue;
    }

    const sportOdds = sportOddsMap.get(sportInfo.sportKey) || [];
    const matchResult = matchBetmanWithForeignOdds(
      {
        sport: m.sport,
        league: m.league,
        categoryType: m.categoryType,
        categoryLabel: m.categoryLabel,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        betmanHomeName: m.betmanHomeName,
        betmanAwayName: m.betmanAwayName,
        kickoffAt: m.kickoffAt,
        rawDate: m.rawDate,
        date: m.date
      },
      sportOdds
    );

    if (matchResult.matched && matchResult.game) {
      const g = matchResult.game;
      const cachedTime = g.cachedAt || (g.lastUpdate ? new Date(g.lastUpdate).getTime() : 0);
      const ageMs = Math.max(0, Date.now() - cachedTime);
      const isFresh = ageMs < CACHE_TTL_MS;

      // 4-state taxonomy: LIVE, CACHED, STALE, UNAVAILABLE
      let status: 'LIVE' | 'CACHED' | 'STALE';
      if (g.isCached === false && isFresh) {
        status = 'LIVE';
      } else if (isFresh) {
        status = 'CACHED';
      } else {
        status = 'STALE';
      }

      m.foreign = {
        win: g.odds.home,
        draw: g.odds.draw,
        lose: g.odds.away,
        refundRate: g.odds.refundRate,
        trend: 'flat'
      };
      m.foreignBookmaker = g.bookmakerTitle;
      m.foreignLastUpdate = g.lastUpdate;
      m.foreignStatus = status;
      m.foreignCachedAt = g.cachedAt ? new Date(g.cachedAt).toISOString() : (g.lastUpdate || new Date().toISOString());
      m.foreignIsQuotaExhausted = isQuotaExhausted;
      m.foreignMarket = 'h2h';
      m.foreignEventId = g.id;
      m.oddsSource = {
        domestic: m.oddsSource?.domestic || 'real',
        foreign: 'real'
      };

      if (status === 'STALE') {
        m.foreignSourceName = isQuotaExhausted
          ? `${g.bookmakerTitle} (오래된 캐시 · 갱신 필요 [쿼터 소진])`
          : `${g.bookmakerTitle} (오래된 캐시 · 갱신 필요)`;
      } else if (status === 'CACHED') {
        m.foreignSourceName = `${g.bookmakerTitle} (캐시 보관 배당)`;
      } else {
        m.foreignSourceName = `${g.bookmakerTitle} (The Odds API 실시간)`;
      }

      enrichedCount++;
      if (g.isPinnacle) pinnacleCount++;
    } else {
      // Strictly maintain UNAVAILABLE if not matched
      m.foreign = null;
      m.foreignStatus = 'UNAVAILABLE';
      m.foreignIsQuotaExhausted = isQuotaExhausted;
      m.oddsSource = {
        domestic: m.oddsSource?.domestic || 'real',
        foreign: 'unavailable'
      };
      if (isQuotaExhausted && (!sportOdds || sportOdds.length === 0)) {
        m.foreignSourceName = '해외배당 쿼터 소진 (API 한도 도달, 유료 플랜 권장)';
      } else {
        m.foreignSourceName = matchResult.reason || '해외배당 미제공 (UNAVAILABLE)';
      }
      m.foreignBookmaker = undefined;
      m.foreignLastUpdate = undefined;
      m.foreignCachedAt = undefined;
    }
  }

  return { enrichedCount, pinnacleCount, unsupportedCount };
}
