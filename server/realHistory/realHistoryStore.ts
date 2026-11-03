import fs from "fs";
import path from "path";
import { RealHistoricalRound, RealHistoricalMatch } from "./realHistoryTypes.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DATASET_FILE = path.join(DATA_DIR, "realHistoricalDataset.json");

let memoryStore: Map<string, RealHistoricalRound> = new Map();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Loads stored real historical rounds from disk
 */
export function loadRealHistoryStore(): void {
  ensureDataDir();
  if (fs.existsSync(DATASET_FILE)) {
    try {
      const raw = fs.readFileSync(DATASET_FILE, "utf-8");
      const list: RealHistoricalRound[] = JSON.parse(raw);
      memoryStore.clear();
      for (const r of list) {
        const key = `${r.sport}_${r.year}_${r.round}`;
        memoryStore.set(key, r);
      }
    } catch (e) {
      console.error("Failed to load realHistoricalDataset.json:", e);
    }
  }
}

/**
 * Saves a real historical round into memory and persists to disk
 */
export function saveRealHistoricalRound(round: RealHistoricalRound): void {
  ensureDataDir();
  const key = `${round.sport}_${round.year}_${round.round}`;
  memoryStore.set(key, round);

  const list = Array.from(memoryStore.values());
  fs.writeFileSync(DATASET_FILE, JSON.stringify(list, null, 2), "utf-8");
}

/**
 * Gets all saved real historical matches across all rounds
 */
export function getAllRealMatches(): RealHistoricalMatch[] {
  loadRealHistoryStore();
  const matches: RealHistoricalMatch[] = [];
  for (const r of memoryStore.values()) {
    matches.push(...r.matches);
  }
  return matches;
}

/**
 * Gets summary statistics of the Real Historical Store
 */
export function getRealHistoryStoreSummary() {
  const allRounds = Array.from(memoryStore.values());
  const allMatches = getAllRealMatches();

  const bySport: Record<string, number> = { sc1: 0, bs1: 0, bk1: 0 };
  const byYear: Record<string, number> = { "2024": 0, "2025": 0, "2026": 0 };

  let validMatches = 0;
  let unavailableMatches = 0;
  let mismatchMatches = 0;
  let duplicateMatches = 0;

  for (const m of allMatches) {
    if (bySport[m.sport] !== undefined) bySport[m.sport]++;
    if (byYear[String(m.year)] !== undefined) byYear[String(m.year)]++;

    if (m.integrityStatus === "VALID") validMatches++;
    else if (m.integrityStatus === "UNAVAILABLE") unavailableMatches++;
    else if (m.integrityStatus === "MISMATCH") mismatchMatches++;
    else if (m.integrityStatus === "DUPLICATE") duplicateMatches++;
  }

  return {
    totalRounds: allRounds.length,
    totalMatches: allMatches.length,
    validMatches,
    unavailableMatches,
    mismatchMatches,
    duplicateMatches,
    syntheticMatches: 0,
    bySport,
    byYear,
    storageLocation: DATASET_FILE
  };
}

// Initial load on import
loadRealHistoryStore();
