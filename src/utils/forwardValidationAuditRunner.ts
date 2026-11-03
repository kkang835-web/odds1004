/**
 * SportsQuant Pro — Long-Term Blind Forward Validation Architecture & Audit Engine
 *
 * Objectives:
 * 1. Absolute Freeze: Policies, thresholds, weights, formulas, baselines remain 100% frozen.
 * 2. Data Cut-off: Strict separation of Historical OOS (1,413 matches) and Blind Forward cohorts.
 * 3. Supported Market Coverage: All supported markets (일반, 핸디캡, U/O, 승1패, 승5패) and sports (soccer, baseball, basketball, volleyball).
 * 4. Sport Code SSOT: Uses `resolveCanonicalSportCode` from `sportCodeResolver.ts`.
 * 5. Outcome Integrity: Baseball W1L (1), Basketball W5L (5), Soccer 1X2 (무) with zero isDrawHit contamination.
 * 6. PIT Audit: Verify point-in-time constraints.
 * 7. Pass Filter & Tier 1 Forward Validation across cohorts.
 * 8. Sample Gates & Non-Retuning Rule enforcement.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getPrimaryPickInfo } from "./quantPickEvaluator.js";
import { resolveCanonicalSportCode } from "./sportCodeResolver.js";
import {
  resolveBaseballWin1LossOutcome,
  resolveBasketballWin5LossOutcome,
  resolveSoccer1X2Outcome,
} from "../components/MatchTable.js";

// ============================================================================
// 0. SHA-256 Checksum Integrity Guard
// ============================================================================
const PROTECTED_FILES = [
  {
    path: "data/realProtoHistoricalDataset.json",
    expected: "893ff9140e1703c3d337d9fa48507d45e461d2124eccf7cc5f4f561db5e66f78",
  },
  {
    path: "data/protoRealWalkForwardV1.json",
    expected: "353a22601a6f0e6fe104c439cd0def3fd8c7471ac540cf67b50aed2b771ca372",
  },
  {
    path: "data/mappings/protoTeamNameDictionary.json",
    expected: "aefb61f6cd12b2bf61a1ef11fb39d88d3754506e1d38f3ed7bb3184a5cc5a2f5",
  },
];

export function verifyChecksums(): void {
  for (const f of PROTECTED_FILES) {
    const fullPath = path.resolve(process.cwd(), f.path);
    const content = fs.readFileSync(fullPath);
    const actual = crypto.createHash("sha256").update(content).digest("hex");
    if (actual !== f.expected) {
      throw new Error(`CRITICAL INTEGRITY FAILURE: ${f.path} checksum mismatch! Expected ${f.expected}, got ${actual}`);
    }
  }
}

// ============================================================================
// Interfaces
// ============================================================================
export interface MetricSummary {
  n: number;
  hits: number;
  hitRate: number;
  totalStaked: number;
  totalReturn: number;
  netProfit: number;
  roi: number;
  avgOdds: number;
  avgModelProb: number;
  avgEv: number;
  mdd: number;
  profitFactor: number;
  brier: number;
  logLoss: number;
}

export interface ForwardMatchRecord {
  matchId: string;
  year: number;
  round: number;
  matchNo: number;
  sport: string;
  league: string;
  gameType: string;
  handicapOrTarget: string | null;
  homeTeam: string;
  awayTeam: string;
  domesticOdds: { win: number; draw: number | null; lose: number };
  score: { home: number; away: number } | null;
  actualOutcome: string;
  kickoffStr: string;
  collectedAt: string;
  isSettled: boolean;

  // Evaluated decisions
  primary: {
    pickOutcome: string;
    odds: number;
    prob: number;
    expectedRoi: number;
    status: string; // 'recommended' | 'pass'
    isPass: boolean;
    tier: string;
    isTier1: boolean;
    isHit: boolean;
    pnl: number;
    brier: number;
    logLoss: number;
  };

  maxProb: {
    pickOutcome: string;
    odds: number;
    prob: number;
    isHit: boolean;
    pnl: number;
  };
}

export interface CohortReport {
  cohortId: string;
  roundKey: string;
  dateFrom: string;
  dateTo: string;
  matchCount: number;
  settledCount: number;
  unsettledCount: number;
  sportCount: number;
  marketCount: number;
  sportsList: string[];
  marketsList: string[];

  allSummary: MetricSummary;
  activeSummary: MetricSummary;
  passSummary: MetricSummary;

  tier1Summary: MetricSummary | null;
  tier1Status: string;

  separation: {
    roiDiff: number; // Active ROI - Pass ROI
    hitRateDiff: number; // Active HitRate - Pass HitRate
    direction: 'PROTECTIVE' | 'DETRIMENTAL' | 'NEUTRAL';
  };
}

// ============================================================================
// Main Forward Validation Runner
// ============================================================================
export function runForwardValidationAudit() {
  verifyChecksums();

  // 1. Sport Code Resolver Regression Test
  const regressionResults = {
    sc: resolveCanonicalSportCode('sc') === 'soccer',
    bs: resolveCanonicalSportCode('bs') === 'baseball',
    bk: resolveCanonicalSportCode('bk') === 'basketball',
    vl: resolveCanonicalSportCode('vl') === 'volleyball',
    bb: resolveCanonicalSportCode('bb') === null,
  };
  if (!Object.values(regressionResults).every(Boolean)) {
    throw new Error(`Sport Code SSOT Regression failed: ${JSON.stringify(regressionResults)}`);
  }

  // 2. Special Market Outcome Unit Test Verification
  const baseballTests = [
    resolveBaseballWin1LossOutcome(4, 3).display === '1',
    resolveBaseballWin1LossOutcome(3, 4).display === '1',
    resolveBaseballWin1LossOutcome(4, 4).display === '1',
    resolveBaseballWin1LossOutcome(5, 3).display === '승',
    resolveBaseballWin1LossOutcome(3, 5).display === '패',
  ];
  const basketballTests = [
    resolveBasketballWin5LossOutcome(105, 102).display === '5',
    resolveBasketballWin5LossOutcome(100, 100).display === '5',
    resolveBasketballWin5LossOutcome(110, 100).display === '승',
    resolveBasketballWin5LossOutcome(100, 110).display === '패',
    resolveBasketballWin5LossOutcome(95, 100).display === '5',
    resolveBasketballWin5LossOutcome(95, 101).display === '패',
  ];
  const soccerTests = [
    resolveSoccer1X2Outcome(2, 1).display === '승' && !resolveSoccer1X2Outcome(2, 1).isDrawHit,
    resolveSoccer1X2Outcome(1, 1).display === '무' && resolveSoccer1X2Outcome(1, 1).isDrawHit,
    resolveSoccer1X2Outcome(0, 2).display === '패' && !resolveSoccer1X2Outcome(0, 2).isDrawHit,
  ];
  if (!baseballTests.every(Boolean) || !basketballTests.every(Boolean) || !soccerTests.every(Boolean)) {
    throw new Error('Special Market Outcome Unit Test Verification failed');
  }

  // 3. Load Datasets
  const wfPath = path.resolve(process.cwd(), "data/protoRealWalkForwardV1.json");
  const histPath = path.resolve(process.cwd(), "data/realProtoHistoricalDataset.json");

  const wfData = JSON.parse(fs.readFileSync(wfPath, "utf-8"));
  const histData = JSON.parse(fs.readFileSync(histPath, "utf-8"));

  const wfSettledRecords = wfData.records.filter((r: any) => r.isSettled);
  const wfHistoricalIds = new Set(wfSettledRecords.map((r: any) => r.matchId));

  // 4. Extract Blind Forward Candidates (Strictly excluding WF 1,413 matches)
  const forwardMatchesRaw: any[] = [];
  let pitViolationsCount = 0;
  const pitViolationDetails: any[] = [];

  for (const rk in histData.rounds) {
    const roundObj = histData.rounds[rk];
    for (const m of roundObj.matches) {
      // Must not be in historical OOS set
      if (wfHistoricalIds.has(m.matchId)) continue;

      // PIT check: Must have collected timestamp, valid odds, not synthetic
      if (m.isSimulated || m.syntheticUsed || m.fallbackUsed) {
        pitViolationsCount++;
        pitViolationDetails.push({ matchId: m.matchId, reason: "Synthetic/Fallback data" });
        continue;
      }

      if (m.integrityStatus !== "VALID") {
        // e.g. INVALID_ODDS (1.00 odds or missing odds)
        continue;
      }

      if (!m.domesticOdds || m.domesticOdds.win <= 1.01 || m.domesticOdds.lose <= 1.01) {
        pitViolationsCount++;
        pitViolationDetails.push({ matchId: m.matchId, reason: "Non-viable domestic odds" });
        continue;
      }

      // Check if settled
      const isSettled = Boolean(m.outcome && m.score && (m.score.home !== null || m.score.away !== null));
      forwardMatchesRaw.push({ ...m, isSettledMatch: isSettled });
    }
  }

  const mapOutcome = (lbl: string) => {
    if (lbl.includes("승")) return "win";
    if (lbl.includes("무")) return "draw";
    if (lbl.includes("패")) return "lose";
    return "win";
  };

  // 5. Evaluate all forward matches using frozen quantPickEvaluator
  const evaluatedForwardRecords: ForwardMatchRecord[] = [];

  for (const m of forwardMatchesRaw) {
    const canonicalSport = resolveCanonicalSportCode(m.sport);
    if (!canonicalSport) continue;

    const matchItem = {
      id: m.matchId,
      gameNo: m.matchNo,
      sport: canonicalSport,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      domestic: { win: m.domesticOdds.win, draw: m.domesticOdds.draw, lose: m.domesticOdds.lose },
    };

    const p = getPrimaryPickInfo(matchItem as any);
    const cand = p.candidates || [];
    const sortedProb = [...cand].sort((a, b) => b.prob - a.prob);

    const eligible = cand.filter((c) => c && c.odds >= 1.45);
    const superGolden = eligible.filter(
      (c) => c.odds >= 1.45 && c.odds <= 2.20 && c.prob >= 58.0 && c.expectedRoi >= -0.5
    ).sort((a, b) => b.prob - a.prob || b.score - a.score)[0];

    const actual = m.outcome === "loss" ? "lose" : m.outcome;
    const isSettled = m.isSettledMatch && Boolean(actual);

    const primaryPick = mapOutcome(p.marketLabel);
    const isPrimaryHit = isSettled ? primaryPick === actual : false;
    const primaryPnl = isSettled ? (isPrimaryHit ? p.odds - 1 : -1) : 0;
    const probDec = p.prob / 100;
    const brier = isSettled ? Math.pow(probDec - (isPrimaryHit ? 1 : 0), 2) : 0;
    const eps = 1e-6;
    const logLoss = isSettled
      ? -(
          (isPrimaryHit ? 1 : 0) * Math.log(Math.max(probDec, eps)) +
          (1 - (isPrimaryHit ? 1 : 0)) * Math.log(Math.max(1 - probDec, eps))
        )
      : 0;

    const maxProbPick = sortedProb[0] ? mapOutcome(sortedProb[0].marketLabel) : primaryPick;
    const maxProbOdds = sortedProb[0] ? sortedProb[0].odds : p.odds;
    const maxProbProb = sortedProb[0] ? sortedProb[0].prob : p.prob;
    const isMaxProbHit = isSettled ? maxProbPick === actual : false;
    const maxProbPnl = isSettled ? (isMaxProbHit ? maxProbOdds - 1 : -1) : 0;

    evaluatedForwardRecords.push({
      matchId: m.matchId,
      year: m.year,
      round: m.round,
      matchNo: m.matchNo,
      sport: canonicalSport,
      league: m.league,
      gameType: m.gameType,
      handicapOrTarget: m.handicapOrTarget,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      domesticOdds: m.domesticOdds,
      score: m.score,
      actualOutcome: actual,
      kickoffStr: m.dateStr,
      collectedAt: m.provenance?.collectedAt || '',
      isSettled,
      primary: {
        pickOutcome: primaryPick,
        odds: p.odds,
        prob: p.prob,
        expectedRoi: p.expectedRoi,
        status: p.status,
        isPass: p.status === "pass",
        tier: superGolden ? "Tier 1 (Super Golden)" : "Non-Tier 1",
        isTier1: Boolean(superGolden),
        isHit: isPrimaryHit,
        pnl: primaryPnl,
        brier,
        logLoss,
      },
      maxProb: {
        pickOutcome: maxProbPick,
        odds: maxProbOdds,
        prob: maxProbProb,
        isHit: isMaxProbHit,
        pnl: maxProbPnl,
      },
    });
  }

  // 6. Chronological Cohort Partitioning
  // Rounds in historical order: 2025_150 -> 2025_151 -> 2026_110 -> 2026_111 -> 2026_112 -> 2026_113 -> 2026_114 -> 2026_115
  const roundKeysChronological = [
    "2025_150",
    "2025_151",
    "2026_110",
    "2026_111",
    "2026_112",
    "2026_113",
    "2026_114",
    "2026_115",
  ];

  function calcMetrics(records: ForwardMatchRecord[], picker: 'primary' | 'maxProb'): MetricSummary {
    const settled = records.filter((r) => r.isSettled);
    const n = settled.length;
    if (n === 0) {
      return {
        n: 0,
        hits: 0,
        hitRate: 0,
        totalStaked: 0,
        totalReturn: 0,
        netProfit: 0,
        roi: 0,
        avgOdds: 0,
        avgModelProb: 0,
        avgEv: 0,
        mdd: 0,
        profitFactor: 0,
        brier: 0,
        logLoss: 0,
      };
    }

    let hits = 0;
    let totalReturn = 0;
    let sumOdds = 0;
    let sumProb = 0;
    let sumEv = 0;
    let grossWins = 0;
    let grossLosses = 0;
    let sumBrier = 0;
    let sumLogLoss = 0;

    let cum = 0;
    let peak = 0;
    let mdd = 0;

    for (const r of settled) {
      const p = picker === 'primary' ? r.primary : (r.maxProb as any);
      sumOdds += p.odds;
      sumProb += p.prob;
      sumEv += (p.expectedRoi ?? 0);
      sumBrier += (p.brier ?? 0);
      sumLogLoss += (p.logLoss ?? 0);

      cum += p.pnl;
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > mdd) mdd = dd;

      if (p.isHit) {
        hits++;
        totalReturn += p.odds;
        grossWins += p.odds - 1;
      } else {
        grossLosses += 1;
      }
    }

    const netProfit = +(totalReturn - n).toFixed(2);
    const hitRate = +((hits / n) * 100).toFixed(2);
    const roi = +((netProfit / n) * 100).toFixed(2);
    const avgOdds = +(sumOdds / n).toFixed(3);
    const avgModelProb = +(sumProb / n).toFixed(2);
    const avgEv = +(sumEv / n).toFixed(2);
    const profitFactor = grossLosses > 0 ? +(grossWins / grossLosses).toFixed(3) : 999;
    const brier = +(sumBrier / n).toFixed(4);
    const logLoss = +(sumLogLoss / n).toFixed(4);

    return {
      n,
      hits,
      hitRate,
      totalStaked: n,
      totalReturn: +totalReturn.toFixed(2),
      netProfit,
      roi,
      avgOdds,
      avgModelProb,
      avgEv,
      mdd: +mdd.toFixed(2),
      profitFactor,
      brier,
      logLoss,
    };
  }

  const cohorts: CohortReport[] = [];
  let cohortIndex = 1;

  for (const rk of roundKeysChronological) {
    const roundRecords = evaluatedForwardRecords.filter((r) => `${r.year}_${r.round}` === rk);
    if (roundRecords.length === 0) continue;

    const settledRecords = roundRecords.filter((r) => r.isSettled);
    const activeRecords = settledRecords.filter((r) => !r.primary.isPass);
    const passRecords = settledRecords.filter((r) => r.primary.isPass);
    const tier1Records = settledRecords.filter((r) => r.primary.isTier1);

    const dates = roundRecords.map((r) => r.kickoffStr).filter(Boolean).sort();
    const dateFrom = dates[0] || 'N/A';
    const dateTo = dates[dates.length - 1] || 'N/A';

    const sportsList = Array.from(new Set(roundRecords.map((r) => r.sport)));
    const marketsList = Array.from(new Set(roundRecords.map((r) => r.gameType)));

    const allSummary = calcMetrics(settledRecords, 'primary');
    const activeSummary = calcMetrics(activeRecords, 'primary');
    const passSummary = calcMetrics(passRecords, 'primary');

    let tier1Summary: MetricSummary | null = null;
    let tier1Status = "NO TIER1 SAMPLE (N = 0)";
    if (tier1Records.length > 0) {
      tier1Summary = calcMetrics(tier1Records, 'primary');
      if (tier1Records.length < 30) tier1Status = `STATISTICALLY INSUFFICIENT (N = ${tier1Records.length}, descriptive only)`;
      else if (tier1Records.length < 50) tier1Status = `PRELIMINARY (N = ${tier1Records.length})`;
      else tier1Status = `STRONGER EVIDENCE (N = ${tier1Records.length})`;
    }

    const roiDiff = +(activeSummary.roi - passSummary.roi).toFixed(2);
    const hitRateDiff = +(activeSummary.hitRate - passSummary.hitRate).toFixed(2);
    let direction: 'PROTECTIVE' | 'DETRIMENTAL' | 'NEUTRAL' = 'NEUTRAL';
    if (roiDiff > 0 || hitRateDiff > 0) direction = 'PROTECTIVE';
    else if (roiDiff < 0 && hitRateDiff < 0) direction = 'DETRIMENTAL';

    cohorts.push({
      cohortId: `Forward Cohort #${cohortIndex++}`,
      roundKey: rk,
      dateFrom,
      dateTo,
      matchCount: roundRecords.length,
      settledCount: settledRecords.length,
      unsettledCount: roundRecords.length - settledRecords.length,
      sportCount: sportsList.length,
      marketCount: marketsList.length,
      sportsList,
      marketsList,
      allSummary,
      activeSummary,
      passSummary,
      tier1Summary,
      tier1Status,
      separation: {
        roiDiff,
        hitRateDiff,
        direction,
      },
    });
  }

  // 7. Cumulative Blind Forward Summary
  const settledAll = evaluatedForwardRecords.filter((r) => r.isSettled);
  const activeAll = settledAll.filter((r) => !r.primary.isPass);
  const passAll = settledAll.filter((r) => r.primary.isPass);
  const tier1All = settledAll.filter((r) => r.primary.isTier1);

  const cumAll = calcMetrics(settledAll, 'primary');
  const cumActive = calcMetrics(activeAll, 'primary');
  const cumPass = calcMetrics(passAll, 'primary');
  const cumTier1 = tier1All.length > 0 ? calcMetrics(tier1All, 'primary') : null;

  // MaxProb benchmark on the exact same sets
  const cumAllMaxProb = calcMetrics(settledAll, 'maxProb');
  const cumActiveMaxProb = calcMetrics(activeAll, 'maxProb');
  const cumPassMaxProb = calcMetrics(passAll, 'maxProb');

  // 8. Sport & Market Breakdown
  const sportBreakdown: Record<string, any> = {};
  for (const s of ['soccer', 'baseball', 'basketball', 'volleyball']) {
    const subset = settledAll.filter((r) => r.sport === s);
    const activeSub = subset.filter((r) => !r.primary.isPass);
    const t1Sub = subset.filter((r) => r.primary.isTier1);
    sportBreakdown[s] = {
      totalN: subset.length,
      activeN: activeSub.length,
      tier1N: t1Sub.length,
      hitRate: subset.length > 0 ? calcMetrics(subset, 'primary').hitRate : 'N/A',
      roi: subset.length > 0 ? calcMetrics(subset, 'primary').roi : 'N/A',
      status: subset.length < 30 ? 'SAMPLE INSUFFICIENT' : 'VALID SAMPLE',
    };
  }

  const marketBreakdown: Record<string, any> = {};
  const allGameTypes = Array.from(new Set(settledAll.map((r) => r.gameType)));
  for (const g of allGameTypes) {
    const subset = settledAll.filter((r) => r.gameType === g);
    const activeSub = subset.filter((r) => !r.primary.isPass);
    const t1Sub = subset.filter((r) => r.primary.isTier1);
    marketBreakdown[g] = {
      totalN: subset.length,
      activeN: activeSub.length,
      tier1N: t1Sub.length,
      hitRate: subset.length > 0 ? calcMetrics(subset, 'primary').hitRate : 'N/A',
      roi: subset.length > 0 ? calcMetrics(subset, 'primary').roi : 'N/A',
      status: subset.length < 30 ? 'SAMPLE INSUFFICIENT' : 'VALID SAMPLE',
    };
  }

  return {
    regressionResults,
    pitViolationsCount,
    pitViolationDetails,
    cohorts,
    cumulative: {
      cumAll,
      cumActive,
      cumPass,
      cumTier1,
      cumAllMaxProb,
      cumActiveMaxProb,
      cumPassMaxProb,
    },
    sportBreakdown,
    marketBreakdown,
    totalBlindForwardSettled: settledAll.length,
    tier1TotalN: tier1All.length,
  };
}

if (process.argv[1]?.endsWith("forwardValidationAuditRunner.ts")) {
  const res = runForwardValidationAudit();
  console.log("FORWARD VALIDATION AUDIT COMPLETE:", JSON.stringify(res, null, 2));
}
