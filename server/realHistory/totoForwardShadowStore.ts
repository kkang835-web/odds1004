/**
 * SportsQuant Pro — TOTO Forward Shadow Store
 * 
 * [ABSOLUTE GUARDRAILS]
 * 1. Strictly isolated from data/realHistoricalDataset.json (never mutates historical backtest dataset).
 * 2. Dedicated persistence in data/totoForwardShadowStore.json.
 * 3. Enforces zero synthetic data, zero simulated data, and zero look-ahead bias.
 * 4. Prediction snapshots are immutably timestamped and frozen at generation time.
 */

import fs from "fs";
import path from "path";
import { RealSportType } from "./realHistoryTypes.js";
import {
  atomicWrite,
  handleCorruptedFile,
  backupStore,
  rotateBackups
} from "../protoHistory/forwardStorageUtils.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const FORWARD_SHADOW_FILE = path.join(DATA_DIR, "totoForwardShadowStore.json");

export type ForwardShadowStatus = "PREDICTED" | "RESULT_CONFIRMED" | "EVALUATED" | "UNAVAILABLE";
export type ForwardComparisonStatus = "V2_WON" | "V1_WON" | "BOTH_HIT" | "BOTH_MISS";

export interface ForwardShadowPredictionRecord {
  predictionId: string; // format: fs_{sport}_{year}_{round}_{matchNo}
  sport: RealSportType;
  year: number;
  round: number;
  matchNo: number; // 1 ~ 14

  predictionCreatedAt: string; // Immutable ISO timestamp when prediction was generated

  homeTeam: string;
  awayTeam: string;
  league: string;
  matchDate?: string;

  // Exact VoteRate snapshot used for inference
  voteRate: {
    win: number | null;
    draw: number | null; // draw for sc1, 1-run for bs1, within 5pts for bk1
    lose: number | null;
    winCount?: number;
    drawCount?: number;
    loseCount?: number;
    totalCount?: number;
  };

  // V1 Production Prediction Snapshot
  v1Prediction: "win" | "draw" | "lose";
  v1Probability: {
    win: number;
    draw: number;
    lose: number;
  };
  v1ConfidenceGrade?: string;

  // EXP03 Shadow Candidate Prediction Snapshot
  exp03Prediction: "win" | "draw" | "lose";
  exp03Probability: {
    win: number;
    draw: number;
    lose: number;
  };
  exp03ConfidenceGrade?: string;

  dataSource: "real";
  isSimulated: false;

  resultStatus: ForwardShadowStatus;

  // Result fields (strictly null at prediction creation time)
  homeScore: number | null;
  awayScore: number | null;
  outcome: "win" | "draw" | "lose" | "canceled" | null;

  evaluatedAt: string | null;

  // Post-result evaluation metrics
  v1IsHit?: boolean;
  exp03IsHit?: boolean;
  v1BrierScore?: number;
  exp03BrierScore?: number;
  v1LogLoss?: number;
  exp03LogLoss?: number;
  comparisonStatus?: ForwardComparisonStatus;
}

export interface ForwardShadowRoundRecord {
  sport: RealSportType;
  year: number;
  round: number;
  validationStatus: "VALID" | "PREDICTION_BLOCKED";
  validationIssues?: string[];
  predictionCreatedAt: string;
  evaluatedAt: string | null;
  allResultsConfirmed: boolean;
  matches: ForwardShadowPredictionRecord[];
}

export interface ForwardShadowStoreData {
  version: "1.0.0";
  environment: "LIVE_SHADOW";
  autoPromotion: "DISABLED";
  productionModel: "V1";
  candidateModel: "TOTO_V2_EXP03";
  lastUpdated: string;
  rounds: Record<string, ForwardShadowRoundRecord>; // key: sport_year_round
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

let memoryStore: ForwardShadowStoreData = {
  version: "1.0.0",
  environment: "LIVE_SHADOW",
  autoPromotion: "DISABLED",
  productionModel: "V1",
  candidateModel: "TOTO_V2_EXP03",
  lastUpdated: new Date().toISOString(),
  rounds: {}
};

let isLoaded = false;

/**
 * Loads Forward Shadow Store from disk
 */
export function loadForwardShadowStore(): ForwardShadowStoreData {
  ensureDataDir();
  if (fs.existsSync(FORWARD_SHADOW_FILE)) {
    try {
      const raw = fs.readFileSync(FORWARD_SHADOW_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.rounds) {
        memoryStore = {
          ...parsed,
          autoPromotion: "DISABLED",
          productionModel: "V1",
          candidateModel: "TOTO_V2_EXP03"
        };
      }
      isLoaded = true;
    } catch (e) {
      handleCorruptedFile(FORWARD_SHADOW_FILE, e);
    }
  } else {
    isLoaded = true;
    saveForwardShadowStore();
  }
  return memoryStore;
}

/**
 * Persists Forward Shadow Store to disk
 */
export function saveForwardShadowStore(): void {
  ensureDataDir();
  memoryStore.lastUpdated = new Date().toISOString();
  memoryStore.autoPromotion = "DISABLED"; // Enforce safety guardrail

  atomicWrite(FORWARD_SHADOW_FILE, JSON.stringify(memoryStore, null, 2));

  // Create gzip backup of the actual production store, keeping latest 30 backups
  backupStore(FORWARD_SHADOW_FILE, "totoForwardShadowStore", memoryStore);
  rotateBackups("totoForwardShadowStore", 30);
}

/**
 * Saves or updates a round record in the Forward Shadow Store
 */
export function saveForwardShadowRound(round: ForwardShadowRoundRecord): void {
  if (!isLoaded) loadForwardShadowStore();
  const key = `${round.sport}_${round.year}_${round.round}`;
  memoryStore.rounds[key] = round;
  saveForwardShadowStore();
}

/**
 * Retrieves a round record by sport, year, and round
 */
export function getForwardShadowRound(sport: RealSportType, year: number, round: number): ForwardShadowRoundRecord | undefined {
  if (!isLoaded) loadForwardShadowStore();
  const key = `${sport}_${year}_${round}`;
  return memoryStore.rounds[key];
}

/**
 * Gets all forward shadow rounds
 */
export function getAllForwardShadowRounds(): ForwardShadowRoundRecord[] {
  if (!isLoaded) loadForwardShadowStore();
  return Object.values(memoryStore.rounds).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.round !== b.round) return a.round - b.round;
    return a.sport.localeCompare(b.sport);
  });
}

/**
 * Gets all forward shadow prediction records across all rounds
 */
export function getAllForwardShadowPredictions(): ForwardShadowPredictionRecord[] {
  if (!isLoaded) loadForwardShadowStore();
  const allPreds: ForwardShadowPredictionRecord[] = [];
  for (const r of Object.values(memoryStore.rounds)) {
    if (r.validationStatus === "VALID" && r.matches && r.matches.length > 0) {
      allPreds.push(...r.matches);
    }
  }
  return allPreds.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.round !== b.round) return a.round - b.round;
    if (a.sport !== b.sport) return a.sport.localeCompare(b.sport);
    return a.matchNo - b.matchNo;
  });
}

/**
 * Clears store (for test suite or fresh initialization)
 */
export function clearForwardShadowStore(): void {
  memoryStore.rounds = {};
  saveForwardShadowStore();
}
