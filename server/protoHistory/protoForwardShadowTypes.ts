/**
 * SportsQuant Pro — PROTO Forward Shadow Types
 * 
 * [ABSOLUTE INVARIANTS]
 * 1. Strictly isolated from historical backtest dataset.
 * 2. Dedicated storage in data/protoForwardShadowStore.json.
 * 3. Zero synthetic/fallback/look-ahead data.
 * 4. Production V1 is immutable. AUTO_PROMOTION = PERMANENTLY_DISABLED.
 */

import { RealProtoSport, RealProtoOutcome } from "./realProtoHistoryTypes.js";
import { ProtoMarketCategory } from "./realProtoWalkForwardTypes.js";
import { ProtoOddsBucket } from "./protoExp02BucketedShrinkage.js";

export type ProtoForwardShadowStatus = 
  | "PREDICTED" 
  | "RESULT_PENDING" 
  | "EVALUATED" 
  | "UNAVAILABLE" 
  | "INVALID"
  | "INELIGIBLE_RETROSPECTIVE"
  | "FORWARD_BLOCKED";

export type ForwardSampleSizeStatus =
  | "EARLY OBSERVATION"            // 0 ~ 99 settled
  | "INITIAL FORWARD SAMPLE"       // 100 ~ 299 settled
  | "ACCUMULATING"                 // 300 ~ 699 settled
  | "MEANINGFUL FORWARD SAMPLE"    // 700 ~ 999 settled
  | "STATISTICAL REVIEW ELIGIBLE"; // 1000+ settled

export interface ProtoForwardShadowPredictionRecord {
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

  // Selected Outcome & Odds (from argmax p_v1)
  selectedOutcome: "win" | "draw" | "lose";
  selectedOdds: number;
  oddsBucket: ProtoOddsBucket;
  oddsBucketLabel: string;
  lambdaExp02: number;

  // No-Vig Baseline
  noVigProbability: {
    win: number;
    draw: number | null;
    lose: number;
  };
  noVigPick: "win" | "draw" | "lose";

  // V1 Production Model Prediction Snapshot
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

  // EXP01 Shadow Prediction Snapshot (lambda = 0.25)
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
  exp01Pick: "win" | "draw" | "lose";
  exp01MaxEvPick: "win" | "draw" | "lose";
  exp01MaxEvValue: number;

  // EXP02 Bucketed Shrinkage Shadow Prediction Snapshot
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
  exp02Pick: "win" | "draw" | "lose";
  exp02MaxEvPick: "win" | "draw" | "lose";
  exp02MaxEvValue: number;

  // Timestamps & Immutability Audit
  predictionCreatedAt: string; // ISO string frozen before match start
  settledAt: string | null;     // ISO string recorded strictly upon official result confirmation
  resultPublishedAt?: string;  // Official publish time if provided
  snapshotHash?: string;       // Immutable checksum of frozen prediction fields

  // Integrity & Anti-Lookahead Flags
  dataSource: "real";
  isSimulated: false;
  fallbackUsed: false;
  syntheticUsed: false;
  lookaheadViolation: boolean;
  snapshotImmutabilityViolation?: boolean;
  snapshotStatus: ProtoForwardShadowStatus;

  // Post-Match Settlement (strictly null at prediction time)
  score: {
    home: number | null;
    away: number | null;
  } | null;
  actualOutcome: RealProtoOutcome;

  // Performance Metrics (calculated only post-settlement)
  isHitV1?: boolean;
  isHitExp01?: boolean;
  isHitExp02?: boolean;
  isHitNoVig?: boolean;
  isHitV1MaxEv?: boolean;
  isHitExp01MaxEv?: boolean;
  isHitExp02MaxEv?: boolean;

  roiV1?: number;
  roiExp01?: number;
  roiExp02?: number;
  roiNoVig?: number;

  brierV1?: number;
  brierExp01?: number;
  brierExp02?: number;
  brierNoVig?: number;

  logLossV1?: number;
  logLossExp01?: number;
  logLossExp02?: number;
  logLossNoVig?: number;
}

export interface ProtoAuditEvent {
  timestamp: string;
  year: number;
  round: number;
  matchId: string;
  eventType: 
    | "SNAPSHOT_MUTATION" 
    | "LOOKAHEAD_VIOLATION" 
    | "DUPLICATE_MATCH" 
    | "RETROSPECTIVE_PREDICTION" 
    | "INVALID_RESULT" 
    | "TEMPORAL_SEQUENCE_VIOLATION" 
    | "SYNTHETIC_RECORD" 
    | "FALLBACK_USED" 
    | "INVALID_ODDS" 
    | "INVERSE_SCORE" 
    | "INVALID_MARKET" 
    | "MISSING_TIMESTAMP"
    | "ROUND_DISCOVERED"
    | "ROUND_SYNC_STARTED"
    | "ROUND_SYNC_COMPLETED"
    | "SNAPSHOT_CREATED"
    | "SNAPSHOT_SKIPPED"
    | "SETTLEMENT_STARTED"
    | "SETTLEMENT_COMPLETED"
    | "SETTLEMENT_SKIPPED"
    | "KPI_UPDATED"
    | "KPI_DOUBLE_COUNT_BLOCKED"
    | "KPI_INTEGRITY_MISMATCH"
    | "ROUND_CLOSED"
    | "ROUND_BLOCKED"
    | "STALE_FORWARD_DATA"
    | "RUN_TIMEOUT"
    | "RUN_LOCK_REJECTED"
    | "RUN_CYCLE_STARTED"
    | "RUN_CYCLE_COMPLETED"
    | "SNAPSHOT_COVERAGE_WARNING"
    | "ROUND_COUNT_INCONSISTENCY";
  severity: "HIGH" | "MEDIUM" | "LOW";
  details: string;
}

export interface ProtoOperationLog {
  runId: string;
  startedAt: string;
  completedAt: string;
  discoveredRounds: number;
  syncedRounds: number;
  newSnapshots: number;
  skippedSnapshots: number;
  settlementCandidates: number;
  settledMatches: number;
  skippedSettlements: number;
  blockedMatches: number;
  integrityErrors: number;
  kpiUpdated: boolean;
  status: "SUCCESS" | "PARTIAL" | "BLOCKED" | "FAILED";
}

export interface ProtoForwardShadowRoundRecord {
  year: number;
  round: number;
  masterSeq: string;
  sourceUrl: string;
  syncedAt: string;
  allSettled: boolean;
  totalMatches: number;
  predictedCount: number;
  pendingCount: number;
  evaluatedCount: number;
  unavailableCount: number;
  invalidCount: number;
  status?: "ROUND_OPEN" | "ROUND_PARTIAL" | "ROUND_SETTLED" | "ROUND_BLOCKED";
  integrityGateStatus?: "FORWARD_ELIGIBLE" | "FORWARD_BLOCKED";
  syntheticRecords?: number;
  fallbackUsed?: number;
  invalidOddsUsed?: number;
  inverseScoreRecords?: number;
  lookaheadViolations?: number;
  duplicateRecords?: number;
  temporalSequenceViolations?: number;
  snapshotImmutabilityViolations?: number;
  roundKpiSnapshot?: Record<string, any>;
  matches: ProtoForwardShadowPredictionRecord[];
}

export interface PersistentSingleShotSchedule {
  scheduledRunId: string;
  scheduledAt: string;
  executeAt: string;
  delayMs: number;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "MISSED";
  runId?: string | null;
  completedAt?: string | null;
  error?: string | null;
}

export interface ProtoForwardShadowStoreData {
  version: "1.0.0-proto-forward-shadow";
  environment: "LIVE_SHADOW";
  createdAt: string;
  updatedAt: string;
  dataSource: "wisetoto_official_real";
  isSimulated: false;
  autoPromotion: "PERMANENTLY_DISABLED";
  productionModel: "PROTO_V1_PRODUCTION";
  shadowCandidates: ["PROTO_V2_EXP01_SHADOW", "PROTO_V2_EXP02_SHADOW"];
  benchmark: "NO_VIG_SHIN_BENCHMARK";
  
  rounds: Record<string, ProtoForwardShadowRoundRecord>;
  
  auditTotals: {
    totalSnapshots: number;
    predicted: number;
    pending: number;
    evaluated: number;
    unavailable: number;
    invalid: number;
    syntheticRecords: number;
    fallbackUsed: number;
    lookaheadViolations: number;
    temporalSequenceViolations: number;
    duplicateRecords: number;
    invalidOddsUsed: number;
    inverseScoreRecords: number;
    snapshotMutationRecords?: number;
    retrospectiveRecords?: number;
    invalidMarketRecords?: number;
    missingTimestampRecords?: number;
  };
  evaluationsRegistry?: Record<string, boolean>;
  operationLogs?: ProtoOperationLog[];
  auditEventLog?: ProtoAuditEvent[];
  singleShotSchedule?: PersistentSingleShotSchedule | null;
}

export interface ForwardModelKPI {
  modelName: string;
  hitRate: number;
  brierScore: number;
  logLoss: number;
  fixedRoi: number;
  averageEv: number;
  medianEv: number;
}

export interface ForwardSportKPI {
  sport: RealProtoSport;
  sampleCount: number;
  isInsufficientSample: boolean;
  v1: { hitRate: number; brier: number; logLoss: number; roi: number };
  exp01: { hitRate: number; brier: number; logLoss: number; roi: number };
  exp02: { hitRate: number; brier: number; logLoss: number; roi: number };
  noVig: { hitRate: number; brier: number; logLoss: number; roi: number };
}

export interface ForwardOddsBucketKPI {
  bucket: ProtoOddsBucket;
  bucketLabel: string;
  sampleCount: number;
  isInsufficientSample: boolean;
  v1Hit: number;
  exp01Hit: number;
  exp02Hit: number;
  noVigHit: number;
  v1Brier: number;
  exp01Brier: number;
  exp02Brier: number;
  noVigBrier: number;
  v1Roi: number;
  exp01Roi: number;
  exp02Roi: number;
  noVigRoi: number;
}

export interface ForwardEvBucketKPI {
  bucketName: string;
  sampleCount: number;
  v1Hit: number;
  exp01Hit: number;
  exp02Hit: number;
  v1Roi: number;
  exp01Roi: number;
  exp02Roi: number;
  v1AvgEv: number;
  exp01AvgEv: number;
  exp02AvgEv: number;
}

export interface ForwardBootstrapCI {
  metric: string;
  comparison: string;
  observedDiff: number;
  ciLower95: number;
  ciUpper95: number;
  isStatisticallySignificant: boolean;
}

export interface ForwardShadowEvaluationSummary {
  experimentId: "PROTO_REAL_FORWARD_SHADOW_V1";
  generatedAt: string;
  dataSource: "wisetoto_official_real";
  isSimulated: false;
  autoPromotion: "PERMANENTLY_DISABLED";
  productionDecision: "PRODUCTION V1 — KEEP";
  roundsList?: any[];
  
  sampleStatus: {
    stage: ForwardSampleSizeStatus;
    totalSnapshots: number;
    settledCount: number;
    pendingCount: number;
    unavailableCount: number;
    invalidCount: number;
    canMakeDefinitiveConclusion: boolean;
    sampleNotice: string;
  };

  overallKPI: {
    v1: ForwardModelKPI;
    exp01: ForwardModelKPI;
    exp02: ForwardModelKPI;
    noVig: ForwardModelKPI;
  };

  bySport: Record<string, ForwardSportKPI>;
  byOddsBucket: ForwardOddsBucketKPI[];
  byEvBucket: ForwardEvBucketKPI[];

  statisticalTests: {
    status: "INSUFFICIENT_SAMPLE" | "COMPUTED";
    mcnemar_V1_Exp01?: { exactPValue: number; isSignificant: boolean };
    mcnemar_V1_Exp02?: { exactPValue: number; isSignificant: boolean };
    bootstrapIterations: 10000;
    bootstrapSeed: 2026;
    bootstrapResults: ForwardBootstrapCI[];
  };

  integrityAudit: {
    syntheticRecords: number;
    fallbackUsed: number;
    lookaheadViolations: number;
    temporalSequenceViolations: number;
    duplicateRecords: number;
    invalidOddsUsed: number;
    inverseScoreRecords: number;
    snapshotMutationRecords?: number;
    retrospectiveRecords?: number;
    invalidMarketRecords?: number;
    missingTimestampRecords?: number;
    productionV1Changed: boolean;
    exp01Changed: boolean;
    exp02Changed: boolean;
    autoPromotion: "PERMANENTLY_DISABLED";
  };
  auditEventLog?: ProtoAuditEvent[];
}

export type HealthCheckStatus = "PASS" | "WARN" | "BLOCKED";

export interface ProtoForwardHealthChecks {
  roundDiscovery: HealthCheckStatus;
  sync: HealthCheckStatus;
  snapshot: HealthCheckStatus;
  settlement: HealthCheckStatus;
  audit: HealthCheckStatus;
  kpi: HealthCheckStatus;
  operationLog: HealthCheckStatus;
}

export interface RoundCoverageSummary {
  year: number;
  round: number;
  eligibleMatches: number;
  snapshotCreated: number;
  settled: number;
  pending: number;
  blocked: number;
  excluded: number;
  coveragePct: number;
  status: "PASS" | "SNAPSHOT_COVERAGE_WARNING" | "ROUND_COUNT_INCONSISTENCY";
  excludedReasons: {
    retrospective: number;
    invalidMarket: number;
    invalidOdds: number;
  };
  integrityGateStatus: "FORWARD_ELIGIBLE" | "FORWARD_BLOCKED";
}

export interface PendingSettlementDetail {
  totalPending: number;
  oldestPending: { matchId: string; round: string; dateStr: string; teamMatch: string } | null;
  latestPending: { matchId: string; round: string; dateStr: string; teamMatch: string } | null;
  pendingBySport: {
    soccer: number;
    baseball: number;
    basketball: number;
    volleyball: number;
  };
}

export interface ProtoForwardHealthResponse {
  systemStatus: "READY" | "DEGRADED" | "BLOCKED";
  latestRound: { year: number; round: number } | null;
  latestSync: string | null;
  latestSettlement: string | null;
  lastRun: string | null;
  lastRunStatus: "SUCCESS" | "PARTIAL" | "BLOCKED" | "FAILED" | "IDLE";

  settled: number;
  pending: number;
  blocked: number;

  synthetic: number;
  fallback: number;
  lookahead: number;
  retrospective: number;
  duplicates: number;
  snapshotMutation: number;
  timestampViolations: number;
  invalidOdds: number;
  inverseScore: number;
  officialResultViolations: number;

  healthChecks: ProtoForwardHealthChecks;

  idempotency: {
    duplicateSnapshot: number;
    duplicateSettlement: number;
    kpiDoubleCount: number;
    snapshotMutation: number;
    resultMutation: number;
  };

  dataQuality: {
    synthetic: number;
    fallback: number;
    lookahead: number;
    retrospective: number;
    invalidOdds: number;
    inverseScore: number;
    duplicate: number;
    snapshotHashViolation: number;
    timestampViolation: number;
    officialResultViolation: number;
  };

  sampleAccumulation: {
    settledCount: number;
    stage: ForwardSampleSizeStatus;
  };

  pendingDetails: PendingSettlementDetail;

  snapshotCoverage: {
    eligibleMatches: number;
    snapshotsCreated: number;
    coveragePct: number;
    status: "PASS" | "SNAPSHOT_COVERAGE_WARNING";
    excludedReasons: {
      retrospective: number;
      invalidMarket: number;
      invalidOdds: number;
    };
  };

  settlementCoverage: {
    eligible: number;
    settled: number;
    pending: number;
    blocked: number;
    excluded: number;
    isInconsistent: boolean;
  };

  roundsMonitor: RoundCoverageSummary[];
  staleDataCount: number;
  staleMatches: Array<{ matchId: string; round: string; reason: string }>;
}

export interface ProtoForwardExportData {
  exportedAt: string;
  version: string;
  environment: string;
  dataSource: string;
  autoPromotion: string;
  rounds: Record<string, ProtoForwardShadowRoundRecord>;
  auditTotals: Record<string, any>;
  operationLogs: ProtoOperationLog[];
  auditEventLog: ProtoAuditEvent[];
  kpiState: any;
}
