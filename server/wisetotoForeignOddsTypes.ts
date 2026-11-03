/**
 * SportsQuant Pro — WiseToto REAL Foreign Odds & Snapshot Type Definitions
 * 
 * [ABSOLUTE INVARIANTS]
 * 1. Provenance is strictly REAL_EXTERNAL only when captured directly from WiseToto HTML.
 * 2. CapturedAt represents the ingestion time of the response, NOT a bookmaker internal timestamp.
 * 3. Opening Odds, Previous Odds, Tick History, and CLV remain UNAVAILABLE until true time-series data is accumulated.
 * 4. Zero synthetic, zero mock, zero derived scaling (e.g. 0.9551) allowed in this layer.
 */

export type OddsMovement = "up" | "down" | "flat" | "unknown";

export interface ForeignBookmakerOdds {
  bookmaker: string;
  normalizedName: string;
  market: "1X2" | "MONEYLINE" | "HANDICAP" | "OVER_UNDER" | string;
  homeOdds: number | null;
  drawOdds: number | null;
  awayOdds: number | null;
  home?: number | null;
  draw?: number | null;
  away?: number | null;
  homeMovement: OddsMovement;
  drawMovement: OddsMovement;
  awayMovement: OddsMovement;
  movement?: {
    home: OddsMovement;
    draw: OddsMovement;
    away: OddsMovement;
  };
  source: "WiseToto";
  provenance: "REAL_EXTERNAL";
  capturedAt: string;
}

export interface DomesticBookmakerRate {
  provider: string; // e.g. "베트맨"
  homeOdds: number | null;
  drawOdds: number | null;
  awayOdds: number | null;
  homeVoteRate: number | null;
  drawVoteRate: number | null;
  awayVoteRate: number | null;
  refundRate: string | null;
  source: "WiseToto";
  provenance: "REAL_EXTERNAL";
  capturedAt: string;
}

export interface ForeignOddsSnapshot {
  snapshotId: string;
  matchId: string;
  gameId?: string;
  year?: number;
  round?: number;
  gameNo?: number;
  scheduleInfoSeq?: string;
  sport?: string;
  capturedAt: string;
  normalized15MinuteBucket: string;
  source: "WiseToto";
  sourceUrl: string;
  provenance: "REAL_EXTERNAL";
  bookmakers: ForeignBookmakerOdds[];
  domesticRate?: DomesticBookmakerRate | null;
  rawHash?: string;
}

export interface ForeignOddsOperationLog {
  logId: string;
  timestamp: string;
  event:
    | "FOREIGN_ODDS_SNAPSHOT_CYCLE_STARTED"
    | "FOREIGN_ODDS_SNAPSHOT_COLLECTED"
    | "FOREIGN_ODDS_SNAPSHOT_SKIPPED_DUPLICATE"
    | "FOREIGN_ODDS_SNAPSHOT_NO_DATA"
    | "FOREIGN_ODDS_SNAPSHOT_FAILED"
    | "FOREIGN_ODDS_SNAPSHOT_CYCLE_COMPLETED"
    | "SCHEDULER_STARTED"
    | "SCHEDULER_STOPPED";
  gameId?: string;
  gameNo?: number;
  message: string;
  metadata?: any;
}

export interface TimelineBucketItem {
  bucket: string;
  status: "CAPTURED" | "MISSING";
  snapshotId?: string;
  capturedAt?: string;
  bookmakerCount?: number;
}

export interface TimelineAuditResult {
  gameId: string;
  status: "COMPLETE" | "GAP_DETECTED" | "SERVER_DOWN_GAP" | "NO_FOREIGN_ODDS_AVAILABLE";
  totalSnapshots: number;
  firstCapturedAt: string | null;
  lastCapturedAt: string | null;
  expectedBuckets: number;
  capturedBuckets: number;
  missingBuckets: string[];
  timeline: TimelineBucketItem[];
}

export interface ForeignOddsCycleSummary {
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIP_OVERLAP";
  gamesScanned: number;
  gamesWithForeignOdds: number;
  snapshotsInserted: number;
  duplicatesSkipped: number;
  noData: number;
  errors: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface ForeignOddsSchedulerStatus {
  isRunning: boolean;
  isCycleActive: boolean;
  intervalMs: number;
  intervalMinutes: number;
  startedAt: string | null;
  lastRunStartedAt: string | null;
  lastRunCompletedAt: string | null;
  nextRunAt: string | null;
  totalScheduledRuns: number;
  successfulRuns: number;
  failedRuns: number;
  lastRunSummary: ForeignOddsCycleSummary | null;
  lastError: string | null;
}

export interface ParsedRateInfoResult {
  hasData: boolean;
  matchId: string;
  capturedAt: string;
  domestic: DomesticBookmakerRate | null;
  foreignBookmakers: ForeignBookmakerOdds[];
  rawDomesticTds: string[];
  rawForeignTds: string[];
  rawHash: string;
}
