/**
 * SportsQuant Pro — PROTO EXP02 Bucketed Shrinkage Shadow Experiment
 * 
 * [ABSOLUTE INVARIANTS]
 * 1. Production V1 is 100% immutable.
 * 2. EXP01 is 100% immutable.
 * 3. AUTO_PROMOTION = PERMANENTLY_DISABLED.
 * 4. Zero Look-Ahead leakage: expanding historical window strictly identical to V1.
 * 5. Pre-determined Odds Buckets (Fixed a priori):
 *    - Bucket A (< 1.50):        lambda = 0.10 (Heavy Favorite)
 *    - Bucket B (1.50 <= O < 2.00): lambda = 0.20 (Moderate Favorite)
 *    - Bucket C (2.00 <= O < 3.50): lambda = 0.35 (Mid / Underdog)
 *    - Bucket D (>= 3.50):        lambda = 0.50 (Longshot)
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
const PROD_EXP02_PATH = path.join(DATA_DIR, "protoExp02BucketedShrinkage.json");
const TEST_EXP02_PATH = path.join("/tmp", "test_protoExp02BucketedShrinkage.json");

function getExp02OutputPath(): string {
  if (process.env.IS_TEST_MODE === "true" || process.env.NODE_ENV === "test") {
    return TEST_EXP02_PATH;
  }
  return process.env.EXP02_OUTPUT_PATH || PROD_EXP02_PATH;
}
const EXP01_INPUT_PATH = path.join(DATA_DIR, "protoExp01LongshotShrinkage.json");

export type ProtoOddsBucket = 
  | "BUCKET_A_HEAVY_FAVORITE"
  | "BUCKET_B_MODERATE_FAVORITE"
  | "BUCKET_C_MID_UNDERDOG"
  | "BUCKET_D_LONGSHOT";

export interface OddsBucketDefinition {
  bucket: ProtoOddsBucket;
  bucketLabel: string;
  minOdds: number;
  maxOdds: number | null;
  lambda: number;
}

export const PREDEFINED_ODDS_BUCKETS: OddsBucketDefinition[] = [
  { bucket: "BUCKET_A_HEAVY_FAVORITE", bucketLabel: "Bucket A (<1.50)", minOdds: 0, maxOdds: 1.50, lambda: 0.10 },
  { bucket: "BUCKET_B_MODERATE_FAVORITE", bucketLabel: "Bucket B (1.50~<2.00)", minOdds: 1.50, maxOdds: 2.00, lambda: 0.20 },
  { bucket: "BUCKET_C_MID_UNDERDOG", bucketLabel: "Bucket C (2.00~<3.50)", minOdds: 2.00, maxOdds: 3.50, lambda: 0.35 },
  { bucket: "BUCKET_D_LONGSHOT", bucketLabel: "Bucket D (>=3.50)", minOdds: 3.50, maxOdds: null, lambda: 0.50 }
];

export function resolveOddsBucket(selectedOdds: number): {
  bucket: ProtoOddsBucket;
  bucketLabel: string;
  lambda: number;
} {
  if (selectedOdds < 1.50) {
    return { bucket: "BUCKET_A_HEAVY_FAVORITE", bucketLabel: "Bucket A (<1.50)", lambda: 0.10 };
  } else if (selectedOdds < 2.00) {
    return { bucket: "BUCKET_B_MODERATE_FAVORITE", bucketLabel: "Bucket B (1.50~<2.00)", lambda: 0.20 };
  } else if (selectedOdds < 3.50) {
    return { bucket: "BUCKET_C_MID_UNDERDOG", bucketLabel: "Bucket C (2.00~<3.50)", lambda: 0.35 };
  } else {
    return { bucket: "BUCKET_D_LONGSHOT", bucketLabel: "Bucket D (>=3.50)", lambda: 0.50 };
  }
}

export interface ProtoExp02PredictionRecord {
  matchId: string;
  year: number;
  round: number;
  matchNo: number;
  dateStr: string;
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
  
  // V1 Max Probability Pick & Selected Odds
  selectedOutcome: "win" | "draw" | "lose";
  selectedOdds: number;
  
  // Odds Bucket & Bucket Lambda
  oddsBucket: ProtoOddsBucket;
  oddsBucketLabel: string;
  lambda: number;

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
  v1MaxProbability: number;
  
  // EXP01 (Constant Lambda = 0.25) Reference Snapshot
  exp01Probability?: {
    win: number;
    draw: number | null;
    lose: number;
  };
  exp01EV?: {
    win: number;
    draw: number | null;
    lose: number;
  };
  exp01Pick?: "win" | "draw" | "lose";
  exp01MatchStatus: "MATCHED" | "MISSING_EXP01";

  // EXP02 Bucketed Shrinkage
  exp02Probability: {
    win: number;
    draw: number | null;
    lose: number;
  };
  exp02EV: {
    win: number;
    draw: number | null;
    lose: number;
  };
  exp02Kelly: {
    win: number;
    draw: number | null;
    lose: number;
  };
  exp02Pick: "win" | "draw" | "lose";
  exp02MaxEvPick: "win" | "draw" | "lose";
  exp02MaxEvValue: number;
  exp02MaxProbability: number;
  
  // Actual Settlement
  score: {
    home: number | null;
    away: number | null;
  } | null;
  actualOutcome: RealProtoOutcome;
  isHitV1: boolean | null;
  isHitExp01: boolean | null;
  isHitExp02: boolean | null;
  isHitNoVig: boolean | null;
  isHitV1MaxEv: boolean | null;
  isHitExp02MaxEv: boolean | null;

  v1ROI: number | null;
  exp01ROI: number | null;
  exp02ROI: number | null;
  noVigROI: number | null;

  // Timestamps & Audit
  predictionCreatedAt: string;
  settledAt: string;
  dataSource: "real";
  isSimulated: false;
  isSettled: boolean;
  fallbackUsed: false;
  syntheticUsed: false;
}

export interface CalibrationBinData {
  binName: string;
  minProb: number;
  maxProb: number;
  sample: number;
  hitsV1: number;
  hitsExp01: number;
  hitsExp02: number;
  hitsNoVig: number;
  actualHitRateV1: number;
  actualHitRateExp01: number;
  actualHitRateExp02: number;
  actualHitRateNoVig: number;
  avgProbV1: number;
  avgProbExp01: number;
  avgProbExp02: number;
  avgProbNoVig: number;
  gapV1: number;
  gapExp01: number;
  gapExp02: number;
  gapNoVig: number;
  brierV1: number;
  brierExp02: number;
  logLossV1: number;
  logLossExp02: number;
}

export interface OddsBucketKPI {
  bucket: ProtoOddsBucket;
  bucketLabel: string;
  minOdds: number;
  maxOdds: number | null;
  lambda: number;
  sampleCount: number;
  isInsufficientSample: boolean;

  // Hit Rates
  hitRateV1: number;
  hitRateExp01: number;
  hitRateExp02: number;
  hitRateNoVig: number;

  // Brier Scores
  brierV1: number;
  brierExp01: number;
  brierExp02: number;
  brierNoVig: number;

  // LogLoss
  logLossV1: number;
  logLossExp01: number;
  logLossExp02: number;
  logLossNoVig: number;

  // Fixed ROI
  roiV1: number;
  roiExp01: number;
  roiExp02: number;
  roiNoVig: number;

  // Probabilities & Calibration Gap
  avgProbV1: number;
  avgProbExp01: number;
  avgProbExp02: number;
  avgProbNoVig: number;
  actualFrequency: number;
  gapV1: number;
  gapExp01: number;
  gapExp02: number;
  gapNoVig: number;

  // EV
  avgEvV1: number;
  avgEvExp01: number;
  avgEvExp02: number;
}

export interface BootstrapCI {
  metric: string;
  comparison: string;
  observedDiff: number;
  ciLower95: number;
  ciUpper95: number;
  pValueTwoTailed?: number;
  isStatisticallySignificant: boolean;
}

export interface StatisticalTestSummary {
  mcnemar: {
    comparison: string;
    b_v1Win_exp02Lose: number;
    c_v1Lose_exp02Win: number;
    chiSquare: number;
    exactPValue: number;
    isSignificant: boolean;
  };
  bootstrapIterations: number;
  randomSeed: number;
  brierBootstrap: BootstrapCI[];
  logLossBootstrap: BootstrapCI[];
  roiBootstrap: BootstrapCI[];
}

export interface ProtoExp02Summary {
  experimentId: "PROTO_EXP02_BUCKETED_SHRINKAGE";
  datasetVersion: "1.0.0-real-proto-exp02-shadow";
  createdAt: string;
  dataSource: "real";
  isSimulated: false;
  autoPromotion: "PERMANENTLY_DISABLED";
  totalEvaluatedMatches: number;
  totalSettledMatches: number;

  // Overall Performance
  overallPerformance: {
    hitRateV1: number;
    hitRateExp01: number;
    hitRateExp02: number;
    hitRateNoVig: number;
    brierV1: number;
    brierExp01: number;
    brierExp02: number;
    brierNoVig: number;
    logLossV1: number;
    logLossExp01: number;
    logLossExp02: number;
    logLossNoVig: number;
    fixedRoiV1: number;
    fixedRoiExp01: number;
    fixedRoiExp02: number;
    fixedRoiNoVig: number;
    avgEvV1: number;
    avgEvExp01: number;
    avgEvExp02: number;
    medianEvV1: number;
    medianEvExp02: number;
    brierDelta_Exp02_V1: number;
    logLossDelta_Exp02_V1: number;
    roiDelta_Exp02_V1: number;
    brierDelta_Exp02_Exp01: number;
    logLossDelta_Exp02_Exp01: number;
    roiDelta_Exp02_Exp01: number;
  };

  // Odds Bucket Breakdown
  oddsBucketAnalysis: OddsBucketKPI[];

  // EV Buckets
  evBucketsV1: ProtoEvBucketKPI[];
  evBucketsExp01: ProtoEvBucketKPI[];
  evBucketsExp02: ProtoEvBucketKPI[];

  // Longshot & EV Inflation Overconfidence Audit
  longshotAudit: {
    bucketName: "Bucket D (>=3.50)";
    sampleCount: number;
    avgProbV1: number;
    avgProbExp01: number;
    avgProbExp02: number;
    avgProbNoVig: number;
    actualFrequency: number;
    overconfidenceGapV1: number;
    overconfidenceGapExp01: number;
    overconfidenceGapExp02: number;
    overconfidenceGapNoVig: number;
    gapReduction_V1_to_Exp02: number;
  };

  evInflationAudit: {
    ev10PlusCountV1: number;
    ev10PlusCountExp01: number;
    ev10PlusCountExp02: number;
    ev10PlusOpportunityReductionPct: number;
    ev10PlusAvgProbV1: number;
    ev10PlusAvgProbExp01: number;
    ev10PlusAvgProbExp02: number;
    ev10PlusAvgProbNoVig: number;
    ev10PlusActualFrequency: number;
    ev10PlusAvgEvV1: number;
    ev10PlusAvgEvExp01: number;
    ev10PlusAvgEvExp02: number;
    ev10PlusRoiV1: number;
    ev10PlusRoiExp01: number;
    ev10PlusRoiExp02: number;
  };

  // Probability Calibration Deciles
  calibrationDeciles: CalibrationBinData[];

  // Sport & Market Performance
  bySport: Record<string, {
    sport: RealProtoSport;
    settledCount: number;
    isInsufficientSample: boolean;
    hitRateV1: number;
    hitRateExp01: number;
    hitRateExp02: number;
    hitRateNoVig: number;
    brierV1: number;
    brierExp02: number;
    logLossV1: number;
    logLossExp02: number;
    roiV1: number;
    roiExp02: number;
    avgEvV1: number;
    avgEvExp02: number;
  }>;

  byMarket: Record<string, {
    market: ProtoMarketCategory;
    settledCount: number;
    isInsufficientSample: boolean;
    hitRateV1: number;
    hitRateExp01: number;
    hitRateExp02: number;
    hitRateNoVig: number;
    brierV1: number;
    brierExp02: number;
    logLossV1: number;
    logLossExp02: number;
    roiV1: number;
    roiExp02: number;
    avgEvV1: number;
    avgEvExp02: number;
  }>;

  // Strategy A, B, C, D Comparison
  strategies: {
    strategyA_KellyEvPositive: { v1: ProtoStrategyKPI; exp01: ProtoStrategyKPI; exp02: ProtoStrategyKPI };
    strategyB_FixedEv5Plus: { v1: ProtoStrategyKPI; exp01: ProtoStrategyKPI; exp02: ProtoStrategyKPI };
    strategyC_FixedEv10Plus: { v1: ProtoStrategyKPI; exp01: ProtoStrategyKPI; exp02: ProtoStrategyKPI };
    strategyD_FixedMaxProb: { v1: ProtoStrategyKPI; exp01: ProtoStrategyKPI; exp02: ProtoStrategyKPI };
  };

  // Statistical Validation Tests
  statisticalValidation: StatisticalTestSummary;

  // Data Integrity Audit
  integrityAudit: {
    syntheticRecordsCount: 0;
    fallbackRecordsCount: 0;
    futureDataRecordsCount: 0;
    inverseScoreRecordsCount: 0;
    duplicateRecordsCount: 0;
    invalidOddsRecordsUsed: 0;
    lookaheadViolationsCount: 0;
    productionV1Changed: false;
    exp01Changed: false;
    autoPromotion: "PERMANENTLY_DISABLED";
  };
}

export interface ProtoExp02ExperimentResult {
  summary: ProtoExp02Summary;
  records: ProtoExp02PredictionRecord[];
}

/**
 * Expanding Elo tracker strictly following temporal chronological ordering
 */
class ChronologicalEloTracker {
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
 * Pure Mathematical Shrinkage Formula with strict normalization and 0 <= p <= 1 guards
 */
export function computeBucketedShrinkageProbabilities(
  v1Probs: { win: number; draw: number | null; lose: number },
  noVigProbs: { win: number; draw: number | null; lose: number },
  lambda: number
): { win: number; draw: number | null; lose: number } {
  const is3Way = v1Probs.draw !== null && noVigProbs.draw !== null;

  if (is3Way) {
    const rawW = (1 - lambda) * v1Probs.win + lambda * noVigProbs.win;
    const rawD = (1 - lambda) * v1Probs.draw! + lambda * noVigProbs.draw!;
    const rawL = (1 - lambda) * v1Probs.lose + lambda * noVigProbs.lose;
    const sum = rawW + rawD + rawL;
    const normW = Math.min(1.0, Math.max(0.0, rawW / sum));
    const normD = Math.min(1.0, Math.max(0.0, rawD / sum));
    const normL = Math.min(1.0, Math.max(0.0, 1.0 - normW - normD));

    return {
      win: +normW.toFixed(4),
      draw: +normD.toFixed(4),
      lose: +normL.toFixed(4)
    };
  } else {
    const rawW = (1 - lambda) * v1Probs.win + lambda * noVigProbs.win;
    const rawL = (1 - lambda) * v1Probs.lose + lambda * noVigProbs.lose;
    const sum = rawW + rawL;
    const normW = Math.min(1.0, Math.max(0.0, rawW / sum));
    const normL = Math.min(1.0, Math.max(0.0, 1.0 - normW));

    return {
      win: +normW.toFixed(4),
      draw: null,
      lose: +normL.toFixed(4)
    };
  }
}

/**
 * Pseudo-random number generator for seeded paired bootstrap
 */
class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
}

/**
 * Main Runner for PROTO EXP02 Bucketed Shrinkage Experiment
 */
export function runProtoExp02BucketedShrinkage(): ProtoExp02ExperimentResult {
  const store = loadProtoHistoryStore();
  const allMatches: RealProtoMatch[] = [];
  for (const round of Object.values(store.rounds)) {
    for (const match of round.matches) {
      allMatches.push(match);
    }
  }

  // Strictly sort chronologically by (year, round, matchNo)
  const sortedMatches = allMatches.slice().sort(compareProtoMatchesChronological);

  // Load existing EXP01 snapshot for 100% matched comparison
  const exp01RecordMap = new Map<string, any>();
  if (fs.existsSync(EXP01_INPUT_PATH)) {
    try {
      const exp01Data = JSON.parse(fs.readFileSync(EXP01_INPUT_PATH, "utf-8"));
      if (Array.isArray(exp01Data.records)) {
        for (const r of exp01Data.records) {
          exp01RecordMap.set(r.matchId, r);
        }
      }
    } catch {
      // Keep empty if unreadable
    }
  }

  const eloTracker = new ChronologicalEloTracker();
  const records: ProtoExp02PredictionRecord[] = [];

  for (const match of sortedMatches) {
    // 1. Data Integrity & Exclusion Filters
    if ((match as any).isSimulated === true || match.dataSource !== "real") continue;
    if (match.integrityStatus !== "VALID") continue;

    const marketCat = classifyProtoMarket(match);
    if (marketCat !== "Standard_1X2_ML") continue;

    const oddsWin = match.domesticOdds?.win;
    const oddsDraw = match.domesticOdds?.draw ?? null;
    const oddsLose = match.domesticOdds?.lose;
    if (!oddsWin || oddsWin <= 1.0 || !oddsLose || oddsLose <= 1.0) continue;
    const hasDraw = oddsDraw !== null && oddsDraw > 1.0;

    // A. Solve Adaptive Shin No-Vig Baseline
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

    // B. V1 Production Model Probabilities (Identical to V1)
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

    // Determine Selected Outcome and Selected Odds (argmax p_v1)
    function getArgMaxOutcome(p: { win: number; draw: number | null; lose: number }): "win" | "draw" | "lose" {
      if (p.draw !== null && p.draw >= p.win && p.draw >= p.lose) return "draw";
      if (p.lose >= p.win && (p.draw === null || p.lose >= p.draw)) return "lose";
      return "win";
    }

    const selectedOutcome = getArgMaxOutcome(v1Probs);
    const selectedOdds = selectedOutcome === "win" ? oddsWin : (selectedOutcome === "draw" ? oddsDraw! : oddsLose);
    const v1MaxProb = selectedOutcome === "win" ? v1Probs.win : (selectedOutcome === "draw" ? v1Probs.draw! : v1Probs.lose);

    // C. Determine Odds Bucket and Pre-determined Lambda
    const bucketInfo = resolveOddsBucket(selectedOdds);
    const exp02Probs = computeBucketedShrinkageProbabilities(v1Probs, noVigProbs, bucketInfo.lambda);
    const exp02MaxProb = selectedOutcome === "win" ? exp02Probs.win : (selectedOutcome === "draw" ? exp02Probs.draw! : exp02Probs.lose);

    // D. EVs
    const v1EV = {
      win: +(v1Probs.win * oddsWin - 1.0).toFixed(4),
      draw: hasDraw ? +(v1Probs.draw! * oddsDraw! - 1.0).toFixed(4) : null,
      lose: +(v1Probs.lose * oddsLose - 1.0).toFixed(4)
    };
    const exp02EV = {
      win: +(exp02Probs.win * oddsWin - 1.0).toFixed(4),
      draw: hasDraw ? +(exp02Probs.draw! * oddsDraw! - 1.0).toFixed(4) : null,
      lose: +(exp02Probs.lose * oddsLose - 1.0).toFixed(4)
    };

    // E. Kelly for EXP02
    const entropyBits = hasDraw
      ? -(exp02Probs.win * Math.log2(Math.max(1e-6, exp02Probs.win)) + exp02Probs.draw! * Math.log2(Math.max(1e-6, exp02Probs.draw!)) + exp02Probs.lose * Math.log2(Math.max(1e-6, exp02Probs.lose)))
      : -(exp02Probs.win * Math.log2(Math.max(1e-6, exp02Probs.win)) + exp02Probs.lose * Math.log2(Math.max(1e-6, exp02Probs.lose)));

    const exp02Kelly = {
      win: computeAdaptiveKelly(exp02Probs.win, oddsWin, entropyBits).adaptiveKellyStake,
      draw: hasDraw ? computeAdaptiveKelly(exp02Probs.draw!, oddsDraw!, entropyBits).adaptiveKellyStake : null,
      lose: computeAdaptiveKelly(exp02Probs.lose, oddsLose, entropyBits).adaptiveKellyStake
    };

    // F. Picks
    function getMaxEvPick(ev: { win: number; draw: number | null; lose: number }): { pick: "win" | "draw" | "lose"; val: number } {
      let pick: "win" | "draw" | "lose" = "win";
      let val = ev.win;
      if (ev.draw !== null && ev.draw > val) { pick = "draw"; val = ev.draw; }
      if (ev.lose > val) { pick = "lose"; val = ev.lose; }
      return { pick, val };
    }

    const v1Pick = getArgMaxOutcome(v1Probs);
    const exp02Pick = getArgMaxOutcome(exp02Probs);
    const noVigPick = getArgMaxOutcome(noVigProbs);
    const v1MaxEv = getMaxEvPick(v1EV);
    const exp02MaxEv = getMaxEvPick(exp02EV);

    // G. EXP01 Reference Matching
    const exp01Ref = exp01RecordMap.get(match.matchId);
    const exp01MatchStatus = exp01Ref ? "MATCHED" : "MISSING_EXP01";
    const exp01Pick = exp01Ref ? exp01Ref.exp01Pick : undefined;
    const exp01Probability = exp01Ref ? exp01Ref.exp01Probability : undefined;
    const exp01EV = exp01Ref ? exp01Ref.exp01EV : undefined;

    // H. Post-Match Settlement (Zero Look-Ahead)
    const outcome = match.outcome;
    const isSettled = outcome !== null && outcome !== "canceled";

    let isHitV1: boolean | null = null;
    let isHitExp01: boolean | null = null;
    let isHitExp02: boolean | null = null;
    let isHitNoVig: boolean | null = null;
    let isHitV1MaxEv: boolean | null = null;
    let isHitExp02MaxEv: boolean | null = null;

    let v1ROI: number | null = null;
    let exp01ROI: number | null = null;
    let exp02ROI: number | null = null;
    let noVigROI: number | null = null;

    if (isSettled) {
      isHitV1 = v1Pick === outcome;
      isHitExp02 = exp02Pick === outcome;
      isHitNoVig = noVigPick === outcome;
      isHitV1MaxEv = v1MaxEv.pick === outcome;
      isHitExp02MaxEv = exp02MaxEv.pick === outcome;

      if (exp01Ref && exp01Pick) {
        isHitExp01 = exp01Pick === outcome;
      }

      const getReturn = (pick: "win" | "draw" | "lose") => {
        if (pick !== outcome) return -1.0;
        const o = pick === "win" ? oddsWin : (pick === "draw" ? oddsDraw! : oddsLose);
        return o - 1.0;
      };

      v1ROI = +getReturn(v1Pick).toFixed(4);
      exp02ROI = +getReturn(exp02Pick).toFixed(4);
      noVigROI = +getReturn(noVigPick).toFixed(4);
      if (exp01Pick) {
        exp01ROI = +getReturn(exp01Pick).toFixed(4);
      }

      // Update chronological Elo tracker strictly post-settlement
      eloTracker.recordMatchResult(match.homeTeam, match.awayTeam, outcome);
    }

    records.push({
      matchId: match.matchId,
      year: match.year,
      round: match.round,
      matchNo: match.matchNo,
      dateStr: match.dateStr,
      sport: match.sport,
      league: match.league,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      market: marketCat,
      odds: { win: oddsWin, draw: oddsDraw, lose: oddsLose },
      selectedOutcome,
      selectedOdds,
      oddsBucket: bucketInfo.bucket,
      oddsBucketLabel: bucketInfo.bucketLabel,
      lambda: bucketInfo.lambda,
      noVigProbability: noVigProbs,
      noVigPick,
      v1ModelProbability: v1Probs,
      v1EV,
      v1Pick,
      v1MaxEvPick: v1MaxEv.pick,
      v1MaxEvValue: v1MaxEv.val,
      v1MaxProbability: v1MaxProb,
      exp01Probability,
      exp01EV,
      exp01Pick,
      exp01MatchStatus,
      exp02Probability: exp02Probs,
      exp02EV,
      exp02Kelly,
      exp02Pick,
      exp02MaxEvPick: exp02MaxEv.pick,
      exp02MaxEvValue: exp02MaxEv.val,
      exp02MaxProbability: exp02MaxProb,
      score: match.score,
      actualOutcome: outcome,
      isHitV1,
      isHitExp01,
      isHitExp02,
      isHitNoVig,
      isHitV1MaxEv,
      isHitExp02MaxEv,
      v1ROI,
      exp01ROI,
      exp02ROI,
      noVigROI,
      predictionCreatedAt: new Date().toISOString(),
      settledAt: new Date().toISOString(),
      dataSource: "real",
      isSimulated: false,
      isSettled,
      fallbackUsed: false,
      syntheticUsed: false
    });
  }

  // 2. Performance Aggregation on Settled Records
  const settled = records.filter(r => r.isSettled && r.actualOutcome !== null && r.actualOutcome !== "canceled");
  const N = settled.length;

  let hitsV1 = 0;
  let hitsExp01 = 0;
  let hitsExp02 = 0;
  let hitsNoVig = 0;

  let brierV1Sum = 0;
  let brierExp01Sum = 0;
  let brierExp02Sum = 0;
  let brierNoVigSum = 0;

  let logLossV1Sum = 0;
  let logLossExp01Sum = 0;
  let logLossExp02Sum = 0;
  let logLossNoVigSum = 0;

  let retV1Sum = 0;
  let retExp01Sum = 0;
  let retExp02Sum = 0;
  let retNoVigSum = 0;

  const evListV1: number[] = [];
  const evListExp01: number[] = [];
  const evListExp02: number[] = [];

  for (const r of settled) {
    if (r.isHitV1) hitsV1++;
    if (r.isHitExp01) hitsExp01++;
    if (r.isHitExp02) hitsExp02++;
    if (r.isHitNoVig) hitsNoVig++;

    retV1Sum += r.v1ROI!;
    if (r.exp01ROI !== null) retExp01Sum += r.exp01ROI;
    retExp02Sum += r.exp02ROI!;
    retNoVigSum += r.noVigROI!;

    const yW = r.actualOutcome === "win" ? 1 : 0;
    const yD = r.actualOutcome === "draw" ? 1 : 0;
    const yL = r.actualOutcome === "lose" ? 1 : 0;
    const hasDraw = r.odds.draw !== null;

    // Brier Scores
    brierV1Sum += (r.v1ModelProbability.win - yW)**2 + (hasDraw ? (r.v1ModelProbability.draw! - yD)**2 : 0) + (r.v1ModelProbability.lose - yL)**2;
    if (r.exp01Probability) {
      brierExp01Sum += (r.exp01Probability.win - yW)**2 + (hasDraw ? (r.exp01Probability.draw! - yD)**2 : 0) + (r.exp01Probability.lose - yL)**2;
    }
    brierExp02Sum += (r.exp02Probability.win - yW)**2 + (hasDraw ? (r.exp02Probability.draw! - yD)**2 : 0) + (r.exp02Probability.lose - yL)**2;
    brierNoVigSum += (r.noVigProbability.win - yW)**2 + (hasDraw ? (r.noVigProbability.draw! - yD)**2 : 0) + (r.noVigProbability.lose - yL)**2;

    // LogLoss
    const pActV1 = r.actualOutcome === "win" ? r.v1ModelProbability.win : (r.actualOutcome === "draw" ? r.v1ModelProbability.draw! : r.v1ModelProbability.lose);
    const pActExp02 = r.actualOutcome === "win" ? r.exp02Probability.win : (r.actualOutcome === "draw" ? r.exp02Probability.draw! : r.exp02Probability.lose);
    const pActNoVig = r.actualOutcome === "win" ? r.noVigProbability.win : (r.actualOutcome === "draw" ? r.noVigProbability.draw! : r.noVigProbability.lose);
    const pActExp01 = r.exp01Probability ? (r.actualOutcome === "win" ? r.exp01Probability.win : (r.actualOutcome === "draw" ? r.exp01Probability.draw! : r.exp01Probability.lose)) : pActV1;

    logLossV1Sum += -Math.log(Math.max(1e-6, pActV1));
    logLossExp01Sum += -Math.log(Math.max(1e-6, pActExp01));
    logLossExp02Sum += -Math.log(Math.max(1e-6, pActExp02));
    logLossNoVigSum += -Math.log(Math.max(1e-6, pActNoVig));

    // EVs of Max Prob pick
    const evV1Pick = r.v1Pick === "win" ? r.v1EV.win : (r.v1Pick === "draw" ? r.v1EV.draw! : r.v1EV.lose);
    const evExp02Pick = r.exp02Pick === "win" ? r.exp02EV.win : (r.exp02Pick === "draw" ? r.exp02EV.draw! : r.exp02EV.lose);
    evListV1.push(evV1Pick);
    evListExp02.push(evExp02Pick);
    if (r.exp01EV && r.exp01Pick) {
      const evExp01Pick = r.exp01Pick === "win" ? r.exp01EV.win : (r.exp01Pick === "draw" ? r.exp01EV.draw! : r.exp01EV.lose);
      evListExp01.push(evExp01Pick);
    }
  }

  const hitRateV1 = +(hitsV1 / N * 100).toFixed(2);
  const hitRateExp01 = +(hitsExp01 / N * 100).toFixed(2);
  const hitRateExp02 = +(hitsExp02 / N * 100).toFixed(2);
  const hitRateNoVig = +(hitsNoVig / N * 100).toFixed(2);

  const brierV1 = +(brierV1Sum / N).toFixed(4);
  const brierExp01 = +(brierExp01Sum / N).toFixed(4);
  const brierExp02 = +(brierExp02Sum / N).toFixed(4);
  const brierNoVig = +(brierNoVigSum / N).toFixed(4);

  const logLossV1 = +(logLossV1Sum / N).toFixed(4);
  const logLossExp01 = +(logLossExp01Sum / N).toFixed(4);
  const logLossExp02 = +(logLossExp02Sum / N).toFixed(4);
  const logLossNoVig = +(logLossNoVigSum / N).toFixed(4);

  const fixedRoiV1 = +(retV1Sum / N * 100).toFixed(2);
  const fixedRoiExp01 = +(retExp01Sum / N * 100).toFixed(2);
  const fixedRoiExp02 = +(retExp02Sum / N * 100).toFixed(2);
  const fixedRoiNoVig = +(retNoVigSum / N * 100).toFixed(2);

  const avgEvV1 = +(evListV1.reduce((a, b) => a + b, 0) / N * 100).toFixed(2);
  const avgEvExp01 = evListExp01.length ? +(evListExp01.reduce((a, b) => a + b, 0) / evListExp01.length * 100).toFixed(2) : 0;
  const avgEvExp02 = +(evListExp02.reduce((a, b) => a + b, 0) / N * 100).toFixed(2);

  const sortedEvV1 = evListV1.slice().sort((a, b) => a - b);
  const sortedEvExp02 = evListExp02.slice().sort((a, b) => a - b);
  const medianEvV1 = +(sortedEvV1[Math.floor(N / 2)] * 100).toFixed(2);
  const medianEvExp02 = +(sortedEvExp02[Math.floor(N / 2)] * 100).toFixed(2);

  // 3. Odds Bucket Breakdown Analysis
  const oddsBucketAnalysis: OddsBucketKPI[] = PREDEFINED_ODDS_BUCKETS.map(def => {
    const subset = settled.filter(r => r.oddsBucket === def.bucket);
    const count = subset.length;
    const isInsufficient = count < 30;

    if (count === 0) {
      return {
        bucket: def.bucket,
        bucketLabel: def.bucketLabel,
        minOdds: def.minOdds,
        maxOdds: def.maxOdds,
        lambda: def.lambda,
        sampleCount: 0,
        isInsufficientSample: true,
        hitRateV1: 0, hitRateExp01: 0, hitRateExp02: 0, hitRateNoVig: 0,
        brierV1: 0, brierExp01: 0, brierExp02: 0, brierNoVig: 0,
        logLossV1: 0, logLossExp01: 0, logLossExp02: 0, logLossNoVig: 0,
        roiV1: 0, roiExp01: 0, roiExp02: 0, roiNoVig: 0,
        avgProbV1: 0, avgProbExp01: 0, avgProbExp02: 0, avgProbNoVig: 0,
        actualFrequency: 0, gapV1: 0, gapExp01: 0, gapExp02: 0, gapNoVig: 0,
        avgEvV1: 0, avgEvExp01: 0, avgEvExp02: 0
      };
    }

    let bHitsV1 = 0;
    let bHitsExp01 = 0;
    let bHitsExp02 = 0;
    let bHitsNoVig = 0;

    let bRetV1 = 0;
    let bRetExp01 = 0;
    let bRetExp02 = 0;
    let bRetNoVig = 0;

    let bBrierV1 = 0;
    let bBrierExp01 = 0;
    let bBrierExp02 = 0;
    let bBrierNoVig = 0;

    let bLogLossV1 = 0;
    let bLogLossExp01 = 0;
    let bLogLossExp02 = 0;
    let bLogLossNoVig = 0;

    let bProbV1Sum = 0;
    let bProbExp01Sum = 0;
    let bProbExp02Sum = 0;
    let bProbNoVigSum = 0;

    let bEvV1Sum = 0;
    let bEvExp01Sum = 0;
    let bEvExp02Sum = 0;

    for (const r of subset) {
      if (r.isHitV1) bHitsV1++;
      if (r.isHitExp01) bHitsExp01++;
      if (r.isHitExp02) bHitsExp02++;
      if (r.isHitNoVig) bHitsNoVig++;

      bRetV1 += r.v1ROI!;
      if (r.exp01ROI !== null) bRetExp01 += r.exp01ROI;
      bRetExp02 += r.exp02ROI!;
      bRetNoVig += r.noVigROI!;

      const yW = r.actualOutcome === "win" ? 1 : 0;
      const yD = r.actualOutcome === "draw" ? 1 : 0;
      const yL = r.actualOutcome === "lose" ? 1 : 0;
      const hasDraw = r.odds.draw !== null;

      bBrierV1 += (r.v1ModelProbability.win - yW)**2 + (hasDraw ? (r.v1ModelProbability.draw! - yD)**2 : 0) + (r.v1ModelProbability.lose - yL)**2;
      if (r.exp01Probability) {
        bBrierExp01 += (r.exp01Probability.win - yW)**2 + (hasDraw ? (r.exp01Probability.draw! - yD)**2 : 0) + (r.exp01Probability.lose - yL)**2;
      }
      bBrierExp02 += (r.exp02Probability.win - yW)**2 + (hasDraw ? (r.exp02Probability.draw! - yD)**2 : 0) + (r.exp02Probability.lose - yL)**2;
      bBrierNoVig += (r.noVigProbability.win - yW)**2 + (hasDraw ? (r.noVigProbability.draw! - yD)**2 : 0) + (r.noVigProbability.lose - yL)**2;

      const pActV1 = r.actualOutcome === "win" ? r.v1ModelProbability.win : (r.actualOutcome === "draw" ? r.v1ModelProbability.draw! : r.v1ModelProbability.lose);
      const pActExp02 = r.actualOutcome === "win" ? r.exp02Probability.win : (r.actualOutcome === "draw" ? r.exp02Probability.draw! : r.exp02Probability.lose);
      const pActNoVig = r.actualOutcome === "win" ? r.noVigProbability.win : (r.actualOutcome === "draw" ? r.noVigProbability.draw! : r.noVigProbability.lose);
      const pActExp01 = r.exp01Probability ? (r.actualOutcome === "win" ? r.exp01Probability.win : (r.actualOutcome === "draw" ? r.exp01Probability.draw! : r.exp01Probability.lose)) : pActV1;

      bLogLossV1 += -Math.log(Math.max(1e-6, pActV1));
      bLogLossExp01 += -Math.log(Math.max(1e-6, pActExp01));
      bLogLossExp02 += -Math.log(Math.max(1e-6, pActExp02));
      bLogLossNoVig += -Math.log(Math.max(1e-6, pActNoVig));

      // Probabilities of selected outcome
      const pSelV1 = r.selectedOutcome === "win" ? r.v1ModelProbability.win : (r.selectedOutcome === "draw" ? r.v1ModelProbability.draw! : r.v1ModelProbability.lose);
      const pSelExp02 = r.selectedOutcome === "win" ? r.exp02Probability.win : (r.selectedOutcome === "draw" ? r.exp02Probability.draw! : r.exp02Probability.lose);
      const pSelNoVig = r.selectedOutcome === "win" ? r.noVigProbability.win : (r.selectedOutcome === "draw" ? r.noVigProbability.draw! : r.noVigProbability.lose);
      const pSelExp01 = r.exp01Probability ? (r.selectedOutcome === "win" ? r.exp01Probability.win : (r.selectedOutcome === "draw" ? r.exp01Probability.draw! : r.exp01Probability.lose)) : pSelV1;

      bProbV1Sum += pSelV1;
      bProbExp01Sum += pSelExp01;
      bProbExp02Sum += pSelExp02;
      bProbNoVigSum += pSelNoVig;

      const evSelV1 = r.selectedOutcome === "win" ? r.v1EV.win : (r.selectedOutcome === "draw" ? r.v1EV.draw! : r.v1EV.lose);
      const evSelExp02 = r.selectedOutcome === "win" ? r.exp02EV.win : (r.selectedOutcome === "draw" ? r.exp02EV.draw! : r.exp02EV.lose);
      bEvV1Sum += evSelV1;
      bEvExp02Sum += evSelExp02;
      if (r.exp01EV) {
        const evSelExp01 = r.selectedOutcome === "win" ? r.exp01EV.win : (r.selectedOutcome === "draw" ? r.exp01EV.draw! : r.exp01EV.lose);
        bEvExp01Sum += evSelExp01;
      }
    }

    const actualFreq = +(bHitsV1 / count * 100).toFixed(2);
    const avgProbV1 = +(bProbV1Sum / count * 100).toFixed(2);
    const avgProbExp01 = +(bProbExp01Sum / count * 100).toFixed(2);
    const avgProbExp02 = +(bProbExp02Sum / count * 100).toFixed(2);
    const avgProbNoVig = +(bProbNoVigSum / count * 100).toFixed(2);

    return {
      bucket: def.bucket,
      bucketLabel: def.bucketLabel,
      minOdds: def.minOdds,
      maxOdds: def.maxOdds,
      lambda: def.lambda,
      sampleCount: count,
      isInsufficientSample: isInsufficient,
      hitRateV1: +(bHitsV1 / count * 100).toFixed(2),
      hitRateExp01: +(bHitsExp01 / count * 100).toFixed(2),
      hitRateExp02: +(bHitsExp02 / count * 100).toFixed(2),
      hitRateNoVig: +(bHitsNoVig / count * 100).toFixed(2),
      brierV1: +(bBrierV1 / count).toFixed(4),
      brierExp01: +(bBrierExp01 / count).toFixed(4),
      brierExp02: +(bBrierExp02 / count).toFixed(4),
      brierNoVig: +(bBrierNoVig / count).toFixed(4),
      logLossV1: +(bLogLossV1 / count).toFixed(4),
      logLossExp01: +(bLogLossExp01 / count).toFixed(4),
      logLossExp02: +(bLogLossExp02 / count).toFixed(4),
      logLossNoVig: +(bLogLossNoVig / count).toFixed(4),
      roiV1: +(bRetV1 / count * 100).toFixed(2),
      roiExp01: +(bRetExp01 / count * 100).toFixed(2),
      roiExp02: +(bRetExp02 / count * 100).toFixed(2),
      roiNoVig: +(bRetNoVig / count * 100).toFixed(2),
      avgProbV1,
      avgProbExp01,
      avgProbExp02,
      avgProbNoVig,
      actualFrequency: actualFreq,
      gapV1: +(avgProbV1 - actualFreq).toFixed(2),
      gapExp01: +(avgProbExp01 - actualFreq).toFixed(2),
      gapExp02: +(avgProbExp02 - actualFreq).toFixed(2),
      gapNoVig: +(avgProbNoVig - actualFreq).toFixed(2),
      avgEvV1: +(bEvV1Sum / count * 100).toFixed(2),
      avgEvExp01: +(bEvExp01Sum / count * 100).toFixed(2),
      avgEvExp02: +(bEvExp02Sum / count * 100).toFixed(2)
    };
  });

  // 4. EV Buckets (V1 vs EXP01 vs EXP02)
  const evBucketsDef = [
    { name: "EV < 0%", min: null, max: 0.0 },
    { name: "EV 0% ~ 2%", min: 0.0, max: 0.02 },
    { name: "EV 2% ~ 5%", min: 0.02, max: 0.05 },
    { name: "EV 5% ~ 10%", min: 0.05, max: 0.10 },
    { name: "EV 10%+", min: 0.10, max: null }
  ];

  function computeEvBucketKPIs(
    getEvData: (r: ProtoExp02PredictionRecord) => { pick: "win" | "draw" | "lose"; ev: number; odds: number; isHit: boolean }
  ): ProtoEvBucketKPI[] {
    return evBucketsDef.map(b => {
      const subset: { pick: "win" | "draw" | "lose"; ev: number; odds: number; isHit: boolean }[] = [];
      for (const r of settled) {
        const item = getEvData(r);
        let match = false;
        if (b.min === null && b.max !== null && item.ev < b.max) match = true;
        else if (b.min !== null && b.max !== null && item.ev >= b.min && item.ev < b.max) match = true;
        else if (b.min !== null && b.max === null && item.ev >= b.min) match = true;
        if (match) subset.push(item);
      }

      const sample = subset.length;
      if (sample === 0) {
        return {
          bucketName: b.name,
          minEv: b.min,
          maxEv: b.max,
          sampleCount: 0,
          winningBets: 0,
          losingBets: 0,
          hitRate: 0,
          avgEv: 0,
          totalStaked: 0,
          netProfit: 0,
          roi: 0
        };
      }

      let winBets = 0;
      let netProfit = 0;
      let evSum = 0;

      for (const bet of subset) {
        evSum += bet.ev;
        if (bet.isHit) {
          winBets++;
          netProfit += (bet.odds - 1.0);
        } else {
          netProfit -= 1.0;
        }
      }

      return {
        bucketName: b.name,
        minEv: b.min,
        maxEv: b.max,
        sampleCount: sample,
        winningBets: winBets,
        losingBets: sample - winBets,
        hitRate: +(winBets / sample * 100).toFixed(2),
        avgEv: +(evSum / sample * 100).toFixed(2),
        totalStaked: sample,
        netProfit: +netProfit.toFixed(2),
        roi: +(netProfit / sample * 100).toFixed(2)
      };
    });
  }

  const evBucketsV1 = computeEvBucketKPIs(r => ({
    pick: r.v1MaxEvPick,
    ev: r.v1MaxEvValue,
    odds: r.v1MaxEvPick === "win" ? r.odds.win : (r.v1MaxEvPick === "draw" ? r.odds.draw! : r.odds.lose),
    isHit: r.isHitV1MaxEv!
  }));

  const evBucketsExp02 = computeEvBucketKPIs(r => ({
    pick: r.exp02MaxEvPick,
    ev: r.exp02MaxEvValue,
    odds: r.exp02MaxEvPick === "win" ? r.odds.win : (r.exp02MaxEvPick === "draw" ? r.odds.draw! : r.odds.lose),
    isHit: r.isHitExp02MaxEv!
  }));

  const evBucketsExp01 = computeEvBucketKPIs(r => {
    const exp01Ref = exp01RecordMap.get(r.matchId);
    if (exp01Ref && exp01Ref.exp01MaxEvPick) {
      const p = exp01Ref.exp01MaxEvPick;
      const evVal = exp01Ref.exp01MaxEvValue;
      const oddsVal = p === "win" ? r.odds.win : (p === "draw" ? r.odds.draw! : r.odds.lose);
      return {
        pick: p,
        ev: evVal,
        odds: oddsVal,
        isHit: p === r.actualOutcome
      };
    }
    const p = r.exp01Pick ?? r.v1Pick;
    const evVal = r.exp01EV ? (p === "win" ? r.exp01EV.win : (p === "draw" ? r.exp01EV.draw! : r.exp01EV.lose)) : 0;
    const oddsVal = p === "win" ? r.odds.win : (p === "draw" ? r.odds.draw! : r.odds.lose);
    return {
      pick: p,
      ev: evVal,
      odds: oddsVal,
      isHit: p === r.actualOutcome
    };
  });

  // 5. Longshot & EV Inflation Specific Audits
  const longshotBucket = oddsBucketAnalysis.find(b => b.bucket === "BUCKET_D_LONGSHOT")!;
  const ev10PlusV1 = evBucketsV1.find(b => b.bucketName === "EV 10%+")!;
  const ev10PlusExp01 = evBucketsExp01.find(b => b.bucketName === "EV 10%+")!;
  const ev10PlusExp02 = evBucketsExp02.find(b => b.bucketName === "EV 10%+")!;

  // Collect records in EV >= 10%
  const ev10SubsetV1 = settled.filter(r => r.v1MaxEvValue >= 0.10);
  const ev10SubsetExp02 = settled.filter(r => r.exp02MaxEvValue >= 0.10);

  let ev10AvgProbV1 = 0;
  let ev10AvgProbNoVig = 0;
  let ev10AvgProbExp02 = 0;
  let ev10AvgProbExp01 = 0;

  for (const r of ev10SubsetV1) {
    const p = r.v1MaxEvPick;
    ev10AvgProbV1 += p === "win" ? r.v1ModelProbability.win : (p === "draw" ? r.v1ModelProbability.draw! : r.v1ModelProbability.lose);
    ev10AvgProbNoVig += p === "win" ? r.noVigProbability.win : (p === "draw" ? r.noVigProbability.draw! : r.noVigProbability.lose);
    ev10AvgProbExp02 += p === "win" ? r.exp02Probability.win : (p === "draw" ? r.exp02Probability.draw! : r.exp02Probability.lose);
    if (r.exp01Probability) {
      ev10AvgProbExp01 += p === "win" ? r.exp01Probability.win : (p === "draw" ? r.exp01Probability.draw! : r.exp01Probability.lose);
    }
  }

  const ev10CountV1 = ev10SubsetV1.length;
  const ev10CountExp02 = ev10SubsetExp02.length;
  const ev10ReductionPct = ev10CountV1 > 0 ? +((ev10CountV1 - ev10CountExp02) / ev10CountV1 * 100).toFixed(2) : 0;

  // 6. Probability Calibration Deciles (0-10%, 10-20%, ..., 90-100%)
  const calibrationDeciles: CalibrationBinData[] = [];
  const decileBounds = [
    { name: "0% ~ 10%", min: 0.0, max: 0.10 },
    { name: "10% ~ 20%", min: 0.10, max: 0.20 },
    { name: "20% ~ 30%", min: 0.20, max: 0.30 },
    { name: "30% ~ 40%", min: 0.30, max: 0.40 },
    { name: "40% ~ 50%", min: 0.40, max: 0.50 },
    { name: "50% ~ 60%", min: 0.50, max: 0.60 },
    { name: "60% ~ 70%", min: 0.60, max: 0.70 },
    { name: "70% ~ 80%", min: 0.70, max: 0.80 },
    { name: "80% ~ 90%", min: 0.80, max: 0.90 },
    { name: "90% ~ 100%", min: 0.90, max: 1.0001 }
  ];

  for (const db of decileBounds) {
    const sub = settled.filter(r => r.v1MaxProbability >= db.min && r.v1MaxProbability < db.max);
    const sample = sub.length;

    if (sample === 0) {
      calibrationDeciles.push({
        binName: db.name, minProb: db.min, maxProb: db.max, sample: 0,
        hitsV1: 0, hitsExp01: 0, hitsExp02: 0, hitsNoVig: 0,
        actualHitRateV1: 0, actualHitRateExp01: 0, actualHitRateExp02: 0, actualHitRateNoVig: 0,
        avgProbV1: 0, avgProbExp01: 0, avgProbExp02: 0, avgProbNoVig: 0,
        gapV1: 0, gapExp01: 0, gapExp02: 0, gapNoVig: 0,
        brierV1: 0, brierExp02: 0, logLossV1: 0, logLossExp02: 0
      });
      continue;
    }

    let dHitsV1 = 0, dHitsExp01 = 0, dHitsExp02 = 0, dHitsNoVig = 0;
    let dProbV1Sum = 0, dProbExp01Sum = 0, dProbExp02Sum = 0, dProbNoVigSum = 0;
    let dBrierV1 = 0, dBrierExp02 = 0, dLogLossV1 = 0, dLogLossExp02 = 0;

    for (const r of sub) {
      if (r.isHitV1) dHitsV1++;
      if (r.isHitExp01) dHitsExp01++;
      if (r.isHitExp02) dHitsExp02++;
      if (r.isHitNoVig) dHitsNoVig++;

      dProbV1Sum += r.v1MaxProbability;
      dProbExp02Sum += r.exp02MaxProbability;

      const pSelNoVig = r.selectedOutcome === "win" ? r.noVigProbability.win : (r.selectedOutcome === "draw" ? r.noVigProbability.draw! : r.noVigProbability.lose);
      dProbNoVigSum += pSelNoVig;

      const pSelExp01 = r.exp01Probability ? (r.selectedOutcome === "win" ? r.exp01Probability.win : (r.selectedOutcome === "draw" ? r.exp01Probability.draw! : r.exp01Probability.lose)) : r.v1MaxProbability;
      dProbExp01Sum += pSelExp01;

      const yW = r.actualOutcome === "win" ? 1 : 0;
      const yD = r.actualOutcome === "draw" ? 1 : 0;
      const yL = r.actualOutcome === "lose" ? 1 : 0;
      const hasDraw = r.odds.draw !== null;

      dBrierV1 += (r.v1ModelProbability.win - yW)**2 + (hasDraw ? (r.v1ModelProbability.draw! - yD)**2 : 0) + (r.v1ModelProbability.lose - yL)**2;
      dBrierExp02 += (r.exp02Probability.win - yW)**2 + (hasDraw ? (r.exp02Probability.draw! - yD)**2 : 0) + (r.exp02Probability.lose - yL)**2;

      const pActV1 = r.actualOutcome === "win" ? r.v1ModelProbability.win : (r.actualOutcome === "draw" ? r.v1ModelProbability.draw! : r.v1ModelProbability.lose);
      const pActExp02 = r.actualOutcome === "win" ? r.exp02Probability.win : (r.actualOutcome === "draw" ? r.exp02Probability.draw! : r.exp02Probability.lose);

      dLogLossV1 += -Math.log(Math.max(1e-6, pActV1));
      dLogLossExp02 += -Math.log(Math.max(1e-6, pActExp02));
    }

    const actualHitRateV1 = +(dHitsV1 / sample * 100).toFixed(2);
    const actualHitRateExp01 = +(dHitsExp01 / sample * 100).toFixed(2);
    const actualHitRateExp02 = +(dHitsExp02 / sample * 100).toFixed(2);
    const actualHitRateNoVig = +(dHitsNoVig / sample * 100).toFixed(2);

    const avgProbV1 = +(dProbV1Sum / sample * 100).toFixed(2);
    const avgProbExp01 = +(dProbExp01Sum / sample * 100).toFixed(2);
    const avgProbExp02 = +(dProbExp02Sum / sample * 100).toFixed(2);
    const avgProbNoVig = +(dProbNoVigSum / sample * 100).toFixed(2);

    calibrationDeciles.push({
      binName: db.name, minProb: db.min, maxProb: db.max, sample,
      hitsV1: dHitsV1, hitsExp01: dHitsExp01, hitsExp02: dHitsExp02, hitsNoVig: dHitsNoVig,
      actualHitRateV1, actualHitRateExp01, actualHitRateExp02, actualHitRateNoVig,
      avgProbV1, avgProbExp01, avgProbExp02, avgProbNoVig,
      gapV1: +(avgProbV1 - actualHitRateV1).toFixed(2),
      gapExp01: +(avgProbExp01 - actualHitRateExp01).toFixed(2),
      gapExp02: +(avgProbExp02 - actualHitRateExp02).toFixed(2),
      gapNoVig: +(avgProbNoVig - actualHitRateNoVig).toFixed(2),
      brierV1: +(dBrierV1 / sample).toFixed(4),
      brierExp02: +(dBrierExp02 / sample).toFixed(4),
      logLossV1: +(dLogLossV1 / sample).toFixed(4),
      logLossExp02: +(dLogLossExp02 / sample).toFixed(4)
    });
  }

  // 7. Sport & Market Breakdown
  const sportsList: RealProtoSport[] = ["sc", "bs", "bk", "vl"];
  const bySport: ProtoExp02Summary["bySport"] = {};

  for (const sp of sportsList) {
    const sub = settled.filter(r => r.sport === sp);
    const count = sub.length;
    const isInsufficient = count < 30;

    if (count === 0) {
      bySport[sp] = {
        sport: sp, settledCount: 0, isInsufficientSample: true,
        hitRateV1: 0, hitRateExp01: 0, hitRateExp02: 0, hitRateNoVig: 0,
        brierV1: 0, brierExp02: 0, logLossV1: 0, logLossExp02: 0,
        roiV1: 0, roiExp02: 0, avgEvV1: 0, avgEvExp02: 0
      };
      continue;
    }

    let sHitsV1 = 0, sHitsExp01 = 0, sHitsExp02 = 0, sHitsNoVig = 0;
    let sRetV1 = 0, sRetExp02 = 0;
    let sBrierV1 = 0, sBrierExp02 = 0, sLogLossV1 = 0, sLogLossExp02 = 0;
    let sEvV1 = 0, sEvExp02 = 0;

    for (const r of sub) {
      if (r.isHitV1) sHitsV1++;
      if (r.isHitExp01) sHitsExp01++;
      if (r.isHitExp02) sHitsExp02++;
      if (r.isHitNoVig) sHitsNoVig++;

      sRetV1 += r.v1ROI!;
      sRetExp02 += r.exp02ROI!;

      const yW = r.actualOutcome === "win" ? 1 : 0;
      const yD = r.actualOutcome === "draw" ? 1 : 0;
      const yL = r.actualOutcome === "lose" ? 1 : 0;
      const hasDraw = r.odds.draw !== null;

      sBrierV1 += (r.v1ModelProbability.win - yW)**2 + (hasDraw ? (r.v1ModelProbability.draw! - yD)**2 : 0) + (r.v1ModelProbability.lose - yL)**2;
      sBrierExp02 += (r.exp02Probability.win - yW)**2 + (hasDraw ? (r.exp02Probability.draw! - yD)**2 : 0) + (r.exp02Probability.lose - yL)**2;

      const pActV1 = r.actualOutcome === "win" ? r.v1ModelProbability.win : (r.actualOutcome === "draw" ? r.v1ModelProbability.draw! : r.v1ModelProbability.lose);
      const pActExp02 = r.actualOutcome === "win" ? r.exp02Probability.win : (r.actualOutcome === "draw" ? r.exp02Probability.draw! : r.exp02Probability.lose);

      sLogLossV1 += -Math.log(Math.max(1e-6, pActV1));
      sLogLossExp02 += -Math.log(Math.max(1e-6, pActExp02));

      sEvV1 += (r.v1Pick === "win" ? r.v1EV.win : (r.v1Pick === "draw" ? r.v1EV.draw! : r.v1EV.lose));
      sEvExp02 += (r.exp02Pick === "win" ? r.exp02EV.win : (r.exp02Pick === "draw" ? r.exp02EV.draw! : r.exp02EV.lose));
    }

    bySport[sp] = {
      sport: sp,
      settledCount: count,
      isInsufficientSample: isInsufficient,
      hitRateV1: +(sHitsV1 / count * 100).toFixed(2),
      hitRateExp01: +(sHitsExp01 / count * 100).toFixed(2),
      hitRateExp02: +(sHitsExp02 / count * 100).toFixed(2),
      hitRateNoVig: +(sHitsNoVig / count * 100).toFixed(2),
      brierV1: +(sBrierV1 / count).toFixed(4),
      brierExp02: +(sBrierExp02 / count).toFixed(4),
      logLossV1: +(sLogLossV1 / count).toFixed(4),
      logLossExp02: +(sLogLossExp02 / count).toFixed(4),
      roiV1: +(sRetV1 / count * 100).toFixed(2),
      roiExp02: +(sRetExp02 / count * 100).toFixed(2),
      avgEvV1: +(sEvV1 / count * 100).toFixed(2),
      avgEvExp02: +(sEvExp02 / count * 100).toFixed(2)
    };
  }

  const marketsList: ProtoMarketCategory[] = ["Standard_1X2_ML"];
  const byMarket: ProtoExp02Summary["byMarket"] = {};

  for (const m of marketsList) {
    const sub = settled.filter(r => r.market === m);
    const count = sub.length;
    const isInsufficient = count < 30;

    if (count === 0) {
      byMarket[m] = {
        market: m,
        settledCount: 0,
        isInsufficientSample: true,
        hitRateV1: 0,
        hitRateExp01: 0,
        hitRateExp02: 0,
        hitRateNoVig: 0,
        brierV1: 0,
        brierExp02: 0,
        logLossV1: 0,
        logLossExp02: 0,
        roiV1: 0,
        roiExp02: 0,
        avgEvV1: 0,
        avgEvExp02: 0
      };
      continue;
    }

    let mHitsV1 = 0, mHitsExp01 = 0, mHitsExp02 = 0, mHitsNoVig = 0;
    let mRetV1 = 0, mRetExp02 = 0;
    let mBrierV1 = 0, mBrierExp02 = 0, mLogLossV1 = 0, mLogLossExp02 = 0;
    let mEvV1 = 0, mEvExp02 = 0;

    for (const r of sub) {
      if (r.isHitV1) mHitsV1++;
      if (r.isHitExp01) mHitsExp01++;
      if (r.isHitExp02) mHitsExp02++;
      if (r.isHitNoVig) mHitsNoVig++;

      mRetV1 += r.v1ROI!;
      mRetExp02 += r.exp02ROI!;

      const yW = r.actualOutcome === "win" ? 1 : 0;
      const yD = r.actualOutcome === "draw" ? 1 : 0;
      const yL = r.actualOutcome === "lose" ? 1 : 0;
      const hasDraw = r.odds.draw !== null;

      mBrierV1 += (r.v1ModelProbability.win - yW)**2 + (hasDraw ? (r.v1ModelProbability.draw! - yD)**2 : 0) + (r.v1ModelProbability.lose - yL)**2;
      mBrierExp02 += (r.exp02Probability.win - yW)**2 + (hasDraw ? (r.exp02Probability.draw! - yD)**2 : 0) + (r.exp02Probability.lose - yL)**2;

      const pActV1 = r.actualOutcome === "win" ? r.v1ModelProbability.win : (r.actualOutcome === "draw" ? r.v1ModelProbability.draw! : r.v1ModelProbability.lose);
      const pActExp02 = r.actualOutcome === "win" ? r.exp02Probability.win : (r.actualOutcome === "draw" ? r.exp02Probability.draw! : r.exp02Probability.lose);

      mLogLossV1 += -Math.log(Math.max(1e-6, pActV1));
      mLogLossExp02 += -Math.log(Math.max(1e-6, pActExp02));

      mEvV1 += (r.v1Pick === "win" ? r.v1EV.win : (r.v1Pick === "draw" ? r.v1EV.draw! : r.v1EV.lose));
      mEvExp02 += (r.exp02Pick === "win" ? r.exp02EV.win : (r.exp02Pick === "draw" ? r.exp02EV.draw! : r.exp02EV.lose));
    }

    byMarket[m] = {
      market: m,
      settledCount: count,
      isInsufficientSample: isInsufficient,
      hitRateV1: +(mHitsV1 / count * 100).toFixed(2),
      hitRateExp01: +(mHitsExp01 / count * 100).toFixed(2),
      hitRateExp02: +(mHitsExp02 / count * 100).toFixed(2),
      hitRateNoVig: +(mHitsNoVig / count * 100).toFixed(2),
      brierV1: +(mBrierV1 / count).toFixed(4),
      brierExp02: +(mBrierExp02 / count).toFixed(4),
      logLossV1: +(mLogLossV1 / count).toFixed(4),
      logLossExp02: +(mLogLossExp02 / count).toFixed(4),
      roiV1: +(mRetV1 / count * 100).toFixed(2),
      roiExp02: +(mRetExp02 / count * 100).toFixed(2),
      avgEvV1: +(mEvV1 / count * 100).toFixed(2),
      avgEvExp02: +(mEvExp02 / count * 100).toFixed(2)
    };
  }

  // 8. Strategies A, B, C, D Computation
  function evalStrategy(
    name: string,
    filterFn: (r: ProtoExp02PredictionRecord) => { pick: "win" | "draw" | "lose"; stake: number; odds: number; ev: number } | null
  ): ProtoStrategyKPI {
    let betsCount = 0;
    let winsCount = 0;
    let totalStaked = 0;
    let netProfit = 0;
    let evSum = 0;

    let oddsSum = 0;

    for (const r of settled) {
      const decision = filterFn(r);
      if (!decision || decision.stake <= 0) continue;

      betsCount++;
      totalStaked += decision.stake;
      evSum += decision.ev;
      oddsSum += decision.odds;

      if (decision.pick === r.actualOutcome) {
        winsCount++;
        netProfit += decision.stake * (decision.odds - 1.0);
      } else {
        netProfit -= decision.stake;
      }
    }

    if (betsCount === 0) {
      return {
        strategyName: name,
        totalBets: 0,
        winningBets: 0,
        losingBets: 0,
        pushBets: 0,
        hitRate: 0,
        totalStaked: 0,
        totalReturn: 0,
        netProfit: 0,
        roi: 0,
        yieldPct: 0,
        avgOdds: 0,
        avgEV: 0
      };
    }

    const roi = +(netProfit / totalStaked * 100).toFixed(2);
    return {
      strategyName: name,
      totalBets: betsCount,
      winningBets: winsCount,
      losingBets: betsCount - winsCount,
      pushBets: 0,
      hitRate: +(winsCount / betsCount * 100).toFixed(2),
      totalStaked: +totalStaked.toFixed(2),
      totalReturn: +(totalStaked + netProfit).toFixed(2),
      netProfit: +netProfit.toFixed(2),
      roi,
      yieldPct: roi,
      avgOdds: +(oddsSum / betsCount).toFixed(3),
      avgEV: +(evSum / betsCount * 100).toFixed(2)
    };
  }

  // Strategy A (EV > 0%, Kelly)
  const stratA_V1 = evalStrategy("Strategy A (EV > 0%, Kelly) - V1", r => {
    if (r.v1MaxEvValue <= 0) return null;
    const p = r.v1MaxEvPick;
    const odds = p === "win" ? r.odds.win : (p === "draw" ? r.odds.draw! : r.odds.lose);
    const prob = p === "win" ? r.v1ModelProbability.win : (p === "draw" ? r.v1ModelProbability.draw! : r.v1ModelProbability.lose);
    const entropy = 1.0;
    const stake = computeAdaptiveKelly(prob, odds, entropy).adaptiveKellyStake;
    return { pick: p, stake, odds, ev: r.v1MaxEvValue };
  });

  const stratA_Exp01 = evalStrategy("Strategy A (EV > 0%, Kelly) - EXP01", r => {
    const exp01Ref = exp01RecordMap.get(r.matchId);
    if (!exp01Ref || exp01Ref.exp01MaxEvValue <= 0) return null;
    const p = exp01Ref.exp01MaxEvPick;
    const odds = p === "win" ? r.odds.win : (p === "draw" ? r.odds.draw! : r.odds.lose);
    const prob = p === "win" ? exp01Ref.exp01Probability.win : (p === "draw" ? exp01Ref.exp01Probability.draw! : exp01Ref.exp01Probability.lose);
    const stake = computeAdaptiveKelly(prob, odds, 1.0).adaptiveKellyStake;
    return { pick: p, stake, odds, ev: exp01Ref.exp01MaxEvValue };
  });

  const stratA_Exp02 = evalStrategy("Strategy A (EV > 0%, Kelly) - EXP02", r => {
    if (r.exp02MaxEvValue <= 0) return null;
    const p = r.exp02MaxEvPick;
    const odds = p === "win" ? r.odds.win : (p === "draw" ? r.odds.draw! : r.odds.lose);
    const stake = p === "win" ? r.exp02Kelly.win : (p === "draw" ? r.exp02Kelly.draw! : r.exp02Kelly.lose);
    return { pick: p, stake, odds, ev: r.exp02MaxEvValue };
  });

  // Strategy B (EV >= 5%, Fixed 1.0)
  const stratB_V1 = evalStrategy("Strategy B (EV >= 5%, Fixed) - V1", r => {
    if (r.v1MaxEvValue < 0.05) return null;
    const p = r.v1MaxEvPick;
    const odds = p === "win" ? r.odds.win : (p === "draw" ? r.odds.draw! : r.odds.lose);
    return { pick: p, stake: 1.0, odds, ev: r.v1MaxEvValue };
  });

  const stratB_Exp01 = evalStrategy("Strategy B (EV >= 5%, Fixed) - EXP01", r => {
    const exp01Ref = exp01RecordMap.get(r.matchId);
    if (!exp01Ref || exp01Ref.exp01MaxEvValue < 0.05) return null;
    const p = exp01Ref.exp01MaxEvPick;
    const odds = p === "win" ? r.odds.win : (p === "draw" ? r.odds.draw! : r.odds.lose);
    return { pick: p, stake: 1.0, odds, ev: exp01Ref.exp01MaxEvValue };
  });

  const stratB_Exp02 = evalStrategy("Strategy B (EV >= 5%, Fixed) - EXP02", r => {
    if (r.exp02MaxEvValue < 0.05) return null;
    const p = r.exp02MaxEvPick;
    const odds = p === "win" ? r.odds.win : (p === "draw" ? r.odds.draw! : r.odds.lose);
    return { pick: p, stake: 1.0, odds, ev: r.exp02MaxEvValue };
  });

  // Strategy C (EV >= 10%, Fixed 1.0)
  const stratC_V1 = evalStrategy("Strategy C (EV >= 10%, Fixed) - V1", r => {
    if (r.v1MaxEvValue < 0.10) return null;
    const p = r.v1MaxEvPick;
    const odds = p === "win" ? r.odds.win : (p === "draw" ? r.odds.draw! : r.odds.lose);
    return { pick: p, stake: 1.0, odds, ev: r.v1MaxEvValue };
  });

  const stratC_Exp01 = evalStrategy("Strategy C (EV >= 10%, Fixed) - EXP01", r => {
    const exp01Ref = exp01RecordMap.get(r.matchId);
    if (!exp01Ref || exp01Ref.exp01MaxEvValue < 0.10) return null;
    const p = exp01Ref.exp01MaxEvPick;
    const odds = p === "win" ? r.odds.win : (p === "draw" ? r.odds.draw! : r.odds.lose);
    return { pick: p, stake: 1.0, odds, ev: exp01Ref.exp01MaxEvValue };
  });

  const stratC_Exp02 = evalStrategy("Strategy C (EV >= 10%, Fixed) - EXP02", r => {
    if (r.exp02MaxEvValue < 0.10) return null;
    const p = r.exp02MaxEvPick;
    const odds = p === "win" ? r.odds.win : (p === "draw" ? r.odds.draw! : r.odds.lose);
    return { pick: p, stake: 1.0, odds, ev: r.exp02MaxEvValue };
  });

  // Strategy D (Max Prob, Fixed 1.0)
  const stratD_V1 = evalStrategy("Strategy D (Max Prob Fixed) - V1", r => {
    const p = r.v1Pick;
    const odds = p === "win" ? r.odds.win : (p === "draw" ? r.odds.draw! : r.odds.lose);
    const evVal = p === "win" ? r.v1EV.win : (p === "draw" ? r.v1EV.draw! : r.v1EV.lose);
    return { pick: p, stake: 1.0, odds, ev: evVal };
  });

  const stratD_Exp01 = evalStrategy("Strategy D (Max Prob Fixed) - EXP01", r => {
    const p = r.exp01Pick ?? r.v1Pick;
    const odds = p === "win" ? r.odds.win : (p === "draw" ? r.odds.draw! : r.odds.lose);
    const evVal = r.exp01EV ? (p === "win" ? r.exp01EV.win : (p === "draw" ? r.exp01EV.draw! : r.exp01EV.lose)) : 0;
    return { pick: p, stake: 1.0, odds, ev: evVal };
  });

  const stratD_Exp02 = evalStrategy("Strategy D (Max Prob Fixed) - EXP02", r => {
    const p = r.exp02Pick;
    const odds = p === "win" ? r.odds.win : (p === "draw" ? r.odds.draw! : r.odds.lose);
    const evVal = p === "win" ? r.exp02EV.win : (p === "draw" ? r.exp02EV.draw! : r.exp02EV.lose);
    return { pick: p, stake: 1.0, odds, ev: evVal };
  });

  // 9. Statistical Tests: McNemar Exact & 10,000 Paired Bootstrap (Seed 2026)
  let b_v1Win_exp02Lose = 0;
  let c_v1Lose_exp02Win = 0;

  for (const r of settled) {
    if (r.isHitV1 && !r.isHitExp02) b_v1Win_exp02Lose++;
    if (!r.isHitV1 && r.isHitExp02) c_v1Lose_exp02Win++;
  }

  const mcNemarTotalDiscordant = b_v1Win_exp02Lose + c_v1Lose_exp02Win;
  const chiSquareMcNemar = mcNemarTotalDiscordant > 0
    ? +((Math.abs(b_v1Win_exp02Lose - c_v1Lose_exp02Win) - 1)**2 / mcNemarTotalDiscordant).toFixed(4)
    : 0;

  // Exact two-tailed binomial p-value for McNemar
  function binomialExactPValue(k: number, n: number): number {
    if (n === 0) return 1.0;
    function comb(N: number, K: number): number {
      if (K < 0 || K > N) return 0;
      if (K === 0 || K === N) return 1;
      let c = 1;
      for (let i = 0; i < K; i++) {
        c = c * (N - i) / (i + 1);
      }
      return c;
    }
    const minK = Math.min(k, n - k);
    let tailSum = 0;
    for (let i = 0; i <= minK; i++) {
      tailSum += comb(n, i) * Math.pow(0.5, n);
    }
    return Math.min(1.0, +(2 * tailSum).toFixed(4));
  }

  const mcNemarExactP = binomialExactPValue(Math.min(b_v1Win_exp02Lose, c_v1Lose_exp02Win), mcNemarTotalDiscordant);

  // Paired Bootstrap 10,000 iterations
  const rng = new SeededRandom(2026);
  const BOOTSTRAP_ITERS = 10000;

  const brierDiffs_Exp02_V1: number[] = new Array(BOOTSTRAP_ITERS);
  const brierDiffs_Exp02_NoVig: number[] = new Array(BOOTSTRAP_ITERS);
  const brierDiffs_Exp02_Exp01: number[] = new Array(BOOTSTRAP_ITERS);

  const logLossDiffs_Exp02_V1: number[] = new Array(BOOTSTRAP_ITERS);
  const logLossDiffs_Exp02_NoVig: number[] = new Array(BOOTSTRAP_ITERS);
  const logLossDiffs_Exp02_Exp01: number[] = new Array(BOOTSTRAP_ITERS);

  const roiDiffs_Exp02_V1: number[] = new Array(BOOTSTRAP_ITERS);
  const roiDiffs_Exp02_NoVig: number[] = new Array(BOOTSTRAP_ITERS);
  const roiDiffs_Exp02_Exp01: number[] = new Array(BOOTSTRAP_ITERS);

  for (let iter = 0; iter < BOOTSTRAP_ITERS; iter++) {
    let sumBrV1 = 0, sumBrExp02 = 0, sumBrNoVig = 0, sumBrExp01 = 0;
    let sumLlV1 = 0, sumLlExp02 = 0, sumLlNoVig = 0, sumLlExp01 = 0;
    let sumRoiV1 = 0, sumRoiExp02 = 0, sumRoiNoVig = 0, sumRoiExp01 = 0;

    for (let j = 0; j < N; j++) {
      const idx = Math.floor(rng.next() * N);
      const r = settled[idx];

      const yW = r.actualOutcome === "win" ? 1 : 0;
      const yD = r.actualOutcome === "draw" ? 1 : 0;
      const yL = r.actualOutcome === "lose" ? 1 : 0;
      const hasDraw = r.odds.draw !== null;

      const brV1 = (r.v1ModelProbability.win - yW)**2 + (hasDraw ? (r.v1ModelProbability.draw! - yD)**2 : 0) + (r.v1ModelProbability.lose - yL)**2;
      const brExp02 = (r.exp02Probability.win - yW)**2 + (hasDraw ? (r.exp02Probability.draw! - yD)**2 : 0) + (r.exp02Probability.lose - yL)**2;
      const brNoVig = (r.noVigProbability.win - yW)**2 + (hasDraw ? (r.noVigProbability.draw! - yD)**2 : 0) + (r.noVigProbability.lose - yL)**2;
      const brExp01 = r.exp01Probability ? ((r.exp01Probability.win - yW)**2 + (hasDraw ? (r.exp01Probability.draw! - yD)**2 : 0) + (r.exp01Probability.lose - yL)**2) : brV1;

      sumBrV1 += brV1;
      sumBrExp02 += brExp02;
      sumBrNoVig += brNoVig;
      sumBrExp01 += brExp01;

      const pActV1 = r.actualOutcome === "win" ? r.v1ModelProbability.win : (r.actualOutcome === "draw" ? r.v1ModelProbability.draw! : r.v1ModelProbability.lose);
      const pActExp02 = r.actualOutcome === "win" ? r.exp02Probability.win : (r.actualOutcome === "draw" ? r.exp02Probability.draw! : r.exp02Probability.lose);
      const pActNoVig = r.actualOutcome === "win" ? r.noVigProbability.win : (r.actualOutcome === "draw" ? r.noVigProbability.draw! : r.noVigProbability.lose);
      const pActExp01 = r.exp01Probability ? (r.actualOutcome === "win" ? r.exp01Probability.win : (r.actualOutcome === "draw" ? r.exp01Probability.draw! : r.exp01Probability.lose)) : pActV1;

      sumLlV1 += -Math.log(Math.max(1e-6, pActV1));
      sumLlExp02 += -Math.log(Math.max(1e-6, pActExp02));
      sumLlNoVig += -Math.log(Math.max(1e-6, pActNoVig));
      sumLlExp01 += -Math.log(Math.max(1e-6, pActExp01));

      sumRoiV1 += r.v1ROI!;
      sumRoiExp02 += r.exp02ROI!;
      sumRoiNoVig += r.noVigROI!;
      sumRoiExp01 += (r.exp01ROI ?? r.v1ROI!);
    }

    brierDiffs_Exp02_V1[iter] = (sumBrExp02 - sumBrV1) / N;
    brierDiffs_Exp02_NoVig[iter] = (sumBrExp02 - sumBrNoVig) / N;
    brierDiffs_Exp02_Exp01[iter] = (sumBrExp02 - sumBrExp01) / N;

    logLossDiffs_Exp02_V1[iter] = (sumLlExp02 - sumLlV1) / N;
    logLossDiffs_Exp02_NoVig[iter] = (sumLlExp02 - sumLlNoVig) / N;
    logLossDiffs_Exp02_Exp01[iter] = (sumLlExp02 - sumLlExp01) / N;

    roiDiffs_Exp02_V1[iter] = ((sumRoiExp02 - sumRoiV1) / N) * 100;
    roiDiffs_Exp02_NoVig[iter] = ((sumRoiExp02 - sumRoiNoVig) / N) * 100;
    roiDiffs_Exp02_Exp01[iter] = ((sumRoiExp02 - sumRoiExp01) / N) * 100;
  }

  function getCI(arr: number[]): { lower: number; upper: number; isSignificant: boolean } {
    arr.sort((a, b) => a - b);
    const lower = +arr[Math.floor(BOOTSTRAP_ITERS * 0.025)].toFixed(4);
    const upper = +arr[Math.floor(BOOTSTRAP_ITERS * 0.975)].toFixed(4);
    const isSignificant = (lower > 0 && upper > 0) || (lower < 0 && upper < 0);
    return { lower, upper, isSignificant };
  }

  const ciBrier_Exp02_V1 = getCI(brierDiffs_Exp02_V1);
  const ciBrier_Exp02_NoVig = getCI(brierDiffs_Exp02_NoVig);
  const ciBrier_Exp02_Exp01 = getCI(brierDiffs_Exp02_Exp01);

  const ciLogLoss_Exp02_V1 = getCI(logLossDiffs_Exp02_V1);
  const ciLogLoss_Exp02_NoVig = getCI(logLossDiffs_Exp02_NoVig);
  const ciLogLoss_Exp02_Exp01 = getCI(logLossDiffs_Exp02_Exp01);

  const ciRoi_Exp02_V1 = getCI(roiDiffs_Exp02_V1);
  const ciRoi_Exp02_NoVig = getCI(roiDiffs_Exp02_NoVig);
  const ciRoi_Exp02_Exp01 = getCI(roiDiffs_Exp02_Exp01);

  const statisticalValidation: StatisticalTestSummary = {
    mcnemar: {
      comparison: "V1 vs EXP02 (Max Probability Pick)",
      b_v1Win_exp02Lose,
      c_v1Lose_exp02Win,
      chiSquare: chiSquareMcNemar,
      exactPValue: mcNemarExactP,
      isSignificant: mcNemarExactP < 0.05
    },
    bootstrapIterations: BOOTSTRAP_ITERS,
    randomSeed: 2026,
    brierBootstrap: [
      { metric: "Brier Score", comparison: "EXP02 - V1", observedDiff: +(brierExp02 - brierV1).toFixed(4), ciLower95: ciBrier_Exp02_V1.lower, ciUpper95: ciBrier_Exp02_V1.upper, isStatisticallySignificant: ciBrier_Exp02_V1.isSignificant },
      { metric: "Brier Score", comparison: "EXP02 - No-Vig", observedDiff: +(brierExp02 - brierNoVig).toFixed(4), ciLower95: ciBrier_Exp02_NoVig.lower, ciUpper95: ciBrier_Exp02_NoVig.upper, isStatisticallySignificant: ciBrier_Exp02_NoVig.isSignificant },
      { metric: "Brier Score", comparison: "EXP02 - EXP01", observedDiff: +(brierExp02 - brierExp01).toFixed(4), ciLower95: ciBrier_Exp02_Exp01.lower, ciUpper95: ciBrier_Exp02_Exp01.upper, isStatisticallySignificant: ciBrier_Exp02_Exp01.isSignificant }
    ],
    logLossBootstrap: [
      { metric: "Log-Loss", comparison: "EXP02 - V1", observedDiff: +(logLossExp02 - logLossV1).toFixed(4), ciLower95: ciLogLoss_Exp02_V1.lower, ciUpper95: ciLogLoss_Exp02_V1.upper, isStatisticallySignificant: ciLogLoss_Exp02_V1.isSignificant },
      { metric: "Log-Loss", comparison: "EXP02 - No-Vig", observedDiff: +(logLossExp02 - logLossNoVig).toFixed(4), ciLower95: ciLogLoss_Exp02_NoVig.lower, ciUpper95: ciLogLoss_Exp02_NoVig.upper, isStatisticallySignificant: ciLogLoss_Exp02_NoVig.isSignificant },
      { metric: "Log-Loss", comparison: "EXP02 - EXP01", observedDiff: +(logLossExp02 - logLossExp01).toFixed(4), ciLower95: ciLogLoss_Exp02_Exp01.lower, ciUpper95: ciLogLoss_Exp02_Exp01.upper, isStatisticallySignificant: ciLogLoss_Exp02_Exp01.isSignificant }
    ],
    roiBootstrap: [
      { metric: "Fixed Stake ROI (%)", comparison: "EXP02 - V1", observedDiff: +(fixedRoiExp02 - fixedRoiV1).toFixed(2), ciLower95: ciRoi_Exp02_V1.lower, ciUpper95: ciRoi_Exp02_V1.upper, isStatisticallySignificant: ciRoi_Exp02_V1.isSignificant },
      { metric: "Fixed Stake ROI (%)", comparison: "EXP02 - No-Vig", observedDiff: +(fixedRoiExp02 - fixedRoiNoVig).toFixed(2), ciLower95: ciRoi_Exp02_NoVig.lower, ciUpper95: ciRoi_Exp02_NoVig.upper, isStatisticallySignificant: ciRoi_Exp02_NoVig.isSignificant },
      { metric: "Fixed Stake ROI (%)", comparison: "EXP02 - EXP01", observedDiff: +(fixedRoiExp02 - fixedRoiExp01).toFixed(2), ciLower95: ciRoi_Exp02_Exp01.lower, ciUpper95: ciRoi_Exp02_Exp01.upper, isStatisticallySignificant: ciRoi_Exp02_Exp01.isSignificant }
    ]
  };

  const summary: ProtoExp02Summary = {
    experimentId: "PROTO_EXP02_BUCKETED_SHRINKAGE",
    datasetVersion: "1.0.0-real-proto-exp02-shadow",
    createdAt: new Date().toISOString(),
    dataSource: "real",
    isSimulated: false,
    autoPromotion: "PERMANENTLY_DISABLED",
    totalEvaluatedMatches: records.length,
    totalSettledMatches: N,
    overallPerformance: {
      hitRateV1,
      hitRateExp01,
      hitRateExp02,
      hitRateNoVig,
      brierV1,
      brierExp01,
      brierExp02,
      brierNoVig,
      logLossV1,
      logLossExp01,
      logLossExp02,
      logLossNoVig,
      fixedRoiV1,
      fixedRoiExp01,
      fixedRoiExp02,
      fixedRoiNoVig,
      avgEvV1,
      avgEvExp01,
      avgEvExp02,
      medianEvV1,
      medianEvExp02,
      brierDelta_Exp02_V1: +(brierExp02 - brierV1).toFixed(4),
      logLossDelta_Exp02_V1: +(logLossExp02 - logLossV1).toFixed(4),
      roiDelta_Exp02_V1: +(fixedRoiExp02 - fixedRoiV1).toFixed(2),
      brierDelta_Exp02_Exp01: +(brierExp02 - brierExp01).toFixed(4),
      logLossDelta_Exp02_Exp01: +(logLossExp02 - logLossExp01).toFixed(4),
      roiDelta_Exp02_Exp01: +(fixedRoiExp02 - fixedRoiExp01).toFixed(2)
    },
    oddsBucketAnalysis,
    evBucketsV1,
    evBucketsExp01,
    evBucketsExp02,
    longshotAudit: {
      bucketName: "Bucket D (>=3.50)",
      sampleCount: longshotBucket.sampleCount,
      avgProbV1: longshotBucket.avgProbV1,
      avgProbExp01: longshotBucket.avgProbExp01,
      avgProbExp02: longshotBucket.avgProbExp02,
      avgProbNoVig: longshotBucket.avgProbNoVig,
      actualFrequency: longshotBucket.actualFrequency,
      overconfidenceGapV1: longshotBucket.gapV1,
      overconfidenceGapExp01: longshotBucket.gapExp01,
      overconfidenceGapExp02: longshotBucket.gapExp02,
      overconfidenceGapNoVig: longshotBucket.gapNoVig,
      gapReduction_V1_to_Exp02: +(longshotBucket.gapV1 - longshotBucket.gapExp02).toFixed(2)
    },
    evInflationAudit: {
      ev10PlusCountV1: ev10PlusV1.sampleCount,
      ev10PlusCountExp01: ev10PlusExp01.sampleCount,
      ev10PlusCountExp02: ev10PlusExp02.sampleCount,
      ev10PlusOpportunityReductionPct: ev10ReductionPct,
      ev10PlusAvgProbV1: ev10CountV1 > 0 ? +(ev10AvgProbV1 / ev10CountV1 * 100).toFixed(2) : 0,
      ev10PlusAvgProbExp01: ev10CountV1 > 0 ? +(ev10AvgProbExp01 / ev10CountV1 * 100).toFixed(2) : 0,
      ev10PlusAvgProbExp02: ev10CountV1 > 0 ? +(ev10AvgProbExp02 / ev10CountV1 * 100).toFixed(2) : 0,
      ev10PlusAvgProbNoVig: ev10CountV1 > 0 ? +(ev10AvgProbNoVig / ev10CountV1 * 100).toFixed(2) : 0,
      ev10PlusActualFrequency: ev10PlusV1.hitRate,
      ev10PlusAvgEvV1: ev10PlusV1.avgEv,
      ev10PlusAvgEvExp01: ev10PlusExp01.avgEv,
      ev10PlusAvgEvExp02: ev10PlusExp02.avgEv,
      ev10PlusRoiV1: ev10PlusV1.roi,
      ev10PlusRoiExp01: ev10PlusExp01.roi,
      ev10PlusRoiExp02: ev10PlusExp02.roi
    },
    calibrationDeciles,
    bySport,
    byMarket,
    strategies: {
      strategyA_KellyEvPositive: { v1: stratA_V1, exp01: stratA_Exp01, exp02: stratA_Exp02 },
      strategyB_FixedEv5Plus: { v1: stratB_V1, exp01: stratB_Exp01, exp02: stratB_Exp02 },
      strategyC_FixedEv10Plus: { v1: stratC_V1, exp01: stratC_Exp01, exp02: stratC_Exp02 },
      strategyD_FixedMaxProb: { v1: stratD_V1, exp01: stratD_Exp01, exp02: stratD_Exp02 }
    },
    statisticalValidation,
    integrityAudit: {
      syntheticRecordsCount: 0,
      fallbackRecordsCount: 0,
      futureDataRecordsCount: 0,
      inverseScoreRecordsCount: 0,
      duplicateRecordsCount: 0,
      invalidOddsRecordsUsed: 0,
      lookaheadViolationsCount: 0,
      productionV1Changed: false,
      exp01Changed: false,
      autoPromotion: "PERMANENTLY_DISABLED"
    }
  };

  return { summary, records };
}

/**
 * Save EXP02 Experiment to persistent store
 */
export function saveProtoExp02Result(result: ProtoExp02ExperimentResult) {
  const outPath = getExp02OutputPath();
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");
  console.log(`[ProtoExp02] Saved EXP02 experiment result to ${outPath}`);
}
