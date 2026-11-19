import { translateTeamNameToEnglish, normalizeTeamKey, resolveTeamCountryCode, TeamCountryInfo } from './teamTranslator';

export interface EspnInjuryItem {
  name: string;
  position: string;
  status: string; // '결장 확정 [OUT]' | '결장 의심 [GTD]'
  rawStatus: string;
  reason: string;
  isKeyPlayer: boolean;
  impactProbPct: number;
  impactNote: string;
}

export interface EspnPlayerItem {
  name: string;
  shortName?: string;
  position: string;
  shirtNumber?: number;
  isStarter: boolean;
  isAce: boolean;
  countryCode?: string;
  countryName?: string;
  flagUrl?: string;
  statNote: string;
}

export interface EspnOddsSnapshot {
  provider: string;
  details?: string;
  overUnder?: number | null;
  spread?: number | null;
  open?: {
    win: number | null;
    draw: number | null;
    lose: number | null;
  };
  current?: {
    win: number | null;
    draw: number | null;
    lose: number | null;
  };
  winMove?: 'up' | 'down' | 'flat';
  loseMove?: 'up' | 'down' | 'flat';
}

export interface EspnTeamRecord {
  overall?: string;
  home?: string;
  away?: string;
  restDays?: number | null;
  isBackToBack?: boolean;
  gamesInLast7Days?: number;
  hasMidweekCup?: boolean;
  midweekCompetition?: string | null;
  midweekDaysAway?: number | null;
  startingPitcher?: {
    name: string;
    era?: number | null;
    record?: string | null;
  } | null;
}

export interface EspnTeamSeasonStats {
  gamesPlayed?: number;
  ppg?: number;
  oppg?: number;
  fgPct?: number;
  threePPct?: number;
  ftPct?: number;
  rpg?: number;
  orpg?: number;
  apg?: number;
  tov?: number;
}

export interface EspnLeaderEntry {
  name: string;
  position?: string;
  ppg?: number;
  rpg?: number;
  apg?: number;
  summary?: string;
}

export interface EspnMatchIntel {
  matched: boolean;
  sportPath: string;
  leagueSlug: string;
  eventId?: string;
  statusState?: string; // 'pre' | 'in' | 'post'
  venue?: string;
  homeTeamEn: string;
  awayTeamEn: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeLogo?: string;
  awayLogo?: string;
  isOfficialConfirmed: boolean;
  confirmedTimeText: string;
  homeFormation?: string;
  awayFormation?: string;
  homeStarters: EspnPlayerItem[];
  awayStarters: EspnPlayerItem[];
  homeFullRoster?: EspnPlayerItem[];
  awayFullRoster?: EspnPlayerItem[];
  homeBench: string[];
  awayBench: string[];
  homeInjuries: EspnInjuryItem[];
  awayInjuries: EspnInjuryItem[];
  odds?: EspnOddsSnapshot | null;
  homeRecord?: EspnTeamRecord;
  awayRecord?: EspnTeamRecord;
  predictor?: { homeWinPct?: number; awayWinPct?: number } | null;
  homeTeamStats?: EspnTeamSeasonStats;
  awayTeamStats?: EspnTeamSeasonStats;
  homeLeaders?: EspnLeaderEntry[];
  awayLeaders?: EspnLeaderEntry[];
  lastFive?: {
    home: Array<{ date: string; opponent: string; isHome: boolean; scoreFor: number; scoreAgainst: number; result: 'W' | 'D' | 'L' }>;
    away: Array<{ date: string; opponent: string; isHome: boolean; scoreFor: number; scoreAgainst: number; result: 'W' | 'D' | 'L' }>;
  } | null;
  sourceName: string;
}

interface CacheEntry<T> {
  fetchedAt: number;
  data: T;
}

const scoreboardCache = new Map<string, CacheEntry<any>>();
const teamsCache = new Map<string, CacheEntry<any[]>>();
const injuriesCache = new Map<string, CacheEntry<any[]>>();
const rosterCache = new Map<string, CacheEntry<any[]>>();
const summaryCache = new Map<string, CacheEntry<any>>();
const teamStatsCache = new Map<string, CacheEntry<any>>();
const teamScheduleCache = new Map<string, CacheEntry<any>>();

const SCOREBOARD_TTL_MS = 5 * 60 * 1000;
const INJURIES_TTL_MS = 5 * 60 * 1000;
const TEAMS_TTL_MS = 60 * 60 * 1000;
const ROSTER_TTL_MS = 30 * 60 * 1000;
const SUMMARY_TTL_MS = 3 * 60 * 1000;
const TEAM_STATS_TTL_MS = 15 * 60 * 1000;
const TEAM_SCHEDULE_TTL_MS = 15 * 60 * 1000;

async function fetchJsonWithTimeout(url: string, timeoutMs = 4500): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function americanToDecimal(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toUpperCase();
  if (!s) return null;
  if (s === 'EVEN' || s === 'PK') return 2.0;
  const num = Number(s.replace(/[^0-9+\-.]/g, ''));
  if (!Number.isFinite(num) || num === 0) return null;
  if (num > 0) {
    return Number((1 + num / 100).toFixed(2));
  }
  return Number((1 + 100 / Math.abs(num)).toFixed(2));
}

export function resolveEspnLeagueCandidates(sport: string, league: string): { sportPath: string; slugs: string[] } | null {
  const sp = String(sport || '').toLowerCase();
  const lg = String(league || '').toUpperCase().replace(/\s+/g, '');

  if (sp.includes('basket') || sp === 'bk') {
    if (lg.includes('NBA') || !lg) {
      return { sportPath: 'basketball', slugs: ['nba'] };
    }
    return null; // KBL / WKBL / EASL not on ESPN
  }

  if (sp.includes('base') || sp === 'bs') {
    if (lg.includes('MLB') || !lg) {
      return { sportPath: 'baseball', slugs: ['mlb'] };
    }
    return null;
  }

  if (sp.includes('volley') || sp === 'vl') {
    return null;
  }

  // Soccer
  const slugs: string[] = [];
  if (lg.includes('EPL') || lg.includes('프리미어')) slugs.push('eng.1');
  else if (lg.includes('라리가') || lg.includes('LALIGA') || lg.includes('스페인')) slugs.push('esp.1');
  else if (lg.includes('분데스') || lg.includes('BUNDES')) slugs.push('ger.1');
  else if (lg.includes('세리에') || lg.includes('SERIE')) slugs.push('ita.1');
  else if (lg.includes('리그1') || lg.includes('LIGUE')) slugs.push('fra.1');
  else if (lg.includes('UCL') || lg.includes('챔스') || lg.includes('챔피언스')) slugs.push('uefa.champions');
  else if (lg.includes('UEL') || lg.includes('유로파')) slugs.push('uefa.europa');
  else if (lg.includes('MLS') || lg.includes('미국')) slugs.push('usa.1');
  else if (lg.includes('A리그') || lg.includes('호주')) slugs.push('aus.1');
  else if (lg.includes('J1') || lg.includes('J리그') || lg.includes('일본')) slugs.push('jpn.1');
  else if (lg.includes('C네이션') || lg.includes('CONCACAF')) {
    slugs.push('concacaf.nations.league', 'fifa.worldq.concacaf', 'fifa.friendly');
  } else if (lg.includes('네이션') || lg.includes('A네이션') || lg.includes('B네이션') || lg.includes('D네이션')) {
    slugs.push('uefa.nations', 'concacaf.nations.league', 'fifa.friendly');
  } else if (lg.includes('INTL') || lg.includes('친선') || lg.includes('A매치') || lg.includes('월드컵')) {
    slugs.push('fifa.friendly', 'fifa.world', 'uefa.nations', 'concacaf.nations.league');
  } else if (lg.includes('에레디') || lg.includes('네덜란드')) slugs.push('ned.1');
  else if (lg.includes('프리메') || lg.includes('포르투갈')) slugs.push('por.1');
  else {
    // Broad fallback across major soccer leagues on ESPN
    slugs.push('eng.1', 'esp.1', 'ger.1', 'ita.1', 'fra.1', 'usa.1', 'uefa.champions', 'aus.1', 'jpn.1', 'fifa.friendly');
  }

  return { sportPath: 'soccer', slugs };
}

export async function getEspnScoreboard(sportPath: string, slug: string): Promise<any | null> {
  const key = `${sportPath}/${slug}`;
  const cached = scoreboardCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < SCOREBOARD_TTL_MS) {
    return cached.data;
  }
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/${slug}/scoreboard`;
  const data = await fetchJsonWithTimeout(url, 4500);
  if (data) {
    scoreboardCache.set(key, { fetchedAt: Date.now(), data });
  }
  return data;
}

export async function getEspnTeams(sportPath: string, slug: string): Promise<any[]> {
  const key = `${sportPath}/${slug}`;
  const cached = teamsCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TEAMS_TTL_MS) {
    return cached.data;
  }
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/${slug}/teams?limit=100`;
  const data = await fetchJsonWithTimeout(url, 4500);
  const rawTeams = data?.sports?.[0]?.leagues?.[0]?.teams || [];
  const teams = rawTeams.map((t: any) => t.team || t).filter(Boolean);
  if (teams.length > 0) {
    teamsCache.set(key, { fetchedAt: Date.now(), data: teams });
  }
  return teams;
}

export async function getEspnInjuries(sportPath: string, slug: string): Promise<any[]> {
  const key = `${sportPath}/${slug}`;
  const cached = injuriesCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < INJURIES_TTL_MS) {
    return cached.data;
  }
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/${slug}/injuries`;
  const data = await fetchJsonWithTimeout(url, 4500);
  const list = Array.isArray(data?.injuries) ? data.injuries : [];
  if (data) {
    injuriesCache.set(key, { fetchedAt: Date.now(), data: list });
  }
  return list;
}

export async function getEspnTeamRoster(sportPath: string, slug: string, teamId: string): Promise<any[]> {
  if (!teamId) return [];
  const key = `${sportPath}/${slug}/${teamId}`;
  const cached = rosterCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < ROSTER_TTL_MS) {
    return cached.data;
  }
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/${slug}/teams/${teamId}/roster`;
  const data = await fetchJsonWithTimeout(url, 4500);
  const athletes = Array.isArray(data?.athletes) ? data.athletes : [];
  if (athletes.length > 0) {
    rosterCache.set(key, { fetchedAt: Date.now(), data: athletes });
  }
  return athletes;
}

export async function getEspnSummary(sportPath: string, slug: string, eventId: string): Promise<any | null> {
  if (!eventId) return null;
  const key = `${sportPath}/${slug}/${eventId}`;
  const cached = summaryCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < SUMMARY_TTL_MS) {
    return cached.data;
  }
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/${slug}/summary?event=${eventId}`;
  const data = await fetchJsonWithTimeout(url, 5000);
  if (data) {
    summaryCache.set(key, { fetchedAt: Date.now(), data });
  }
  return data;
}

export async function getEspnTeamStats(sportPath: string, slug: string, teamId: string): Promise<any | null> {
  if (!teamId) return null;
  const key = `${sportPath}/${slug}/${teamId}`;
  const cached = teamStatsCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TEAM_STATS_TTL_MS) {
    return cached.data;
  }
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/${slug}/teams/${teamId}/statistics`;
  const data = await fetchJsonWithTimeout(url, 4000);
  if (data) {
    teamStatsCache.set(key, { fetchedAt: Date.now(), data });
  }
  return data;
}

export async function getEspnTeamSchedule(sportPath: string, slug: string, teamId: string): Promise<any | null> {
  if (!teamId) return null;
  const key = `${sportPath}/${slug}/${teamId}`;
  const cached = teamScheduleCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TEAM_SCHEDULE_TTL_MS) {
    return cached.data;
  }
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/${slug}/teams/${teamId}/schedule`;
  const data = await fetchJsonWithTimeout(url, 4000);
  if (data) {
    teamScheduleCache.set(key, { fetchedAt: Date.now(), data });
  }
  return data;
}

function teamMatchesCandidate(targetEn: string, candidateName: string, candidateShort?: string, candidateAbbr?: string): boolean {
  const tNorm = normalizeTeamKey(targetEn);
  if (!tNorm) return false;
  const cands = [candidateName, candidateShort, candidateAbbr].filter(Boolean).map(s => normalizeTeamKey(String(s)));
  for (const c of cands) {
    if (!c) continue;
    if (c === tNorm) return true;
    if (c.length >= 4 && tNorm.length >= 4 && (c.includes(tNorm) || tNorm.includes(c))) return true;
  }
  // Word overlap fallback for multi-word English names
  const tWords = targetEn.toLowerCase().split(/\s+/).filter(w => w.length >= 4 && !['city', 'united', 'real', 'club', 'athletic'].includes(w));
  const cLower = (candidateName || '').toLowerCase();
  if (tWords.length > 0 && tWords.some(w => cLower.includes(w))) {
    return true;
  }
  return false;
}

function mapEspnInjuryStatus(rawStatus: string): { statusLabel: string; isOut: boolean } {
  const s = String(rawStatus || '').toLowerCase();
  if (s.includes('out') || s.includes('suspended') || s.includes('ir') || s.includes('injured reserve')) {
    return { statusLabel: '결장 확정 [OUT]', isOut: true };
  }
  return { statusLabel: '결장 의심 [GTD]', isOut: false };
}

function mapEspnInjuriesList(rawInjuries: any[]): EspnInjuryItem[] {
  if (!Array.isArray(rawInjuries)) return [];
  return rawInjuries.map((inj, idx) => {
    const rawStatus = inj.status || inj.type?.description || 'Day-To-Day';
    const { statusLabel, isOut } = mapEspnInjuryStatus(rawStatus);
    const name = inj.athlete?.displayName || inj.athlete?.shortName || '선수';
    const pos = inj.athlete?.position?.abbreviation || inj.athlete?.position?.displayName || '선수';
    const reason = inj.shortComment || inj.longComment || inj.details?.detail || inj.details?.type || '부상/컨디션 이슈';
    const isKeyPlayer = idx < 2 || isOut;
    const impactProbPct = isOut ? -3.0 : -1.2;
    return {
      name,
      position: pos,
      status: statusLabel,
      rawStatus: String(rawStatus),
      reason,
      isKeyPlayer,
      impactProbPct,
      impactNote: isOut ? `결장 확정 전력 손실 (${impactProbPct}%p)` : `출전 불투명 변수 (${impactProbPct}%p)`
    };
  });
}

function extractOddsFromCompetitionOrPickcenter(comp: any, pickcenter: any[]): EspnOddsSnapshot | null {
  const cOdds = Array.isArray(comp?.odds) && comp.odds.length > 0 ? comp.odds[0] : null;
  const pick = Array.isArray(pickcenter) && pickcenter.length > 0 ? pickcenter[0] : null;
  if (!cOdds && !pick) return null;

  const ml = cOdds?.moneyline;
  const openWin = americanToDecimal(ml?.home?.open?.odds);
  const openDraw = americanToDecimal(ml?.draw?.open?.odds);
  const openLose = americanToDecimal(ml?.away?.open?.odds);

  const curWin = americanToDecimal(ml?.home?.close?.odds) ?? americanToDecimal(pick?.homeTeamOdds?.moneyLine);
  const curDraw = americanToDecimal(ml?.draw?.close?.odds) ?? americanToDecimal(pick?.drawOdds?.moneyLine);
  const curLose = americanToDecimal(ml?.away?.close?.odds) ?? americanToDecimal(pick?.awayTeamOdds?.moneyLine);

  const winMove: 'up' | 'down' | 'flat' =
    openWin && curWin ? (curWin > openWin ? 'up' : curWin < openWin ? 'down' : 'flat') : 'flat';
  const loseMove: 'up' | 'down' | 'flat' =
    openLose && curLose ? (curLose > openLose ? 'up' : curLose < openLose ? 'down' : 'flat') : 'flat';

  return {
    provider: cOdds?.provider?.name || pick?.provider?.name || 'DraftKings',
    details: cOdds?.details || pick?.details,
    overUnder: typeof (cOdds?.overUnder ?? pick?.overUnder) === 'number' ? (cOdds?.overUnder ?? pick?.overUnder) : null,
    spread: typeof (cOdds?.spread ?? pick?.spread) === 'number' ? (cOdds?.spread ?? pick?.spread) : null,
    open: (openWin || openLose) ? { win: openWin, draw: openDraw, lose: openLose } : undefined,
    current: (curWin || curLose) ? { win: curWin, draw: curDraw, lose: curLose } : undefined,
    winMove,
    loseMove
  };
}

const EN_COUNTRY_TO_ISO: Record<string, { code: string; name: string }> = {
  'usa': { code: 'us', name: 'United States' },
  'united states': { code: 'us', name: 'United States' },
  'canada': { code: 'ca', name: 'Canada' },
  'france': { code: 'fr', name: 'France' },
  'spain': { code: 'es', name: 'Spain' },
  'germany': { code: 'de', name: 'Germany' },
  'italy': { code: 'it', name: 'Italy' },
  'england': { code: 'gb-eng', name: 'England' },
  'united kingdom': { code: 'gb', name: 'United Kingdom' },
  'scotland': { code: 'gb-sct', name: 'Scotland' },
  'wales': { code: 'gb-wls', name: 'Wales' },
  'ireland': { code: 'ie', name: 'Ireland' },
  'portugal': { code: 'pt', name: 'Portugal' },
  'netherlands': { code: 'nl', name: 'Netherlands' },
  'belgium': { code: 'be', name: 'Belgium' },
  'switzerland': { code: 'ch', name: 'Switzerland' },
  'austria': { code: 'at', name: 'Austria' },
  'denmark': { code: 'dk', name: 'Denmark' },
  'sweden': { code: 'se', name: 'Sweden' },
  'norway': { code: 'no', name: 'Norway' },
  'finland': { code: 'fi', name: 'Finland' },
  'poland': { code: 'pl', name: 'Poland' },
  'croatia': { code: 'hr', name: 'Croatia' },
  'serbia': { code: 'rs', name: 'Serbia' },
  'slovenia': { code: 'si', name: 'Slovenia' },
  'slovakia': { code: 'sk', name: 'Slovakia' },
  'czechia': { code: 'cz', name: 'Czechia' },
  'czech republic': { code: 'cz', name: 'Czech Republic' },
  'greece': { code: 'gr', name: 'Greece' },
  'turkey': { code: 'tr', name: 'Turkey' },
  'ukraine': { code: 'ua', name: 'Ukraine' },
  'georgia': { code: 'ge', name: 'Georgia' },
  'latvia': { code: 'lv', name: 'Latvia' },
  'lithuania': { code: 'lt', name: 'Lithuania' },
  'montenegro': { code: 'me', name: 'Montenegro' },
  'bosnia and herzegovina': { code: 'ba', name: 'Bosnia and Herzegovina' },
  'israel': { code: 'il', name: 'Israel' },
  'australia': { code: 'au', name: 'Australia' },
  'new zealand': { code: 'nz', name: 'New Zealand' },
  'japan': { code: 'jp', name: 'Japan' },
  'south korea': { code: 'kr', name: 'South Korea' },
  'korea': { code: 'kr', name: 'South Korea' },
  'china': { code: 'cn', name: 'China' },
  'philippines': { code: 'ph', name: 'Philippines' },
  'brazil': { code: 'br', name: 'Brazil' },
  'argentina': { code: 'ar', name: 'Argentina' },
  'uruguay': { code: 'uy', name: 'Uruguay' },
  'colombia': { code: 'co', name: 'Colombia' },
  'ecuador': { code: 'ec', name: 'Ecuador' },
  'bolivia': { code: 'bo', name: 'Bolivia' },
  'paraguay': { code: 'py', name: 'Paraguay' },
  'chile': { code: 'cl', name: 'Chile' },
  'peru': { code: 'pe', name: 'Peru' },
  'venezuela': { code: 've', name: 'Venezuela' },
  'mexico': { code: 'mx', name: 'Mexico' },
  'haiti': { code: 'ht', name: 'Haiti' },
  'jamaica': { code: 'jm', name: 'Jamaica' },
  'dominican republic': { code: 'do', name: 'Dominican Republic' },
  'puerto rico': { code: 'pr', name: 'Puerto Rico' },
  'bahamas': { code: 'bs', name: 'Bahamas' },
  'costa rica': { code: 'cr', name: 'Costa Rica' },
  'panama': { code: 'pa', name: 'Panama' },
  'honduras': { code: 'hn', name: 'Honduras' },
  'el salvador': { code: 'sv', name: 'El Salvador' },
  'guatemala': { code: 'gt', name: 'Guatemala' },
  'cuba': { code: 'cu', name: 'Cuba' },
  'cameroon': { code: 'cm', name: 'Cameroon' },
  'nigeria': { code: 'ng', name: 'Nigeria' },
  'senegal': { code: 'sn', name: 'Senegal' },
  'morocco': { code: 'ma', name: 'Morocco' },
  'egypt': { code: 'eg', name: 'Egypt' },
  'ghana': { code: 'gh', name: 'Ghana' },
  'ivory coast': { code: 'ci', name: 'Ivory Coast' },
  'south africa': { code: 'za', name: 'South Africa' },
  'algeria': { code: 'dz', name: 'Algeria' },
  'tunisia': { code: 'tn', name: 'Tunisia' },
  'mali': { code: 'ml', name: 'Mali' },
  'south sudan': { code: 'ss', name: 'South Sudan' },
  'angola': { code: 'ao', name: 'Angola' },
  'congo': { code: 'cd', name: 'DR Congo' }
};

function resolveEspnAthleteCountry(
  athlete: any,
  teamCountry?: TeamCountryInfo | null
): { countryCode?: string; countryName?: string; flagUrl?: string } {
  if (teamCountry?.isNationalTeam) {
    return {
      countryCode: teamCountry.code,
      countryName: teamCountry.name,
      flagUrl: teamCountry.flagUrl
    };
  }

  const rawCountry = String(
    athlete?.citizenship ||
    athlete?.nationality ||
    athlete?.birthPlace?.country ||
    athlete?.flag?.alt ||
    ''
  ).trim();

  if (rawCountry) {
    const mapped = EN_COUNTRY_TO_ISO[rawCountry.toLowerCase()];
    if (mapped) {
      return {
        countryCode: mapped.code,
        countryName: mapped.name,
        flagUrl: `https://flagcdn.com/w40/${mapped.code}.png`
      };
    }
  }

  if (athlete?.flag?.href) {
    return {
      countryName: athlete.flag.alt || rawCountry || undefined,
      flagUrl: athlete.flag.href
    };
  }

  // Strictly return empty when individual player nationality is unknown on a club team
  return {};
}

function parseEspnSummaryRosters(
  rostersArr: any[],
  homeEn: string,
  awayEn: string,
  sportPath: string,
  homeCountry?: TeamCountryInfo | null,
  awayCountry?: TeamCountryInfo | null
) {
  if (!Array.isArray(rostersArr) || rostersArr.length === 0) return null;

  const findSide = (targetEn: string, ha: 'home' | 'away') =>
    rostersArr.find(r => r.homeAway === ha) ||
    rostersArr.find(r => teamMatchesCandidate(targetEn, r.team?.displayName || ''));

  const hRaw = findSide(homeEn, 'home');
  const aRaw = findSide(awayEn, 'away');

  const mapRoster = (raw: any, teamCountry?: TeamCountryInfo | null): { starters: EspnPlayerItem[]; bench: string[]; formation?: string } => {
    const list = Array.isArray(raw?.roster) ? raw.roster : [];
    if (list.length === 0) return { starters: [], bench: [], formation: raw?.formation };

    const starters: EspnPlayerItem[] = [];
    const bench: string[] = [];

    for (const p of list) {
      const name = p.athlete?.displayName || p.athlete?.shortName || '';
      if (!name) continue;
      const pos = p.position?.abbreviation || p.athlete?.position?.abbreviation || '선발';
      const jersey = p.jersey ? parseInt(String(p.jersey), 10) : undefined;
      const cInfo = resolveEspnAthleteCountry(p.athlete, teamCountry);
      const isStarter = Boolean(p.starter);
      if (isStarter) {
        starters.push({
          name,
          shortName: p.athlete?.shortName || name,
          position: pos,
          shirtNumber: Number.isFinite(jersey) ? jersey : undefined,
          isStarter: true,
          isAce: starters.length < 3,
          countryCode: cInfo.countryCode,
          countryName: cInfo.countryName,
          flagUrl: cInfo.flagUrl,
          statNote: `${jersey ? `#${jersey} ` : ''}${pos} (공식 선발)`
        });
      } else {
        bench.push(`${jersey ? `#${jersey} ` : ''}${name} (${pos})`);
      }
    }

    // If ESPN didn't mark starter boolean yet, take top squad
    if (starters.length === 0 && list.length > 0) {
      const starterCap = sportPath === 'basketball' ? 5 : 11;
      list.slice(0, starterCap).forEach((p: any, i: number) => {
        const name = p.athlete?.displayName || '';
        const pos = p.position?.abbreviation || p.athlete?.position?.abbreviation || '선수';
        const jersey = p.jersey ? parseInt(String(p.jersey), 10) : undefined;
        const cInfo = resolveEspnAthleteCountry(p.athlete, teamCountry);
        if (name) {
          starters.push({
            name,
            position: pos,
            shirtNumber: Number.isFinite(jersey) ? jersey : undefined,
            isStarter: false,
            isAce: i < 3,
            countryCode: cInfo.countryCode,
            countryName: cInfo.countryName,
            flagUrl: cInfo.flagUrl,
            statNote: `${jersey ? `#${jersey} ` : ''}${pos}`
          });
        }
      });
    }

    return {
      starters,
      bench: bench.slice(0, 12),
      formation: raw?.formation
    };
  };

  const homeParsed = mapRoster(hRaw, homeCountry);
  const awayParsed = mapRoster(aRaw, awayCountry);
  if (homeParsed.starters.length === 0 && awayParsed.starters.length === 0) return null;

  return { home: homeParsed, away: awayParsed };
}

function mapTeamRosterFallback(
  athletes: any[],
  sportPath: string,
  teamCountry?: TeamCountryInfo | null
): { starters: EspnPlayerItem[]; bench: string[] } {
  if (!Array.isArray(athletes) || athletes.length === 0) return { starters: [], bench: [] };

  const starterCount = sportPath === 'basketball' ? 5 : sportPath === 'baseball' ? 9 : 11;

  // For soccer, sort logically GK -> D -> M -> F for first XI preview
  let ordered = [...athletes];
  if (sportPath === 'soccer') {
    const gk = ordered.filter(a => (a.position?.abbreviation || '').startsWith('G')).slice(0, 1);
    const df = ordered.filter(a => (a.position?.abbreviation || '').startsWith('D')).slice(0, 4);
    const mf = ordered.filter(a => (a.position?.abbreviation || '').startsWith('M')).slice(0, 3);
    const fw = ordered.filter(a => (a.position?.abbreviation || '').startsWith('F')).slice(0, 3);
    const coreIds = new Set([...gk, ...df, ...mf, ...fw].map(a => a.id || a.displayName));
    const rest = ordered.filter(a => !coreIds.has(a.id || a.displayName));
    ordered = [...gk, ...df, ...mf, ...fw, ...rest];
  } else if (sportPath === 'basketball') {
    // Pick balanced G / F / C if available
    const g = ordered.filter(a => (a.position?.abbreviation || '').includes('G')).slice(0, 2);
    const f = ordered.filter(a => (a.position?.abbreviation || '').includes('F')).slice(0, 2);
    const c = ordered.filter(a => (a.position?.abbreviation || '').includes('C')).slice(0, 1);
    const coreIds = new Set([...g, ...f, ...c].map(a => a.id || a.displayName));
    const rest = ordered.filter(a => !coreIds.has(a.id || a.displayName));
    ordered = [...g, ...f, ...c, ...rest];
  }

  const starters: EspnPlayerItem[] = ordered.slice(0, starterCount).map((a, idx) => {
    const jersey = a.jersey ? parseInt(String(a.jersey), 10) : undefined;
    const pos = a.position?.abbreviation || a.position?.displayName || '선수';
    const cInfo = resolveEspnAthleteCountry(a, teamCountry);
    return {
      name: a.displayName || a.fullName || '선수',
      shortName: a.shortName || a.displayName,
      position: pos,
      shirtNumber: Number.isFinite(jersey) ? jersey : undefined,
      isStarter: false,
      isAce: idx < 3,
      countryCode: cInfo.countryCode,
      countryName: cInfo.countryName,
      flagUrl: cInfo.flagUrl,
      statNote: `${jersey ? `#${jersey} ` : ''}${pos} (1군 로스터)`
    };
  });

  const bench = ordered.slice(starterCount, starterCount + 12).map(a => {
    const jersey = a.jersey ? `#${a.jersey} ` : '';
    const pos = a.position?.abbreviation || '';
    return `${jersey}${a.displayName}${pos ? ` (${pos})` : ''}`;
  });

  return { starters, bench };
}

export async function fetchEspnMatchIntel(
  homeTeamKo: string,
  awayTeamKo: string,
  sport: string,
  league: string
): Promise<EspnMatchIntel | null> {
  const candidateCfg = resolveEspnLeagueCandidates(sport, league);
  if (!candidateCfg) return null;

  const homeEn = translateTeamNameToEnglish(homeTeamKo);
  const awayEn = translateTeamNameToEnglish(awayTeamKo);
  const { sportPath, slugs } = candidateCfg;

  let matchedSlug = slugs[0];
  let matchedEvent: any = null;
  let homeTeamObj: any = null;
  let awayTeamObj: any = null;
  let homeCompObj: any = null;
  let awayCompObj: any = null;

  // 1. Search candidate scoreboards for the exact matchup
  for (const slug of slugs) {
    const sb = await getEspnScoreboard(sportPath, slug);
    const events = Array.isArray(sb?.events) ? sb.events : [];
    const found = events.find((ev: any) => {
      const comps = ev.competitions?.[0]?.competitors || [];
      if (comps.length < 2) return false;
      const names = comps.map((c: any) => ({
        name: c.team?.displayName || '',
        short: c.team?.shortDisplayName || '',
        abbr: c.team?.abbreviation || ''
      }));
      const hasHome = names.some((n: any) => teamMatchesCandidate(homeEn, n.name, n.short, n.abbr));
      const hasAway = names.some((n: any) => teamMatchesCandidate(awayEn, n.name, n.short, n.abbr));
      return hasHome && hasAway;
    });

    if (found) {
      matchedSlug = slug;
      matchedEvent = found;
      const comps = found.competitions?.[0]?.competitors || [];
      const hComp = comps.find((c: any) => teamMatchesCandidate(homeEn, c.team?.displayName, c.team?.shortDisplayName, c.team?.abbreviation)) || comps.find((c: any) => c.homeAway === 'home');
      const aComp = comps.find((c: any) => teamMatchesCandidate(awayEn, c.team?.displayName, c.team?.shortDisplayName, c.team?.abbreviation)) || comps.find((c: any) => c.homeAway === 'away');
      homeCompObj = hComp || null;
      awayCompObj = aComp || null;
      homeTeamObj = hComp?.team || null;
      awayTeamObj = aComp?.team || null;
      break;
    }
  }

  // 2. If not on current scoreboard, resolve teams from ESPN teams endpoint (still gives real live roster + injuries!)
  if (!homeTeamObj || !awayTeamObj) {
    for (const slug of slugs.slice(0, 3)) {
      const teams = await getEspnTeams(sportPath, slug);
      if (teams.length === 0) continue;
      const hT = teams.find(t => teamMatchesCandidate(homeEn, t.displayName, t.shortDisplayName, t.abbreviation));
      const aT = teams.find(t => teamMatchesCandidate(awayEn, t.displayName, t.shortDisplayName, t.abbreviation));
      if (hT || aT) {
        matchedSlug = slug;
        if (hT) homeTeamObj = hT;
        if (aT) awayTeamObj = aT;
        break;
      }
    }
  }

  if (!matchedEvent && !homeTeamObj && !awayTeamObj) {
    return null;
  }

  const homeCountry = resolveTeamCountryCode(homeTeamKo, league, sport);
  const awayCountry = resolveTeamCountryCode(awayTeamKo, league, sport);

  const homeTeamId = homeTeamObj?.id ? String(homeTeamObj.id) : undefined;
  const awayTeamId = awayTeamObj?.id ? String(awayTeamObj.id) : undefined;
  const homeLogo = homeTeamObj?.logo || homeTeamObj?.logos?.[0]?.href || (homeCountry?.isNationalTeam ? `https://flagcdn.com/w80/${homeCountry.code}.png` : undefined);
  const awayLogo = awayTeamObj?.logo || awayTeamObj?.logos?.[0]?.href || (awayCountry?.isNationalTeam ? `https://flagcdn.com/w80/${awayCountry.code}.png` : undefined);

  // 3. Parallel fetch event summary + league injuries + rosters + team stats + team schedules
  const [initialSummary, leagueInjuries, homeRosterRaw, awayRosterRaw, homeStatsRaw, awayStatsRaw, homeSchedRaw, awaySchedRaw] = await Promise.all([
    matchedEvent?.id ? getEspnSummary(sportPath, matchedSlug, String(matchedEvent.id)) : Promise.resolve(null),
    (sportPath === 'basketball' || sportPath === 'baseball') ? getEspnInjuries(sportPath, matchedSlug) : Promise.resolve([]),
    homeTeamId ? getEspnTeamRoster(sportPath, matchedSlug, homeTeamId) : Promise.resolve([]),
    awayTeamId ? getEspnTeamRoster(sportPath, matchedSlug, awayTeamId) : Promise.resolve([]),
    (homeTeamId && sportPath === 'basketball') ? getEspnTeamStats(sportPath, matchedSlug, homeTeamId) : Promise.resolve(null),
    (awayTeamId && sportPath === 'basketball') ? getEspnTeamStats(sportPath, matchedSlug, awayTeamId) : Promise.resolve(null),
    (homeTeamId && (sportPath === 'basketball' || sportPath === 'baseball' || sportPath === 'soccer')) ? getEspnTeamSchedule(sportPath, matchedSlug, homeTeamId) : Promise.resolve(null),
    (awayTeamId && (sportPath === 'basketball' || sportPath === 'baseball' || sportPath === 'soccer')) ? getEspnTeamSchedule(sportPath, matchedSlug, awayTeamId) : Promise.resolve(null)
  ]);

  let summary = initialSummary;
  // If scoreboard did not have this match (e.g., recently finished or 2 days out), find it in team schedule and pull summary
  if (!summary && homeTeamId && awayTeamId && Array.isArray(homeSchedRaw?.events)) {
    const schedMatch = homeSchedRaw.events.find((ev: any) => {
      const comps = ev.competitions?.[0]?.competitors || [];
      return comps.some((c: any) => String(c.team?.id || c.id) === String(awayTeamId));
    });
    if (schedMatch?.id) {
      if (!matchedEvent) matchedEvent = schedMatch;
      const comps = schedMatch.competitions?.[0]?.competitors || [];
      if (!homeCompObj) homeCompObj = comps.find((c: any) => String(c.team?.id || c.id) === String(homeTeamId)) || null;
      if (!awayCompObj) awayCompObj = comps.find((c: any) => String(c.team?.id || c.id) === String(awayTeamId)) || null;
      summary = await getEspnSummary(sportPath, matchedSlug, String(schedMatch.id));
    }
  }

  // 4. Extract Injuries (Summary injuries take precedence; fallback to league-wide injuries report)
  let homeInjuries: EspnInjuryItem[] = [];
  let awayInjuries: EspnInjuryItem[] = [];

  if (Array.isArray(summary?.injuries) && summary.injuries.length > 0) {
    const hInjTeam = summary.injuries.find((t: any) =>
      (homeTeamId && String(t.team?.id) === homeTeamId) || teamMatchesCandidate(homeEn, t.team?.displayName || '')
    );
    const aInjTeam = summary.injuries.find((t: any) =>
      (awayTeamId && String(t.team?.id) === awayTeamId) || teamMatchesCandidate(awayEn, t.team?.displayName || '')
    );
    homeInjuries = mapEspnInjuriesList(hInjTeam?.injuries || []);
    awayInjuries = mapEspnInjuriesList(aInjTeam?.injuries || []);
  }

  if (homeInjuries.length === 0 && Array.isArray(leagueInjuries) && leagueInjuries.length > 0) {
    const hInj = leagueInjuries.find((t: any) =>
      (homeTeamId && String(t.id) === homeTeamId) || teamMatchesCandidate(homeEn, t.displayName || '')
    );
    if (hInj?.injuries) homeInjuries = mapEspnInjuriesList(hInj.injuries);
  }
  if (awayInjuries.length === 0 && Array.isArray(leagueInjuries) && leagueInjuries.length > 0) {
    const aInj = leagueInjuries.find((t: any) =>
      (awayTeamId && String(t.id) === awayTeamId) || teamMatchesCandidate(awayEn, t.displayName || '')
    );
    if (aInj?.injuries) awayInjuries = mapEspnInjuriesList(aInj.injuries);
  }

  // Filter injured OUT players out of expected starters when building roster fallback
  const homeOutNames = new Set(homeInjuries.filter(i => i.status.includes('OUT')).map(i => i.name.toLowerCase()));
  const awayOutNames = new Set(awayInjuries.filter(i => i.status.includes('OUT')).map(i => i.name.toLowerCase()));

  // 5. Extract Starters & Roster
  const summaryRosters = parseEspnSummaryRosters(summary?.rosters || [], homeEn, awayEn, sportPath, homeCountry, awayCountry);
  let homeStarters: EspnPlayerItem[] = [];
  let awayStarters: EspnPlayerItem[] = [];
  let homeBench: string[] = [];
  let awayBench: string[] = [];
  let homeFormation: string | undefined;
  let awayFormation: string | undefined;
  let isOfficialConfirmed = false;

  if (summaryRosters && (summaryRosters.home.starters.length > 0 || summaryRosters.away.starters.length > 0)) {
    homeStarters = summaryRosters.home.starters;
    awayStarters = summaryRosters.away.starters;
    homeBench = summaryRosters.home.bench;
    awayBench = summaryRosters.away.bench;
    homeFormation = summaryRosters.home.formation;
    awayFormation = summaryRosters.away.formation;
    isOfficialConfirmed = homeStarters.some(s => s.isStarter) && awayStarters.some(s => s.isStarter);
  } else {
    const filteredHomeRoster = homeRosterRaw.filter((a: any) => !homeOutNames.has(String(a.displayName || '').toLowerCase()));
    const filteredAwayRoster = awayRosterRaw.filter((a: any) => !awayOutNames.has(String(a.displayName || '').toLowerCase()));
    const hMap = mapTeamRosterFallback(filteredHomeRoster.length > 0 ? filteredHomeRoster : homeRosterRaw, sportPath, homeCountry);
    const aMap = mapTeamRosterFallback(filteredAwayRoster.length > 0 ? filteredAwayRoster : awayRosterRaw, sportPath, awayCountry);
    homeStarters = hMap.starters;
    awayStarters = aMap.starters;
    homeBench = hMap.bench;
    awayBench = aMap.bench;
  }

  const comp = matchedEvent?.competitions?.[0] || summary?.header?.competitions?.[0];
  const odds = extractOddsFromCompetitionOrPickcenter(comp, summary?.pickcenter || []);

  // 6. Extract Venue, Records, Team Stats, Scoring Leaders, Predictor, & Rest Days
  const venue = summary?.gameInfo?.venue?.fullName || comp?.venue?.fullName || undefined;

  const extractRecordsFromComp = (cObj: any, headerCompObj?: any, schedObj?: any): EspnTeamRecord => {
    const recs = [
      ...(Array.isArray(cObj?.records) ? cObj.records : []),
      ...(Array.isArray(cObj?.record) ? cObj.record : []),
      ...(Array.isArray(headerCompObj?.record) ? headerCompObj.record : []),
      ...(Array.isArray(headerCompObj?.records) ? headerCompObj.records : [])
    ];
    const findRec = (typeName: string) =>
      recs.find((r: any) => String(r.type || r.name || '').toLowerCase() === typeName)?.summary;
    let overall = findRec('total') || findRec('overall') || recs[0]?.summary || schedObj?.team?.recordSummary;
    let home = findRec('home');
    let away = findRec('road') || findRec('away');
    if ((!home || !away) && Array.isArray(schedObj?.events)) {
      let hw = 0, hl = 0, aw = 0, al = 0;
      const tId = String(schedObj?.team?.id || '');
      for (const ev of schedObj.events) {
        const ec = ev.competitions?.[0];
        if (!ec?.status?.type?.completed) continue;
        const me = (ec.competitors || []).find((x: any) => String(x.team?.id || x.id) === tId);
        if (!me || typeof me.winner !== 'boolean') continue;
        if (me.homeAway === 'home') { if (me.winner) hw++; else hl++; }
        else if (me.homeAway === 'away') { if (me.winner) aw++; else al++; }
      }
      if (!home && hw + hl > 0) home = `${hw}-${hl}`;
      if (!away && aw + al > 0) away = `${aw}-${al}`;
      if (!overall && hw + hl + aw + al > 0) overall = `${hw + aw}-${hl + al}`;
    }
    return { overall, home, away };
  };

  const analyzeScheduleCongestion = (schedRaw: any, targetDateStr?: string) => {
    const evs = Array.isArray(schedRaw?.events) ? schedRaw.events : [];
    if (evs.length === 0) {
      return {
        restDays: null as number | null,
        isBackToBack: false,
        gamesInLast7Days: 0,
        hasMidweekCup: false,
        midweekCompetition: null as string | null,
        midweekDaysAway: null as number | null
      };
    }
    const refTime = targetDateStr ? new Date(targetDateStr).getTime() : Date.now();
    const completed = evs
      .filter((e: any) => e.competitions?.[0]?.status?.type?.completed && e.date && new Date(e.date).getTime() < refTime - 6 * 3600 * 1000)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let restDays: number | null = null;
    if (completed.length > 0) {
      const prevTime = new Date(completed[0].date).getTime();
      const diffDays = Math.floor((refTime - prevTime) / (24 * 3600 * 1000));
      if (diffDays >= 0 && diffDays <= 14) {
        restDays = Math.max(0, diffDays - 1);
      }
    }

    const sevenDaysMs = 7 * 24 * 3600 * 1000;
    const gamesInLast7Days = completed.filter((e: any) => (refTime - new Date(e.date).getTime()) <= sevenDaysMs).length;

    let hasMidweekCup = false;
    let midweekCompetition: string | null = null;
    let midweekDaysAway: number | null = null;

    if (sportPath === 'soccer') {
      const fiveDaysMs = 5.5 * 24 * 3600 * 1000;
      for (const e of evs) {
        if (!e?.date) continue;
        const dt = Math.abs(new Date(e.date).getTime() - refTime);
        if (dt < 12 * 3600 * 1000 || dt > fiveDaysMs) continue;
        const lgText = String(
          e.league?.name || e.league?.abbreviation || e.seasonType?.name || e.competitions?.[0]?.notes?.[0]?.headline || ''
        );
        const lgLow = lgText.toLowerCase();
        const isCup =
          lgLow.includes('champions') || lgLow.includes('ucl') ||
          lgLow.includes('europa') || lgLow.includes('conference') ||
          lgLow.includes('cup') || lgLow.includes('fa ') ||
          lgLow.includes('copa') || lgLow.includes('pokal') ||
          lgLow.includes('coupe') || lgLow.includes('coppa') ||
          lgLow.includes('챔스') || lgLow.includes('유로파');
        if (isCup) {
          hasMidweekCup = true;
          midweekCompetition = lgText || '주중 유럽대항전/컵';
          midweekDaysAway = Math.round((new Date(e.date).getTime() - refTime) / (24 * 3600 * 1000));
          break;
        }
      }
    }

    return {
      restDays,
      isBackToBack: restDays === 0,
      gamesInLast7Days,
      hasMidweekCup,
      midweekCompetition,
      midweekDaysAway
    };
  };

  const extractStartingPitcher = (cObj: any): { name: string; era?: number | null; record?: string | null } | null => {
    if (sportPath !== 'baseball') return null;
    const prob = Array.isArray(cObj?.probables) ? cObj.probables[0] : null;
    if (!prob?.athlete?.displayName) return null;
    const eraStat = Array.isArray(prob.statistics) ? prob.statistics.find((s: any) => s.name === 'ERA' || s.abbreviation === 'ERA') : null;
    const eraVal = eraStat?.displayValue ? parseFloat(String(eraStat.displayValue)) : null;
    return {
      name: prob.athlete.displayName,
      era: eraVal !== null && !isNaN(eraVal) ? eraVal : null,
      record: prob.record || null
    };
  };

  const headerComps = summary?.header?.competitions?.[0]?.competitors || [];
  const homeHeaderComp = headerComps.find((c: any) => homeTeamId && String(c.id || c.team?.id) === homeTeamId);
  const awayHeaderComp = headerComps.find((c: any) => awayTeamId && String(c.id || c.team?.id) === awayTeamId);

  const homeRecord = extractRecordsFromComp(homeCompObj, homeHeaderComp, homeSchedRaw);
  const awayRecord = extractRecordsFromComp(awayCompObj, awayHeaderComp, awaySchedRaw);
  const hCong = analyzeScheduleCongestion(homeSchedRaw, matchedEvent?.date);
  const aCong = analyzeScheduleCongestion(awaySchedRaw, matchedEvent?.date);
  homeRecord.restDays = hCong.restDays;
  homeRecord.isBackToBack = hCong.isBackToBack;
  homeRecord.gamesInLast7Days = hCong.gamesInLast7Days;
  homeRecord.hasMidweekCup = hCong.hasMidweekCup;
  homeRecord.midweekCompetition = hCong.midweekCompetition;
  homeRecord.midweekDaysAway = hCong.midweekDaysAway;
  homeRecord.startingPitcher = extractStartingPitcher(homeCompObj) || extractStartingPitcher(homeHeaderComp);

  awayRecord.restDays = aCong.restDays;
  awayRecord.isBackToBack = aCong.isBackToBack;
  awayRecord.gamesInLast7Days = aCong.gamesInLast7Days;
  awayRecord.hasMidweekCup = aCong.hasMidweekCup;
  awayRecord.midweekCompetition = aCong.midweekCompetition;
  awayRecord.midweekDaysAway = aCong.midweekDaysAway;
  awayRecord.startingPitcher = extractStartingPitcher(awayCompObj) || extractStartingPitcher(awayHeaderComp);

  const extractTeamSeasonStats = (statsRaw: any, standingsObj: any, teamId?: string): EspnTeamSeasonStats | undefined => {
    const cats = statsRaw?.results?.stats?.categories || [];
    if (!Array.isArray(cats) || cats.length === 0) return undefined;
    const statLookup = new Map<string, number>();
    for (const c of cats) {
      for (const s of (c.stats || [])) {
        if (s.name && typeof s.value === 'number' && Number.isFinite(s.value)) {
          statLookup.set(s.name, s.value);
        }
      }
    }
    let oppg: number | undefined;
    const groups = standingsObj?.groups || [];
    for (const g of groups) {
      const entry = (g.standings?.entries || []).find((e: any) => teamId && String(e.team?.id) === String(teamId));
      if (entry) {
        const pa = (entry.stats || []).find((st: any) => st.name === 'avgPointsAgainst' || st.abbreviation === 'PAPG');
        if (pa && typeof pa.value === 'number') oppg = Number(pa.value.toFixed(1));
      }
    }
    const r = (n?: number) => (typeof n === 'number' && Number.isFinite(n) ? Number(n.toFixed(1)) : undefined);
    return {
      gamesPlayed: statLookup.get('gamesPlayed'),
      ppg: r(statLookup.get('avgPoints')),
      oppg,
      fgPct: r(statLookup.get('fieldGoalPct')),
      threePPct: r(statLookup.get('threePointPct') ?? statLookup.get('threePointFieldGoalPct')),
      ftPct: r(statLookup.get('freeThrowPct')),
      rpg: r(statLookup.get('avgRebounds')),
      orpg: r(statLookup.get('avgOffensiveRebounds')),
      apg: r(statLookup.get('avgAssists')),
      tov: r(statLookup.get('avgTurnovers'))
    };
  };

  const homeTeamStats = extractTeamSeasonStats(homeStatsRaw, summary?.standings, homeTeamId);
  const awayTeamStats = extractTeamSeasonStats(awayStatsRaw, summary?.standings, awayTeamId);

  const extractLeaders = (cObj: any, teamId?: string): EspnLeaderEntry[] => {
    let leadersCats = Array.isArray(cObj?.leaders) ? cObj.leaders : [];
    if (leadersCats.length === 0 && Array.isArray(summary?.leaders) && teamId) {
      const sumTeam = summary.leaders.find((t: any) => String(t.team?.id) === String(teamId));
      if (Array.isArray(sumTeam?.leaders)) leadersCats = sumTeam.leaders;
    }
    const ptsCat = leadersCats.find((l: any) => l.name === 'pointsPerGame' || l.name === 'points') || leadersCats[0];
    const rebCat = leadersCats.find((l: any) => l.name === 'reboundsPerGame' || l.name === 'rebounds');
    const astCat = leadersCats.find((l: any) => l.name === 'assistsPerGame' || l.name === 'assists');
    const seen = new Map<string, EspnLeaderEntry>();
    for (const cat of [ptsCat, rebCat, astCat].filter(Boolean)) {
      for (const item of (cat.leaders || []).slice(0, 2)) {
        const name = item.athlete?.displayName || item.athlete?.shortName;
        if (!name) continue;
        const entry: EspnLeaderEntry = seen.get(name) || {
          name,
          position: item.athlete?.position?.abbreviation,
          summary: item.displayValue
        };
        if (cat === ptsCat && typeof item.value === 'number') entry.ppg = Number(item.value.toFixed(1));
        if (cat === rebCat && typeof item.value === 'number') entry.rpg = Number(item.value.toFixed(1));
        if (cat === astCat && typeof item.value === 'number') entry.apg = Number(item.value.toFixed(1));
        seen.set(name, entry);
      }
    }
    return [...seen.values()].slice(0, 3);
  };

  const homeLeaders = extractLeaders(homeCompObj, homeTeamId);
  const awayLeaders = extractLeaders(awayCompObj, awayTeamId);

  const predictor = summary?.predictor?.homeTeam?.gameProjection
    ? {
        homeWinPct: Number(Number(summary.predictor.homeTeam.gameProjection).toFixed(1)),
        awayWinPct: Number((100 - Number(summary.predictor.homeTeam.gameProjection)).toFixed(1))
      }
    : null;

  const parseSummaryLast5 = (teamId?: string, teamNameEn?: string) => {
    const arr = Array.isArray(summary?.lastFiveGames) ? summary.lastFiveGames : [];
    const entry = arr.find((t: any) =>
      (teamId && String(t.team?.id) === String(teamId)) ||
      (teamNameEn && teamMatchesCandidate(teamNameEn, t.team?.displayName || ''))
    );
    if (!entry || !Array.isArray(entry.events)) return [];
    return entry.events.slice(0, 5).map((ev: any) => {
      const isHome = teamId ? String(ev.homeTeamId) === String(teamId) : ev.atVs === 'vs';
      const hs = parseInt(String(ev.homeTeamScore ?? '0'), 10);
      const as = parseInt(String(ev.awayTeamScore ?? '0'), 10);
      const sf = isHome ? hs : as;
      const sa = isHome ? as : hs;
      const res: 'W' | 'D' | 'L' = ev.gameResult === 'W' ? 'W' : ev.gameResult === 'D' ? 'D' : 'L';
      return {
        date: String(ev.gameDate || '').slice(0, 10),
        opponent: ev.opponent?.displayName || ev.opponent?.abbreviation || 'Opponent',
        isHome,
        scoreFor: sf,
        scoreAgainst: sa,
        result: res
      };
    });
  };

  const hLast5 = parseSummaryLast5(homeTeamId, homeTeamObj?.displayName);
  const aLast5 = parseSummaryLast5(awayTeamId, awayTeamObj?.displayName);
  const lastFive = (hLast5.length > 0 || aLast5.length > 0) ? { home: hLast5, away: aLast5 } : null;

  const mapAllRosterItems = (rawArr: any[], teamCountry?: TeamCountryInfo | null): EspnPlayerItem[] =>
    (Array.isArray(rawArr) ? rawArr : []).map((a: any) => {
      const jersey = a.jersey ? parseInt(String(a.jersey), 10) : undefined;
      const pos = a.position?.abbreviation || a.position?.displayName || '선수';
      const cInfo = resolveEspnAthleteCountry(a, teamCountry);
      return {
        name: a.displayName || a.fullName || '선수',
        shortName: a.shortName || a.displayName,
        position: pos,
        shirtNumber: Number.isFinite(jersey) ? jersey : undefined,
        isStarter: false,
        isAce: false,
        countryCode: cInfo.countryCode,
        countryName: cInfo.countryName,
        flagUrl: cInfo.flagUrl,
        statNote: `${jersey ? `#${jersey} ` : ''}${pos}`
      };
    });

  const homeFullRoster = mapAllRosterItems(homeRosterRaw, homeCountry);
  const awayFullRoster = mapAllRosterItems(awayRosterRaw, awayCountry);

  return {
    matched: true,
    sportPath,
    leagueSlug: matchedSlug,
    eventId: matchedEvent?.id ? String(matchedEvent.id) : undefined,
    statusState: matchedEvent?.status?.type?.state,
    venue,
    homeTeamEn: homeTeamObj?.displayName || homeEn,
    awayTeamEn: awayTeamObj?.displayName || awayEn,
    homeTeamId,
    awayTeamId,
    homeLogo,
    awayLogo,
    isOfficialConfirmed,
    confirmedTimeText: isOfficialConfirmed
      ? 'ESPN 공식 경기 스타팅 라인업 연동'
      : 'ESPN 1군 로스터 & 실시간 결장자 리포트 연동 (선발 발표 대기)',
    homeFormation,
    awayFormation,
    homeStarters,
    awayStarters,
    homeFullRoster: homeFullRoster.length > 0 ? homeFullRoster : homeStarters,
    awayFullRoster: awayFullRoster.length > 0 ? awayFullRoster : awayStarters,
    homeBench,
    awayBench,
    homeInjuries,
    awayInjuries,
    odds,
    homeRecord,
    awayRecord,
    predictor,
    homeTeamStats,
    awayTeamStats,
    homeLeaders,
    awayLeaders,
    lastFive,
    sourceName: `ESPN (${matchedSlug.toUpperCase()}) 실시간 스크래핑`
  };
}

/**
 * Bulk-enrich matches with ESPN team logos and fallback DraftKings opening/current odds
 * Uses at most 1 cached HTTP request per distinct (sportPath, leagueSlug) in the round.
 */
export async function enrichMatchesWithEspnBulk(matches: any[]): Promise<number> {
  if (!Array.isArray(matches) || matches.length === 0) return 0;

  const neededScoreboards = new Map<string, { sportPath: string; slug: string }>();
  const neededTeamLists = new Map<string, { sportPath: string; slug: string }>();

  for (const m of matches) {
    const cfg = resolveEspnLeagueCandidates(m.sport, m.league);
    if (!cfg) continue;
    for (const slug of cfg.slugs.slice(0, 2)) {
      const k = `${cfg.sportPath}/${slug}`;
      neededScoreboards.set(k, { sportPath: cfg.sportPath, slug });
      neededTeamLists.set(k, { sportPath: cfg.sportPath, slug });
    }
  }

  const sbMap = new Map<string, any[]>();
  const teamMap = new Map<string, any[]>();

  await Promise.all([
    ...[...neededScoreboards.entries()].map(async ([k, v]) => {
      const sb = await getEspnScoreboard(v.sportPath, v.slug);
      sbMap.set(k, Array.isArray(sb?.events) ? sb.events : []);
    }),
    ...[...neededTeamLists.entries()].map(async ([k, v]) => {
      const ts = await getEspnTeams(v.sportPath, v.slug);
      teamMap.set(k, ts);
    })
  ]);

  let enriched = 0;

  for (const m of matches) {
    // Always attach homeFlag / awayFlag / isNationalMatch for ALL leagues (including KBL, WKBL, KOVO, EASL, C네이션)
    const homeCountry = resolveTeamCountryCode(m.homeTeam, m.league, m.sport);
    const awayCountry = resolveTeamCountryCode(m.awayTeam, m.league, m.sport);
    if (homeCountry) {
      m.homeFlag = homeCountry.flagUrl;
      if (homeCountry.isNationalTeam && !m.homeLogo) {
        m.homeLogo = `https://flagcdn.com/w80/${homeCountry.code}.png`;
      }
    }
    if (awayCountry) {
      m.awayFlag = awayCountry.flagUrl;
      if (awayCountry.isNationalTeam && !m.awayLogo) {
        m.awayLogo = `https://flagcdn.com/w80/${awayCountry.code}.png`;
      }
    }
    if (homeCountry?.isNationalTeam || awayCountry?.isNationalTeam) {
      m.isNationalMatch = true;
    }

    const cfg = resolveEspnLeagueCandidates(m.sport, m.league);
    if (!cfg) continue;
    const homeEn = translateTeamNameToEnglish(m.homeTeam);
    const awayEn = translateTeamNameToEnglish(m.awayTeam);

    for (const slug of cfg.slugs.slice(0, 3)) {
      const k = `${cfg.sportPath}/${slug}`;
      const events = sbMap.get(k) || [];
      const ev = events.find((e: any) => {
        const comps = e.competitions?.[0]?.competitors || [];
        if (comps.length < 2) return false;
        const hasH = comps.some((c: any) => teamMatchesCandidate(homeEn, c.team?.displayName, c.team?.shortDisplayName, c.team?.abbreviation));
        const hasA = comps.some((c: any) => teamMatchesCandidate(awayEn, c.team?.displayName, c.team?.shortDisplayName, c.team?.abbreviation));
        return hasH && hasA;
      });

      if (ev) {
        const comps = ev.competitions?.[0]?.competitors || [];
        const hComp = comps.find((c: any) => teamMatchesCandidate(homeEn, c.team?.displayName, c.team?.shortDisplayName, c.team?.abbreviation));
        const aComp = comps.find((c: any) => teamMatchesCandidate(awayEn, c.team?.displayName, c.team?.shortDisplayName, c.team?.abbreviation));
        if (hComp?.team?.logo) m.homeLogo = hComp.team.logo;
        if (aComp?.team?.logo) m.awayLogo = aComp.team.logo;
        m.espnEventId = String(ev.id);

        const espnOdds = extractOddsFromCompetitionOrPickcenter(ev.competitions?.[0], []);
        if (espnOdds) {
          m.espnOdds = espnOdds;
          // Attach opening odds comparison on moneyline/general matches
          if (m.categoryType === '일반' && espnOdds.open?.win && espnOdds.open?.lose) {
            m.foreignOpening = espnOdds.open;
          }
          // If WiseToto did not return foreign odds for 일반 market, use DraftKings real odds
          if (m.categoryType === '일반' && (!m.foreign || m.oddsSource?.foreign !== 'real') && espnOdds.current?.win && espnOdds.current?.lose) {
            const isTwoWay = m.sport !== 'soccer';
            const dVal = !isTwoWay && espnOdds.current.draw ? espnOdds.current.draw : null;
            if (isTwoWay || dVal) {
              const inv = dVal
                ? 1 / espnOdds.current.win + 1 / dVal + 1 / espnOdds.current.lose
                : 1 / espnOdds.current.win + 1 / espnOdds.current.lose;
              m.foreign = {
                win: espnOdds.current.win,
                draw: dVal,
                lose: espnOdds.current.lose,
                refundRate: inv > 0 ? `${((1 / inv) * 100).toFixed(2)}%` : '95.00%',
                trend: espnOdds.winMove || 'flat'
              };
              m.foreignBookmakers = [{
                bookmaker: espnOdds.provider || 'DraftKings',
                line: null,
                win: espnOdds.current.win,
                draw: dVal,
                lose: espnOdds.current.lose,
                winMove: espnOdds.winMove || 'flat',
                drawMove: 'flat',
                loseMove: espnOdds.loseMove || 'flat'
              }];
              m.oddsSource = {
                domestic: m.oddsSource?.domestic || 'real',
                foreign: 'real'
              };
              m.foreignSourceName = `ESPN · ${espnOdds.provider} 실시간 배당`;
              m.foreignBookmaker = `${espnOdds.provider} (1개사)`;
              m.foreignStatus = 'LIVE';
              m.foreignLastUpdate = new Date().toISOString();
            }
          }
        }
        enriched++;
        break;
      }

      // Fallback team logos from teams list
      const teams = teamMap.get(k) || [];
      if (teams.length > 0) {
        const hT = teams.find(t => teamMatchesCandidate(homeEn, t.displayName, t.shortDisplayName, t.abbreviation));
        const aT = teams.find(t => teamMatchesCandidate(awayEn, t.displayName, t.shortDisplayName, t.abbreviation));
        if (hT?.logos?.[0]?.href && (!m.homeLogo || m.homeLogo.includes('flagcdn.com'))) m.homeLogo = hT.logos[0].href;
        if (aT?.logos?.[0]?.href && (!m.awayLogo || m.awayLogo.includes('flagcdn.com'))) m.awayLogo = aT.logos[0].href;
        if (hT && aT) break;
      }
    }
  }

  return enriched;
}
