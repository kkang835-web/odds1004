import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  MatchItem, 
  SportCategory, 
  BaseballWin1LossOutcome, 
  BasketballWin5LossOutcome, 
  Soccer1X2Outcome 
} from '../types';
import { resolveRoundByDate, getTodayDateString } from '../utils/calendarRoundResolver';
import { computeQuantModel } from '../utils/quantModel';

// Fixed Height Standards for Zero-Jitter Virtual Scrolling
export const ROW_HEIGHT_PC = 52;
export const ROW_HEIGHT_MOBILE = 240;

export type { MatchItem };

export type CanonicalMarketType = 'SUM' | 'W1L' | 'W5L' | 'HANDICAP' | 'UNDER_OVER' | '1X2' | 'MONEYLINE';

/**
 * Accurately and strictly classifies the canonical market type of any match.
 * Prevents market conflation (e.g. SUM vs U/O, Baseball W1L vs Basketball W5L).
 */
export function identifyMarketType(m: MatchItem): CanonicalMarketType {
  const rawLabel = (m.categoryLabel || '').trim();
  const rawType = ((m as any).categoryType || '').trim();
  const betmanMarket = ((m as any).betmanMarketType || '').trim();

  // 1. SUM (일반 홀짝)
  if (
    rawLabel === 'SUM' || 
    rawLabel.includes('홀짝') || 
    rawType === 'SUM' || 
    betmanMarket === 'SUM' || 
    (m.marketType === 'SUM' && m.sport !== 'baseball')
  ) {
    return 'SUM';
  }

  // 2. Baseball Win-1-Loss (승1패) - STRICT: baseball only!
  if (
    m.sport === 'baseball' && 
    (rawLabel === '승1패' || rawLabel === '승①패' || rawLabel.includes('승1패') || rawType === '승1패' || betmanMarket === 'W1L')
  ) {
    return 'W1L';
  }

  // 3. Basketball Win-5-Loss (승5패) - STRICT: basketball only!
  if (
    m.sport === 'basketball' && 
    (rawLabel === '승5패' || rawLabel === '승⑤패' || rawLabel.includes('승5패') || rawType === '승5패' || rawType === '승1패' || betmanMarket === 'W5L')
  ) {
    return 'W5L';
  }

  // 4. Handicap (핸디캡)
  if (
    rawType === '핸디캡' || 
    betmanMarket === 'HANDICAP' || 
    rawLabel.startsWith('H') || 
    rawLabel.includes('핸디')
  ) {
    return 'HANDICAP';
  }

  // 5. Under/Over (언더오버)
  if (
    rawType === '언더오버' || 
    betmanMarket === 'UNDER_OVER' || 
    rawLabel.startsWith('U') || 
    rawLabel.startsWith('O') || 
    rawLabel.includes('언더') || 
    rawLabel.includes('오버') || 
    rawLabel.includes('U/O')
  ) {
    return 'UNDER_OVER';
  }

  // 6. 1X2 (Soccer or draw-possible sports)
  if (m.sport === 'soccer' || (m.domestic?.draw !== null && m.domestic?.draw !== undefined && m.domestic.draw > 0)) {
    return '1X2';
  }

  // 7. 2-Way Moneyline
  return 'MONEYLINE';
}

/**
 * Formats the match type badge cleanly without duplicate numbers
 * Strictly enforces that '승1패' is valid only for baseball and '승5패' is valid for basketball.
 */
export function formatCategoryBadge(m: MatchItem): string {
  const mType = identifyMarketType(m);
  if (mType === 'SUM') return 'SUM (홀짝)';
  if (mType === 'W1L') return '승1패';
  if (mType === 'W5L') return '승5패';
  if (mType === 'HANDICAP') {
    const rawLabel = (m.categoryLabel || '').trim();
    if (rawLabel.startsWith('H') || rawLabel.includes('핸디')) return rawLabel;
    const line = m.handicapLine ?? m.handicapOrLine;
    return line !== undefined && line !== null ? `H ${line > 0 ? '+' : ''}${line}` : '핸디캡';
  }
  if (mType === 'UNDER_OVER') {
    const rawLabel = (m.categoryLabel || '').trim();
    if (rawLabel.startsWith('U') || rawLabel.startsWith('O') || rawLabel.includes('언더') || rawLabel.includes('오버')) return rawLabel;
    const line = m.uoLine ?? m.handicapOrLine;
    return line !== undefined && line !== null ? `U/O ${line}` : '언더오버';
  }
  return '일반';
}

/**
 * Resolves the physical final match score (home, away) for a match.
 */
function getPhysicalScore(
  m: MatchItem,
  generalMatchMap?: Map<string, MatchItem>,
  allMatches?: MatchItem[]
): { home: number; away: number } | null {
  if (m.underlyingScore && typeof m.underlyingScore.home === 'number' && typeof m.underlyingScore.away === 'number') {
    return { home: m.underlyingScore.home, away: m.underlyingScore.away };
  }
  const key = `${m.homeTeam}_${m.awayTeam}_${m.date}`;
  const generalMatch = generalMatchMap
    ? generalMatchMap.get(key)
    : allMatches?.find(other => 
        other.homeTeam === m.homeTeam &&
        other.awayTeam === m.awayTeam &&
        other.date === m.date &&
        other.categoryLabel === '일반'
      );
  if (generalMatch) {
    if (generalMatch.score && typeof generalMatch.score.home === 'number' && typeof generalMatch.score.away === 'number') {
      return { home: generalMatch.score.home, away: generalMatch.score.away };
    }
    if (typeof generalMatch.homeScore === 'number' && typeof generalMatch.awayScore === 'number') {
      return { home: generalMatch.homeScore, away: generalMatch.awayScore };
    }
  }
  if (m.score && typeof (m.score as any).home === 'number' && typeof (m.score as any).away === 'number') {
    return { home: (m.score as any).home, away: (m.score as any).away };
  }
  if (typeof (m.score as any) === 'string' && (m.score as any).includes(':')) {
    const parts = (m.score as any).split(':').map((s: string) => parseInt(s.trim(), 10));
    if (!isNaN(parts[0]) && !isNaN(parts[1])) {
      return { home: parts[0], away: parts[1] };
    }
  }
  if (typeof m.homeScore === 'number' && typeof m.awayScore === 'number') {
    return { home: m.homeScore, away: m.awayScore };
  }
  return null;
}

/**
 * Calculates and formats the Display Score for match table rows.
 * For Handicap markets: Displays the handicap settlement score directly as the main score (e.g. 1:0 or 0:0).
 * For General / UO / SUM markets: Displays the actual physical match final score (e.g. 2:0 or 1:6).
 */
function getDisplayScore(
  m: MatchItem, 
  generalMatchMap?: Map<string, MatchItem>,
  allMatches?: MatchItem[]
): string {
  if (m.status !== '종료') return '-:-';

  // 1. For 3-Way Handicap markets, display the handicap settlement score directly as the main score
  const isHandicap = m.categoryType === '핸디캡' || (m.categoryLabel && (m.categoryLabel.startsWith('H') || m.categoryLabel.includes('핸디')));
  if (isHandicap && m.settlementScore && typeof m.settlementScore.home === 'number' && typeof m.settlementScore.away === 'number') {
    return `${m.settlementScore.home}:${m.settlementScore.away}`;
  }

  const phys = getPhysicalScore(m, generalMatchMap, allMatches);
  if (!phys) return '-:-';
  return `${phys.home}:${phys.away}`;
}

export interface MarketHitStatus {
  isWinHit: boolean;
  isDrawHit: boolean; // STRICT: ONLY true for actual soccer / general draw (NEVER true for baseball W1L or basketball W5L!)
  isLoseHit: boolean;
  baseballOutcome: BaseballWin1LossOutcome | null;
  basketballOutcome: BasketballWin5LossOutcome | null;
  soccerOutcome: Soccer1X2Outcome | null;
  outcomeTag: string;
  activeOddsSlot: 'win' | 'middle' | 'lose' | null;
  homeTeamWon: boolean;
  awayTeamWon: boolean;
}

/**
 * Canonical outcome resolver for Baseball Win-1-Loss (승1패)
 * - HOME_WIN_2PLUS : 홈팀 2점 이상 승리 -> "승"
 * - ONE_RUN_OR_TIE : 홈팀과 원정팀 점수 차 1점 이하 (1점 차 홈승, 1점 차 원정승, 동점) -> "1"
 * - HOME_LOSS_2PLUS: 홈팀 2점 이상 패배 (원정 2점 이상 승리) -> "패"
 */
export function resolveBaseballWin1LossOutcome(
  homeScore: number,
  awayScore: number
): { outcome: BaseballWin1LossOutcome; display: string; activeOddsSlot: 'win' | 'middle' | 'lose' } {
  const diff = homeScore - awayScore;
  if (Math.abs(diff) <= 1) {
    return { outcome: 'ONE_RUN_OR_TIE', display: '1', activeOddsSlot: 'middle' };
  } else if (diff >= 2) {
    return { outcome: 'HOME_WIN_2PLUS', display: '승', activeOddsSlot: 'win' };
  } else {
    return { outcome: 'HOME_LOSS_2PLUS', display: '패', activeOddsSlot: 'lose' };
  }
}

/**
 * Canonical outcome resolver for Basketball Win-5-Loss (승5패)
 * - HOME_WIN_6PLUS : 홈팀 6점 이상 승리 -> "승"
 * - WITHIN_5       : 양팀 점수 차 5점 이하 -> "5"
 * - HOME_LOSS_6PLUS: 홈팀 6점 이상 패배 (원정 6점 이상 승리) -> "패"
 */
export function resolveBasketballWin5LossOutcome(
  homeScore: number,
  awayScore: number
): { outcome: BasketballWin5LossOutcome; display: string; activeOddsSlot: 'win' | 'middle' | 'lose' } {
  const diff = homeScore - awayScore;
  if (Math.abs(diff) <= 5) {
    return { outcome: 'WITHIN_5', display: '5', activeOddsSlot: 'middle' };
  } else if (diff >= 6) {
    return { outcome: 'HOME_WIN_6PLUS', display: '승', activeOddsSlot: 'win' };
  } else {
    return { outcome: 'HOME_LOSS_6PLUS', display: '패', activeOddsSlot: 'lose' };
  }
}

/**
 * Canonical outcome resolver for Soccer 1X2 (축구 승무패)
 */
export function resolveSoccer1X2Outcome(
  homeScore: number,
  awayScore: number
): { outcome: Soccer1X2Outcome; display: string; activeOddsSlot: 'win' | 'middle' | 'lose'; isDrawHit: boolean } {
  if (homeScore > awayScore) {
    return { outcome: 'HOME_WIN', display: '승', activeOddsSlot: 'win', isDrawHit: false };
  } else if (homeScore === awayScore) {
    return { outcome: 'DRAW', display: '무', activeOddsSlot: 'middle', isDrawHit: true };
  } else {
    return { outcome: 'AWAY_WIN', display: '패', activeOddsSlot: 'lose', isDrawHit: false };
  }
}

export interface MarketSlotLabels {
  slot1: string;
  slot2: string | null;
  slot3: string;
  marketName: string;
  isTwoWay: boolean;
}

/**
 * Returns exact slot labels for domestic and foreign odds based on market definition.
 * - Soccer 1X2: 홈승 / 무승부 / 원정승
 * - Baseball ML: 홈승 / 원정승 (2-way)
 * - Basketball / Volleyball ML: 홈승 / 원정승 (2-way)
 * - Baseball W1L: 승 / 1 / 패 (3-way)
 * - Basketball W5L: 승 / 5 / 패 (3-way)
 * - Handicap: 홈승 / (핸무) / 원정승 (with line criteria)
 * - Under/Over: 언더 / 오버 (2-way)
 * - SUM: 홀 / 짝 (2-way)
 */
export function getMarketSlotLabels(m: MatchItem): MarketSlotLabels {
  const mType = identifyMarketType(m);

  switch (mType) {
    case 'SUM': {
      const hasOdds = typeof m.domestic?.win === 'number' && typeof m.domestic?.lose === 'number';
      return {
        slot1: hasOdds ? '홀' : '-',
        slot2: null,
        slot3: hasOdds ? '짝' : '-',
        marketName: hasOdds ? '일반 홀짝' : 'SUM (미제공)',
        isTwoWay: true
      };
    }

    case 'W1L': {
      return {
        slot1: '승',
        slot2: '1',
        slot3: '패',
        marketName: '야구 승1패',
        isTwoWay: false
      };
    }

    case 'W5L': {
      return {
        slot1: '승',
        slot2: '5',
        slot3: '패',
        marketName: '농구 승5패',
        isTwoWay: false
      };
    }

    case 'HANDICAP': {
      const line = m.handicapLine ?? m.handicapOrLine;
      const lineStr = line !== undefined && line !== null ? `${line > 0 ? '+' : ''}${line}` : '';
      const hasDraw = typeof m.domestic?.draw === 'number' && m.domestic.draw > 0;
      return {
        slot1: lineStr ? `홈승 (${lineStr})` : '홈승',
        slot2: hasDraw ? '핸무' : null,
        slot3: lineStr ? `원정승 (${line ? (line < 0 ? `+${Math.abs(line)}` : `-${line}`) : ''})` : '원정승',
        marketName: lineStr ? `핸디캡 (${lineStr})` : '핸디캡',
        isTwoWay: !hasDraw
      };
    }

    case 'UNDER_OVER': {
      const line = m.uoLine ?? m.handicapOrLine;
      const lineStr = line !== undefined && line !== null ? `${line}` : '';
      return {
        slot1: lineStr ? `언더 (${lineStr})` : '언더',
        slot2: null,
        slot3: lineStr ? `오버 (${lineStr})` : '오버',
        marketName: lineStr ? `언더오버 (${lineStr})` : '언더오버',
        isTwoWay: true
      };
    }

    case '1X2': {
      return {
        slot1: '홈승',
        slot2: '무승부',
        slot3: '원정승',
        marketName: `${m.sport === 'soccer' ? '축구' : ''} 승무패`.trim(),
        isTwoWay: false
      };
    }

    case 'MONEYLINE':
    default: {
      return {
        slot1: '홈승',
        slot2: null,
        slot3: '원정승',
        marketName: `${m.sport === 'baseball' ? '야구' : m.sport === 'basketball' ? '농구' : ''} 승패`.trim() || '승패',
        isTwoWay: true
      };
    }
  }
}

export interface FormattedOddsThreeSlots {
  isTwoWay: boolean;
  slot1: { text: string; isMissing: boolean };
  slot2: { text: string; isMissing: boolean; isAlignmentDash: boolean };
  slot3: { text: string; isMissing: boolean };
}

/**
 * Maps domestic or foreign odds into a strict 3-slot symmetrical format.
 * - 3-way markets: [Slot 1] [Slot 2] [Slot 3] (e.g. 1.43  4.00  5.00)
 *   If draw/middle odds are missing, shows '-' as missing data (isMissing: true).
 * - 2-way markets: [Slot 1] [ - ] [Slot 3] (e.g. 1.69  -  1.84)
 *   The middle '-' is an alignment dash indicating no 3rd option exists (isAlignmentDash: true).
 */
export function formatOddsIntoThreeSlots(
  odds: { win?: number | null; draw?: number | null; lose?: number | null } | null | undefined,
  isTwoWay: boolean
): FormattedOddsThreeSlots {
  const hasWin = typeof odds?.win === 'number' && odds.win > 0;
  const hasDraw = typeof odds?.draw === 'number' && odds.draw > 0;
  const hasLose = typeof odds?.lose === 'number' && odds.lose > 0;

  const slot1Text = hasWin ? odds!.win!.toFixed(2) : '-';
  const slot3Text = hasLose ? odds!.lose!.toFixed(2) : '-';

  if (isTwoWay) {
    return {
      isTwoWay: true,
      slot1: { text: slot1Text, isMissing: !hasWin },
      slot2: { text: '-', isMissing: false, isAlignmentDash: true },
      slot3: { text: slot3Text, isMissing: !hasLose }
    };
  } else {
    return {
      isTwoWay: false,
      slot1: { text: slot1Text, isMissing: !hasWin },
      slot2: { text: hasDraw ? odds!.draw!.toFixed(2) : '-', isMissing: !hasDraw, isAlignmentDash: false },
      slot3: { text: slot3Text, isMissing: !hasLose }
    };
  }
}

/**
 * Resolves domestic odds from m.domestic, m.matchOdds, m.handicapOdds, or m.uoOdds cleanly.
 */
export function resolveMatchDomesticOdds(m: MatchItem) {
  const mType = identifyMarketType(m);
  if (mType === 'HANDICAP' && m.handicapOdds && (typeof m.handicapOdds.win === 'number' || typeof m.handicapOdds.lose === 'number')) {
    return m.handicapOdds;
  }
  if (mType === 'UNDER_OVER' && m.uoOdds && (typeof m.uoOdds.win === 'number' || typeof m.uoOdds.lose === 'number')) {
    return m.uoOdds;
  }
  if (mType === 'W1L' && m.w1lOdds && (typeof m.w1lOdds.win === 'number' || typeof m.w1lOdds.lose === 'number')) {
    return m.w1lOdds;
  }
  if (m.domestic && (typeof m.domestic.win === 'number' || typeof m.domestic.lose === 'number')) {
    return m.domestic;
  }
  if (m.matchOdds && (typeof m.matchOdds.win === 'number' || typeof m.matchOdds.lose === 'number')) {
    return m.matchOdds;
  }
  if (m.handicapOdds && (typeof m.handicapOdds.win === 'number' || typeof m.handicapOdds.lose === 'number')) {
    return m.handicapOdds;
  }
  if (m.uoOdds && (typeof m.uoOdds.win === 'number' || typeof m.uoOdds.lose === 'number')) {
    return m.uoOdds;
  }
  return m.domestic || m.matchOdds || null;
}

/**
 * Returns distinct fallback/unavailable status reason for foreign odds.
 * Strictly distinguishes:
 * 1. Non-h2h markets (승1패/승5패/핸디캡/언더오버/SUM)
 * 2. Match matching failure
 * 3. Unsupported sport/league
 * 4. General unavailable
 */
export function getForeignUnavailableReason(m: MatchItem): string {
  if (m.verifiedForeignPreview) {
    if (m.verifiedForeignPreview.status === 'MATCH_ERROR') {
      return '경기 매칭 실패 (MATCH_ERROR)';
    }
    if (m.verifiedForeignPreview.status === 'PARSE_ERROR') {
      return '파싱 실패 (PARSE_ERROR)';
    }
    if (m.verifiedForeignPreview.status === 'NOT_PROVIDED') {
      return '원본 미제공 (NOT_PROVIDED)';
    }
  }
  const sourceName = m.foreignSourceName || '';
  if (sourceName.includes('원본 미제공') || sourceName.includes('해외 평균 배당')) {
    return '원본 미제공 (NOT_PROVIDED)';
  }
  const mType = identifyMarketType(m);
  if (mType !== '1X2' && mType !== 'MONEYLINE') {
    return '지원되지 않는 시장 (h2h 미해당)';
  }
  if (sourceName.includes('쿼터 소진')) {
    return 'API 쿼터 소진 (UNAVAILABLE)';
  }
  if (sourceName.includes('매칭') || sourceName.includes('불일치') || sourceName.includes('찾을 수 없음')) {
    return '경기 매칭 실패';
  }
  if (sourceName.includes('미지원')) {
    return '미지원 종목';
  }
  return '미제공 (UNAVAILABLE)';
}

export interface ForeignFreshnessInfo {
  status: 'LIVE' | 'CACHED' | 'STALE' | 'UNAVAILABLE';
  label: string;
  badgeClass: string;
  timeText: string;
  subNotice?: string;
  tooltip: string;
  isQuotaExhausted?: boolean;
}

/**
 * Returns clean freshness badge info: LIVE / CACHED / STALE / UNAVAILABLE with formatted timestamp
 */
export function getForeignFreshness(m: MatchItem): ForeignFreshnessInfo {
  if (m.verifiedForeignPreview) {
    const v = m.verifiedForeignPreview;
    let formattedKstTime = '';
    let isStale = true;
    if (v.scrapedAt) {
      try {
        const d = new Date(v.scrapedAt);
        if (!isNaN(d.getTime())) {
          // Format in Korea Standard Time (KST, Asia/Seoul)
          formattedKstTime = new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).format(d);

          // Configurable freshness threshold: 6 hours
          const MAX_FRESHNESS_MS = 6 * 60 * 60 * 1000;
          const diffMs = Math.abs(Date.now() - d.getTime());
          isStale = diffMs > MAX_FRESHNESS_MS;
        }
      } catch {}
    }

    const sourceLabel = v.source === 'supabase_staging' || v.sourceOrigin === 'supabase_staging'
      ? 'Supabase Staging'
      : (v.source === 'local_test_json_fallback' || v.sourceOrigin === 'local_test_json_fallback'
        ? '로컬 JSON Fallback'
        : '검증 스냅샷');

    if (v.status === 'OK' && m.foreign) {
      const hDiff = v.oddsChange?.win !== null && v.oddsChange?.win !== undefined ? `${v.oddsChange.win > 0 ? '+' : ''}${v.oddsChange.win}` : '-';
      const dDiff = v.oddsChange?.draw !== null && v.oddsChange?.draw !== undefined ? `${v.oddsChange.draw > 0 ? '+' : ''}${v.oddsChange.draw}` : '-';
      const aDiff = v.oddsChange?.lose !== null && v.oddsChange?.lose !== undefined ? `${v.oddsChange.lose > 0 ? '+' : ''}${v.oddsChange.lose}` : '-';
      const tooltipLines = [
        `[해외 평균 배당 · 과거 배당 스냅샷]`,
        `데이터 원천: ${sourceLabel} (검증 미리보기)`,
        `현재 배당: 홈(${v.currentOdds?.win ?? '-'}) / 무(${v.currentOdds?.draw ?? '-'}) / 원정(${v.currentOdds?.lose ?? '-'})`,
        `초기 배당: 홈(${v.initialOdds?.win ?? '-'}) / 무(${v.initialOdds?.draw ?? '-'}) / 원정(${v.initialOdds?.lose ?? '-'})`,
        `배당 변동: 홈(${hDiff}) 무(${dDiff}) 원정(${aDiff})`,
        formattedKstTime ? `수집 시각: ${formattedKstTime} (KST)` : '',
        `최신성 상태: ${isStale ? '과거 배당 스냅샷 (오래된 데이터 / 실시간 배당 아님)' : '최신 데이터'}`
      ].filter(Boolean).join('\n');

      return {
        status: isStale ? 'STALE' : 'CACHED',
        label: '과거 배당 스냅샷',
        badgeClass: 'bg-amber-100 text-amber-900 border border-amber-300 font-bold',
        timeText: formattedKstTime ? `${formattedKstTime} (KST)` : '',
        subNotice: `해외 평균 (${sourceLabel})`,
        tooltip: tooltipLines,
        isQuotaExhausted: false
      };
    } else if (v.status === 'NOT_PROVIDED') {
      return {
        status: 'UNAVAILABLE',
        label: '원본 미제공',
        badgeClass: 'bg-slate-100 text-slate-500 border border-slate-200 font-bold',
        timeText: formattedKstTime ? `${formattedKstTime} (KST)` : '',
        tooltip: `해외 평균 배당 원본 미제공 (출처: ${sourceLabel}, 벳인포 대시 '-')`,
        isQuotaExhausted: false
      };
    } else if (v.status === 'PARSE_ERROR') {
      return {
        status: 'UNAVAILABLE',
        label: '파싱 실패',
        badgeClass: 'bg-rose-100 text-rose-800 border border-rose-300 font-bold',
        timeText: formattedKstTime ? `${formattedKstTime} (KST)` : '',
        tooltip: '해외 평균 배당 파싱 실패 (PARSE_ERROR)',
        isQuotaExhausted: false
      };
    } else if (v.status === 'MATCH_ERROR') {
      return {
        status: 'UNAVAILABLE',
        label: '매칭 실패',
        badgeClass: 'bg-red-100 text-red-800 border border-red-300 font-bold',
        timeText: formattedKstTime ? `${formattedKstTime} (KST)` : '',
        tooltip: '경기 정보 불일치 (MATCH_ERROR)',
        isQuotaExhausted: false
      };
    }
  }

  if (m.oddsSource?.foreign !== 'real' || !m.foreign) {
    const reason = getForeignUnavailableReason(m);
    return {
      status: 'UNAVAILABLE',
      label: 'UNAVAILABLE',
      badgeClass: 'bg-gray-100 text-gray-500 border border-gray-200',
      timeText: '',
      tooltip: m.foreignSourceName || reason
    };
  }

  // Format collection / update time (never mutate or mock)
  const timeRaw = m.foreignLastUpdate || m.foreignCachedAt || (m as any).foreignCachedAt;
  let formattedTime = '';
  let timeMs = 0;
  if (timeRaw) {
    try {
      const d = new Date(timeRaw);
      if (!isNaN(d.getTime())) {
        timeMs = d.getTime();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        formattedTime = `${month}/${day} ${hours}:${mins}`;
      }
    } catch {
      // fallback
    }
  }

  const isQuotaExhausted = Boolean(
    m.foreignIsQuotaExhausted ||
    (m.foreignSourceName && m.foreignSourceName.includes('쿼터 소진')) ||
    (m.foreignSourceName && m.foreignSourceName.includes('한도 도달'))
  );

  const CACHE_TTL_MS = 15 * 60 * 1000;
  const isTimeExceeded = timeMs > 0 ? (Date.now() - timeMs >= CACHE_TTL_MS) : false;

  // Determine status cleanly: STALE, CACHED, or LIVE
  let status: 'LIVE' | 'CACHED' | 'STALE';
  if (m.foreignStatus === 'STALE' || isTimeExceeded) {
    status = 'STALE';
  } else if (
    m.foreignStatus === 'CACHED' ||
    (m.foreignSourceName && m.foreignSourceName.includes('캐시')) ||
    (m as any).isCached
  ) {
    status = 'CACHED';
  } else {
    status = 'LIVE';
  }

  if (status === 'STALE') {
    return {
      status: 'STALE',
      label: isQuotaExhausted ? 'STALE · 쿼터소진' : 'STALE',
      badgeClass: 'bg-orange-100 text-orange-900 border border-orange-300 font-bold',
      timeText: formattedTime,
      subNotice: isQuotaExhausted ? '오래된 캐시 · 갱신 필요 (쿼터 소진)' : '오래된 캐시 · 갱신 필요',
      tooltip: `오래된 캐시 · 갱신 필요${formattedTime ? ` (마지막 수집: ${formattedTime})` : ''}${
        isQuotaExhausted 
          ? ' · API 쿼터 소진으로 갱신 중단 (유료 플랜 권장)' 
          : ' · 신선도 기준(15분) 초과'
      }`,
      isQuotaExhausted
    };
  }

  if (status === 'CACHED') {
    return {
      status: 'CACHED',
      label: 'CACHED',
      badgeClass: 'bg-amber-100 text-amber-900 border border-amber-300 font-bold',
      timeText: formattedTime,
      subNotice: '캐시 보관',
      tooltip: `캐시 보관 배당${formattedTime ? ` (수집: ${formattedTime})` : ''} · 쿼터 소진 대비 안전 캐시 재사용`,
      isQuotaExhausted
    };
  }

  return {
    status: 'LIVE',
    label: 'LIVE',
    badgeClass: 'bg-emerald-600 text-white font-bold',
    timeText: formattedTime,
    tooltip: `실시간 배당${formattedTime ? ` (조회: ${formattedTime})` : ''} · The Odds API 실시간 동기화`,
    isQuotaExhausted: false
  };
}

/**
 * Resolves the settlement hit outcome for a match row, cleanly separating
 * baseball Win-1-Loss and basketball Win-5-Loss from generic soccer isDrawHit.
 */
export function getMatchHitStatus(
  m: MatchItem,
  generalMatchMap?: Map<string, MatchItem>,
  allMatches?: MatchItem[]
): MarketHitStatus {
  const defaultStatus: MarketHitStatus = {
    isWinHit: false,
    isDrawHit: false,
    isLoseHit: false,
    baseballOutcome: null,
    basketballOutcome: null,
    soccerOutcome: null,
    outcomeTag: '',
    activeOddsSlot: null,
    homeTeamWon: false,
    awayTeamWon: false
  };

  if (m.status !== '종료') {
    return defaultStatus;
  }

  const mType = identifyMarketType(m);
  const phys = getPhysicalScore(m, generalMatchMap, allMatches);
  const homeTeamWon = phys ? phys.home > phys.away : (m.hitOutcome === 'win');
  const awayTeamWon = phys ? phys.away > phys.home : (m.hitOutcome === 'lose');

  // 1. SUM Market (일반 홀짝) - STRICT: NEVER route to UO or 1X2!
  if (mType === 'SUM') {
    if (m.rawResultTag === '홀' || m.rawResultTag === '짝') {
      const isOdd = m.rawResultTag === '홀';
      return {
        ...defaultStatus,
        outcomeTag: isOdd ? '홀' : '짝',
        activeOddsSlot: isOdd ? 'win' : 'lose',
        homeTeamWon,
        awayTeamWon
      };
    }
    if (phys) {
      const total = phys.home + phys.away;
      const isOdd = total % 2 !== 0;
      return {
        ...defaultStatus,
        outcomeTag: isOdd ? '홀' : '짝',
        activeOddsSlot: isOdd ? 'win' : 'lose',
        homeTeamWon,
        awayTeamWon
      };
    }
    // If neither official 홀/짝 tag nor physical scores are confirmed, return empty (미제공)
    // NEVER fall back to '언더' or 'win'!
    return defaultStatus;
  }

  // 2. Baseball Win-1-Loss (승1패)
  if (mType === 'W1L') {
    if (phys) {
      const res = resolveBaseballWin1LossOutcome(phys.home, phys.away);
      return {
        ...defaultStatus,
        isDrawHit: false,
        baseballOutcome: res.outcome,
        outcomeTag: res.display,
        activeOddsSlot: res.activeOddsSlot,
        homeTeamWon,
        awayTeamWon
      };
    }
    if (m.rawResultTag === '1' || m.rawResultTag === '승1패' || m.hitOutcome === 'draw') {
      return { ...defaultStatus, isDrawHit: false, baseballOutcome: 'ONE_RUN_OR_TIE', outcomeTag: '1', activeOddsSlot: 'middle', homeTeamWon, awayTeamWon };
    } else if (m.hitOutcome === 'win' || m.rawResultTag === '승') {
      return { ...defaultStatus, isDrawHit: false, baseballOutcome: 'HOME_WIN_2PLUS', outcomeTag: '승', activeOddsSlot: 'win', homeTeamWon: true, awayTeamWon: false };
    } else if (m.hitOutcome === 'lose' || m.rawResultTag === '패') {
      return { ...defaultStatus, isDrawHit: false, baseballOutcome: 'HOME_LOSS_2PLUS', outcomeTag: '패', activeOddsSlot: 'lose', homeTeamWon: false, awayTeamWon: true };
    }
    return defaultStatus;
  }

  // 3. Basketball Win-5-Loss (승5패)
  if (mType === 'W5L') {
    if (phys) {
      const res = resolveBasketballWin5LossOutcome(phys.home, phys.away);
      return {
        ...defaultStatus,
        isDrawHit: false,
        basketballOutcome: res.outcome,
        outcomeTag: res.display,
        activeOddsSlot: res.activeOddsSlot,
        homeTeamWon,
        awayTeamWon
      };
    }
    if (m.rawResultTag === '5' || m.rawResultTag === '승5패' || m.hitOutcome === 'draw') {
      return { ...defaultStatus, isDrawHit: false, basketballOutcome: 'WITHIN_5', outcomeTag: '5', activeOddsSlot: 'middle', homeTeamWon, awayTeamWon };
    } else if (m.hitOutcome === 'win' || m.rawResultTag === '승') {
      return { ...defaultStatus, isDrawHit: false, basketballOutcome: 'HOME_WIN_6PLUS', outcomeTag: '승', activeOddsSlot: 'win', homeTeamWon: true, awayTeamWon: false };
    } else if (m.hitOutcome === 'lose' || m.rawResultTag === '패') {
      return { ...defaultStatus, isDrawHit: false, basketballOutcome: 'HOME_LOSS_6PLUS', outcomeTag: '패', activeOddsSlot: 'lose', homeTeamWon: false, awayTeamWon: true };
    }
    return defaultStatus;
  }

  // 4. Handicap (핸디캡)
  if (mType === 'HANDICAP') {
    if (m.rawResultTag && ['핸디승', '핸무', '핸디패', '적특'].includes(m.rawResultTag)) {
      const isWin = m.rawResultTag === '핸디승';
      const isDraw = m.rawResultTag === '핸무';
      const isVoid = m.rawResultTag === '적특';
      return {
        ...defaultStatus,
        isWinHit: isWin,
        isDrawHit: isDraw || isVoid,
        isLoseHit: !isWin && !isDraw && !isVoid,
        outcomeTag: m.rawResultTag,
        activeOddsSlot: isWin ? 'win' : ((isDraw || isVoid) ? 'middle' : 'lose'),
        homeTeamWon,
        awayTeamWon
      };
    }
    if (phys) {
      const hLine = m.handicapLine ?? m.handicapOrLine ?? 0;
      const margin = phys.home - phys.away + hLine;
      const hasDraw = typeof m.domestic?.draw === 'number' && m.domestic.draw > 0;
      if (margin > 0) {
        return { ...defaultStatus, isWinHit: true, outcomeTag: '핸디승', activeOddsSlot: 'win', homeTeamWon, awayTeamWon };
      } else if (margin === 0) {
        return { ...defaultStatus, isDrawHit: true, outcomeTag: hasDraw ? '핸무' : '적특', activeOddsSlot: 'middle', homeTeamWon, awayTeamWon };
      } else {
        return { ...defaultStatus, isLoseHit: true, outcomeTag: '핸디패', activeOddsSlot: 'lose', homeTeamWon, awayTeamWon };
      }
    }
    const isWin = m.hitOutcome === 'win';
    const isDraw = m.hitOutcome === 'draw';
    const isLose = m.hitOutcome === 'lose';
    const isVoid = m.hitOutcome === 'push' || m.hitOutcome === 'void';
    return {
      ...defaultStatus,
      isWinHit: isWin,
      isDrawHit: isDraw || isVoid,
      isLoseHit: isLose,
      outcomeTag: isWin ? '핸디승' : (isDraw ? '핸무' : (isLose ? '핸디패' : (isVoid ? '적특' : ''))),
      activeOddsSlot: isWin ? 'win' : ((isDraw || isVoid) ? 'middle' : (isLose ? 'lose' : null)),
      homeTeamWon,
      awayTeamWon
    };
  }

  // 5. Under/Over (언더오버)
  if (mType === 'UNDER_OVER') {
    if (m.rawResultTag && ['언더', '오버', '적특'].includes(m.rawResultTag)) {
      const isWin = m.rawResultTag === '언더';
      const isVoid = m.rawResultTag === '적특';
      return {
        ...defaultStatus,
        isWinHit: isWin,
        isDrawHit: isVoid,
        isLoseHit: m.rawResultTag === '오버',
        outcomeTag: m.rawResultTag,
        activeOddsSlot: isWin ? 'win' : (isVoid ? 'middle' : 'lose'),
        homeTeamWon,
        awayTeamWon
      };
    }
    if (phys) {
      const uLine = m.uoLine ?? m.handicapOrLine ?? 0;
      const total = phys.home + phys.away;
      if (total < uLine) {
        return { ...defaultStatus, isWinHit: true, outcomeTag: '언더', activeOddsSlot: 'win', homeTeamWon, awayTeamWon };
      } else if (total > uLine) {
        return { ...defaultStatus, isLoseHit: true, outcomeTag: '오버', activeOddsSlot: 'lose', homeTeamWon, awayTeamWon };
      } else {
        return { ...defaultStatus, isDrawHit: true, outcomeTag: '적특', activeOddsSlot: 'middle', homeTeamWon, awayTeamWon };
      }
    }
    const isWin = m.hitOutcome === 'win';
    const isLose = m.hitOutcome === 'lose';
    const isVoid = m.hitOutcome === 'push' || m.hitOutcome === 'void';
    return {
      ...defaultStatus,
      isWinHit: isWin,
      isDrawHit: isVoid,
      isLoseHit: isLose,
      outcomeTag: isWin ? '언더' : (isLose ? '오버' : (isVoid ? '적특' : '')),
      activeOddsSlot: isWin ? 'win' : (isVoid ? 'middle' : (isLose ? 'lose' : null)),
      homeTeamWon,
      awayTeamWon
    };
  }

  // 6. Soccer / General 1X2 Market
  if (mType === '1X2') {
    if (phys) {
      const res = resolveSoccer1X2Outcome(phys.home, phys.away);
      return {
        ...defaultStatus,
        isWinHit: res.activeOddsSlot === 'win',
        isDrawHit: res.isDrawHit,
        isLoseHit: res.activeOddsSlot === 'lose',
        soccerOutcome: res.outcome,
        outcomeTag: res.display === '승' ? '홈승' : (res.display === '패' ? '원정승' : '무승부'),
        activeOddsSlot: res.activeOddsSlot,
        homeTeamWon,
        awayTeamWon
      };
    }
    const isWin = m.hitOutcome === 'win';
    const isDraw = m.hitOutcome === 'draw';
    const isLose = m.hitOutcome === 'lose';
    return {
      ...defaultStatus,
      isWinHit: isWin,
      isDrawHit: isDraw,
      isLoseHit: isLose,
      outcomeTag: isWin ? '홈승' : (isDraw ? '무승부' : (isLose ? '원정승' : '')),
      activeOddsSlot: isWin ? 'win' : (isDraw ? 'middle' : (isLose ? 'lose' : null)),
      homeTeamWon,
      awayTeamWon
    };
  }

  // 7. Baseball / Basketball 2-Way Moneyline
  const isWin = m.hitOutcome === 'win' || (phys && phys.home > phys.away);
  const isLose = m.hitOutcome === 'lose' || (phys && phys.home < phys.away);
  return {
    ...defaultStatus,
    isWinHit: Boolean(isWin),
    isDrawHit: false,
    isLoseHit: Boolean(isLose),
    outcomeTag: isWin ? '홈승' : (isLose ? '원정승' : ''),
    activeOddsSlot: isWin ? 'win' : (isLose ? 'lose' : null),
    homeTeamWon,
    awayTeamWon
  };
}

/**
 * Formats the Korean Outcome Tag (e.g. 핸디승, 핸무, 핸디패, 언더, 오버, 적특, 승, 무, 패, 1, 5)
 */
function getDisplayOutcomeTag(
  m: MatchItem,
  generalMatchMap?: Map<string, MatchItem>,
  allMatches?: MatchItem[]
): string {
  return getMatchHitStatus(m, generalMatchMap, allMatches).outcomeTag;
}

/**
 * Generates AdSense-compliant Card Model Rationale (3 lines) and Prediction Target
 */
function getMatchCardQuantSummary(m: MatchItem) {
  const mType = identifyMarketType(m);
  const isBaseball = m.sport === 'baseball';
  const sport = m.sport || 'soccer';
  const marketBase = sport === 'soccer' ? 2.65 : sport === 'baseball' ? 8.8 : sport === 'basketball' ? 162.0 : 182.0;

  const domWin = typeof m.domestic?.win === 'number' ? m.domestic.win : (typeof m.matchOdds?.win === 'number' ? m.matchOdds.win : 1.85);
  const domDraw = typeof m.domestic?.draw === 'number' ? m.domestic.draw : (typeof m.matchOdds?.draw === 'number' ? m.matchOdds.draw : null);
  const domLose = typeof m.domestic?.lose === 'number' ? m.domestic.lose : (typeof m.matchOdds?.lose === 'number' ? m.matchOdds.lose : 1.85);

  // Independent Bookmaker No-Vig Calculation
  let noVigHome = 50.0;
  let noVigDraw = 0.0;
  let noVigAway = 50.0;
  if (domWin > 0 && domLose > 0) {
    const invW = 1 / domWin;
    const invL = 1 / domLose;
    if (domDraw && domDraw > 0) {
      const invD = 1 / domDraw;
      const sum = invW + invD + invL;
      noVigHome = +((invW / sum) * 100).toFixed(1);
      noVigDraw = +((invD / sum) * 100).toFixed(1);
      noVigAway = +((invL / sum) * 100).toFixed(1);
    } else {
      const sum = invW + invL;
      noVigHome = +((invW / sum) * 100).toFixed(1);
      noVigAway = +((invL / sum) * 100).toFixed(1);
    }
  }

  // Run pure mathematical quant model (< 1ms) with real match properties
  const quantRes = computeQuantModel({
    league: m.league,
    sport,
    type: '1X2',
    domesticOdds: { win: domWin, draw: domDraw, lose: domLose },
    foreignOdds: m.foreign ? { win: m.foreign.win, draw: m.foreign.draw, lose: m.foreign.lose } : undefined,
    homeStats: (m as any).homeStats,
    awayStats: (m as any).awayStats,
    isBaseball,
    marketBase
  });

  const hProb = quantRes?.homeProb ?? (isBaseball ? 52.0 : 45.0);
  const aProb = quantRes?.awayProb ?? (isBaseball ? 48.0 : 30.0);
  const dProb = quantRes?.drawProb ?? (isBaseball ? 0 : 25.0);
  const expHome = quantRes?.expectedScore?.home ?? (sport === 'soccer' ? 1.45 : sport === 'baseball' ? 4.2 : 88.0);
  const expAway = quantRes?.expectedScore?.away ?? (sport === 'soccer' ? 1.10 : sport === 'baseball' ? 3.8 : 82.0);

  // 1. SUM Market: No prediction available (Independent random parity)
  if (mType === 'SUM') {
    return {
      homeProb: 50.0,
      drawProb: 0,
      awayProb: 50.0,
      modelChoice: '미제공 (홀짝)',
      modelOdds: domWin,
      targetProb: 50.0,
      evVal: 0,
      noVigProb: 50.0,
      predictionTarget: '미제공 (UNAVAILABLE)',
      accuracyText: '홀짝(SUM) 마켓 퀀트 모델 미제공',
      line1: '분석 근거 ① SUM 마켓은 독립 점수 패리티(홀짝) 기반으로 퀀트 모델 미제공',
      line2: '분석 근거 ② 타 마켓 라벨 변환 원천 차단 (UNAVAILABLE 처리)',
      line3: '분석 근거 ③ 베트맨 공식 배당 및 정산 결과만 표시'
    };
  }

  // 2. Under/Over Market: Explicit Under / Over prediction based on model expected total
  if (mType === 'UNDER_OVER') {
    const uoLine = m.uoLine ?? m.handicapOrLine ?? (sport === 'soccer' ? 2.5 : sport === 'baseball' ? 8.5 : 165.5);
    const expTotal = expHome + expAway;
    const isUnder = expTotal < uoLine;
    const modelChoice = isUnder ? '언더' : '오버';
    const modelOdds = isUnder ? domWin : domLose;
    const targetModelProb = isUnder ? noVigHome : noVigAway;
    const evVal = +(((targetModelProb / 100) * modelOdds - 1) * 100).toFixed(1);
    return {
      homeProb: +(noVigHome).toFixed(1),
      drawProb: 0,
      awayProb: +(noVigAway).toFixed(1),
      modelChoice,
      modelOdds,
      targetProb: targetModelProb,
      evVal,
      noVigProb: targetModelProb,
      predictionTarget: `${modelChoice} (${uoLine}) 기대값 ${modelOdds.toFixed(2)}`,
      accuracyText: `공정 승률 ${targetModelProb}% (${evVal >= 0 ? `+${evVal}% EV` : `${evVal}% EV`})`,
      line1: `분석 근거 ① 수리 퀀트 기대 총득점 ${expTotal.toFixed(1)}점 vs 기준점 ${uoLine}점`,
      line2: `분석 근거 ② ${isUnder ? `기대득점 미달로 저득점 언더 우세` : `기대득점 초과로 다득점 오버 우세`}`,
      line3: `분석 근거 ③ No-Vig 마진 제거 기반 언더/오버 포지션 산출`
    };
  }

  // 3. Handicap Market: Margin-adjusted model prediction
  if (mType === 'HANDICAP') {
    const hLine = m.handicapLine ?? m.handicapOrLine ?? 0;
    const hLineStr = hLine > 0 ? `+${hLine}` : `${hLine}`;
    const margin = expHome - expAway + hLine;
    const modelChoice = margin >= 0 ? `홈승 (${hLineStr})` : `원정승`;
    const modelOdds = margin >= 0 ? domWin : domLose;
    const targetModelProb = margin >= 0 ? hProb : aProb;
    const evVal = +(((targetModelProb / 100) * modelOdds - 1) * 100).toFixed(1);
    return {
      homeProb: hProb,
      drawProb: dProb,
      awayProb: aProb,
      modelChoice,
      modelOdds,
      targetProb: targetModelProb,
      evVal,
      noVigProb: margin >= 0 ? noVigHome : noVigAway,
      predictionTarget: `${modelChoice} 기대값 ${modelOdds.toFixed(2)}`,
      accuracyText: `공정 승률 ${targetModelProb}% (${evVal >= 0 ? `+${evVal}% EV` : `${evVal}% EV`})`,
      line1: `분석 근거 ① 핸디캡 기준점(${hLineStr}) 보정 기대 마진 ${margin.toFixed(1)}점`,
      line2: `분석 근거 ② 가우시안/스켈람 점수차 결합 분포 모델`,
      line3: `분석 근거 ③ No-Vig 마진 제거 기반 핸디캡 포지션 산출`
    };
  }

  // 4. Baseball Win-1-Loss Market: 3-Way prediction
  if (mType === 'W1L') {
    const diff = expHome - expAway;
    let modelChoice = '승';
    let modelOdds = domWin;
    let targetModelProb = hProb;
    let targetNoVigProb = noVigHome;
    if (Math.abs(diff) <= 1.0 && domDraw && domDraw > 0) {
      modelChoice = '1';
      modelOdds = domDraw;
      targetModelProb = dProb;
      targetNoVigProb = noVigDraw;
    } else if (diff < -1.0) {
      modelChoice = '패';
      modelOdds = domLose;
      targetModelProb = aProb;
      targetNoVigProb = noVigAway;
    }
    const evVal = +(((targetModelProb / 100) * modelOdds - 1) * 100).toFixed(1);
    return {
      homeProb: hProb,
      drawProb: dProb,
      awayProb: aProb,
      modelChoice,
      modelOdds,
      targetProb: targetModelProb,
      evVal,
      noVigProb: targetNoVigProb,
      predictionTarget: `야구 승1패 [${modelChoice}] 기대값 ${modelOdds.toFixed(2)}`,
      accuracyText: `공정 승률 ${targetModelProb}% (${evVal >= 0 ? `+${evVal}% EV` : `${evVal}% EV`})`,
      line1: `분석 근거 ① 야구 득실차 스켈람 분포 (기대 마진 ${diff.toFixed(1)}점)`,
      line2: `분석 근거 ② 1점차 접전 구간(${dProb}%) 및 2점차 이상 분리 모델`,
      line3: `분석 근거 ③ 프로토 승1패 시장 전용 3-way 퀀트 산출`
    };
  }

  // 5. Basketball Win-5-Loss Market: 3-Way prediction
  if (mType === 'W5L') {
    const diff = expHome - expAway;
    let modelChoice = '승';
    let modelOdds = domWin;
    let targetModelProb = hProb;
    let targetNoVigProb = noVigHome;
    if (Math.abs(diff) <= 5.0 && domDraw && domDraw > 0) {
      modelChoice = '5';
      modelOdds = domDraw;
      targetModelProb = dProb;
      targetNoVigProb = noVigDraw;
    } else if (diff < -5.0) {
      modelChoice = '패';
      modelOdds = domLose;
      targetModelProb = aProb;
      targetNoVigProb = noVigAway;
    }
    const evVal = +(((targetModelProb / 100) * modelOdds - 1) * 100).toFixed(1);
    return {
      homeProb: hProb,
      drawProb: dProb,
      awayProb: aProb,
      modelChoice,
      modelOdds,
      targetProb: targetModelProb,
      evVal,
      noVigProb: targetNoVigProb,
      predictionTarget: `농구 승5패 [${modelChoice}] 기대값 ${modelOdds.toFixed(2)}`,
      accuracyText: `공정 승률 ${targetModelProb}% (${evVal >= 0 ? `+${evVal}% EV` : `${evVal}% EV`})`,
      line1: `분석 근거 ① 농구 득실차 가우시안 페이스 모델 (기대 마진 ${diff.toFixed(1)}점)`,
      line2: `분석 근거 ② 5점차 이내 접전 구간(${dProb}%) 및 6점차 이상 분리 모델`,
      line3: `분석 근거 ③ 프로토 승5패 시장 전용 3-way 퀀트 산출`
    };
  }

  // 6. Soccer 1X2 & 2-Way Moneyline
  let modelChoice = '홈승';
  let modelOdds = domWin;
  let targetModelProb = hProb;
  let targetNoVigProb = noVigHome;

  if (hProb >= aProb && (domDraw === null || hProb >= dProb)) {
    modelChoice = '홈승';
    modelOdds = domWin;
    targetModelProb = hProb;
    targetNoVigProb = noVigHome;
  } else if (aProb > hProb && (domDraw === null || aProb >= dProb)) {
    modelChoice = '원정승';
    modelOdds = domLose;
    targetModelProb = aProb;
    targetNoVigProb = noVigAway;
  } else if (domDraw && dProb > hProb && dProb > aProb) {
    modelChoice = '무승부';
    modelOdds = domDraw;
    targetModelProb = dProb;
    targetNoVigProb = noVigDraw;
  }

  const evVal = +(((targetModelProb / 100) * modelOdds - 1) * 100).toFixed(1);
  const accuracyText = `공정 승률 ${targetModelProb}% (${evVal >= 0 ? `+${evVal}% EV` : `${evVal}% EV`})`;

  return {
    homeProb: hProb,
    drawProb: dProb,
    awayProb: aProb,
    modelChoice,
    modelOdds,
    targetProb: targetModelProb,
    evVal,
    noVigProb: targetNoVigProb,
    predictionTarget: `${modelChoice} 기대값 ${modelOdds.toFixed(2)}`,
    accuracyText,
    line1: `분석 근거 ① 수리 퀀트 기대 득점 (홈 ${expHome}점 vs 원정 ${expAway}점)`,
    line2: sport === 'soccer' 
      ? `분석 근거 ② Dixon-Coles 공정 확률 (홈 ${hProb}% / 무 ${dProb}% / 원정 ${aProb}%)`
      : (isBaseball ? `분석 근거 ② 스켈람(Skellam) 점수차 공정 확률 (홈 ${hProb}% vs 원정 ${aProb}%)` : `분석 근거 ② 가우시안 핸디캡 페이스 수리 분포 (기대 마진 ${(expHome - expAway).toFixed(1)}점)`),
    line3: `분석 근거 ③ 비례 역수 공정 확률 (Proportional Inverse Normalization) 마진 제거 기반 포지션 산출`
  };
}

interface MatchTableProps {
  matches: MatchItem[];
  selectedYear: number;
  selectedRound: number;
  protoRoundLimits: Record<number, number>;
  selectedMatch?: MatchItem | null;
  roundMetadata?: {
    roundPeriod?: string;
    totalGames?: number;
    status?: string;
    domesticRefundRate?: string;
    foreignRefundRate?: string;
    fetchedAt?: string;
    isVerifiedForeignPreview?: boolean;
    verifiedPreviewRound?: number | null;
    foreignSourceOrigin?: string | null;
  };
  isLoading?: boolean;
  isVerifiedPreviewMode?: boolean;
  onToggleVerifiedPreviewMode?: () => void;
  onActivateVerifiedPreview?: (targetRound?: number) => void;
  onYearChange: (y: number) => void;
  onRoundChange: (r: number) => void;
  onRefresh?: (force?: boolean) => void;
  onSelectMatchForQuant: (match: MatchItem, initialTab?: 'overview' | 'sharp_edge' | 'quant_deep' | 'h2h' | 'quant' | 'ai' | string) => void;
}

export function MatchTable({
  matches,
  selectedYear,
  selectedRound,
  protoRoundLimits,
  selectedMatch,
  roundMetadata,
  isLoading,
  isVerifiedPreviewMode,
  onToggleVerifiedPreviewMode,
  onActivateVerifiedPreview,
  onYearChange,
  onRoundChange,
  onRefresh,
  onSelectMatchForQuant
}: MatchTableProps) {
  const [sportFilter, setSportFilter] = useState<SportCategory>('all');
  const [leagueFilter, setLeagueFilter] = useState<string>('all');
  const [onlyForeignOdds, setOnlyForeignOdds] = useState<boolean>(false);

  useEffect(() => {
    setOnlyForeignOdds(false);
  }, [selectedYear, selectedRound]);

  const maxRoundsForYear = protoRoundLimits[selectedYear] || (selectedYear === 2026 ? 155 : 150);

  // Total matches with real foreign odds in this round
  const totalForeignMatchedCount = useMemo(() => {
    let count = 0;
    for (const m of matches) {
      if (m.oddsSource?.foreign === 'real' && m.foreign) count++;
    }
    return count;
  }, [matches]);

  // [1] Dynamic groupBy(sport) - Runtime dynamic counting
  const sportCounts = useMemo(() => {
    const counts = { all: matches.length, soccer: 0, baseball: 0, basketball: 0, volleyball: 0 };
    for (const m of matches) {
      if (m.sport === 'soccer') counts.soccer++;
      else if (m.sport === 'baseball') counts.baseball++;
      else if (m.sport === 'basketball') counts.basketball++;
      else if (m.sport === 'volleyball') counts.volleyball++;
    }
    return counts;
  }, [matches]);

  // [1] Dynamic groupBy(league) - Runtime dynamic counting
  const leagueCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of matches) {
      if (sportFilter !== 'all' && m.sport !== sportFilter) continue;
      const l = (m.league || '기타').trim();
      map.set(l, (map.get(l) || 0) + 1);
    }
    return map;
  }, [matches, sportFilter]);

  const availableLeagues = useMemo(() => {
    return Array.from(leagueCounts.entries()).sort((a, b) => b[1] - a[1]);
  }, [leagueCounts]);

  // Filter matches by sport, league, and foreign odds while preserving original match sequence
  const filteredMatches = useMemo(() => {
    return matches.filter(m => {
      if (onlyForeignOdds && (!m.foreign || m.oddsSource?.foreign !== 'real')) return false;
      if (sportFilter !== 'all' && m.sport !== sportFilter) return false;
      if (leagueFilter !== 'all' && (m.league || '기타').trim() !== leagueFilter) return false;
      return true;
    });
  }, [matches, sportFilter, leagueFilter, onlyForeignOdds]);

  // realGameCount: Dynamically determined at runtime
  const realGameCount = filteredMatches.length;

  // Real Foreign Odds & Pinnacle Match Counts & Actual Calculated Payout
  const { 
    foreignMatchedCount, 
    pinnacleMatchedCount, 
    actualPinnacleAvgRefundRate, 
    cachedForeignCount, 
    liveForeignCount, 
    staleForeignCount,
    verifiedOkCount,
    verifiedNotProvidedCount,
    verifiedParseErrorCount,
    verifiedMatchErrorCount,
    isVerifiedForeignPreviewActive
  } = useMemo(() => {
    let foreignCount = 0;
    let pinCount = 0;
    let cachedCount = 0;
    let liveCount = 0;
    let staleCount = 0;
    let totalPayout = 0;
    let payoutCount = 0;
    let vOk = 0;
    let vNotProvided = 0;
    let vParseError = 0;
    let vMatchError = 0;
    let vTotal = 0;

    for (const m of filteredMatches) {
      if (m.verifiedForeignPreview) {
        vTotal++;
        if (m.verifiedForeignPreview.status === 'OK') vOk++;
        else if (m.verifiedForeignPreview.status === 'NOT_PROVIDED') vNotProvided++;
        else if (m.verifiedForeignPreview.status === 'PARSE_ERROR') vParseError++;
        else if (m.verifiedForeignPreview.status === 'MATCH_ERROR') vMatchError++;
      }

      if (m.oddsSource?.foreign === 'real' && m.foreign) {
        foreignCount++;
        const freshness = getForeignFreshness(m);
        if (freshness.status === 'CACHED') {
          cachedCount++;
        } else if (freshness.status === 'LIVE') {
          liveCount++;
        } else if (freshness.status === 'STALE') {
          staleCount++;
        }

        const isPin = m.foreignBookmaker?.toLowerCase() === 'pinnacle' || (m.foreignSourceName && m.foreignSourceName.includes('Pinnacle'));
        if (isPin) pinCount++;

        const fw = m.foreign.win;
        const fd = m.foreign.draw;
        const fl = m.foreign.lose;
        const slotLabels = getMarketSlotLabels(m);

        if (slotLabels.isTwoWay) {
          // 2-way market: requires valid win and lose odds
          if (typeof fw === 'number' && fw > 0 && typeof fl === 'number' && fl > 0) {
            const invSum = (1 / fw) + (1 / fl);
            if (invSum > 0) {
              totalPayout += (1 / invSum) * 100;
              payoutCount++;
            }
          }
        } else {
          // 3-way market: requires valid win, draw, and lose odds all present
          if (typeof fw === 'number' && fw > 0 && typeof fd === 'number' && fd > 0 && typeof fl === 'number' && fl > 0) {
            const invSum = (1 / fw) + (1 / fd) + (1 / fl);
            if (invSum > 0) {
              totalPayout += (1 / invSum) * 100;
              payoutCount++;
            }
          }
        }
      }
    }

    const avgPayout = payoutCount > 0 ? `${(totalPayout / payoutCount).toFixed(2)}%` : null;
    return { 
      foreignMatchedCount: foreignCount, 
      pinnacleMatchedCount: pinCount, 
      actualPinnacleAvgRefundRate: avgPayout,
      cachedForeignCount: cachedCount,
      liveForeignCount: liveCount,
      staleForeignCount: staleCount,
      verifiedOkCount: vOk,
      verifiedNotProvidedCount: vNotProvided,
      verifiedParseErrorCount: vParseError,
      verifiedMatchErrorCount: vMatchError,
      isVerifiedForeignPreviewActive: vTotal > 0
    };
  }, [filteredMatches]);

  // Precompute group general match lookup and first-in-group flags in O(N)
  const { generalMatchMap, groupHasGeneralSet } = useMemo(() => {
    const gMap = new Map<string, MatchItem>();
    const hasGSet = new Set<string>();

    for (const m of matches) {
      if (m.categoryLabel === '일반') {
        const key = `${m.homeTeam}_${m.awayTeam}_${m.date}`;
        gMap.set(key, m);
        hasGSet.add(key);
      }
    }
    return { generalMatchMap: gMap, groupHasGeneralSet: hasGSet };
  }, [matches]);

  // Zero-Jitter Desktop Virtualizer (ROW_HEIGHT = 52)
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: realGameCount,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT_PC,
    overscan: 16,
  });

  // Zero-Jitter Mobile Virtualizer (< 768px, ROW_HEIGHT = 168)
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const cardVirtualizer = useVirtualizer({
    count: realGameCount,
    getScrollElement: () => cardContainerRef.current,
    estimateSize: () => ROW_HEIGHT_MOBILE,
    overscan: 12,
  });

  // Ensure viewport starts at the top on round change
  useEffect(() => {
    if (isLoading || filteredMatches.length === 0) return;
    rowVirtualizer.scrollToIndex(0, { align: 'start' });
    cardVirtualizer.scrollToIndex(0, { align: 'start' });
  }, [selectedYear, selectedRound, isLoading, filteredMatches.length]);

  const sortedYears = Object.keys(protoRoundLimits).map(Number).sort((a, b) => a - b);
  const currentYearIdx = sortedYears.indexOf(selectedYear);

  const canGoPrev = selectedRound > 1 || currentYearIdx > 0;
  const canGoNext = selectedRound < maxRoundsForYear || selectedYear === 2026 || (currentYearIdx < sortedYears.length - 1);

  const handlePrevRound = () => {
    if (selectedRound > 1) {
      onRoundChange(selectedRound - 1);
    } else if (currentYearIdx > 0) {
      const prevYear = sortedYears[currentYearIdx - 1];
      const prevYearMaxRound = protoRoundLimits[prevYear] || 100;
      onYearChange(prevYear);
      onRoundChange(prevYearMaxRound);
    }
  };

  const handleNextRound = () => {
    if (selectedRound < maxRoundsForYear || selectedYear === 2026) {
      onRoundChange(selectedRound + 1);
    } else if (currentYearIdx < sortedYears.length - 1) {
      const nextYear = sortedYears[currentYearIdx + 1];
      onYearChange(nextYear);
      onRoundChange(1);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden font-sans">
      {/* ========================================================================= */}
      {/* Top Header Control Bar: Year / Round / Date / Refresh                     */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 text-white p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Round Selector Widget */}
          <div className="flex items-center bg-slate-800/90 rounded-xl border border-slate-700 overflow-hidden shadow-xs">
            {/* Prev Round Button */}
            <button
              onClick={handlePrevRound}
              disabled={!canGoPrev}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                canGoPrev 
                  ? 'bg-slate-700 hover:bg-blue-600 text-white cursor-pointer shadow-xs' 
                  : 'bg-slate-850 text-slate-500 cursor-not-allowed'
              }`}
              title="이전 회차"
            >
              <span>◀</span>
              <span className="hidden sm:inline">이전 회차</span>
            </button>

            {/* Year Select */}
            <div className="flex items-center gap-1 px-1.5 sm:px-2 border-l border-slate-700">
              <select 
                value={selectedYear} 
                onChange={e => {
                  const newYear = Number(e.target.value);
                  onYearChange(newYear);
                  const maxR = protoRoundLimits[newYear] || 100;
                  if (selectedRound > maxR) onRoundChange(maxR);
                }}
                className="bg-transparent border-0 text-xs font-bold text-slate-200 focus:outline-none cursor-pointer py-1"
              >
                {sortedYears.slice().reverse().map(y => (
                  <option key={y} value={y} className="bg-slate-800 text-white">
                    {y}년도 ({protoRoundLimits[y]}회차)
                  </option>
                ))}
              </select>
            </div>

            {/* Round Select */}
            <div className="flex items-center gap-1 px-1.5 sm:px-2 border-l border-slate-700">
              <select 
                value={selectedRound} 
                onChange={e => {
                  onRoundChange(Number(e.target.value));
                }}
                className="bg-transparent border-0 text-xs font-black text-amber-400 focus:outline-none cursor-pointer py-1"
              >
                {Array.from({ length: maxRoundsForYear }, (_, i) => maxRoundsForYear - i).map(r => (
                  <option key={r} value={r} className="bg-slate-800 text-white">
                    {r}회차
                  </option>
                ))}
              </select>
            </div>

            {/* Next Round Button */}
            <button
              onClick={handleNextRound}
              disabled={!canGoNext}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 border-l border-slate-700 ${
                canGoNext 
                  ? 'bg-slate-700 hover:bg-blue-600 text-white cursor-pointer shadow-xs' 
                  : 'bg-slate-850 text-slate-500 cursor-not-allowed'
              }`}
              title="다음 회차"
            >
              <span className="hidden sm:inline">다음 회차</span>
              <span>▶</span>
            </button>
          </div>

          {/* Calendar Date Picker Widget */}
          <div className="flex items-center gap-1 bg-slate-800/90 rounded-xl px-2.5 py-1 border border-slate-700 text-xs">
            <span className="text-amber-400 font-bold hidden sm:inline">📅 경기일:</span>
            <input 
              type="date"
              defaultValue={getTodayDateString()}
              onChange={e => {
                const val = e.target.value;
                if (!val) return;
                const d = new Date(val);
                if (!isNaN(d.getTime())) {
                  const resolved = resolveRoundByDate(d);
                  if (resolved.year !== selectedYear) onYearChange(resolved.year);
                  if (resolved.protoRound !== selectedRound) onRoundChange(resolved.protoRound);
                }
              }}
              className="bg-transparent text-slate-200 text-xs font-mono font-bold focus:outline-none cursor-pointer"
              title="경기 날짜를 선택하면 해당 일자의 프로토 회차로 즉시 자동 이동합니다"
            />
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => onRefresh?.(true)}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-800 text-emerald-300 hover:text-white border border-emerald-800/60 text-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title="클릭하여 프로토 승부식 경기목록 실시간 새로고침"
          >
            <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${isLoading ? 'animate-ping' : 'animate-pulse'}`}></span>
            <span>{isLoading ? '패치 중...' : '새로고침 🔄'}</span>
          </button>
        </div>

        {/* Dynamic Filters: groupBy(sport) & groupBy(league) */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 w-full md:w-auto">
          {/* League Dropdown Filter */}
          <div className="shrink-0 flex items-center bg-slate-800 rounded-full px-2.5 py-1 border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold mr-1">리그:</span>
            <select
              value={leagueFilter}
              onChange={e => setLeagueFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-800 text-white">
                전체 리그 ({availableLeagues.reduce((a, b) => a + b[1], 0)}경기)
              </option>
              {availableLeagues.map(([lName, count]) => (
                <option key={lName} value={lName} className="bg-slate-800 text-white">
                  {lName} ({count})
                </option>
              ))}
            </select>
          </div>

          {/* Instagram Story-Style Horizontal Scroll Filter Chips with Dynamic Counts */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button 
              onClick={() => { setSportFilter('all'); setLeagueFilter('all'); }} 
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                sportFilter === 'all' 
                  ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400/50' 
                  : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <span>전체</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                sportFilter === 'all' ? 'bg-blue-800 text-blue-100' : 'bg-slate-700 text-slate-300'
              }`}>
                {sportCounts.all}
              </span>
            </button>
            
            <button 
              onClick={() => { setSportFilter('soccer'); setLeagueFilter('all'); }} 
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                sportFilter === 'soccer' 
                  ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400/50' 
                  : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <span>⚽ 축구</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                sportFilter === 'soccer' ? 'bg-blue-800 text-blue-100' : 'bg-slate-700 text-slate-300'
              }`}>
                {sportCounts.soccer}
              </span>
            </button>

            <button 
              onClick={() => { setSportFilter('baseball'); setLeagueFilter('all'); }} 
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                sportFilter === 'baseball' 
                  ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400/50' 
                  : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <span>⚾ 야구</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                sportFilter === 'baseball' ? 'bg-blue-800 text-blue-100' : 'bg-slate-700 text-slate-300'
              }`}>
                {sportCounts.baseball}
              </span>
            </button>

            <button 
              onClick={() => { setSportFilter('basketball'); setLeagueFilter('all'); }} 
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                sportFilter === 'basketball' 
                  ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400/50' 
                  : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <span>🏀 농구</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                sportFilter === 'basketball' ? 'bg-blue-800 text-blue-100' : 'bg-slate-700 text-slate-300'
              }`}>
                {sportCounts.basketball}
              </span>
            </button>

            <button 
              onClick={() => { setSportFilter('volleyball'); setLeagueFilter('all'); }} 
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                sportFilter === 'volleyball' 
                  ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400/50' 
                  : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <span>🏐 배구</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                sportFilter === 'volleyball' ? 'bg-blue-800 text-blue-100' : 'bg-slate-700 text-slate-300'
              }`}>
                {sportCounts.volleyball}
              </span>
            </button>

            {totalForeignMatchedCount > 0 && (
              <button 
                type="button"
                onClick={() => setOnlyForeignOdds(!onlyForeignOdds)} 
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  onlyForeignOdds 
                    ? 'bg-amber-500 text-white shadow-md ring-2 ring-amber-300' 
                    : 'bg-amber-950/80 text-amber-300 border border-amber-700/60 hover:bg-amber-900'
                }`}
                title="해외 평균 배당이 제공되는 경기만 필터링합니다"
              >
                <span>🌐 해외배당 정상제공</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  onlyForeignOdds ? 'bg-amber-700 text-white' : 'bg-amber-900 text-amber-200'
                }`}>
                  {totalForeignMatchedCount}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Comparison Summary Bar & Provenance Banner */}
      <div className="bg-slate-50 px-4 py-2.5 border-b border-gray-200 space-y-2 text-xs">
        {/* Real Data vs Simulation Provenance Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2 flex-wrap">
            {matches.length > 0 && (matches[0].dataSource === 'real' || !matches[0].isSimulated) ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-black">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                <span>
                  🟢 REAL DATA: 와이즈토토(WiseToto) 실시간 국내·해외배당 연동 [{selectedYear}년 {selectedRound}회차]
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100 text-purple-900 border border-purple-300 text-xs font-black">
                <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                <span>🟣 SIMULATION DATA: 수리 퀀트 시뮬레이션 모델 (Deterministic Fallback)</span>
              </span>
            )}
            <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
              출처: 와이즈토토(WiseToto) 공시 배당 및 해외 북메이커 평균 (Bet365 · Unibet · WilliamHill · Bwin · Sbobet · Ladbrokes)
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-600 flex-wrap">
            <span className="font-bold">연동 현황:</span>
            <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              {matches.length > 0 && (matches[0].dataSource === 'real' || !matches[0].isSimulated)
                ? `국내 공식 ${realGameCount}경기 · 와이즈토토 해외 평균 배당 ${foreignMatchedCount}경기 매칭`
                : '수리모형 추정값 (시뮬레이션)'
              }
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="bg-blue-50/80 p-2.5 rounded-xl border border-blue-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-black text-blue-900 text-xs sm:text-sm">🇰🇷 국내 공식 기대값 ({matches[0]?.domesticSourceName ? 'BetMan' : 'Proto'})</span>
              <span className="bg-blue-200 text-blue-900 px-1.5 py-0.2 rounded text-[10px] font-bold">공식 발매 배당</span>
              <span className="text-[11px] text-blue-700 font-mono font-bold">
                [편성 {realGameCount}경기]
              </span>
            </div>
            <div className="text-right">
              <span className="text-gray-500">환급률 기준: </span>
              <strong className="text-blue-900 font-mono text-xs sm:text-sm">
                {roundMetadata?.domesticRefundRate || '87.90%'}
              </strong>
            </div>
          </div>

          <div className="bg-amber-50/80 p-2.5 rounded-xl border border-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-amber-900 text-xs sm:text-sm">🌐 해외 평균 배당</span>
              {foreignMatchedCount > 0 ? (
                <>
                  <span className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">
                    와이즈토토 해외배당 연동 [{foreignMatchedCount}경기]
                  </span>
                  <span className="bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
                    Bet365 · Unibet · WilliamHill · Bwin · Sbobet · Ladbrokes 평균
                  </span>
                </>
              ) : (
                <span className="bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded text-[10px] font-bold">
                  해당 회차 해외배당 미제공
                </span>
              )}
            </div>
            <div className="text-right">
              <span className="text-gray-500">
                {actualPinnacleAvgRefundRate ? '실측 환급률(Payout): ' : '환급률 기준: '}
              </span>
              <strong className="text-amber-900 font-mono text-xs sm:text-sm">
                {actualPinnacleAvgRefundRate 
                  ? `${actualPinnacleAvgRefundRate} (실측 ${foreignMatchedCount}경기)` 
                  : '미제공 (참고 기준값: 95.51%)'}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📱 MOBILE VIEW: Zero-Jitter Hardware Accelerated Card UI (< 768px)         */}
      {/* ========================================================================= */}
      <div 
        ref={cardContainerRef}
        className="block md:hidden w-full overflow-y-auto overflow-x-hidden max-h-[75vh] relative p-2 bg-slate-100 will-change-transform"
        style={{ willChange: 'transform', transform: 'translateZ(0)', overscrollBehavior: 'contain' }}
      >
        {isLoading ? (
          <div className="py-16 text-center text-gray-500 font-medium bg-white rounded-xl shadow-xs">
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span>{selectedYear}년도 {selectedRound}회차 경기 목록 패치 중...</span>
            </div>
          </div>
        ) : realGameCount === 0 ? (
          <div className="py-12 text-center text-gray-500 font-medium bg-white rounded-xl shadow-xs">
            해당 조건의 편성 경기가 없습니다.
          </div>
        ) : (
          <div 
            style={{ 
              height: `${cardVirtualizer.getTotalSize()}px`, 
              width: '100%', 
              position: 'relative',
              maxWidth: '100%',
              overflow: 'hidden'
            }}
          >
            {cardVirtualizer.getVirtualItems().map(virtualRow => {
              const m = filteredMatches[virtualRow.index];
              const idx = virtualRow.index;
              const isFinished = m.status === '종료';
              const hitStatus = getMatchHitStatus(m, generalMatchMap, filteredMatches);
              const { outcomeTag, activeOddsSlot, homeTeamWon, awayTeamWon } = hitStatus;
              const isSelected = selectedMatch && (selectedMatch.gameNo === m.gameNo && selectedMatch.categoryLabel === m.categoryLabel);
              const cardSummary = getMatchCardQuantSummary(m);
              const slotLabels = getMarketSlotLabels(m);
              const mType = identifyMarketType(m);
              const domSlots = formatOddsIntoThreeSlots(resolveMatchDomesticOdds(m), slotLabels.isTwoWay);
              const forSlots = formatOddsIntoThreeSlots(m.foreign, slotLabels.isTwoWay);
              const foreignStatusLabel = getForeignUnavailableReason(m);
              const foreignFreshness = getForeignFreshness(m);

              return (
                <div
                  key={`card_${m.gameNo}_${m.categoryLabel}_${idx}`}
                  data-index={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${ROW_HEIGHT_MOBILE - 10}px`,
                    transform: `translateY(${virtualRow.start}px) translateZ(0)`,
                    willChange: 'transform',
                  }}
                  onClick={() => onSelectMatchForQuant(m, 'overview')}
                  className={`bg-white rounded-2xl p-3 sm:p-3.5 border shadow-xs transition-all cursor-pointer flex flex-col justify-between overflow-hidden active:scale-[0.99] ${
                    isSelected ? 'border-blue-500 ring-2 ring-blue-400/50 bg-blue-50/20' : 'border-slate-200 active:bg-slate-50'
                  }`}
                >
                  {/* 1. Card Header: PROTO · Sport & League / Time & Status */}
                  <div className="flex items-center justify-between text-xs font-bold leading-tight">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="bg-slate-900 text-white font-mono font-black px-2 py-0.5 rounded-md text-[10px] shrink-0">
                        PROTO · {m.sport === 'soccer' ? '축구' : m.sport === 'baseball' ? '야구' : m.sport === 'basketball' ? '농구' : '배구'}
                      </span>
                      <span className="text-slate-700 font-extrabold truncate max-w-[120px]">
                        {m.league}
                      </span>
                      <span className="bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.2 rounded font-bold text-[10px] shrink-0 whitespace-nowrap">
                        {formatCategoryBadge(m)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px]">
                      <span className="font-bold text-slate-700">{m.time || m.date?.slice(5) || '20:00'}</span>
                      {isFinished && outcomeTag ? (
                        <span className={`px-1.5 py-0.5 rounded font-black border text-[10px] whitespace-nowrap ${
                          activeOddsSlot === 'middle' ? 'bg-amber-100 text-amber-900 border-amber-300' : (activeOddsSlot === 'win' ? 'bg-blue-100 text-blue-900 border-blue-300' : 'bg-red-100 text-red-900 border-red-300')
                        }`}>
                          {outcomeTag}
                        </span>
                      ) : (
                        <span className="text-gray-400 font-bold text-[10px]">-</span>
                      )}
                    </div>
                  </div>

                  {/* 2. Team Names & Scores */}
                  <div className="flex items-center justify-between gap-2 py-1">
                    <div className="text-right flex-1 truncate">
                      <span className={`text-base font-black truncate block ${homeTeamWon ? 'text-blue-700 font-extrabold' : 'text-slate-900'}`}>
                        {m.homeTeam || '홈팀'}
                      </span>
                    </div>
                    <div className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-800 font-mono text-xs font-black border border-slate-200 shrink-0">
                      {isFinished ? getDisplayScore(m, generalMatchMap, filteredMatches) : 'VS'}
                    </div>
                    <div className="text-left flex-1 truncate">
                      <span className={`text-base font-black truncate block ${awayTeamWon ? 'text-blue-700 font-extrabold' : 'text-slate-900'}`}>
                        {m.awayTeam || '원정팀'}
                      </span>
                    </div>
                  </div>

                  {/* 3. Model Probabilities: 승 % / 무 % / 패 % */}
                  <div className="grid grid-cols-3 gap-1 bg-slate-50 p-2 rounded-xl border border-slate-200 text-center">
                    <div className="space-y-0.5">
                      <div className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
                        {mType === 'UNDER_OVER' ? '언더 확률' : (mType === 'SUM' ? '홀 확률' : '승 확률')}
                      </div>
                      <div className="text-xs font-mono font-black text-slate-900">{cardSummary.homeProb}%</div>
                    </div>
                    <div className="space-y-0.5 border-x border-slate-200">
                      <div className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
                        {mType === 'W1L' ? '1점차' : (mType === 'W5L' ? '5점차' : (slotLabels.slot2 || '무승부'))}
                      </div>
                      <div className="text-xs font-mono font-black text-slate-700">{cardSummary.drawProb > 0 ? `${cardSummary.drawProb}%` : '-'}</div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
                        {mType === 'UNDER_OVER' ? '오버 확률' : (mType === 'SUM' ? '짝 확률' : '패 확률')}
                      </div>
                      <div className="text-xs font-mono font-black text-slate-900">{cardSummary.awayProb}%</div>
                    </div>
                  </div>

                  {/* 4. Model Pick & Key Metrics Row */}
                  <div className="grid grid-cols-4 gap-1 text-center bg-blue-50/80 p-2 rounded-xl border border-blue-100">
                    <div>
                      <div className="text-[9px] font-bold text-blue-900 whitespace-nowrap">Model Pick</div>
                      <div className="text-xs font-black text-blue-700 truncate">{cardSummary.modelChoice}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-slate-600 whitespace-nowrap">국내배당</div>
                      <div className="text-xs font-mono font-black text-slate-900">{cardSummary.modelOdds.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-slate-600 whitespace-nowrap">No-Vig</div>
                      <div className="text-xs font-mono font-black text-emerald-700">{cardSummary.noVigProb}%</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-slate-600 whitespace-nowrap">EV 기대값</div>
                      <div className={`text-xs font-mono font-black ${cardSummary.evVal >= 0 ? 'text-emerald-700' : 'text-slate-600'}`}>
                        {cardSummary.evVal >= 0 ? `+${cardSummary.evVal}%` : `${cardSummary.evVal}%`}
                      </div>
                    </div>
                  </div>

                  {/* 5. Domestic (BetMan) & Foreign (Pinnacle) Odds - 3칸 대칭 숫자 중심 표시 */}
                  <div className="space-y-1.5 pt-1.5 border-t border-slate-100">
                    {/* 국내 BetMan */}
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-blue-900 bg-blue-100 px-1.5 py-0.5 rounded font-sans text-[9px] shrink-0 w-18 text-center">국내 BetMan</span>
                        <div className="grid grid-cols-3 gap-1 text-center w-[135px]">
                          <span className={`py-0.5 rounded ${activeOddsSlot === 'win' ? 'bg-blue-600 text-white font-bold' : 'font-bold text-slate-800'}`}>
                            {domSlots.slot1.text}
                          </span>
                          <span className={`py-0.5 rounded ${
                            domSlots.slot2.isAlignmentDash
                              ? 'text-slate-400 font-bold'
                              : (activeOddsSlot === 'middle' ? 'bg-blue-600 text-white font-bold' : (domSlots.slot2.isMissing ? 'text-slate-400 font-bold' : 'font-bold text-slate-700'))
                          }`}>
                            {domSlots.slot2.text}
                          </span>
                          <span className={`py-0.5 rounded ${activeOddsSlot === 'lose' ? 'bg-blue-600 text-white font-bold' : 'font-bold text-slate-800'}`}>
                            {domSlots.slot3.text}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 해외 평균 배당 */}
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded font-sans text-[9px] shrink-0 w-18 text-center">
                          해외 평균 배당
                        </span>
                        {m.oddsSource?.foreign === 'real' && m.foreign ? (
                          <div className="grid grid-cols-3 gap-1 text-center w-[135px]">
                            <span className="font-black text-amber-950 py-0.5 rounded">
                              {forSlots.slot1.text === '-' ? '—' : forSlots.slot1.text}
                            </span>
                            <span className={`py-0.5 rounded ${
                              forSlots.slot2.isAlignmentDash
                                ? 'text-slate-400 font-bold'
                                : (forSlots.slot2.isMissing ? 'text-slate-400 font-bold' : 'font-bold text-slate-700')
                            }`}>
                              {forSlots.slot2.text === '-' ? '—' : forSlots.slot2.text}
                            </span>
                            <span className="font-black text-amber-950 py-0.5 rounded">
                              {forSlots.slot3.text === '-' ? '—' : forSlots.slot3.text}
                            </span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-1 text-center w-[135px] text-gray-400 font-bold">
                            <span className="py-0.5">—</span>
                            <span className="py-0.5">—</span>
                            <span className="py-0.5">—</span>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMatchForQuant(m, 'overview');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1 shrink-0 cursor-pointer shadow-xs active:scale-95 transition-all whitespace-nowrap ml-2"
                      >
                        <span>분석 →</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 🖥️ DESKTOP VIEW: Zero-Jitter High-Density Table (>= 768px, ROW_HEIGHT = 52) */}
      {/* ========================================================================= */}
      <div 
        ref={tableContainerRef}
        className="hidden md:block w-full overflow-auto max-h-[750px] relative scroll-smooth border-t border-gray-100 will-change-transform"
        style={{ willChange: 'transform', transform: 'translateZ(0)', overscrollBehavior: 'contain' }}
      >
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 z-20 bg-slate-100 shadow-xs select-none">
            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-gray-200">
              <th className="p-2.5 text-center w-12 bg-slate-100 whitespace-nowrap">번호</th>
              <th className="p-2.5 w-24 text-center bg-slate-100 whitespace-nowrap">일시</th>
              <th className="p-2.5 w-20 bg-slate-100 whitespace-nowrap">리그</th>
              <th className="p-2.5 w-18 text-center bg-slate-100 whitespace-nowrap">유형</th>
              <th className="p-2.5 text-center bg-slate-100 whitespace-nowrap">홈팀 vs 원정팀 (결과 스코어)</th>
              <th className="p-2.5 text-center w-44 bg-blue-50/90 text-blue-950 border-l border-blue-200 whitespace-nowrap">
                국내 배당 (BetMan)
              </th>
              <th className="p-2.5 text-center w-44 bg-amber-50/90 text-amber-950 border-l border-amber-200 whitespace-nowrap">
                해외 평균 배당
              </th>
              <th className="p-2.5 text-center w-16 bg-slate-100 whitespace-nowrap">상태</th>
              <th className="p-2.5 text-center w-24 bg-slate-100 whitespace-nowrap">상세 분석</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-gray-500 font-medium">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>{selectedYear}년도 {selectedRound}회차 경기 목록 패치 중...</span>
                  </div>
                </td>
              </tr>
            ) : realGameCount === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-gray-500 font-medium">
                  해당 조건의 편성 경기가 없습니다.
                </td>
              </tr>
            ) : (() => {
              const virtualRows = rowVirtualizer.getVirtualItems();
              const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start || 0 : 0;
              const paddingBottom = virtualRows.length > 0
                ? rowVirtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end || 0)
                : 0;

              return (
                <>
                  {paddingTop > 0 && (
                    <tr>
                      <td style={{ height: `${paddingTop}px` }} colSpan={9} />
                    </tr>
                  )}
                  {virtualRows.map(virtualRow => {
                    const m = filteredMatches[virtualRow.index];
                    const idx = virtualRow.index;
                    const isFinished = m.status === '종료';
                    const hitStatus = getMatchHitStatus(m, generalMatchMap, filteredMatches);
                    const { outcomeTag, activeOddsSlot, homeTeamWon, awayTeamWon } = hitStatus;
                    const isSelected = selectedMatch && (selectedMatch.gameNo === m.gameNo && selectedMatch.categoryLabel === m.categoryLabel);
                    const slotLabels = getMarketSlotLabels(m);
                    const mType = identifyMarketType(m);
                    const domSlots = formatOddsIntoThreeSlots(resolveMatchDomesticOdds(m), slotLabels.isTwoWay);
                    const forSlots = formatOddsIntoThreeSlots(m.foreign, slotLabels.isTwoWay);
                    const foreignStatusLabel = getForeignUnavailableReason(m);
                    const foreignFreshness = getForeignFreshness(m);

                    const isGeneralRow = m.categoryLabel === '일반';
                    const key = `${m.homeTeam}_${m.awayTeam}_${m.date}`;
                    const prev = idx > 0 ? filteredMatches[idx - 1] : null;
                    const isFirstInGroup = idx === 0 || (
                      prev?.homeTeam !== m.homeTeam ||
                      prev?.awayTeam !== m.awayTeam
                    );
                    const showAnalysisButton = isGeneralRow || (isFirstInGroup && !groupHasGeneralSet.has(key));

                    return (
                      <tr
                        key={`pc_row_${m.gameNo}_${m.categoryLabel}_${idx}`}
                        data-index={virtualRow.index}
                        onClick={() => onSelectMatchForQuant(m, 'overview')}
                        style={{ height: `${ROW_HEIGHT_PC}px` }}
                        className={`h-[52px] transition-colors cursor-pointer ${
                          isSelected 
                            ? 'bg-blue-50/80 font-semibold' 
                            : (idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/40 hover:bg-slate-100/70')
                        }`}
                      >
                        {/* 1. 번호 */}
                        <td className="p-2 text-center font-mono font-bold text-gray-700 whitespace-nowrap">
                          {m.gameNo}
                        </td>

                        {/* 2. 일시 */}
                        <td className="p-2 text-center font-mono text-[11px] text-gray-600 whitespace-nowrap">
                          {m.date}
                        </td>

                        {/* 3. 리그 */}
                        <td className="p-2 truncate font-medium text-gray-800 whitespace-nowrap" title={m.league}>
                          {m.sport === 'soccer' ? '⚽' : m.sport === 'baseball' ? '⚾' : m.sport === 'basketball' ? '🏀' : '🏐'} {m.league}
                        </td>

                        {/* 4. 유형 배지 */}
                        <td className="p-2 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-blue-100 text-blue-800 whitespace-nowrap inline-block">
                            {formatCategoryBadge(m)}
                          </span>
                        </td>

                        {/* 5. 홈팀 vs 원정팀 (결과 스코어) */}
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className={`text-right flex-1 truncate font-medium ${homeTeamWon ? 'text-blue-700 font-black' : 'text-gray-900'}`}>
                              {m.homeTeam}
                            </span>
                            <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-mono text-[11px] font-bold border border-slate-200 shrink-0 whitespace-nowrap">
                              {isFinished ? getDisplayScore(m, generalMatchMap, filteredMatches) : 'VS'}
                            </span>
                            <span className={`text-left flex-1 truncate font-medium ${awayTeamWon ? 'text-blue-700 font-black' : 'text-gray-900'}`}>
                              {m.awayTeam}
                            </span>
                          </div>
                        </td>

                        {/* 6. 국내 공시 기대값 (BetMan) - 3칸 대칭 구조 & 선택지 라벨 없이 실제 배당 숫자만 표시 */}
                        <td className="p-2 text-center bg-blue-50/40 border-l border-blue-100 font-mono whitespace-nowrap">
                          <div className="grid grid-cols-3 gap-1 w-full max-w-[150px] mx-auto text-[11px] items-center">
                            {/* Slot 1 */}
                            <span className={`w-full py-0.5 rounded text-center inline-block ${activeOddsSlot === 'win' ? 'bg-blue-600 text-white font-bold' : 'text-blue-950 font-bold'}`}>
                              {domSlots.slot1.text}
                            </span>

                            {/* Slot 2 (가운데 슬롯: 2-way 정렬용 대시 or 3-way 배당/결측치) */}
                            <span className={`w-full py-0.5 rounded text-center inline-block ${
                              domSlots.slot2.isAlignmentDash
                                ? 'text-slate-400 font-bold'
                                : (activeOddsSlot === 'middle' ? 'bg-blue-600 text-white font-bold' : (domSlots.slot2.isMissing ? 'text-slate-400 font-bold' : 'text-slate-700 font-bold'))
                            }`}>
                              {domSlots.slot2.text}
                            </span>

                            {/* Slot 3 */}
                            <span className={`w-full py-0.5 rounded text-center inline-block ${activeOddsSlot === 'lose' ? 'bg-blue-600 text-white font-bold' : 'text-blue-950 font-bold'}`}>
                              {domSlots.slot3.text}
                            </span>
                          </div>
                        </td>

                        {/* 7. 해외 시장 기준값 (해외 평균 배당) - 3칸 대칭 구조 & 순수 배당 숫자만 표시 */}
                        <td className="p-2 text-center bg-amber-50/40 border-l border-amber-100 font-mono whitespace-nowrap">
                          {m.oddsSource?.foreign === 'real' && m.foreign ? (
                            <div className="grid grid-cols-3 gap-1 w-full max-w-[150px] mx-auto text-[11px] items-center">
                              {/* Foreign Slot 1 */}
                              <span className="w-full py-0.5 rounded text-center text-amber-950 font-black inline-block">
                                {forSlots.slot1.text === '-' ? '—' : forSlots.slot1.text}
                              </span>

                              {/* Foreign Slot 2 (가운데 슬롯: 2-way 정렬용 대시 or 3-way 배당/결측치) */}
                              <span className={`w-full py-0.5 rounded text-center inline-block ${
                                forSlots.slot2.isAlignmentDash
                                  ? 'text-slate-400 font-bold'
                                  : (forSlots.slot2.isMissing ? 'text-slate-400 font-bold' : 'text-slate-600 font-bold')
                              }`}>
                                {forSlots.slot2.text === '-' ? '—' : forSlots.slot2.text}
                              </span>

                              {/* Foreign Slot 3 */}
                              <span className="w-full py-0.5 rounded text-center text-amber-950 font-black inline-block">
                                {forSlots.slot3.text === '-' ? '—' : forSlots.slot3.text}
                              </span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-1 w-full max-w-[150px] mx-auto text-[11px] text-gray-400 font-bold items-center">
                              <span className="w-full py-0.5 rounded text-center inline-block">—</span>
                              <span className="w-full py-0.5 rounded text-center inline-block">—</span>
                              <span className="w-full py-0.5 rounded text-center inline-block">—</span>
                            </div>
                          )}
                        </td>

                        {/* 8. 상태 (결과 단일 표시) */}
                        <td className="p-2 text-center font-bold text-[10px] whitespace-nowrap">
                          <div className="status-result flex items-center justify-center w-full min-w-[90px] h-8">
                            {isFinished && outcomeTag ? (
                              <span className={`px-2.5 py-1 rounded font-black border whitespace-nowrap inline-flex items-center justify-center min-w-[52px] h-[26px] ${
                                activeOddsSlot === 'middle' 
                                  ? 'bg-amber-100 text-amber-900 border-amber-300' 
                                  : (activeOddsSlot === 'win' ? 'bg-blue-100 text-blue-900 border-blue-300' : 'bg-red-100 text-red-900 border-red-300')
                              }`}>
                                {outcomeTag}
                              </span>
                            ) : (
                              <span className="text-gray-400 font-bold">-</span>
                            )}
                          </div>
                        </td>

                        {/* 9. 상세 분석 버튼 */}
                        <td className="p-2 text-center whitespace-nowrap">
                          {showAnalysisButton && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectMatchForQuant(m, 'overview');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-xs active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                            >
                              상세 분석
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {paddingBottom > 0 && (
                    <tr>
                      <td style={{ height: `${paddingBottom}px` }} colSpan={9} />
                    </tr>
                  )}
                </>
              );
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}
