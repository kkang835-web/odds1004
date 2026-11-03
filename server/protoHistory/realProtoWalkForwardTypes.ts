/**
 * SportsQuant Pro — PROTO Real Walk-Forward Types & Schema
 * 
 * [ABSOLUTE GUARDRAILS]
 * 1. REAL dataset only: data/realProtoHistoricalDataset.json
 * 2. Strict provenance: REAL vs DERIVED clearly labeled.
 * 3. Zero Look-Ahead leakage: predictionCreatedAt < matchStart <= settledAt.
 * 4. CLV = DISABLED, Benter = DISABLED.
 */

import { RealProtoSport, RealProtoGameType, RealProtoOutcome, RealProtoIntegrityStatus } from "./realProtoHistoryTypes.js";

export type ProtoMarketCategory = "Standard_1X2_ML" | "Handicap" | "UnderOver" | "SUM" | "UNSUPPORTED";

export interface ProtoWalkForwardPredictionRecord {
  matchId: string;
  year: number;
  round: number;
  matchNo: number;
  sport: RealProtoSport;
  league: string;
  homeTeam: string;
  awayTeam: string;
  market: ProtoMarketCategory;
  rawGameType: RealProtoGameType;
  handicapOrTarget: string | null;
  
  // REAL Source Inputs
  odds: {
    win: number;
    draw: number | null;
    lose: number;
  };
  
  // DERIVED Outputs (Pure mathematical & statistical transforms)
  impliedProbability: {
    win: number;
    draw: number | null;
    lose: number;
  };
  noVigProbability: {
    win: number;
    draw: number | null;
    lose: number;
  };
  modelProbability: {
    win: number;
    draw: number | null;
    lose: number;
  };
  ev: {
    win: number;
    draw: number | null;
    lose: number;
  };
  kelly: {
    win: number;
    draw: number | null;
    lose: number;
  };
  
  // Selections
  modelPick: "win" | "draw" | "lose";
  noVigPick: "win" | "draw" | "lose";
  maxEvPick: "win" | "draw" | "lose";
  maxEvValue: number;
  
  // Real Outcome & Settlement
  score: {
    home: number | null;
    away: number | null;
  } | null;
  actualOutcome: RealProtoOutcome;
  isHitModel: boolean | null;
  isHitNoVig: boolean | null;
  isHitMaxEv: boolean | null;
  
  // 1-unit Fixed Stake Bet Settlement for Model Max Pick
  payoutModel: number; // e.g. odds if won, 0 if lost, 1 if push/cancelled
  profitModel: number; // e.g. (odds - 1) if won, -1 if lost, 0 if push/cancelled
  
  // Provenance & Audit Timestamps
  predictionCreatedAt: string;
  settledAt: string;
  dataSource: "real";
  isSimulated: false;
  integrityStatus: RealProtoIntegrityStatus;
  isSettled: boolean;
}

export interface ProtoStrategyKPI {
  strategyName: string;
  totalBets: number;
  winningBets: number;
  losingBets: number;
  pushBets: number;
  hitRate: number; // %
  totalStaked: number;
  totalReturn: number;
  netProfit: number;
  roi: number; // %
  yieldPct: number; // %
  avgOdds: number;
  avgEV: number; // %
}

export interface ProtoEvBucketKPI {
  bucketName: string;
  minEv: number;
  maxEv: number;
  sampleCount: number;
  winningBets: number;
  losingBets: number;
  hitRate: number; // %
  avgEv: number; // %
  totalStaked: number;
  netProfit: number;
  roi: number; // %
}

export interface ProtoSportWalkForwardKPI {
  sport: RealProtoSport;
  totalMatches: number;
  validMatches: number;
  settledMatches: number;
  modelHitRate: number;
  noVigHitRate: number;
  brierScoreModel: number;
  brierScoreNoVig: number;
  logLossModel: number;
  logLossNoVig: number;
  fixedRoiModel: number;
  fixedRoiNoVig: number;
  avgEvModel: number;
}

export interface ProtoRoundWalkForwardKPI {
  year: number;
  round: number;
  masterSeq: string;
  matchCount: number;
  settledCount: number;
  modelHits: number;
  modelHitRate: number;
  noVigHits: number;
  noVigHitRate: number;
  brierScore: number;
  logLoss: number;
  roi: number;
  avgEV: number;
}

export interface ProtoWalkForwardSummary {
  datasetVersion: string;
  createdAt: string;
  dataSource: "real";
  isSimulated: false;
  
  // Scope Counts
  totalDatasetMatches: number;
  validDatasetMatches: number;
  usedInWalkForward: number;
  unsupportedMarkets: number;
  excludedRecords: number;
  
  // Market Breakdown
  marketBreakdown: {
    standardCount: number;
    handicapCount: number;
    underOverCount: number;
    sumCount: number;
    unsupportedCount: number;
  };
  
  // Prediction Accuracy Metrics (Standard Settled)
  overallPerformance: {
    settledCount: number;
    modelHitRate: number;
    noVigHitRate: number;
    brierScoreModel: number;
    brierScoreNoVig: number;
    logLossModel: number;
    logLossNoVig: number;
    brierDelta: number; // model - noVig (negative is better)
    logLossDelta: number; // model - noVig (negative is better)
  };
  
  // Strategies Evaluation
  strategies: {
    strategyA_ModelMaxProb: ProtoStrategyKPI;
    strategyB_PositiveEV: ProtoStrategyKPI;
    strategyC_EvGte2Pct: ProtoStrategyKPI;
    strategyD_EvGte5Pct: ProtoStrategyKPI;
    strategyNoVigBenchmark: ProtoStrategyKPI;
  };
  
  // EV Buckets
  evBuckets: ProtoEvBucketKPI[];
  
  // Breakdowns
  bySport: Record<string, ProtoSportWalkForwardKPI>;
  byRound: ProtoRoundWalkForwardKPI[];
  
  // Guardrails & Leakage Audit
  leakageAudit: {
    futureDataLeakageCount: 0;
    futureResultLeakageCount: 0;
    futureOddsLeakageCount: 0;
    timestampViolationCount: 0;
    auditPassed: boolean;
  };
  
  // Disabled Indicators
  clvStatus: "DISABLED";
  benterStatus: "DISABLED";
}

export interface ProtoWalkForwardResultStore {
  summary: ProtoWalkForwardSummary;
  records: ProtoWalkForwardPredictionRecord[];
}
