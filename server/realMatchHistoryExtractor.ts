import fs from 'fs';
import path from 'path';

export interface ExtractedRecentMatch {
  matchId: string;
  date: string;
  opponent: string;
  isHome: boolean;
  score: string;
  scoreFor: number;
  scoreAgainst: number;
  result: '승' | '무' | '패' | 'W' | 'D' | 'L';
  league: string;
  competition: string;
  source: string;
  provenance: {
    dataset: string;
    matchId: string;
    year?: number;
    round?: number;
    matchNo?: number;
  };
}

export interface ExtractedH2HMatch {
  matchId: string;
  date: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  score: string;
  winner: 'home' | 'away' | 'draw';
  result: '승' | '무' | '패';
  competition: string;
  league: string;
  source: string;
  provenance: {
    dataset: string;
    matchId: string;
    year?: number;
    round?: number;
  };
}

export interface ExtractedTeamFormAndH2H {
  homeRecentForm: {
    recentMatches: ExtractedRecentMatch[];
    summary: {
      played: number;
      win: number;
      draw: number;
      lose: number;
      scored: number;
      conceded: number;
      avgScored: string;
      avgConceded: string;
      diff: number;
      diffStr: string;
      streak: string;
    };
    hasData: boolean;
    dataSource: 'real' | 'unavailable';
  };
  awayRecentForm: {
    recentMatches: ExtractedRecentMatch[];
    summary: {
      played: number;
      win: number;
      draw: number;
      lose: number;
      scored: number;
      conceded: number;
      avgScored: string;
      avgConceded: string;
      diff: number;
      diffStr: string;
      streak: string;
    };
    hasData: boolean;
    dataSource: 'real' | 'unavailable';
  };
  h2h: {
    matches: ExtractedH2HMatch[];
    summary: {
      total: number;
      homeWin: number;
      draw: number;
      awayWin: number;
      homeScored: number;
      awayScored: number;
      homeAvgScored: string;
      awayAvgScored: string;
    };
    hasData: boolean;
    dataSource: 'real' | 'unavailable';
  };
}

// In-memory cache of historical matches parsed from real dataset
interface FlatHistoricalMatch {
  matchId: string;
  year: number;
  round: number;
  matchNo: number;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeNorm: string;
  awayNorm: string;
  homeScore: number;
  awayScore: number;
  dateStr: string;
  dateTimestamp: number;
  sourceUrl?: string;
}

let flatHistoryCache: FlatHistoricalMatch[] | null = null;

function normalizeTeam(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/fc|cf|sc|bc|utd|united|city|시티|유나이티드|트윈스|라이온즈|베어스|다이노스|위즈|랜더스|이글스|자이언츠|히어로즈|타이거즈|블루제|타이거|다저스|양키스|레드삭|화이트|브레이|필리스|애스트|매리너|카디널|브루어|다이아|레인저|컵스|가디언|로열스|레즈|내셔널|말린스|로키스|에인절|어슬레/gi, '')
    .trim();
}

function parseDateToTimestamp(dateStr: string, year: number = 2026): number {
  if (!dateStr) return 0;
  // Format: "09.16(수) 08:07" or "2026-09-16" or "26-09-16"
  const isoMatch = dateStr.match(/^(\d{4})[.-](\d{1,2})[.-](\d{1,2})/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10)).getTime();
  }
  const monthDayMatch = dateStr.match(/(\d{1,2})\.(\d{1,2})/);
  if (monthDayMatch) {
    return new Date(year, parseInt(monthDayMatch[1], 10) - 1, parseInt(monthDayMatch[2], 10)).getTime();
  }
  return 0;
}

function loadRealHistoryDataset(): FlatHistoricalMatch[] {
  if (flatHistoryCache) return flatHistoryCache;

  const results: FlatHistoricalMatch[] = [];
  const datasetPath = path.join(process.cwd(), 'data', 'realProtoHistoricalDataset.json');

  try {
    if (fs.existsSync(datasetPath)) {
      const raw = fs.readFileSync(datasetPath, 'utf-8');
      const data = JSON.parse(raw);
      if (data.rounds) {
        for (const rKey of Object.keys(data.rounds)) {
          const r = data.rounds[rKey];
          if (r && Array.isArray(r.matches)) {
            for (const m of r.matches) {
              if (m.score && typeof m.score.home === 'number' && typeof m.score.away === 'number') {
                const yr = m.year || r.year || 2026;
                const ts = parseDateToTimestamp(m.dateStr || m.date, yr);
                results.push({
                  matchId: m.matchId || `proto_${yr}_${r.round}_${m.matchNo}`,
                  year: yr,
                  round: m.round || r.round || 1,
                  matchNo: m.matchNo || 0,
                  sport: (m.sport || m.rawSport || 'sc').toLowerCase(),
                  league: m.league || 'PROTO',
                  homeTeam: m.homeTeam,
                  awayTeam: m.awayTeam,
                  homeNorm: normalizeTeam(m.homeTeam),
                  awayNorm: normalizeTeam(m.awayTeam),
                  homeScore: m.score.home,
                  awayScore: m.score.away,
                  dateStr: m.dateStr || m.date || `${yr}.09.01`,
                  dateTimestamp: ts,
                  sourceUrl: m.provenance?.sourceUrl
                });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to load realProtoHistoricalDataset:", err);
  }

  // Also ingest protoRealWalkForwardV1 if available
  const walkForwardPath = path.join(process.cwd(), 'data', 'protoRealWalkForwardV1.json');
  try {
    if (fs.existsSync(walkForwardPath)) {
      const raw = fs.readFileSync(walkForwardPath, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.records)) {
        for (const m of data.records) {
          if (m.score && typeof m.score.home === 'number' && typeof m.score.away === 'number') {
            const yr = m.year || 2026;
            const ts = parseDateToTimestamp(m.date || m.predictionCreatedAt, yr);
            results.push({
              matchId: m.matchId,
              year: yr,
              round: m.round || 1,
              matchNo: m.matchNo || 0,
              sport: (m.sport || 'sc').toLowerCase(),
              league: m.league || 'PROTO',
              homeTeam: m.homeTeam,
              awayTeam: m.awayTeam,
              homeNorm: normalizeTeam(m.homeTeam),
              awayNorm: normalizeTeam(m.awayTeam),
              homeScore: m.score.home,
              awayScore: m.score.away,
              dateStr: m.date || `${yr}.09.15`,
              dateTimestamp: ts
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn("Could not load walkForwardPath:", err);
  }

  flatHistoryCache = results;
  return results;
}

function normalizeSportKey(rawSport?: string): string {
  const s = String(rawSport || 'soccer').toLowerCase().trim();
  if (s.includes('base') || s === 'bs' || s === 'bb') return 'baseball';
  if (s.includes('basket') || s === 'bk') return 'basketball';
  if (s.includes('volley') || s === 'vl' || s === 'vb') return 'volleyball';
  return 'soccer';
}

function matchTeamName(targetNorm: string, candidateNorm: string, rawTarget: string, rawCandidate: string): boolean {
  if (!targetNorm || !candidateNorm) return false;
  if (targetNorm === candidateNorm) return true;
  if (rawTarget && rawCandidate && rawTarget === rawCandidate) return true;
  
  // Safe substring match only for long descriptive names (>= 3 chars)
  if (targetNorm.length >= 3 && candidateNorm.length >= 3) {
    if (targetNorm === candidateNorm) return true;
    if (candidateNorm.includes(targetNorm) || targetNorm.includes(candidateNorm)) return true;
  }
  return false;
}

/**
 * Extracts strictly real past matches for Home, Away, and direct H2H prior to match date.
 */
export function extractRealH2HAndRecentForm(
  homeTeam: string,
  awayTeam: string,
  league: string,
  sport: string,
  targetDate?: string
): ExtractedTeamFormAndH2H {
  const history = loadRealHistoryDataset();
  const homeNorm = normalizeTeam(homeTeam);
  const awayNorm = normalizeTeam(awayTeam);
  const targetTs = targetDate ? parseDateToTimestamp(targetDate) : Date.now();
  const targetSport = normalizeSportKey(sport);

  const isNoDrawSport = targetSport === 'baseball' || targetSport === 'basketball' || targetSport === 'volleyball';

  // 1. Home Recent Form (prior matches where homeTeam played in SAME SPORT)
  const homePast = history
    .filter(m => {
      if (normalizeSportKey(m.sport) !== targetSport) return false;
      const isPast = targetTs > 0 ? (m.dateTimestamp > 0 ? m.dateTimestamp < targetTs : true) : true;
      const isHomeTeam = matchTeamName(homeNorm, m.homeNorm, homeTeam, m.homeTeam) || matchTeamName(homeNorm, m.awayNorm, homeTeam, m.awayTeam);
      return isPast && isHomeTeam;
    })
    .slice(0, 5);

  const homeRecentMatches: ExtractedRecentMatch[] = homePast.map(m => {
    const isHome = matchTeamName(homeNorm, m.homeNorm, homeTeam, m.homeTeam);
    const scoreFor = isHome ? m.homeScore : m.awayScore;
    const scoreAgainst = isHome ? m.awayScore : m.homeScore;
    const opponent = isHome ? m.awayTeam : m.homeTeam;
    const result = scoreFor > scoreAgainst ? '승' : (scoreFor < scoreAgainst ? '패' : '무');

    return {
      matchId: m.matchId,
      date: m.dateStr,
      opponent,
      isHome,
      score: `${scoreFor} : ${scoreAgainst}`,
      scoreFor,
      scoreAgainst,
      result,
      league: m.league || league,
      competition: m.league || league,
      source: 'realProtoHistoricalDataset.json',
      provenance: {
        dataset: 'data/realProtoHistoricalDataset.json',
        matchId: m.matchId,
        year: m.year,
        round: m.round,
        matchNo: m.matchNo
      }
    };
  });

  // 2. Away Recent Form (SAME SPORT)
  const awayPast = history
    .filter(m => {
      if (normalizeSportKey(m.sport) !== targetSport) return false;
      const isPast = targetTs > 0 ? (m.dateTimestamp > 0 ? m.dateTimestamp < targetTs : true) : true;
      const isAwayTeam = matchTeamName(awayNorm, m.homeNorm, awayTeam, m.homeTeam) || matchTeamName(awayNorm, m.awayNorm, awayTeam, m.awayTeam);
      return isPast && isAwayTeam;
    })
    .slice(0, 5);

  const awayRecentMatches: ExtractedRecentMatch[] = awayPast.map(m => {
    const isHome = matchTeamName(awayNorm, m.homeNorm, awayTeam, m.homeTeam);
    const scoreFor = isHome ? m.homeScore : m.awayScore;
    const scoreAgainst = isHome ? m.awayScore : m.homeScore;
    const opponent = isHome ? m.awayTeam : m.homeTeam;
    const result = scoreFor > scoreAgainst ? '승' : (scoreFor < scoreAgainst ? '패' : '무');

    return {
      matchId: m.matchId,
      date: m.dateStr,
      opponent,
      isHome,
      score: `${scoreFor} : ${scoreAgainst}`,
      scoreFor,
      scoreAgainst,
      result,
      league: m.league || league,
      competition: m.league || league,
      source: 'realProtoHistoricalDataset.json',
      provenance: {
        dataset: 'data/realProtoHistoricalDataset.json',
        matchId: m.matchId,
        year: m.year,
        round: m.round,
        matchNo: m.matchNo
      }
    };
  });

  // 3. Direct H2H Matches (SAME SPORT)
  const h2hPast = history
    .filter(m => {
      if (normalizeSportKey(m.sport) !== targetSport) return false;
      const isPast = targetTs > 0 ? (m.dateTimestamp > 0 ? m.dateTimestamp < targetTs : true) : true;
      const isMatch = (
        (matchTeamName(homeNorm, m.homeNorm, homeTeam, m.homeTeam) && matchTeamName(awayNorm, m.awayNorm, awayTeam, m.awayTeam)) ||
        (matchTeamName(awayNorm, m.homeNorm, awayTeam, m.homeTeam) && matchTeamName(homeNorm, m.awayNorm, homeTeam, m.awayTeam))
      );
      return isPast && isMatch;
    })
    .slice(0, 5);

  const h2hMatches: ExtractedH2HMatch[] = h2hPast.map(m => {
    const isTargetHome = matchTeamName(homeNorm, m.homeNorm, homeTeam, m.homeTeam);
    const hSc = isTargetHome ? m.homeScore : m.awayScore;
    const aSc = isTargetHome ? m.awayScore : m.homeScore;
    const winner: 'home' | 'away' | 'draw' = hSc > aSc ? 'home' : (hSc < aSc ? 'away' : 'draw');
    const result = hSc > aSc ? '승' : (hSc < aSc ? '패' : '무');

    return {
      matchId: m.matchId,
      date: m.dateStr,
      home: homeTeam,
      away: awayTeam,
      homeScore: hSc,
      awayScore: aSc,
      score: `${hSc} : ${aSc}`,
      winner,
      result,
      competition: m.league || league,
      league: m.league || league,
      source: 'realProtoHistoricalDataset.json',
      provenance: {
        dataset: 'data/realProtoHistoricalDataset.json',
        matchId: m.matchId,
        year: m.year,
        round: m.round
      }
    };
  });

  // Compute Home Summary strictly from real homeRecentMatches
  const homeSummary = computeSummaryFromMatches(homeRecentMatches, isNoDrawSport);
  const awaySummary = computeSummaryFromMatches(awayRecentMatches, isNoDrawSport);
  const h2hSummary = computeH2HSummaryFromMatches(h2hMatches, isNoDrawSport);

  return {
    homeRecentForm: {
      recentMatches: homeRecentMatches,
      summary: homeSummary,
      hasData: homeRecentMatches.length > 0,
      dataSource: homeRecentMatches.length > 0 ? 'real' : 'unavailable'
    },
    awayRecentForm: {
      recentMatches: awayRecentMatches,
      summary: awaySummary,
      hasData: awayRecentMatches.length > 0,
      dataSource: awayRecentMatches.length > 0 ? 'real' : 'unavailable'
    },
    h2h: {
      matches: h2hMatches,
      summary: h2hSummary,
      hasData: h2hMatches.length > 0,
      dataSource: h2hMatches.length > 0 ? 'real' : 'unavailable'
    }
  };
}

function computeSummaryFromMatches(matches: ExtractedRecentMatch[], isNoDrawSport: boolean) {
  const played = matches.length;
  if (played === 0) {
    return {
      played: 0,
      win: 0,
      draw: 0,
      lose: 0,
      scored: 0,
      conceded: 0,
      avgScored: '-',
      avgConceded: '-',
      diff: 0,
      diffStr: '-',
      streak: '-'
    };
  }

  let scored = 0;
  let conceded = 0;
  let win = 0;
  let draw = 0;
  let lose = 0;

  for (const m of matches) {
    scored += m.scoreFor;
    conceded += m.scoreAgainst;
    if (m.result === '승') win++;
    else if (!isNoDrawSport && m.result === '무') draw++;
    else lose++;
  }

  const diff = scored - conceded;
  return {
    played,
    win,
    draw,
    lose,
    scored,
    conceded,
    avgScored: (scored / played).toFixed(1),
    avgConceded: (conceded / played).toFixed(1),
    diff,
    diffStr: diff >= 0 ? `+${diff}` : `${diff}`,
    streak: win >= lose ? `${win}연승` : `${lose}연패`
  };
}

function computeH2HSummaryFromMatches(matches: ExtractedH2HMatch[], isNoDrawSport: boolean) {
  const total = matches.length;
  if (total === 0) {
    return {
      total: 0,
      homeWin: 0,
      draw: 0,
      awayWin: 0,
      homeScored: 0,
      awayScored: 0,
      homeAvgScored: '-',
      awayAvgScored: '-'
    };
  }

  let homeScored = 0;
  let awayScored = 0;
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (const m of matches) {
    homeScored += m.homeScore;
    awayScored += m.awayScore;
    if (m.winner === 'home') homeWin++;
    else if (!isNoDrawSport && m.winner === 'draw') draw++;
    else awayWin++;
  }

  return {
    total,
    homeWin,
    draw,
    awayWin,
    homeScored,
    awayScored,
    homeAvgScored: (homeScored / total).toFixed(1),
    awayAvgScored: (awayScored / total).toFixed(1)
  };
}
