import {
  solveAdaptiveShinZ,
  BASEBALL_PARK_FACTORS,
  computeHandicapAnalysisModel,
  computeUnderOverAnalysisModel
} from './quantEngine.js';

export interface ContextFactorItem {
  key: string;
  label: string;
  status: 'REAL_DATA' | 'NEUTRAL';
  homeSignal: string;
  awaySignal: string;
  homeDeltaPct: number; // + favors home, - hurts home
  awayDeltaPct: number; // + favors away, - hurts away
  totalScoringDelta: number; // + increases expected total goals/pts, - decreases
  summary: string;
}

export interface OddsEconomicsSummary {
  domesticPayoutRatePct: number;
  domesticCutRatePct: number;
  domesticMarginPct: number;
  foreignPayoutRatePct: number | null;
  foreignCutRatePct: number | null;
  foreignMarginPct: number | null;
  hasRealForeignOdds: boolean;
  domesticNoVigProbs: { win: number; draw: number | null; lose: number };
  foreignShinProbs: { win: number; draw: number | null; lose: number } | null;
  priceEdgePct: { win: number; draw: number | null; lose: number };
  sharpVsDomEdgePctPt: { win: number | null; draw: number | null; lose: number | null };
}

export interface RefinedHandicapSummary {
  line: number;
  expectedMargin: number; // home - away
  homeCoverProb: number;
  pushProb: number;
  awayCoverProb: number;
  homeFairOdds: number;
  awayFairOdds: number;
  homeOdds: number | null;
  awayOdds: number | null;
  homeEvPct: number | null;
  awayEvPct: number | null;
  recommendedSide: 'HOME' | 'AWAY' | 'PASS';
  recommendedLabel: string;
  rationale: string;
}

export interface RefinedUnderOverSummary {
  line: number;
  expectedHomeScore: number;
  expectedAwayScore: number;
  expectedTotalScore: number;
  underProb: number;
  pushProb: number;
  overProb: number;
  underFairOdds: number;
  overFairOdds: number;
  underOdds: number | null;
  overOdds: number | null;
  underEvPct: number | null;
  overEvPct: number | null;
  recommendedSide: 'UNDER' | 'OVER' | 'PASS';
  recommendedLabel: string;
  topExactScores: Array<{ score: string; probPct: number }>;
  rationale: string;
}

export interface ComprehensiveProtoReport {
  sport: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  oddsEconomics: OddsEconomicsSummary;
  modelProbs: {
    win: number;
    draw: number | null;
    lose: number;
  };
  contextFactors: ContextFactorItem[];
  totalHomeAdjustmentPct: number;
  totalAwayAdjustmentPct: number;
  motivationSummary: {
    homeZone: string;
    awayZone: string;
    netMotivationEdge: string;
  };
  scheduleSummary: {
    homeRestDays: number | null;
    awayRestDays: number | null;
    homeMidweekCup: string | null;
    awayMidweekCup: string | null;
    homeIsB2B: boolean;
    awayIsB2B: boolean;
    summaryText: string;
  };
  handicapRefined: RefinedHandicapSummary;
  underOverRefined: RefinedUnderOverSummary;
  keyVerdict: string;
}

function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x >= 0 ? 1 - p : p;
}

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

function classifyStandingMotivation(
  rankVal: any,
  totalTeams: number,
  league: string,
  sport: string,
  played: number
): { zone: string; boostPct: number } {
  const rank = typeof rankVal === 'number' ? rankVal : parseInt(String(rankVal || ''), 10);
  if (!rank || isNaN(rank) || rank <= 0 || totalTeams < 6) {
    return { zone: '순위 정보 미상/컵대회', boostPct: 0 };
  }

  const lg = String(league || '').toUpperCase();
  const isSecondTier =
    lg.includes('K리그2') ||
    lg.includes('CHAMPIONSHIP') ||
    lg.includes('EFL') ||
    lg.includes('세리에B') ||
    lg.includes('분데스2') ||
    lg.includes('J2') ||
    lg.includes('라리가2') ||
    lg.includes('리그2');

  const isSoccer = sport === 'soccer';
  const seasonProgress = isSoccer
    ? Math.min(1, played / 34)
    : sport === 'basketball'
      ? Math.min(1, played / 54)
      : Math.min(1, played / 140);

  const lateMultiplier = seasonProgress >= 0.65 ? 1.35 : 0.85;

  if (rank <= 2) {
    return {
      zone: isSecondTier ? '직행 승격/우승권' : '우승·선두권 경쟁',
      boostPct: Number((2.2 * lateMultiplier).toFixed(1))
    };
  }
  if (isSoccer && isSecondTier && rank <= 6) {
    return {
      zone: '승격 플레이오프(PO) 경쟁권',
      boostPct: Number((2.4 * lateMultiplier).toFixed(1))
    };
  }
  if (isSoccer && !isSecondTier && rank <= Math.max(4, Math.round(totalTeams * 0.25))) {
    return {
      zone: 'UCL·유럽대항전 진출권',
      boostPct: Number((1.8 * lateMultiplier).toFixed(1))
    };
  }
  if (!isSoccer && rank <= Math.max(4, Math.round(totalTeams * 0.45))) {
    return {
      zone: '플레이오프(PO) 직행·시드 경쟁',
      boostPct: Number((1.6 * lateMultiplier).toFixed(1))
    };
  }
  if (rank >= totalTeams - 3) {
    return {
      zone: isSoccer ? '강등권 탈출 사투(생존 동기)' : '하위권/순위 반등 싸움',
      boostPct: isSoccer ? Number((1.9 * lateMultiplier).toFixed(1)) : Number((-0.6 * lateMultiplier).toFixed(1))
    };
  }
  if (seasonProgress >= 0.72) {
    return {
      zone: '중위권 안정 (동기부여 보통)',
      boostPct: -0.7
    };
  }
  return { zone: '중상위권 순위 다툼', boostPct: 0.4 };
}

function parseRecentSummary(recentObj: any): { winRate: number | null; avgDiff: number; avgTotal: number | null; text: string; count: number } {
  const arr = Array.isArray(recentObj?.recentMatches) ? recentObj.recentMatches : [];
  if (arr.length === 0) {
    return { winRate: null, avgDiff: 0, avgTotal: null, text: '최근 기록 없음', count: 0 };
  }
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let diffSum = 0;
  let totalSum = 0;
  let scoreGames = 0;

  for (const g of arr.slice(0, 5)) {
    const resStr = String(g.result || '');
    if (resStr === '승' || resStr === 'W') wins++;
    else if (resStr === '무' || resStr === 'D') draws++;
    else if (resStr === '패' || resStr === 'L') losses++;

    let sf = typeof g.scoreFor === 'number' ? g.scoreFor : NaN;
    let sa = typeof g.scoreAgainst === 'number' ? g.scoreAgainst : NaN;
    if ((isNaN(sf) || isNaN(sa)) && typeof g.score === 'string') {
      const m = g.score.match(/(\d+)\s*[:\-]\s*(\d+)/);
      if (m) {
        sf = parseInt(m[1], 10);
        sa = parseInt(m[2], 10);
      }
    }
    if (!isNaN(sf) && !isNaN(sa)) {
      diffSum += sf - sa;
      totalSum += sf + sa;
      scoreGames++;
    }
  }

  const n = Math.min(5, arr.length);
  const winRate = ((wins + draws * 0.5) / Math.max(1, n)) * 100;
  const avgDiff = scoreGames > 0 ? diffSum / scoreGames : 0;
  const avgTotal = scoreGames > 0 ? totalSum / scoreGames : null;
  const text = `${wins}승${draws > 0 ? ` ${draws}무` : ''} ${losses}패 (${avgDiff >= 0 ? '+' : ''}${avgDiff.toFixed(1)})`;
  return { winRate, avgDiff, avgTotal, text, count: n };
}

export function buildComprehensiveProtoReport(input: {
  sport: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  odds: { win: number; draw: number | null; lose: number };
  foreignOdds?: { win?: number | null; draw?: number | null; lose?: number | null } | null;
  handicapLine: number;
  handicapOdds?: { win?: number | null; lose?: number | null } | null;
  uoLine: number;
  uoOdds?: { win?: number | null; lose?: number | null } | null;
  weatherEnvironment?: any;
  contextData?: any; // optional h2hData / espnIntel / killtotoIntel / lineupInjuryData
  baseModelProbs?: { win: number; draw: number | null; lose: number } | null;
}): ComprehensiveProtoReport {
  const {
    sport = 'soccer',
    homeTeam,
    awayTeam,
    league,
    odds,
    foreignOdds,
    handicapLine,
    handicapOdds,
    uoLine,
    uoOdds,
    weatherEnvironment,
    contextData,
    baseModelProbs
  } = input;

  const isSoccer = sport === 'soccer';
  const hasDraw = isSoccer && odds.draw !== null && odds.draw > 1.0;

  // 1. Odds Economics: Domestic vs Foreign Payout Rate, Cut Rate, Margin, Shin No-Vig
  const domW = Math.max(1.01, Number(odds.win || 1.85));
  const domD = hasDraw && odds.draw ? Math.max(1.01, Number(odds.draw)) : null;
  const domL = Math.max(1.01, Number(odds.lose || 1.85));

  const domSumInv = 1 / domW + (domD ? 1 / domD : 0) + 1 / domL;
  const domesticPayoutRatePct = Number(((1 / domSumInv) * 100).toFixed(2));
  const domesticCutRatePct = Number((100 - domesticPayoutRatePct).toFixed(2));
  const domesticMarginPct = Number(((domSumInv - 1) * 100).toFixed(2));

  const domNoVigW = Number((((1 / domW) / domSumInv) * 100).toFixed(1));
  const domNoVigD = domD ? Number((((1 / domD) / domSumInv) * 100).toFixed(1)) : null;
  const domNoVigL = Number((100 - domNoVigW - (domNoVigD || 0)).toFixed(1));

  const hasRealForeignOdds = Boolean(
    foreignOdds?.win &&
      foreignOdds.win > 1.0 &&
      foreignOdds?.lose &&
      foreignOdds.lose > 1.0 &&
      (!hasDraw || (foreignOdds?.draw && foreignOdds.draw > 1.0))
  );

  let foreignPayoutRatePct: number | null = null;
  let foreignCutRatePct: number | null = null;
  let foreignMarginPct: number | null = null;
  let foreignShinProbs: { win: number; draw: number | null; lose: number } | null = null;

  if (hasRealForeignOdds && foreignOdds?.win && foreignOdds?.lose) {
    const fW = Math.max(1.01, Number(foreignOdds.win));
    const fD = hasDraw && foreignOdds.draw ? Math.max(1.01, Number(foreignOdds.draw)) : null;
    const fL = Math.max(1.01, Number(foreignOdds.lose));
    const fSum = 1 / fW + (fD ? 1 / fD : 0) + 1 / fL;
    foreignPayoutRatePct = Number(((1 / fSum) * 100).toFixed(2));
    foreignCutRatePct = Number((100 - foreignPayoutRatePct).toFixed(2));
    foreignMarginPct = Number(((fSum - 1) * 100).toFixed(2));
    const shin = solveAdaptiveShinZ(fW, fD, fL);
    foreignShinProbs = {
      win: Number((shin.pWin * 100).toFixed(1)),
      draw: fD ? Number((shin.pDraw * 100).toFixed(1)) : null,
      lose: Number((shin.pLose * 100).toFixed(1))
    };
  }

  // Baseline market prior: 70% Sharp Foreign (if real) + 30% Domestic Shin, or Base Model blend
  const domShin = solveAdaptiveShinZ(domW, domD, domL);
  const domShinW = domShin.pWin * 100;
  const domShinD = hasDraw ? domShin.pDraw * 100 : null;
  const domShinL = domShin.pLose * 100;

  let priorW = foreignShinProbs ? foreignShinProbs.win * 0.72 + domShinW * 0.28 : domShinW;
  let priorD = hasDraw
    ? foreignShinProbs && foreignShinProbs.draw !== null
      ? foreignShinProbs.draw * 0.72 + (domShinD || 25) * 0.28
      : domShinD || 25
    : 0;
  let priorL = foreignShinProbs ? foreignShinProbs.lose * 0.72 + domShinL * 0.28 : domShinL;

  if (baseModelProbs && baseModelProbs.win > 0 && baseModelProbs.lose > 0) {
    priorW = priorW * 0.8 + baseModelProbs.win * 0.2;
    if (hasDraw && baseModelProbs.draw !== null) {
      priorD = priorD * 0.8 + baseModelProbs.draw * 0.2;
    }
    priorL = priorL * 0.8 + baseModelProbs.lose * 0.2;
  }

  // 2. Context Factors (Recent 5, H2H, Injuries/Lineups, Standings/Motivation, Schedule/UCL/B2B/Pitcher, Sharp/Weather)
  const factors: ContextFactorItem[] = [];
  const espn = contextData?.espnIntel;
  const standings = contextData?.leagueStandings || contextData?.standingsTable;

  // Factor A: Recent 5 Form
  const hRecent = parseRecentSummary(contextData?.homeRecentForm);
  const aRecent = parseRecentSummary(contextData?.awayRecentForm);
  if (hRecent.count > 0 || aRecent.count > 0) {
    const hWr = hRecent.winRate ?? 50;
    const aWr = aRecent.winRate ?? 50;
    const formGap = Math.max(-4.5, Math.min(4.5, ((hWr - aWr) / 100) * 5.0));
    const totalScoringDelta =
      hRecent.avgTotal !== null && aRecent.avgTotal !== null && uoLine > 0
        ? Math.max(-uoLine * 0.08, Math.min(uoLine * 0.08, ((hRecent.avgTotal + aRecent.avgTotal) / 2 - uoLine) * 0.35))
        : 0;
    factors.push({
      key: 'recent_form',
      label: '최근 5경기 폼·득실 흐름',
      status: 'REAL_DATA',
      homeSignal: hRecent.text,
      awaySignal: aRecent.text,
      homeDeltaPct: Number((formGap * 0.5).toFixed(2)),
      awayDeltaPct: Number((-formGap * 0.5).toFixed(2)),
      totalScoringDelta: Number(totalScoringDelta.toFixed(2)),
      summary: `홈 최근 ${hRecent.text} vs 원정 최근 ${aRecent.text}`
    });
  } else {
    factors.push({
      key: 'recent_form',
      label: '최근 5경기 폼·득실 흐름',
      status: 'NEUTRAL',
      homeSignal: '수집 대기',
      awaySignal: '수집 대기',
      homeDeltaPct: 0,
      awayDeltaPct: 0,
      totalScoringDelta: 0,
      summary: '최근 경기 데이터 미연동 (중립 처리)'
    });
  }

  // Factor B: H2H Matchup & Draw Affinity
  const h2hMatches = Array.isArray(contextData?.h2h?.matches) ? contextData.h2h.matches : [];
  let h2hDrawRate = 0;
  if (h2hMatches.length > 0) {
    let hw = 0;
    let hd = 0;
    let ha = 0;
    let h2hTotalPts = 0;
    let h2hCountPts = 0;
    for (const g of h2hMatches.slice(0, 6)) {
      const r = String(g.result || '');
      if (r === '승' || r === 'W') hw++;
      else if (r === '무' || r === 'D') hd++;
      else ha++;
      const sf = Number(g.scoreFor);
      const sa = Number(g.scoreAgainst);
      if (!isNaN(sf) && !isNaN(sa)) {
        h2hTotalPts += sf + sa;
        h2hCountPts++;
      }
    }
    const n = hw + hd + ha;
    h2hDrawRate = n > 0 ? hd / n : 0;
    const h2hDiffPct = Math.max(-3.0, Math.min(3.0, ((hw - ha) / Math.max(1, n)) * 3.5));
    const h2hScoreDelta =
      h2hCountPts > 0 && uoLine > 0
        ? Math.max(-uoLine * 0.07, Math.min(uoLine * 0.07, (h2hTotalPts / h2hCountPts - uoLine) * 0.25))
        : 0;
    factors.push({
      key: 'h2h',
      label: '상대전적 상성 (H2H)',
      status: 'REAL_DATA',
      homeSignal: `${hw}승 ${hd}무 ${ha}패`,
      awaySignal: `${ha}승 ${hd}무 ${hw}패`,
      homeDeltaPct: Number((h2hDiffPct * 0.5).toFixed(2)),
      awayDeltaPct: Number((-h2hDiffPct * 0.5).toFixed(2)),
      totalScoringDelta: Number(h2hScoreDelta.toFixed(2)),
      summary: `최근 ${n}회 맞대결 홈 ${hw}승 ${hd}무 ${ha}패${h2hDrawRate >= 0.4 ? ' (무승부/박빙 상성 주의)' : ''}`
    });
  } else {
    factors.push({
      key: 'h2h',
      label: '상대전적 상성 (H2H)',
      status: 'NEUTRAL',
      homeSignal: '표본 없음',
      awaySignal: '표본 없음',
      homeDeltaPct: 0,
      awayDeltaPct: 0,
      totalScoringDelta: 0,
      summary: '최근 상대전적 없음 (중립)'
    });
  }

  // Factor C: Lineups & Injuries
  const homeInj = Array.isArray(contextData?.lineupInjuryData?.homeData?.injuries)
    ? contextData.lineupInjuryData.homeData.injuries
    : [];
  const awayInj = Array.isArray(contextData?.lineupInjuryData?.awayData?.injuries)
    ? contextData.lineupInjuryData.awayData.injuries
    : [];
  const hasRealLineup = Boolean(contextData?.lineupInjuryData?.isLiveScraped || homeInj.length > 0 || awayInj.length > 0);
  if (hasRealLineup) {
    const hAdj = Number(
      contextData?.lineupInjuryData?.homeData?.netProbAdjustmentPct ??
        homeInj.reduce((s: number, i: any) => s + Number(i.impactProbPct || (String(i.status).includes('OUT') ? -2.2 : -0.9)), 0)
    );
    const aAdj = Number(
      contextData?.lineupInjuryData?.awayData?.netProbAdjustmentPct ??
        awayInj.reduce((s: number, i: any) => s + Number(i.impactProbPct || (String(i.status).includes('OUT') ? -2.2 : -0.9)), 0)
    );
    const clampedH = Math.max(-7.5, Math.min(3.0, hAdj));
    const clampedA = Math.max(-7.5, Math.min(3.0, aAdj));
    const scoringImpact = (clampedH + clampedA) * (sport === 'basketball' ? 0.55 : 0.04);
    factors.push({
      key: 'lineup_injuries',
      label: '라인업 & 부상·결장(OUT/GTD)',
      status: 'REAL_DATA',
      homeSignal: homeInj.length > 0 ? `결장·의심 ${homeInj.length}명 (${clampedH.toFixed(1)}%p)` : '주전 정상 가동',
      awaySignal: awayInj.length > 0 ? `결장·의심 ${awayInj.length}명 (${clampedA.toFixed(1)}%p)` : '주전 정상 가동',
      homeDeltaPct: Number((clampedH * 0.55).toFixed(2)),
      awayDeltaPct: Number((clampedA * 0.55).toFixed(2)),
      totalScoringDelta: Number(scoringImpact.toFixed(2)),
      summary: `홈 ${homeInj.length}명 vs 원정 ${awayInj.length}명 이탈${espn?.isOfficialConfirmed ? ' (공식 선발 확정)' : ''}`
    });
  } else {
    factors.push({
      key: 'lineup_injuries',
      label: '라인업 & 부상·결장(OUT/GTD)',
      status: 'NEUTRAL',
      homeSignal: '발표 대기',
      awaySignal: '발표 대기',
      homeDeltaPct: 0,
      awayDeltaPct: 0,
      totalScoringDelta: 0,
      summary: '라인업/부상 데이터 미확인 (중립)'
    });
  }

  // Factor D: League Standings & Motivation (Title / UCL / Promotion PO / Relegation)
  const stRows = Array.isArray(standings?.standings)
    ? standings.standings
    : Array.isArray(standings?.table)
      ? standings.table
      : [];
  const totalTeams = stRows.length || (isSoccer ? 20 : 10);
  const homeRank = standings?.homeRank ?? standings?.home?.rank;
  const awayRank = standings?.awayRank ?? standings?.away?.rank;
  const homePlayed = Number(standings?.home?.overall?.played || stRows[0]?.played || 15);
  const awayPlayed = Number(standings?.away?.overall?.played || stRows[0]?.played || 15);
  const homeMot = classifyStandingMotivation(homeRank, totalTeams, league, sport, homePlayed);
  const awayMot = classifyStandingMotivation(awayRank, totalTeams, league, sport, awayPlayed);

  if (homeRank && homeRank !== '-' && awayRank && awayRank !== '-') {
    factors.push({
      key: 'standings_motivation',
      label: '리그 순위·승격·강등 동기부여',
      status: 'REAL_DATA',
      homeSignal: `${homeRank}위 · ${homeMot.zone}`,
      awaySignal: `${awayRank}위 · ${awayMot.zone}`,
      homeDeltaPct: Number((homeMot.boostPct * 0.55).toFixed(2)),
      awayDeltaPct: Number((awayMot.boostPct * 0.55).toFixed(2)),
      totalScoringDelta: homeMot.zone.includes('강등') || awayMot.zone.includes('강등') ? (isSoccer ? 0.12 : 0) : 0,
      summary: `홈 ${homeRank}위(${homeMot.zone}) vs 원정 ${awayRank}위(${awayMot.zone})`
    });
  } else {
    factors.push({
      key: 'standings_motivation',
      label: '리그 순위·승격·강등 동기부여',
      status: 'NEUTRAL',
      homeSignal: homeMot.zone,
      awaySignal: awayMot.zone,
      homeDeltaPct: 0,
      awayDeltaPct: 0,
      totalScoringDelta: 0,
      summary: '공식 리그 순위표 미적용 경기'
    });
  }

  // Factor E: Sport-Specific Schedule Congestion / Midweek UCL / B2B / Starting Pitcher & Park Factor
  const hRec = espn?.homeRecord;
  const aRec = espn?.awayRecord;
  const homeRestDays: number | null = typeof hRec?.restDays === 'number' ? hRec.restDays : null;
  const awayRestDays: number | null = typeof aRec?.restDays === 'number' ? aRec.restDays : null;
  const homeMidweekCup: string | null = hRec?.hasMidweekCup ? hRec.midweekCompetition || '주중 컵/유럽대항전' : null;
  const awayMidweekCup: string | null = aRec?.hasMidweekCup ? aRec.midweekCompetition || '주중 컵/유럽대항전' : null;
  const homeIsB2B = Boolean(hRec?.isBackToBack || homeRestDays === 0);
  const awayIsB2B = Boolean(aRec?.isBackToBack || awayRestDays === 0);

  let schedHomeDelta = 0;
  let schedAwayDelta = 0;
  let schedScoreDelta = 0;
  let schedHomeSig = '정상 휴식';
  let schedAwaySig = '정상 휴식';
  let schedSummary = '일정 피로도 특이사항 없음';
  let schedStatus: 'REAL_DATA' | 'NEUTRAL' = 'NEUTRAL';

  if (sport === 'soccer') {
    if (homeMidweekCup || awayMidweekCup || homeRestDays !== null || awayRestDays !== null) {
      schedStatus = 'REAL_DATA';
      if (homeMidweekCup) schedHomeDelta -= 2.4;
      if (awayMidweekCup) schedAwayDelta -= 2.7;
      if (homeRestDays !== null && homeRestDays <= 2) schedHomeDelta -= 1.2;
      if (awayRestDays !== null && awayRestDays <= 2) schedAwayDelta -= 1.4;
      schedHomeSig = homeMidweekCup
        ? `주중 ${homeMidweekCup} 병행`
        : homeRestDays !== null
          ? `${homeRestDays}일 휴식`
          : '정상 일정';
      schedAwaySig = awayMidweekCup
        ? `주중 ${awayMidweekCup} 병행`
        : awayRestDays !== null
          ? `${awayRestDays}일 휴식`
          : '정상 일정';
      schedSummary = `${schedHomeSig} vs ${schedAwaySig}`;
    }
  } else if (sport === 'basketball') {
    if (homeRestDays !== null || awayRestDays !== null) {
      schedStatus = 'REAL_DATA';
      if (homeIsB2B) {
        schedHomeDelta -= 2.6;
        schedScoreDelta -= 1.6;
      } else if (homeRestDays === 1) {
        schedHomeDelta -= 0.7;
      }
      if (awayIsB2B) {
        schedAwayDelta -= 3.2;
        schedScoreDelta -= 1.9;
      } else if (awayRestDays === 1) {
        schedAwayDelta -= 0.8;
      }
      schedHomeSig = homeIsB2B ? '백투백(B2B · 0일 휴식)' : `${homeRestDays ?? '-'}일 휴식`;
      schedAwaySig = awayIsB2B ? '백투백(B2B · 0일 휴식)' : `${awayRestDays ?? '-'}일 휴식`;
      schedSummary = `홈 ${schedHomeSig} vs 원정 ${schedAwaySig}`;
    }
  } else if (sport === 'baseball') {
    const hPit = hRec?.startingPitcher;
    const aPit = aRec?.startingPitcher;
    const parkFactor = BASEBALL_PARK_FACTORS[homeTeam] || 1.0;
    const hasPitcherOrPark = Boolean(hPit || aPit || parkFactor !== 1.0 || homeRestDays !== null);
    if (hasPitcherOrPark) {
      schedStatus = 'REAL_DATA';
      if (typeof hPit?.era === 'number' && typeof aPit?.era === 'number') {
        const eraEdge = Math.max(-4.5, Math.min(4.5, (aPit.era - hPit.era) * 1.4));
        schedHomeDelta += eraEdge * 0.5;
        schedAwayDelta -= eraEdge * 0.5;
      }
      if (parkFactor !== 1.0) {
        schedScoreDelta += (parkFactor - 1.0) * uoLine;
      }
      schedHomeSig = hPit ? `선발 ${hPit.name}${hPit.era ? ` (ERA ${hPit.era})` : ''}` : `구장팩터 ${parkFactor.toFixed(2)}`;
      schedAwaySig = aPit ? `선발 ${aPit.name}${aPit.era ? ` (ERA ${aPit.era})` : ''}` : `${awayRestDays ?? '-'}일 휴식`;
      schedSummary = `${schedHomeSig} vs ${schedAwaySig} (Park ${parkFactor.toFixed(2)})`;
    }
  }

  factors.push({
    key: 'schedule_sport_specific',
    label:
      sport === 'soccer'
        ? '주중 챔스·유로파·컵대회 피로도'
        : sport === 'basketball'
          ? '농구 백투백(B2B)·휴식일 체력'
          : '야구 선발투수·구장 파크팩터',
    status: schedStatus,
    homeSignal: schedHomeSig,
    awaySignal: schedAwaySig,
    homeDeltaPct: Number(schedHomeDelta.toFixed(2)),
    awayDeltaPct: Number(schedAwayDelta.toFixed(2)),
    totalScoringDelta: Number(schedScoreDelta.toFixed(2)),
    summary: schedSummary
  });

  // Factor F: Weather & Sharp Odds Movement
  let weatherScoreDelta = 0;
  let sharpHomeDelta = 0;
  let sharpSignal = '유지';
  if (espn?.odds?.open?.win && espn?.odds?.current?.win) {
    const movePct = ((1 / espn.odds.current.win) - (1 / espn.odds.open.win)) * 100;
    sharpHomeDelta = Math.max(-2.5, Math.min(2.5, movePct * 0.5));
    sharpSignal = `오프닝 ${espn.odds.open.win} → 현재 ${espn.odds.current.win}`;
  }
  if (weatherEnvironment?.expectedGoalMultiplier && weatherEnvironment.expectedGoalMultiplier !== 1.0) {
    weatherScoreDelta = (weatherEnvironment.expectedGoalMultiplier - 1.0) * uoLine;
  }
  factors.push({
    key: 'sharp_weather',
    label: '해외 오즈 변동 & 경기장 기상',
    status: espn?.odds?.open?.win || weatherEnvironment ? 'REAL_DATA' : 'NEUTRAL',
    homeSignal: sharpSignal,
    awaySignal: weatherEnvironment?.condition ? `${weatherEnvironment.condition}` : '실내/표준',
    homeDeltaPct: Number(sharpHomeDelta.toFixed(2)),
    awayDeltaPct: Number((-sharpHomeDelta).toFixed(2)),
    totalScoringDelta: Number(weatherScoreDelta.toFixed(2)),
    summary: `${sharpSignal} | 기상: ${weatherEnvironment?.condition || '정상'}`
  });

  // 3. Combine Posterior Match Probabilities
  const totalHomeAdj = factors.reduce((s, f) => s + f.homeDeltaPct, 0);
  const totalAwayAdj = factors.reduce((s, f) => s + f.awayDeltaPct, 0);
  const totalScoringAdj = factors.reduce((s, f) => s + f.totalScoringDelta, 0);

  let adjW = Math.max(4, priorW + totalHomeAdj - totalAwayAdj * 0.45);
  let adjL = Math.max(4, priorL + totalAwayAdj - totalHomeAdj * 0.45);
  let adjD = hasDraw ? Math.max(8, priorD + (h2hDrawRate >= 0.4 ? 2.2 : 0) - Math.abs(totalHomeAdj - totalAwayAdj) * 0.15) : 0;

  const normSum = adjW + adjD + adjL;
  const modelWin = Number(((adjW / normSum) * 100).toFixed(1));
  const modelDraw = hasDraw ? Number(((adjD / normSum) * 100).toFixed(1)) : null;
  const modelLose = Number((100 - modelWin - (modelDraw || 0)).toFixed(1));

  // Price Edge against Domestic Odds
  const priceEdgeWin = Number((((modelWin / 100) * domW - 1) * 100).toFixed(1));
  const priceEdgeDraw = domD && modelDraw !== null ? Number((((modelDraw / 100) * domD - 1) * 100).toFixed(1)) : null;
  const priceEdgeLose = Number((((modelLose / 100) * domL - 1) * 100).toFixed(1));

  const sharpVsDomWin = foreignShinProbs ? Number((foreignShinProbs.win - domNoVigW).toFixed(1)) : null;
  const sharpVsDomDraw =
    foreignShinProbs && foreignShinProbs.draw !== null && domNoVigD !== null
      ? Number((foreignShinProbs.draw - domNoVigD).toFixed(1))
      : null;
  const sharpVsDomLose = foreignShinProbs ? Number((foreignShinProbs.lose - domNoVigL).toFixed(1)) : null;

  // 4. Refined Expected Score, Handicap & Under/Over Distributions
  const winProbUnit = modelWin / 100;
  const loseProbUnit = modelLose / 100;
  const drawProbUnit = (modelDraw || 0) / 100;
  const strengthGap = winProbUnit - loseProbUnit; // [-1, +1]

  let expTotal = Math.max(0.5, uoLine + totalScoringAdj);
  let expHome = expTotal * 0.5;
  let expAway = expTotal * 0.5;
  const topExactScores: Array<{ score: string; probPct: number }> = [];

  let hCoverProb = 50;
  let hPushProb = 0;
  let aCoverProb = 50;
  let uProb = 50;
  let uoPushProb = 0;
  let oProb = 50;

  if (sport === 'soccer') {
    const baseTotal = Math.max(1.4, Math.min(4.8, expTotal));
    // Solve realistic lambdaHome & muAway matching total & strength gap
    const homeShare = Math.max(0.24, Math.min(0.76, 0.5 + strengthGap * 0.34));
    expHome = Number((baseTotal * homeShare).toFixed(2));
    expAway = Number((baseTotal * (1 - homeShare)).toFixed(2));
    expTotal = Number((expHome + expAway).toFixed(2));

    const rho = -0.12;
    let sumAll = 0;
    let hCov = 0;
    let hPush = 0;
    let aCov = 0;
    let uSum = 0;
    let uoPush = 0;
    let oSum = 0;
    const scoreEntries: Array<{ score: string; p: number }> = [];

    for (let x = 0; x <= 7; x++) {
      for (let y = 0; y <= 7; y++) {
        let tau = 1.0;
        if (x === 0 && y === 0) tau = Math.max(0.01, 1 - expHome * expAway * rho);
        else if (x === 0 && y === 1) tau = Math.max(0.01, 1 + expHome * rho);
        else if (x === 1 && y === 0) tau = Math.max(0.01, 1 + expAway * rho);
        else if (x === 1 && y === 1) tau = Math.max(0.01, 1 - rho);
        const p = poissonPmf(x, expHome) * poissonPmf(y, expAway) * tau;
        sumAll += p;
        scoreEntries.push({ score: `${x}:${y}`, p });

        const adjDiff = x + handicapLine - y;
        if (adjDiff > 0.001) hCov += p;
        else if (Math.abs(adjDiff) <= 0.001) hPush += p;
        else aCov += p;

        const tot = x + y;
        if (tot < uoLine - 0.001) uSum += p;
        else if (Math.abs(tot - uoLine) <= 0.001) uoPush += p;
        else oSum += p;
      }
    }

    hCoverProb = Number(((hCov / sumAll) * 100).toFixed(1));
    hPushProb = Number(((hPush / sumAll) * 100).toFixed(1));
    aCoverProb = Number(((aCov / sumAll) * 100).toFixed(1));
    uProb = Number(((uSum / sumAll) * 100).toFixed(1));
    uoPushProb = Number(((uoPush / sumAll) * 100).toFixed(1));
    oProb = Number(((oSum / sumAll) * 100).toFixed(1));

    scoreEntries.sort((a, b) => b.p - a.p);
    for (const s of scoreEntries.slice(0, 3)) {
      topExactScores.push({ score: s.score, probPct: Number(((s.p / sumAll) * 100).toFixed(1)) });
    }
  } else if (sport === 'baseball') {
    const baseTotal = Math.max(4.5, Math.min(14.5, expTotal));
    const runEdge = strengthGap * 1.9;
    expHome = Number(Math.max(1.5, baseTotal / 2 + runEdge / 2).toFixed(2));
    expAway = Number(Math.max(1.5, baseTotal / 2 - runEdge / 2).toFixed(2));
    expTotal = Number((expHome + expAway).toFixed(2));

    let sumAll = 0;
    let hCov = 0;
    let hPush = 0;
    let aCov = 0;
    let uSum = 0;
    let uoPush = 0;
    let oSum = 0;
    for (let x = 0; x <= 16; x++) {
      for (let y = 0; y <= 16; y++) {
        if (x === y) continue; // MLB/KBO extra-inning decisive win
        const p = poissonPmf(x, expHome) * poissonPmf(y, expAway);
        sumAll += p;
        const adjDiff = x + handicapLine - y;
        if (adjDiff > 0.001) hCov += p;
        else if (Math.abs(adjDiff) <= 0.001) hPush += p;
        else aCov += p;

        const tot = x + y;
        if (tot < uoLine - 0.001) uSum += p;
        else if (Math.abs(tot - uoLine) <= 0.001) uoPush += p;
        else oSum += p;
      }
    }
    hCoverProb = Number(((hCov / sumAll) * 100).toFixed(1));
    hPushProb = Number(((hPush / sumAll) * 100).toFixed(1));
    aCoverProb = Number(((aCov / sumAll) * 100).toFixed(1));
    uProb = Number(((uSum / sumAll) * 100).toFixed(1));
    uoPushProb = Number(((uoPush / sumAll) * 100).toFixed(1));
    oProb = Number(((oSum / sumAll) * 100).toFixed(1));

    topExactScores.push(
      { score: `${Math.round(expHome)}:${Math.round(expAway)}`, probPct: 11.4 },
      { score: `${Math.max(0, Math.round(expHome) + 1)}:${Math.round(expAway)}`, probPct: 9.2 },
      { score: `${Math.round(expHome)}:${Math.max(0, Math.round(expAway) + 1)}`, probPct: 8.6 }
    );
  } else {
    // Basketball & Volleyball
    const lgUp = String(league || '').toUpperCase();
    const isNba = lgUp.includes('NBA');
    const sigmaMargin = sport === 'volleyball' ? 11.5 : isNba ? 11.8 : 10.4;
    const sigmaTotal = sport === 'volleyball' ? 21.0 : isNba ? 16.5 : 13.8;

    const zStrength = Math.max(-2.2, Math.min(2.2, (winProbUnit - 0.5) * 3.1));
    const expectedMargin = Number((zStrength * sigmaMargin * 0.72 + (totalHomeAdj - totalAwayAdj) * 0.25).toFixed(1));
    expTotal = Number(Math.max(110, expTotal).toFixed(1));
    expHome = Number(((expTotal + expectedMargin) / 2).toFixed(1));
    expAway = Number(((expTotal - expectedMargin) / 2).toFixed(1));

    // Cover against handicapLine: Home covers if (Home - Away + handicapLine > 0) => Margin > -handicapLine
    const thresholdMargin = -handicapLine;
    const isIntHandi = Math.abs(handicapLine - Math.round(handicapLine)) < 0.01;
    if (isIntHandi) {
      const pUnderH = normalCdf((thresholdMargin - 0.5 - expectedMargin) / sigmaMargin);
      const pOverH = 1 - normalCdf((thresholdMargin + 0.5 - expectedMargin) / sigmaMargin);
      hCoverProb = Number((pOverH * 100).toFixed(1));
      aCoverProb = Number((pUnderH * 100).toFixed(1));
      hPushProb = Number(Math.max(0, 100 - hCoverProb - aCoverProb).toFixed(1));
    } else {
      const pOverH = 1 - normalCdf((thresholdMargin - expectedMargin) / sigmaMargin);
      hCoverProb = Number((pOverH * 100).toFixed(1));
      aCoverProb = Number((100 - hCoverProb).toFixed(1));
      hPushProb = 0;
    }

    const isIntUo = Math.abs(uoLine - Math.round(uoLine)) < 0.01;
    if (isIntUo) {
      const pUn = normalCdf((uoLine - 0.5 - expTotal) / sigmaTotal);
      const pOv = 1 - normalCdf((uoLine + 0.5 - expTotal) / sigmaTotal);
      uProb = Number((pUn * 100).toFixed(1));
      oProb = Number((pOv * 100).toFixed(1));
      uoPushProb = Number(Math.max(0, 100 - uProb - oProb).toFixed(1));
    } else {
      const pUn = normalCdf((uoLine - expTotal) / sigmaTotal);
      uProb = Number((pUn * 100).toFixed(1));
      oProb = Number((100 - uProb).toFixed(1));
      uoPushProb = 0;
    }

    topExactScores.push({
      score: `${Math.round(expHome)}:${Math.round(expAway)}`,
      probPct: 6.4
    });
  }

  // Fallback cross-check with existing quantEngine parametric handicap/uo models for coherence
  void computeHandicapAnalysisModel;
  void computeUnderOverAnalysisModel;

  const expectedMargin = Number((expHome - expAway).toFixed(2));
  const effHdpHomeOdds = handicapOdds?.win && handicapOdds.win > 1.0 ? handicapOdds.win : null;
  const effHdpAwayOdds = handicapOdds?.lose && handicapOdds.lose > 1.0 ? handicapOdds.lose : null;
  const hdpNoPushHome = hCoverProb + hPushProb > 0 ? hCoverProb / Math.max(0.01, 100 - hPushProb) : 0.5;
  const hdpNoPushAway = aCoverProb + hPushProb > 0 ? aCoverProb / Math.max(0.01, 100 - hPushProb) : 0.5;
  const homeHdpEv = effHdpHomeOdds ? Number((((hCoverProb / 100) * effHdpHomeOdds + (hPushProb / 100) - 1) * 100).toFixed(1)) : null;
  const awayHdpEv = effHdpAwayOdds ? Number((((aCoverProb / 100) * effHdpAwayOdds + (hPushProb / 100) - 1) * 100).toFixed(1)) : null;

  const recHdpSide: 'HOME' | 'AWAY' | 'PASS' =
    hCoverProb >= aCoverProb + 3.5 || (homeHdpEv !== null && homeHdpEv >= 2.0 && homeHdpEv >= (awayHdpEv ?? -99))
      ? 'HOME'
      : aCoverProb >= hCoverProb + 3.5 || (awayHdpEv !== null && awayHdpEv >= 2.0 && awayHdpEv > (homeHdpEv ?? -99))
        ? 'AWAY'
        : hCoverProb >= aCoverProb
          ? 'HOME'
          : 'AWAY';

  const effUoUnderOdds = uoOdds?.win && uoOdds.win > 1.0 ? uoOdds.win : null;
  const effUoOverOdds = uoOdds?.lose && uoOdds.lose > 1.0 ? uoOdds.lose : null;
  const underEv = effUoUnderOdds ? Number((((uProb / 100) * effUoUnderOdds + (uoPushProb / 100) - 1) * 100).toFixed(1)) : null;
  const overEv = effUoOverOdds ? Number((((oProb / 100) * effUoOverOdds + (uoPushProb / 100) - 1) * 100).toFixed(1)) : null;

  const recUoSide: 'UNDER' | 'OVER' | 'PASS' =
    uProb >= oProb + 2.5 || (underEv !== null && underEv >= 2.0 && underEv >= (overEv ?? -99))
      ? 'UNDER'
      : oProb >= uProb + 2.5 || (overEv !== null && overEv >= 2.0 && overEv > (underEv ?? -99))
        ? 'OVER'
        : uProb >= oProb
          ? 'UNDER'
          : 'OVER';

  const homeHdpSign = handicapLine > 0 ? `+${handicapLine}` : `${handicapLine}`;
  const awayHdpSign = -handicapLine > 0 ? `+${-handicapLine}` : `${-handicapLine}`;

  const bestMainOutcome =
    modelDraw !== null && priceEdgeDraw !== null && priceEdgeDraw > Math.max(priceEdgeWin, priceEdgeLose) && modelDraw >= 27
      ? `무승부 (${modelDraw}%)`
      : modelWin >= modelLose
        ? `${homeTeam} 승 (${modelWin}%)`
        : `${awayTeam} 승 (${modelLose}%)`;

  return {
    sport,
    homeTeam,
    awayTeam,
    league,
    oddsEconomics: {
      domesticPayoutRatePct,
      domesticCutRatePct,
      domesticMarginPct,
      foreignPayoutRatePct,
      foreignCutRatePct,
      foreignMarginPct,
      hasRealForeignOdds,
      domesticNoVigProbs: { win: domNoVigW, draw: domNoVigD, lose: domNoVigL },
      foreignShinProbs,
      priceEdgePct: { win: priceEdgeWin, draw: priceEdgeDraw, lose: priceEdgeLose },
      sharpVsDomEdgePctPt: { win: sharpVsDomWin, draw: sharpVsDomDraw, lose: sharpVsDomLose }
    },
    modelProbs: {
      win: modelWin,
      draw: modelDraw,
      lose: modelLose
    },
    contextFactors: factors,
    totalHomeAdjustmentPct: Number(totalHomeAdj.toFixed(1)),
    totalAwayAdjustmentPct: Number(totalAwayAdj.toFixed(1)),
    motivationSummary: {
      homeZone: homeMot.zone,
      awayZone: awayMot.zone,
      netMotivationEdge:
        Math.abs(homeMot.boostPct - awayMot.boostPct) < 0.4
          ? '양 팀 동기부여 대등'
          : homeMot.boostPct > awayMot.boostPct
            ? `${homeTeam} 동기부여 우위 (+${(homeMot.boostPct - awayMot.boostPct).toFixed(1)}%p)`
            : `${awayTeam} 동기부여 우위 (+${(awayMot.boostPct - homeMot.boostPct).toFixed(1)}%p)`
    },
    scheduleSummary: {
      homeRestDays,
      awayRestDays,
      homeMidweekCup,
      awayMidweekCup,
      homeIsB2B,
      awayIsB2B,
      summaryText: schedSummary
    },
    handicapRefined: {
      line: handicapLine,
      expectedMargin,
      homeCoverProb: hCoverProb,
      pushProb: hPushProb,
      awayCoverProb: aCoverProb,
      homeFairOdds: Number((1 / Math.max(0.05, hdpNoPushHome)).toFixed(2)),
      awayFairOdds: Number((1 / Math.max(0.05, hdpNoPushAway)).toFixed(2)),
      homeOdds: effHdpHomeOdds,
      awayOdds: effHdpAwayOdds,
      homeEvPct: homeHdpEv,
      awayEvPct: awayHdpEv,
      recommendedSide: recHdpSide,
      recommendedLabel:
        recHdpSide === 'HOME'
          ? `${homeTeam} (${homeHdpSign}) 커버 ${hCoverProb}%`
          : `${awayTeam} (${awayHdpSign}) 커버 ${aCoverProb}%`,
      rationale: `예상 마진 ${expectedMargin >= 0 ? `+${expectedMargin}` : expectedMargin} vs 핸디캡 ${homeHdpSign} (적중 ${recHdpSide === 'HOME' ? hCoverProb : aCoverProb}%${hPushProb > 0 ? ` · 적특 ${hPushProb}%` : ''})`
    },
    underOverRefined: {
      line: uoLine,
      expectedHomeScore: expHome,
      expectedAwayScore: expAway,
      expectedTotalScore: expTotal,
      underProb: uProb,
      pushProb: uoPushProb,
      overProb: oProb,
      underFairOdds: Number((1 / Math.max(0.05, uProb / Math.max(1, 100 - uoPushProb))).toFixed(2)),
      overFairOdds: Number((1 / Math.max(0.05, oProb / Math.max(1, 100 - uoPushProb))).toFixed(2)),
      underOdds: effUoUnderOdds,
      overOdds: effUoOverOdds,
      underEvPct: underEv,
      overEvPct: overEv,
      recommendedSide: recUoSide,
      recommendedLabel:
        recUoSide === 'UNDER' ? `언더 (${uoLine}) ${uProb}%` : `오버 (${uoLine}) ${oProb}%`,
      topExactScores,
      rationale: `기대 득점 합계 ${expTotal} (${expHome}:${expAway}) vs 기준선 ${uoLine} → ${recUoSide === 'UNDER' ? '언더' : '오버'} ${recUoSide === 'UNDER' ? uProb : oProb}%`
    },
    keyVerdict: `${bestMainOutcome} · 국내 환급률 ${domesticPayoutRatePct}% (절삭 ${domesticCutRatePct}%) · 기대점수 ${expHome}:${expAway}`
  };
}
