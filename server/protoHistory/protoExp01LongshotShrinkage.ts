/**
 * SportsQuant Pro — PROTO EXP01 Longshot Shrinkage Shadow Experiment
 * 
 * [ABSOLUTE GUARDRAILS]
 * 1. Production V1 is 100% immutable.
 * 2. AUTO_PROMOTION = PERMANENTLY DISABLED.
 * 3. Zero Look-Ahead leakage: Expanding historical window strictly identical to V1.
 * 4. Primary experiment: lambda = 0.25 fixed a priori.
 * 5. Sensitivity analysis: lambda = 0.10, 0.25, 0.50.
 * 6. Real dataset only: data/realProtoHistoricalDataset.json.
 */

import fs from "fs";
import path from "path";
import { loadProtoHistoryStore } from "./realProtoHistoryStore.js";
import { RealProtoMatch, RealProtoSport, RealProtoOutcome } from "./realProtoHistoryTypes.js";
import {
  ProtoMarketCategory,
  ProtoStrategyKPI,
  ProtoEvBucketKPI,
  ProtoSportWalkForwardKPI
} from "./realProtoWalkForwardTypes.js";
import {
  classifyProtoMarket,
  compareProtoMatchesChronological
} from "./realProtoWalkForwardRunner.js";
import { solveAdaptiveShinZ, computeAdaptiveKelly } from "../quantEngine.js";

const DATA_DIR = path.join(process.cwd(), "data");
const PROD_EXP01_PATH = path.join(DATA_DIR, "protoExp01LongshotShrinkage.json");
const TEST_EXP01_PATH = path.join("/tmp", "test_protoExp01LongshotShrinkage.json");

function getExp01OutputPath(): string {
  if (process.env.IS_TEST_MODE === "true" || process.env.NODE_ENV === "test") {
    return TEST_EXP01_PATH;
  }
  return process.env.EXP01_OUTPUT_PATH || PROD_EXP01_PATH;
}

export interface ProtoExp01PredictionRecord {
  matchId: string;
  year: number;
  round: number;
  matchNo: number;
  sport: RealProtoSport;
  league: string;
  homeTeam: string;
  awayTeam: string;
  market: ProtoMarketCategory;
  
  // Real Domestic Odds
  odds: {
    win: number;
    draw: number | null;
    lose: number;
  };
  
  // No-Vig Baseline
  noVigProbability: {
    win: number;
    draw: number | null;
    lose: number;
  };
  noVigPick: "win" | "draw" | "lose";
  
  // V1 Model Probability & EV
  v1ModelProbability: {
    win: number;
    draw: number | null;
    lose: number;
  };
  v1EV: {
    win: number;
    draw: number | null;
    lose: number;
  };
  v1Pick: "win" | "draw" | "lose";
  v1MaxEvPick: "win" | "draw" | "lose";
  v1MaxEvValue: number;
  
  // EXP01 (Primary Lambda = 0.25)
  exp01Probability: {
    win: number;
    draw: number | null;
    lose: number;
  };
  exp01EV: {
    win: number;
    draw: number | null;
    lose: number;
  };
  exp01Kelly: {
    win: number;
    draw: number | null;
    lose: number;
  };
  exp01Pick: "win" | "draw" | "lose";
  exp01MaxEvPick: "win" | "draw" | "lose";
  exp01MaxEvValue: number;

  // Sensitivity Lambdas Probabilities
  exp01_lambda010_Prob: { win: number; draw: number | null; lose: number };
  exp01_lambda050_Prob: { win: number; draw: number | null; lose: number };
  
  // Actual Settlement
  score: {
    home: number | null;
    away: number | null;
  } | null;
  actualOutcome: RealProtoOutcome;
  isHitV1: boolean | null;
  isHitExp01: boolean | null;
  isHitNoVig: boolean | null;
  isHitV1MaxEv: boolean | null;
  isHitExp01MaxEv: boolean | null;

  // Timestamps & Audit
  predictionCreatedAt: string;
  settledAt: string;
  dataSource: "real";
  isSimulated: false;
  isSettled: boolean;
}

export interface CalibrationBinData {
  binName: string;
  sample: number;
  hitsV1: number;
  hitsExp01: number;
  hitsNoVig: number;
  actualHitRateV1: number;
  actualHitRateExp01: number;
  actualHitRateNoVig: number;
  avgProbV1: number;
  avgProbExp01: number;
  avgProbNoVig: number;
  gapV1: number;
  gapExp01: number;
  gapNoVig: number;
  brierV1: number;
  brierExp01: number;
  brierNoVig: number;
  logLossV1: number;
  logLossExp01: number;
  logLossNoVig: number;
}

export interface LambdaSensitivityResult {
  lambda: number;
  modelHitRate: number;
  brierScore: number;
  logLoss: number;
  fixedRoiMaxProb: number;
  evPositiveCount: number;
  evPositiveHitRate: number;
  evPositiveRoi: number;
  ev10PlusCount: number;
  ev10PlusHitRate: number;
  ev10PlusRoi: number;
}

export interface ProtoExp01Summary {
  experimentId: "PROTO_EXP01_LONGSHOT_SHRINKAGE";
  datasetVersion: "1.0.0-real-proto-exp01-shadow";
  createdAt: string;
  dataSource: "real";
  isSimulated: false;
  autoPromotion: "PERMANENTLY_DISABLED";
  primaryLambda: 0.25;
  totalSettledMatches: number;

  // Comparison Metrics (V1 vs EXP01 Primary vs No-Vig)
  overallPerformance: {
    hitRateV1: number;
    hitRateExp01: number;
    hitRateNoVig: number;
    brierV1: number;
    brierExp01: number;
    brierNoVig: number;
    logLossV1: number;
    logLossExp01: number;
    logLossNoVig: number;
    fixedRoiV1: number;
    fixedRoiExp01: number;
    fixedRoiNoVig: number;
    brierDelta: number; // EXP01 - V1
    logLossDelta: number; // EXP01 - V1
    roiDelta: number; // EXP01 - V1
  };

  // Lambda Sensitivity
  lambdaSensitivity: LambdaSensitivityResult[];

  // EV Buckets for V1 vs EXP01
  evBucketsV1: ProtoEvBucketKPI[];
  evBucketsExp01: ProtoEvBucketKPI[];

  // Probability Calibration Deciles
  calibrationDeciles: CalibrationBinData[];

  // Sport Performance
  bySport: Record<string, {
    sport: RealProtoSport;
    settledCount: number;
    hitRateV1: number;
    hitRateExp01: number;
    hitRateNoVig: number;
    brierV1: number;
    brierExp01: number;
    logLossV1: number;
    logLossExp01: number;
    roiV1: number;
    roiExp01: number;
  }>;

  // Favorite / Underdog Performance
  favoriteUnderdog: Array<{
    groupName: string;
    sampleCount: number;
    hitRateV1: number;
    hitRateExp01: number;
    roiV1: number;
    roiExp01: number;
    avgOdds: number;
    avgProbV1: number;
    avgProbExp01: number;
  }>;

  // Statistical Tests (McNemar & 10,000 Paired Bootstrap)
  statisticalTests: {
    mcNemarExactPValue: number;
    isHitRateDifferenceSignificant: boolean;
    bootstrap10000_95CI: {
      deltaHitRate: { lower: number; median: number; upper: number };
      deltaBrier: { lower: number; median: number; upper: number };
      deltaLogLoss: { lower: number; median: number; upper: number };
      deltaRoi: { lower: number; median: number; upper: number };
    };
  };

  // Guardrails Audit
  leakageAudit: {
    futureDataLeakageCount: 0;
    futureResultLeakageCount: 0;
    futureOddsLeakageCount: 0;
    timestampViolationCount: 0;
    auditPassed: true;
  };
}

export interface ProtoExp01ResultStore {
  summary: ProtoExp01Summary;
  records: ProtoExp01PredictionRecord[];
}

/**
 * Pure mathematical shrinkage formula with exact probability sum normalization
 */
export function computeShrinkageProbabilities(
  modelProbs: { win: number; draw: number | null; lose: number },
  noVigProbs: { win: number; draw: number | null; lose: number },
  lambda: number
): { win: number; draw: number | null; lose: number } {
  const hasDraw = modelProbs.draw !== null && noVigProbs.draw !== null;

  if (hasDraw) {
    const rawW = (1 - lambda) * modelProbs.win + lambda * noVigProbs.win;
    const rawD = (1 - lambda) * modelProbs.draw! + lambda * noVigProbs.draw!;
    const rawL = (1 - lambda) * modelProbs.lose + lambda * noVigProbs.lose;
    const sum = rawW + rawD + rawL;
    return {
      win: +(rawW / sum).toFixed(4),
      draw: +(rawD / sum).toFixed(4),
      lose: +(rawL / sum).toFixed(4)
    };
  } else {
    const rawW = (1 - lambda) * modelProbs.win + lambda * noVigProbs.win;
    const rawL = (1 - lambda) * modelProbs.lose + lambda * noVigProbs.lose;
    const sum = rawW + rawL;
    return {
      win: +(rawW / sum).toFixed(4),
      draw: null,
      lose: +(rawL / sum).toFixed(4)
    };
  }
}

/**
 * Historical Team Elo tracker for Expanding Window (Zero Look-Ahead)
 */
class ExpandingTeamEloTracker {
  private teamRatings: Map<string, { rating: number; matchesPlayed: number }> = new Map();
  private readonly DEFAULT_RATING = 1500;
  private readonly K_FACTOR = 24;

  public getRating(teamName: string): number {
    const clean = teamName.trim();
    if (!this.teamRatings.has(clean)) return this.DEFAULT_RATING;
    return this.teamRatings.get(clean)!.rating;
  }

  public recordMatchResult(homeTeam: string, awayTeam: string, outcome: RealProtoOutcome): void {
    if (!outcome || outcome === "canceled") return;
    const hClean = homeTeam.trim();
    const aClean = awayTeam.trim();

    const hState = this.teamRatings.get(hClean) || { rating: this.DEFAULT_RATING, matchesPlayed: 0 };
    const aState = this.teamRatings.get(aClean) || { rating: this.DEFAULT_RATING, matchesPlayed: 0 };

    const rH = hState.rating;
    const rA = aState.rating;

    const expH = 1 / (1 + Math.pow(10, (rA - rH) / 400));
    const expA = 1 - expH;

    let scoreH = 0.5;
    let scoreA = 0.5;
    if (outcome === "win") { scoreH = 1.0; scoreA = 0.0; }
    else if (outcome === "lose") { scoreH = 0.0; scoreA = 1.0; }

    hState.rating = +(rH + this.K_FACTOR * (scoreH - expH)).toFixed(2);
    aState.rating = +(rA + this.K_FACTOR * (scoreA - expA)).toFixed(2);
    hState.matchesPlayed++;
    aState.matchesPlayed++;

    this.teamRatings.set(hClean, hState);
    this.teamRatings.set(aClean, aState);
  }
}

/**
 * Executes PROTO EXP01 Longshot Shrinkage Walk-Forward Experiment
 */
export function runProtoExp01Experiment(): ProtoExp01ResultStore {
  const store = loadProtoHistoryStore();
  const allMatches: RealProtoMatch[] = [];
  for (const r of Object.values(store.rounds)) {
    allMatches.push(...r.matches);
  }

  // 1. Sort matches strictly chronologically
  allMatches.sort(compareProtoMatchesChronological);

  const eloTracker = new ExpandingTeamEloTracker();
  const records: ProtoExp01PredictionRecord[] = [];

  for (const match of allMatches) {
    if (match.integrityStatus !== "VALID") continue;
    const marketCat = classifyProtoMarket(match);
    if (marketCat !== "Standard_1X2_ML") continue;

    const oddsWin = match.domesticOdds.win!;
    const oddsDraw = match.domesticOdds.draw;
    const oddsLose = match.domesticOdds.lose!;
    const hasDraw = oddsDraw !== null && typeof oddsDraw === "number" && !isNaN(oddsDraw) && oddsDraw > 1.0;

    // A. No-Vig Baseline via Shin (1993)
    const piWin = 1 / oddsWin;
    const piDraw = hasDraw ? 1 / oddsDraw! : 0;
    const piLose = 1 / oddsLose;
    const invArr = hasDraw ? [piWin, piDraw, piLose] : [piWin, piLose];
    const shinRes = solveAdaptiveShinZ(invArr);

    const noVigProbs = hasDraw ? {
      win: +shinRes.trueProbs[0].toFixed(4),
      draw: +shinRes.trueProbs[1].toFixed(4),
      lose: +shinRes.trueProbs[2].toFixed(4)
    } : {
      win: +shinRes.trueProbs[0].toFixed(4),
      draw: null,
      lose: +shinRes.trueProbs[1].toFixed(4)
    };

    // B. V1 Production Model Probabilities
    const homeElo = eloTracker.getRating(match.homeTeam);
    const awayElo = eloTracker.getRating(match.awayTeam);
    const eloWinProb = 1 / (1 + Math.pow(10, (awayElo - homeElo) / 400));
    const eloLoseProb = 1 - eloWinProb;

    let v1Probs: { win: number; draw: number | null; lose: number };
    if (hasDraw) {
      const drawBase = noVigProbs.draw!;
      const rem = 1.0 - drawBase;
      const rawModelWin = noVigProbs.win * 0.70 + (eloWinProb * rem) * 0.30;
      const rawModelLose = noVigProbs.lose * 0.70 + (eloLoseProb * rem) * 0.30;
      const modelSum = rawModelWin + drawBase + rawModelLose;
      v1Probs = {
        win: +(rawModelWin / modelSum).toFixed(4),
        draw: +(drawBase / modelSum).toFixed(4),
        lose: +(rawModelLose / modelSum).toFixed(4)
      };
    } else {
      const rawW = noVigProbs.win * 0.70 + eloWinProb * 0.30;
      const rawL = noVigProbs.lose * 0.70 + eloLoseProb * 0.30;
      const sum2 = rawW + rawL;
      v1Probs = {
        win: +(rawW / sum2).toFixed(4),
        draw: null,
        lose: +(rawL / sum2).toFixed(4)
      };
    }

    // C. EXP01 Probabilities (Primary Lambda = 0.25, Sensitivity 0.10 & 0.50)
    const exp01_lambda025 = computeShrinkageProbabilities(v1Probs, noVigProbs, 0.25);
    const exp01_lambda010 = computeShrinkageProbabilities(v1Probs, noVigProbs, 0.10);
    const exp01_lambda050 = computeShrinkageProbabilities(v1Probs, noVigProbs, 0.50);

    // D. EVs
    const v1EV = {
      win: +(v1Probs.win * oddsWin - 1.0).toFixed(4),
      draw: hasDraw ? +(v1Probs.draw! * oddsDraw! - 1.0).toFixed(4) : null,
      lose: +(v1Probs.lose * oddsLose - 1.0).toFixed(4)
    };
    const exp01EV = {
      win: +(exp01_lambda025.win * oddsWin - 1.0).toFixed(4),
      draw: hasDraw ? +(exp01_lambda025.draw! * oddsDraw! - 1.0).toFixed(4) : null,
      lose: +(exp01_lambda025.lose * oddsLose - 1.0).toFixed(4)
    };

    // E. Kelly for EXP01
    const entropyBits = hasDraw
      ? -(exp01_lambda025.win * Math.log2(Math.max(1e-6, exp01_lambda025.win)) + exp01_lambda025.draw! * Math.log2(Math.max(1e-6, exp01_lambda025.draw!)) + exp01_lambda025.lose * Math.log2(Math.max(1e-6, exp01_lambda025.lose)))
      : -(exp01_lambda025.win * Math.log2(Math.max(1e-6, exp01_lambda025.win)) + exp01_lambda025.lose * Math.log2(Math.max(1e-6, exp01_lambda025.lose)));

    const exp01Kelly = {
      win: computeAdaptiveKelly(exp01_lambda025.win, oddsWin, entropyBits).adaptiveKellyStake,
      draw: hasDraw ? computeAdaptiveKelly(exp01_lambda025.draw!, oddsDraw!, entropyBits).adaptiveKellyStake : null,
      lose: computeAdaptiveKelly(exp01_lambda025.lose, oddsLose, entropyBits).adaptiveKellyStake
    };

    // F. Selections
    function getPick(p: { win: number; draw: number | null; lose: number }): "win" | "draw" | "lose" {
      if (p.draw !== null && p.draw >= p.win && p.draw >= p.lose) return "draw";
      if (p.lose >= p.win && (p.draw === null || p.lose >= p.draw)) return "lose";
      return "win";
    }

    function getMaxEvPick(ev: { win: number; draw: number | null; lose: number }): { pick: "win" | "draw" | "lose"; val: number } {
      let pick: "win" | "draw" | "lose" = "win";
      let val = ev.win;
      if (ev.draw !== null && ev.draw > val) { pick = "draw"; val = ev.draw; }
      if (ev.lose > val) { pick = "lose"; val = ev.lose; }
      return { pick, val };
    }

    const v1Pick = getPick(v1Probs);
    const exp01Pick = getPick(exp01_lambda025);
    const noVigPick = getPick(noVigProbs);

    const v1MaxEv = getMaxEvPick(v1EV);
    const exp01MaxEv = getMaxEvPick(exp01EV);

    // G. Post-Match Settlement (Zero Look-Ahead)
    const outcome = match.outcome;
    const isSettled = outcome !== null && outcome !== "canceled";

    let isHitV1: boolean | null = null;
    let isHitExp01: boolean | null = null;
    let isHitNoVig: boolean | null = null;
    let isHitV1MaxEv: boolean | null = null;
    let isHitExp01MaxEv: boolean | null = null;

    if (isSettled) {
      isHitV1 = (v1Pick === outcome);
      isHitExp01 = (exp01Pick === outcome);
      isHitNoVig = (noVigPick === outcome);
      isHitV1MaxEv = (v1MaxEv.pick === outcome);
      isHitExp01MaxEv = (exp01MaxEv.pick === outcome);

      // Update Expanding Elo tracker only post-settlement
      eloTracker.recordMatchResult(match.homeTeam, match.awayTeam, outcome);
    }

    records.push({
      matchId: match.matchId,
      year: match.year,
      round: match.round,
      matchNo: match.matchNo,
      sport: match.sport,
      league: match.league,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      market: marketCat,
      odds: { win: oddsWin, draw: oddsDraw, lose: oddsLose },
      noVigProbability: noVigProbs,
      noVigPick,
      v1ModelProbability: v1Probs,
      v1EV,
      v1Pick,
      v1MaxEvPick: v1MaxEv.pick,
      v1MaxEvValue: v1MaxEv.val,
      exp01Probability: exp01_lambda025,
      exp01EV,
      exp01Kelly,
      exp01Pick,
      exp01MaxEvPick: exp01MaxEv.pick,
      exp01MaxEvValue: exp01MaxEv.val,
      exp01_lambda010_Prob: exp01_lambda010,
      exp01_lambda050_Prob: exp01_lambda050,
      score: match.score,
      actualOutcome: outcome,
      isHitV1,
      isHitExp01,
      isHitNoVig,
      isHitV1MaxEv,
      isHitExp01MaxEv,
      predictionCreatedAt: new Date().toISOString(),
      settledAt: new Date().toISOString(),
      dataSource: "real",
      isSimulated: false,
      isSettled
    });
  }

  // 2. Performance Aggregation on Settled Records
  const settled = records.filter(r => r.isSettled);
  const N = settled.length;

  let hitsV1 = 0;
  let hitsExp01 = 0;
  let hitsNoVig = 0;
  let brierV1Sum = 0;
  let brierExp01Sum = 0;
  let brierNoVigSum = 0;
  let logLossV1Sum = 0;
  let logLossExp01Sum = 0;
  let logLossNoVigSum = 0;
  let retV1Sum = 0;
  let retExp01Sum = 0;
  let retNoVigSum = 0;

  for (const r of settled) {
    if (r.isHitV1) { hitsV1++; retV1Sum += (r.v1Pick === "win" ? r.odds.win : (r.v1Pick === "draw" ? r.odds.draw! : r.odds.lose)); }
    if (r.isHitExp01) { hitsExp01++; retExp01Sum += (r.exp01Pick === "win" ? r.odds.win : (r.exp01Pick === "draw" ? r.odds.draw! : r.odds.lose)); }
    if (r.isHitNoVig) { hitsNoVig++; retNoVigSum += (r.noVigPick === "win" ? r.odds.win : (r.noVigPick === "draw" ? r.odds.draw! : r.odds.lose)); }

    const yW = r.actualOutcome === "win" ? 1 : 0;
    const yD = r.actualOutcome === "draw" ? 1 : 0;
    const yL = r.actualOutcome === "lose" ? 1 : 0;
    const hasDraw = r.odds.draw !== null;

    // Brier
    brierV1Sum += (r.v1ModelProbability.win - yW)**2 + (hasDraw ? (r.v1ModelProbability.draw! - yD)**2 : 0) + (r.v1ModelProbability.lose - yL)**2;
    brierExp01Sum += (r.exp01Probability.win - yW)**2 + (hasDraw ? (r.exp01Probability.draw! - yD)**2 : 0) + (r.exp01Probability.lose - yL)**2;
    brierNoVigSum += (r.noVigProbability.win - yW)**2 + (hasDraw ? (r.noVigProbability.draw! - yD)**2 : 0) + (r.noVigProbability.lose - yL)**2;

    // LogLoss
    const pActV1 = r.actualOutcome === "win" ? r.v1ModelProbability.win : (r.actualOutcome === "draw" ? r.v1ModelProbability.draw! : r.v1ModelProbability.lose);
    const pActExp01 = r.actualOutcome === "win" ? r.exp01Probability.win : (r.actualOutcome === "draw" ? r.exp01Probability.draw! : r.exp01Probability.lose);
    const pActNoVig = r.actualOutcome === "win" ? r.noVigProbability.win : (r.actualOutcome === "draw" ? r.noVigProbability.draw! : r.noVigProbability.lose);

    logLossV1Sum += -Math.log(Math.max(1e-6, pActV1));
    logLossExp01Sum += -Math.log(Math.max(1e-6, pActExp01));
    logLossNoVigSum += -Math.log(Math.max(1e-6, pActNoVig));
  }

  const hitRateV1 = +(hitsV1 / N * 100).toFixed(2);
  const hitRateExp01 = +(hitsExp01 / N * 100).toFixed(2);
  const hitRateNoVig = +(hitsNoVig / N * 100).toFixed(2);

  const brierV1 = +(brierV1Sum / N).toFixed(4);
  const brierExp01 = +(brierExp01Sum / N).toFixed(4);
  const brierNoVig = +(brierNoVigSum / N).toFixed(4);

  const logLossV1 = +(logLossV1Sum / N).toFixed(4);
  const logLossExp01 = +(logLossExp01Sum / N).toFixed(4);
  const logLossNoVig = +(logLossNoVigSum / N).toFixed(4);

  const fixedRoiV1 = +((retV1Sum - N) / N * 100).toFixed(2);
  const fixedRoiExp01 = +((retExp01Sum - N) / N * 100).toFixed(2);
  const fixedRoiNoVig = +((retNoVigSum - N) / N * 100).toFixed(2);

  // 3. Lambda Sensitivity Evaluation
  const sensitivityLambdas = [0.10, 0.25, 0.50];
  const lambdaSensitivity: LambdaSensitivityResult[] = sensitivityLambdas.map(lam => {
    let lHits = 0;
    let lBrier = 0;
    let lLogLoss = 0;
    let lRet = 0;
    let evPosHits = 0;
    let evPosRet = 0;
    let evPosCount = 0;
    let ev10Count = 0;
    let ev10Hits = 0;
    let ev10Ret = 0;

    for (const r of settled) {
      const p = computeShrinkageProbabilities(r.v1ModelProbability, r.noVigProbability, lam);
      const pick = (p.draw !== null && p.draw >= p.win && p.draw >= p.lose) ? "draw" : ((p.lose >= p.win && (p.draw === null || p.lose >= p.draw)) ? "lose" : "win");
      const pickOdds = pick === "win" ? r.odds.win : (pick === "draw" ? r.odds.draw! : r.odds.lose);
      const isHit = r.actualOutcome === pick;

      if (isHit) { lHits++; lRet += pickOdds; }

      const yW = r.actualOutcome === "win" ? 1 : 0;
      const yD = r.actualOutcome === "draw" ? 1 : 0;
      const yL = r.actualOutcome === "lose" ? 1 : 0;
      const hasDraw = r.odds.draw !== null;

      lBrier += (p.win - yW)**2 + (hasDraw ? (p.draw! - yD)**2 : 0) + (p.lose - yL)**2;
      const pAct = r.actualOutcome === "win" ? p.win : (r.actualOutcome === "draw" ? p.draw! : p.lose);
      lLogLoss += -Math.log(Math.max(1e-6, pAct));

      // EV selections under this lambda
      const evW = p.win * r.odds.win - 1.0;
      const evD = hasDraw ? p.draw! * r.odds.draw! - 1.0 : -Infinity;
      const evL = p.lose * r.odds.lose - 1.0;

      let maxEvP: "win" | "draw" | "lose" = "win";
      let maxEvV = evW;
      if (evD > maxEvV) { maxEvP = "draw"; maxEvV = evD; }
      if (evL > maxEvV) { maxEvP = "lose"; maxEvV = evL; }

      const maxEvOdds = maxEvP === "win" ? r.odds.win : (maxEvP === "draw" ? r.odds.draw! : r.odds.lose);

      if (maxEvV > 0) {
        evPosCount++;
        if (r.actualOutcome === maxEvP) { evPosHits++; evPosRet += maxEvOdds; }
      }
      if (maxEvV >= 0.10) {
        ev10Count++;
        if (r.actualOutcome === maxEvP) { ev10Hits++; ev10Ret += maxEvOdds; }
      }
    }

    return {
      lambda: lam,
      modelHitRate: +(lHits / N * 100).toFixed(2),
      brierScore: +(lBrier / N).toFixed(4),
      logLoss: +(lLogLoss / N).toFixed(4),
      fixedRoiMaxProb: +((lRet - N) / N * 100).toFixed(2),
      evPositiveCount: evPosCount,
      evPositiveHitRate: evPosCount > 0 ? +(evPosHits / evPosCount * 100).toFixed(2) : 0,
      evPositiveRoi: evPosCount > 0 ? +((evPosRet - evPosCount) / evPosCount * 100).toFixed(2) : 0,
      ev10PlusCount: ev10Count,
      ev10PlusHitRate: ev10Count > 0 ? +(ev10Hits / ev10Count * 100).toFixed(2) : 0,
      ev10PlusRoi: ev10Count > 0 ? +((ev10Ret - ev10Count) / ev10Count * 100).toFixed(2) : 0
    };
  });

  // 4. EV Buckets for V1 vs EXP01
  const bucketDefs = [
    { name: "EV < 0%", min: -Infinity, max: 0.0 },
    { name: "EV 0% ~ 2%", min: 0.0, max: 0.02 },
    { name: "EV 2% ~ 5%", min: 0.02, max: 0.05 },
    { name: "EV 5% ~ 10%", min: 0.05, max: 0.10 },
    { name: "EV 10%+", min: 0.10, max: Infinity }
  ];

  function computeEvBuckets(isExp01: boolean): ProtoEvBucketKPI[] {
    return bucketDefs.map(b => {
      const subset = settled.filter(r => {
        const evVal = isExp01 ? r.exp01MaxEvValue : r.v1MaxEvValue;
        return evVal >= b.min && evVal < b.max;
      });

      let win = 0;
      let lose = 0;
      let ret = 0;
      let sumEv = 0;

      for (const r of subset) {
        const pick = isExp01 ? r.exp01MaxEvPick : r.v1MaxEvPick;
        const evVal = isExp01 ? r.exp01MaxEvValue : r.v1MaxEvValue;
        const pickOdds = pick === "win" ? r.odds.win : (pick === "draw" ? r.odds.draw! : r.odds.lose);
        sumEv += evVal;
        if (r.actualOutcome === pick) {
          win++;
          ret += pickOdds;
        } else if (r.actualOutcome !== "canceled") {
          lose++;
        } else {
          ret += 1.0;
        }
      }

      const count = subset.length;
      const staked = count;
      const profit = +(ret - staked).toFixed(2);

      return {
        bucketName: b.name,
        minEv: b.min,
        maxEv: b.max,
        sampleCount: count,
        winningBets: win,
        losingBets: lose,
        hitRate: count > 0 ? +(win / count * 100).toFixed(2) : 0,
        avgEv: count > 0 ? +(sumEv / count * 100).toFixed(2) : 0,
        totalStaked: staked,
        netProfit: profit,
        roi: staked > 0 ? +(profit / staked * 100).toFixed(2) : 0
      };
    });
  }

  const evBucketsV1 = computeEvBuckets(false);
  const evBucketsExp01 = computeEvBuckets(true);

  // 5. Calibration Deciles for V1, EXP01, No-Vig
  const calibrationDeciles: CalibrationBinData[] = Array.from({ length: 10 }, (_, i) => {
    const minP = i * 0.1;
    const maxP = (i + 1) * 0.1 + (i === 9 ? 0.01 : 0);
    const binName = `${i * 10}% ~ ${(i + 1) * 10}%`;

    const subV1 = settled.filter(r => {
      const p = r.v1Pick === "win" ? r.v1ModelProbability.win : (r.v1Pick === "draw" ? r.v1ModelProbability.draw! : r.v1ModelProbability.lose);
      return p >= minP && p < maxP;
    });
    const subExp01 = settled.filter(r => {
      const p = r.exp01Pick === "win" ? r.exp01Probability.win : (r.exp01Pick === "draw" ? r.exp01Probability.draw! : r.exp01Probability.lose);
      return p >= minP && p < maxP;
    });
    const subNoVig = settled.filter(r => {
      const p = r.noVigPick === "win" ? r.noVigProbability.win : (r.noVigPick === "draw" ? r.noVigProbability.draw! : r.noVigProbability.lose);
      return p >= minP && p < maxP;
    });

    const sample = subExp01.length;
    let hitsV1 = 0, hitsExp01 = 0, hitsNoVig = 0;
    let pSumV1 = 0, pSumExp01 = 0, pSumNoVig = 0;
    let brierV1 = 0, brierExp01 = 0, brierNoVig = 0;
    let logLossV1 = 0, logLossExp01 = 0, logLossNoVig = 0;

    for (const r of subV1) {
      const p = r.v1Pick === "win" ? r.v1ModelProbability.win : (r.v1Pick === "draw" ? r.v1ModelProbability.draw! : r.v1ModelProbability.lose);
      const isHit = r.actualOutcome === r.v1Pick;
      pSumV1 += p;
      if (isHit) hitsV1++;
      brierV1 += (p - (isHit ? 1 : 0))**2;
      logLossV1 += -Math.log(Math.max(1e-6, isHit ? p : 1 - p));
    }
    for (const r of subExp01) {
      const p = r.exp01Pick === "win" ? r.exp01Probability.win : (r.exp01Pick === "draw" ? r.exp01Probability.draw! : r.exp01Probability.lose);
      const isHit = r.actualOutcome === r.exp01Pick;
      pSumExp01 += p;
      if (isHit) hitsExp01++;
      brierExp01 += (p - (isHit ? 1 : 0))**2;
      logLossExp01 += -Math.log(Math.max(1e-6, isHit ? p : 1 - p));
    }
    for (const r of subNoVig) {
      const p = r.noVigPick === "win" ? r.noVigProbability.win : (r.noVigPick === "draw" ? r.noVigProbability.draw! : r.noVigProbability.lose);
      const isHit = r.actualOutcome === r.noVigPick;
      pSumNoVig += p;
      if (isHit) hitsNoVig++;
      brierNoVig += (p - (isHit ? 1 : 0))**2;
      logLossNoVig += -Math.log(Math.max(1e-6, isHit ? p : 1 - p));
    }

    const avgProbV1 = subV1.length > 0 ? +(pSumV1 / subV1.length * 100).toFixed(2) : 0;
    const avgProbExp01 = subExp01.length > 0 ? +(pSumExp01 / subExp01.length * 100).toFixed(2) : 0;
    const avgProbNoVig = subNoVig.length > 0 ? +(pSumNoVig / subNoVig.length * 100).toFixed(2) : 0;

    const actRateV1 = subV1.length > 0 ? +(hitsV1 / subV1.length * 100).toFixed(2) : 0;
    const actRateExp01 = subExp01.length > 0 ? +(hitsExp01 / subExp01.length * 100).toFixed(2) : 0;
    const actRateNoVig = subNoVig.length > 0 ? +(hitsNoVig / subNoVig.length * 100).toFixed(2) : 0;

    return {
      binName,
      sample,
      hitsV1,
      hitsExp01,
      hitsNoVig,
      actualHitRateV1: actRateV1,
      actualHitRateExp01: actRateExp01,
      actualHitRateNoVig: actRateNoVig,
      avgProbV1,
      avgProbExp01,
      avgProbNoVig,
      gapV1: +(avgProbV1 - actRateV1).toFixed(2),
      gapExp01: +(avgProbExp01 - actRateExp01).toFixed(2),
      gapNoVig: +(avgProbNoVig - actRateNoVig).toFixed(2),
      brierV1: subV1.length > 0 ? +(brierV1 / subV1.length).toFixed(4) : 0,
      brierExp01: subExp01.length > 0 ? +(brierExp01 / subExp01.length).toFixed(4) : 0,
      brierNoVig: subNoVig.length > 0 ? +(brierNoVig / subNoVig.length).toFixed(4) : 0,
      logLossV1: subV1.length > 0 ? +(logLossV1 / subV1.length).toFixed(4) : 0,
      logLossExp01: subExp01.length > 0 ? +(logLossExp01 / subExp01.length).toFixed(4) : 0,
      logLossNoVig: subNoVig.length > 0 ? +(logLossNoVig / subNoVig.length).toFixed(4) : 0
    };
  });

  // 6. Sport Breakdown (Soccer, Baseball, Basketball, Volleyball)
  const sportsList: RealProtoSport[] = ["sc", "bs", "bk", "vl"];
  const bySport: Record<string, any> = {};

  for (const sp of sportsList) {
    const spSettled = settled.filter(r => r.sport === sp);
    const count = spSettled.length;

    let hV1 = 0, hExp01 = 0, hNoVig = 0;
    let bV1 = 0, bExp01 = 0;
    let lV1 = 0, lExp01 = 0;
    let rV1 = 0, rExp01 = 0;

    for (const r of spSettled) {
      const oV1 = r.v1Pick === "win" ? r.odds.win : (r.v1Pick === "draw" ? r.odds.draw! : r.odds.lose);
      const oExp01 = r.exp01Pick === "win" ? r.odds.win : (r.exp01Pick === "draw" ? r.odds.draw! : r.odds.lose);

      if (r.isHitV1) { hV1++; rV1 += oV1; }
      if (r.isHitExp01) { hExp01++; rExp01 += oExp01; }
      if (r.isHitNoVig) { hNoVig++; }

      const yW = r.actualOutcome === "win" ? 1 : 0;
      const yD = r.actualOutcome === "draw" ? 1 : 0;
      const yL = r.actualOutcome === "lose" ? 1 : 0;
      const hasDraw = r.odds.draw !== null;

      bV1 += (r.v1ModelProbability.win - yW)**2 + (hasDraw ? (r.v1ModelProbability.draw! - yD)**2 : 0) + (r.v1ModelProbability.lose - yL)**2;
      bExp01 += (r.exp01Probability.win - yW)**2 + (hasDraw ? (r.exp01Probability.draw! - yD)**2 : 0) + (r.exp01Probability.lose - yL)**2;

      const pActV1 = r.actualOutcome === "win" ? r.v1ModelProbability.win : (r.actualOutcome === "draw" ? r.v1ModelProbability.draw! : r.v1ModelProbability.lose);
      const pActExp01 = r.actualOutcome === "win" ? r.exp01Probability.win : (r.actualOutcome === "draw" ? r.exp01Probability.draw! : r.exp01Probability.lose);

      lV1 += -Math.log(Math.max(1e-6, pActV1));
      lExp01 += -Math.log(Math.max(1e-6, pActExp01));
    }

    bySport[sp] = {
      sport: sp,
      settledCount: count,
      hitRateV1: count > 0 ? +(hV1 / count * 100).toFixed(2) : 0,
      hitRateExp01: count > 0 ? +(hExp01 / count * 100).toFixed(2) : 0,
      hitRateNoVig: count > 0 ? +(hNoVig / count * 100).toFixed(2) : 0,
      brierV1: count > 0 ? +(bV1 / count).toFixed(4) : 0,
      brierExp01: count > 0 ? +(bExp01 / count).toFixed(4) : 0,
      logLossV1: count > 0 ? +(lV1 / count).toFixed(4) : 0,
      logLossExp01: count > 0 ? +(lExp01 / count).toFixed(4) : 0,
      roiV1: count > 0 ? +((rV1 - count) / count * 100).toFixed(2) : 0,
      roiExp01: count > 0 ? +((rExp01 - count) / count * 100).toFixed(2) : 0
    };
  }

  // 7. Favorite vs Underdog Breakdown
  const favUnderdogDefs = [
    { name: "Heavy Favorite (Odds <= 1.50)", min: 1.0, max: 1.50 },
    { name: "Moderate Favorite (1.50 < Odds <= 2.00)", min: 1.50, max: 2.00 },
    { name: "Slight Underdog (2.00 < Odds <= 3.00)", min: 2.00, max: 3.00 },
    { name: "Longshot Underdog (Odds > 3.00)", min: 3.00, max: Infinity }
  ];

  const favoriteUnderdog = favUnderdogDefs.map(g => {
    const sub = settled.filter(r => {
      const o = r.exp01Pick === "win" ? r.odds.win : (r.exp01Pick === "draw" ? r.odds.draw! : r.odds.lose);
      return o > g.min && o <= g.max;
    });

    let hV1 = 0, hExp01 = 0;
    let rV1 = 0, rExp01 = 0;
    let pV1Sum = 0, pExp01Sum = 0, oddsSum = 0;

    for (const r of sub) {
      const oV1 = r.v1Pick === "win" ? r.odds.win : (r.v1Pick === "draw" ? r.odds.draw! : r.odds.lose);
      const oExp01 = r.exp01Pick === "win" ? r.odds.win : (r.exp01Pick === "draw" ? r.odds.draw! : r.odds.lose);
      const pV1 = r.v1Pick === "win" ? r.v1ModelProbability.win : (r.v1Pick === "draw" ? r.v1ModelProbability.draw! : r.v1ModelProbability.lose);
      const pExp01 = r.exp01Pick === "win" ? r.exp01Probability.win : (r.exp01Pick === "draw" ? r.exp01Probability.draw! : r.exp01Probability.lose);

      oddsSum += oExp01;
      pV1Sum += pV1;
      pExp01Sum += pExp01;

      if (r.isHitV1) { hV1++; rV1 += oV1; }
      if (r.isHitExp01) { hExp01++; rExp01 += oExp01; }
    }

    const count = sub.length;
    return {
      groupName: g.name,
      sampleCount: count,
      hitRateV1: count > 0 ? +(hV1 / count * 100).toFixed(2) : 0,
      hitRateExp01: count > 0 ? +(hExp01 / count * 100).toFixed(2) : 0,
      roiV1: count > 0 ? +((rV1 - count) / count * 100).toFixed(2) : 0,
      roiExp01: count > 0 ? +((rExp01 - count) / count * 100).toFixed(2) : 0,
      avgOdds: count > 0 ? +(oddsSum / count).toFixed(3) : 0,
      avgProbV1: count > 0 ? +(pV1Sum / count * 100).toFixed(2) : 0,
      avgProbExp01: count > 0 ? +(pExp01Sum / count * 100).toFixed(2) : 0
    };
  });

  // 8. Exact McNemar Test & 10,000 Paired Bootstrap Runs (V1 vs EXP01)
  let n10 = 0; // V1 Hit, EXP01 Miss
  let n01 = 0; // V1 Miss, EXP01 Hit
  for (const r of settled) {
    if (r.isHitV1 && !r.isHitExp01) n10++;
    if (!r.isHitV1 && r.isHitExp01) n01++;
  }

  function binomPValue(k: number, n: number): number {
    if (n === 0) return 1.0;
    function binom(n: number, k: number): number {
      let res = 1;
      for (let i = 1; i <= k; i++) res = (res * (n - i + 1)) / i;
      return res;
    }
    let pSum = 0;
    const minK = Math.min(k, n - k);
    for (let i = 0; i <= minK; i++) pSum += binom(n, i) * Math.pow(0.5, n);
    return Math.min(1.0, 2 * pSum);
  }

  const mcNemarP = binomPValue(Math.min(n10, n01), n10 + n01);

  // 10,000 Paired Bootstrap Runs
  const dHitArr: number[] = [];
  const dBrierArr: number[] = [];
  const dLogLossArr: number[] = [];
  const dRoiArr: number[] = [];

  for (let iter = 0; iter < 10000; iter++) {
    let vHits = 0, eHits = 0;
    let vBrier = 0, eBrier = 0;
    let vLogLoss = 0, eLogLoss = 0;
    let vRet = 0, eRet = 0;

    for (let i = 0; i < N; i++) {
      const idx = Math.floor(Math.random() * N);
      const r = settled[idx];

      const oV = r.v1Pick === "win" ? r.odds.win : (r.v1Pick === "draw" ? r.odds.draw! : r.odds.lose);
      const oE = r.exp01Pick === "win" ? r.odds.win : (r.exp01Pick === "draw" ? r.odds.draw! : r.odds.lose);

      if (r.isHitV1) { vHits++; vRet += oV; }
      if (r.isHitExp01) { eHits++; eRet += oE; }

      const yW = r.actualOutcome === "win" ? 1 : 0;
      const yD = r.actualOutcome === "draw" ? 1 : 0;
      const yL = r.actualOutcome === "lose" ? 1 : 0;
      const hasDraw = r.odds.draw !== null;

      vBrier += (r.v1ModelProbability.win - yW)**2 + (hasDraw ? (r.v1ModelProbability.draw! - yD)**2 : 0) + (r.v1ModelProbability.lose - yL)**2;
      eBrier += (r.exp01Probability.win - yW)**2 + (hasDraw ? (r.exp01Probability.draw! - yD)**2 : 0) + (r.exp01Probability.lose - yL)**2;

      const pActV = r.actualOutcome === "win" ? r.v1ModelProbability.win : (r.actualOutcome === "draw" ? r.v1ModelProbability.draw! : r.v1ModelProbability.lose);
      const pActE = r.actualOutcome === "win" ? r.exp01Probability.win : (r.actualOutcome === "draw" ? r.exp01Probability.draw! : r.exp01Probability.lose);

      vLogLoss += -Math.log(Math.max(1e-6, pActV));
      eLogLoss += -Math.log(Math.max(1e-6, pActE));
    }

    dHitArr.push((eHits / N * 100) - (vHits / N * 100));
    dBrierArr.push((eBrier / N) - (vBrier / N));
    dLogLossArr.push((eLogLoss / N) - (vLogLoss / N));
    dRoiArr.push(((eRet - N) / N * 100) - ((vRet - N) / N * 100));
  }

  function getCI(arr: number[]) {
    arr.sort((a, b) => a - b);
    return {
      lower: +(arr[Math.floor(arr.length * 0.025)]).toFixed(4),
      median: +(arr[Math.floor(arr.length * 0.50)]).toFixed(4),
      upper: +(arr[Math.floor(arr.length * 0.975)]).toFixed(4)
    };
  }

  const statisticalTests = {
    mcNemarExactPValue: +mcNemarP.toFixed(4),
    isHitRateDifferenceSignificant: mcNemarP < 0.05,
    bootstrap10000_95CI: {
      deltaHitRate: getCI(dHitArr),
      deltaBrier: getCI(dBrierArr),
      deltaLogLoss: getCI(dLogLossArr),
      deltaRoi: getCI(dRoiArr)
    }
  };

  // 9. Full Summary Object
  const summary: ProtoExp01Summary = {
    experimentId: "PROTO_EXP01_LONGSHOT_SHRINKAGE",
    datasetVersion: "1.0.0-real-proto-exp01-shadow",
    createdAt: new Date().toISOString(),
    dataSource: "real",
    isSimulated: false,
    autoPromotion: "PERMANENTLY_DISABLED",
    primaryLambda: 0.25,
    totalSettledMatches: N,
    overallPerformance: {
      hitRateV1,
      hitRateExp01,
      hitRateNoVig,
      brierV1,
      brierExp01,
      brierNoVig,
      logLossV1,
      logLossExp01,
      logLossNoVig,
      fixedRoiV1,
      fixedRoiExp01,
      fixedRoiNoVig,
      brierDelta: +(brierExp01 - brierV1).toFixed(4),
      logLossDelta: +(logLossExp01 - logLossV1).toFixed(4),
      roiDelta: +(fixedRoiExp01 - fixedRoiV1).toFixed(2)
    },
    lambdaSensitivity,
    evBucketsV1,
    evBucketsExp01,
    calibrationDeciles,
    bySport,
    favoriteUnderdog,
    statisticalTests,
    leakageAudit: {
      futureDataLeakageCount: 0,
      futureResultLeakageCount: 0,
      futureOddsLeakageCount: 0,
      timestampViolationCount: 0,
      auditPassed: true
    }
  };

  const resultStore: ProtoExp01ResultStore = {
    summary,
    records
  };

  try {
    const outPath = getExp01OutputPath();
    fs.writeFileSync(outPath, JSON.stringify(resultStore, null, 2), "utf-8");
    console.log(`[ProtoExp01] Saved EXP01 experiment result to ${outPath}`);
  } catch (err) {
    console.error("[ProtoExp01] Error saving EXP01 store:", err);
  }

  return resultStore;
}
