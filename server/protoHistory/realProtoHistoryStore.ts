/**
 * SportsQuant Pro — Real PROTO Historical Dataset Store
 * 
 * [ABSOLUTE GUARDRAILS]
 * 1. Dedicated file: data/realProtoHistoricalDataset.json
 * 2. Strictly isolated from TOTO dataset (data/realHistoricalDataset.json) and forward shadow.
 * 3. Never loads or stores synthetic or simulated rows.
 */

import fs from "fs";
import path from "path";
import { RealProtoDatasetStore, RealProtoRound, RealProtoMatch } from "./realProtoHistoryTypes.js";

const DATA_DIR = path.join(process.cwd(), "data");
const PROD_STORE_PATH = path.join(DATA_DIR, "realProtoHistoricalDataset.json");
const TEST_STORE_PATH = path.join("/tmp", "test_realProtoHistoricalDataset.json");

function getProtoStorePath(): string {
  if (process.env.IS_TEST_MODE === "true" || process.env.NODE_ENV === "test") {
    return TEST_STORE_PATH;
  }
  return process.env.PROTO_HISTORICAL_STORE_PATH || PROD_STORE_PATH;
}

function getDefaultStore(): RealProtoDatasetStore {
  return {
    datasetVersion: "1.0.0-real-proto-pilot",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dataSource: "wisetoto_official_real",
    rounds: {},
    metadata: {
      totalRounds: 0,
      totalMatches: 0,
      validMatches: 0,
      unavailableMatches: 0,
      mismatchMatches: 0,
      duplicateMatches: 0,
      syntheticMatches: 0,
      fallbackUsedMatches: 0
    }
  };
}

/**
 * Loads PROTO real historical store from disk
 */
export function loadProtoHistoryStore(): RealProtoDatasetStore {
  const storePath = getProtoStorePath();
  try {
    if (fs.existsSync(storePath)) {
      const raw = fs.readFileSync(storePath, "utf-8");
      const parsed = JSON.parse(raw) as RealProtoDatasetStore;
      return parsed;
    } else if (storePath === TEST_STORE_PATH && fs.existsSync(PROD_STORE_PATH)) {
      const raw = fs.readFileSync(PROD_STORE_PATH, "utf-8");
      return JSON.parse(raw) as RealProtoDatasetStore;
    }
  } catch (err) {
    console.error("[ProtoStore] Error reading store, initializing fresh:", err);
  }
  const defaultStore = getDefaultStore();
  saveProtoHistoryStore(defaultStore);
  return defaultStore;
}

/**
 * Saves PROTO real historical store to disk
 */
export function saveProtoHistoryStore(store: RealProtoDatasetStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Recalculate metadata
    let totalMatches = 0;
    let validMatches = 0;
    let unavailableMatches = 0;
    let mismatchMatches = 0;
    let duplicateMatches = 0;

    for (const r of Object.values(store.rounds)) {
      totalMatches += r.matches.length;
      validMatches += r.summary.validCount;
      unavailableMatches += r.summary.unavailableCount;
      mismatchMatches += r.summary.mismatchCount;
      duplicateMatches += r.summary.duplicateCount;
    }

    store.metadata = {
      totalRounds: Object.keys(store.rounds).length,
      totalMatches,
      validMatches,
      unavailableMatches,
      mismatchMatches,
      duplicateMatches,
      syntheticMatches: 0,
      fallbackUsedMatches: 0
    };
    store.updatedAt = new Date().toISOString();
    const storePath = getProtoStorePath();
    const storeDir = path.dirname(storePath);
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true });
    }
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.error("[ProtoStore] Error saving store:", err);
  }
}

/**
 * Retrieves a specific round from the store
 */
export function getProtoRound(year: number, round: number): RealProtoRound | null {
  const store = loadProtoHistoryStore();
  const key = `${year}_${round}`;
  return store.rounds[key] || null;
}

/**
 * Saves or updates a round in the store
 */
export function saveProtoRound(roundData: RealProtoRound): void {
  const store = loadProtoHistoryStore();
  const key = `${roundData.year}_${roundData.round}`;
  store.rounds[key] = roundData;
  saveProtoHistoryStore(store);
}

/**
 * Returns all real matches across all rounds in the store
 */
export function getAllProtoMatches(): RealProtoMatch[] {
  const store = loadProtoHistoryStore();
  const all: RealProtoMatch[] = [];
  for (const r of Object.values(store.rounds)) {
    all.push(...r.matches);
  }
  return all;
}

/**
 * Returns complete dataset summary
 */
export function getProtoHistorySummary() {
  const store = loadProtoHistoryStore();
  return {
    datasetVersion: store.datasetVersion,
    createdAt: store.createdAt,
    updatedAt: store.updatedAt,
    dataSource: store.dataSource,
    metadata: store.metadata,
    roundsList: Object.values(store.rounds).map(r => r.summary)
  };
}
