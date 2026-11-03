/**
 * SportsQuant Pro — Real PROTO Historical Data Types & Schema
 * 
 * [ABSOLUTE GUARDRAILS]
 * 1. Real data only: dataSource = "real", isSimulated = false.
 * 2. Real domestic official odds only (domWin, domDraw, domLose).
 * 3. Real score only from official source. If unconfirmed, score = null, outcome = null.
 * 4. Zero outcome-to-score reverse calculation.
 * 5. Zero synthetic or fallback generation.
 * 6. Completely separate from TOTO (data/realHistoricalDataset.json) and synthetic PROTO backtest.
 */

export type RealProtoGameType = "일반" | "핸디캡" | "언더오버" | "SUM" | "기타";

export type RealProtoSport = "sc" | "bs" | "bk" | "vl" | "etc";

export type RealProtoOutcome = "win" | "draw" | "lose" | "canceled" | null;

export type RealProtoIntegrityStatus = 
  | "VALID"
  | "UNAVAILABLE"
  | "MISMATCH"
  | "DUPLICATE"
  | "SYNTHETIC"
  | "INVALID_ODDS";

export interface RealProtoProvenance {
  sourceUrl: string;
  collectedAt: string; // ISO 8601
  requestContext: string;
  year: number;
  round: number;
  masterSeq: string;
  scheduleInfoSeq: string | null;
}

export interface RealProtoDomesticOdds {
  win: number | null;
  draw: number | null;
  lose: number | null;
}

export interface RealProtoScore {
  home: number | null;
  away: number | null;
}

export interface RealProtoMatch {
  matchId: string; // e.g. "proto_2026_115_5238"
  year: number;
  round: number;
  masterSeq: string;
  matchNo: number; // e.g. 5238
  sport: RealProtoSport;
  rawSport: string;
  dateStr: string;
  league: string;
  gameType: RealProtoGameType;
  handicapOrTarget: string | null;
  homeTeam: string;
  awayTeam: string;
  
  // Real domestic odds only
  domesticOdds: RealProtoDomesticOdds;
  
  // Real outcome & score only
  score: RealProtoScore | null;
  outcomeTag: string | null; // e.g. "홈승", "원정승", "무승부", "언더", "오버", etc.
  outcome: RealProtoOutcome;
  
  // Verification & Provenance
  integrityStatus: RealProtoIntegrityStatus;
  dataSource: "real";
  isSimulated: false;
  fallbackUsed: false;
  syntheticUsed: false;
  provenance: RealProtoProvenance;
}

export interface RealProtoRoundSummary {
  year: number;
  round: number;
  masterSeq: string;
  expectedMatchCount: number;
  actualMatchCount: number;
  validCount: number;
  unavailableCount: number;
  mismatchCount: number;
  duplicateCount: number;
  syntheticCount: number;
  invalidOddsCount: number;
  fallbackUsedCount: 0;
  collectedAt: string;
  sportsBreakdown: Record<string, number>;
}

export interface RealProtoRound {
  year: number;
  round: number;
  masterSeq: string;
  matches: RealProtoMatch[];
  summary: RealProtoRoundSummary;
}

export interface RealProtoDatasetStore {
  datasetVersion: string; // e.g. "1.0.0-real-proto-pilot"
  createdAt: string;
  updatedAt: string;
  dataSource: "wisetoto_official_real";
  rounds: Record<string, RealProtoRound>; // key: `${year}_${round}`
  metadata: {
    totalRounds: number;
    totalMatches: number;
    validMatches: number;
    unavailableMatches: number;
    mismatchMatches: number;
    duplicateMatches: number;
    syntheticMatches: 0;
    fallbackUsedMatches: 0;
  };
}
