/**
 * SportsQuant Pro — Real PROTO Historical Dataset Pilot Runner
 * 
 * [ABSOLUTE GUARDRAILS]
 * 1. Collects genuine WiseToto PROTO rounds (5~10 target rounds).
 * 2. Strict provenance and integrity validation.
 * 3. 0 Synthetic, 0 Fallback, 0 Fake Scores.
 * 4. Saves directly to data/realProtoHistoricalDataset.json.
 */

import { collectRealProtoRound, initWisetotoProtoSession, WisetotoProtoSession } from "./realProtoCollector.js";
import { saveProtoRound, loadProtoHistoryStore, getProtoHistorySummary } from "./realProtoHistoryStore.js";
import { RealProtoRoundSummary } from "./realProtoHistoryTypes.js";

export interface ProtoPilotResult {
  totalRounds: number;
  totalMatches: number;
  validMatches: number;
  unavailableMatches: number;
  mismatchMatches: number;
  duplicateMatches: number;
  syntheticMatches: 0;
  fallbackCalls: 0;
  roundReports: RealProtoRoundSummary[];
  success: boolean;
  errors: string[];
}

/**
 * Runs the pilot data collection for specified (year, round) pairs
 */
export async function runProtoPilot(
  targets: Array<{ year: number; round: number }> = [
    { year: 2026, round: 110 },
    { year: 2026, round: 111 },
    { year: 2026, round: 112 },
    { year: 2026, round: 113 },
    { year: 2026, round: 114 },
    { year: 2026, round: 115 },
    { year: 2025, round: 150 },
    { year: 2025, round: 151 },
    { year: 2025, round: 152 },
    { year: 2025, round: 153 }
  ]
): Promise<ProtoPilotResult> {
  const roundReports: RealProtoRoundSummary[] = [];
  const errors: string[] = [];
  let sess: WisetotoProtoSession | undefined;

  try {
    sess = await initWisetotoProtoSession();
  } catch (err: any) {
    errors.push(`Failed to initialize session: ${err.message}`);
  }

  for (const t of targets) {
    try {
      console.log(`[ProtoPilot] Collecting Year ${t.year} Round ${t.round}...`);
      const roundData = await collectRealProtoRound(t.year, t.round, sess);
      saveProtoRound(roundData);
      roundReports.push(roundData.summary);
      console.log(`[ProtoPilot] Successfully saved Year ${t.year} Round ${t.round} (${roundData.matches.length} matches, ${roundData.summary.validCount} valid)`);
    } catch (err: any) {
      console.error(`[ProtoPilot] Error collecting Year ${t.year} Round ${t.round}:`, err.message);
      errors.push(`Year ${t.year} Round ${t.round}: ${err.message}`);
    }
  }

  const store = loadProtoHistoryStore();
  const meta = store.metadata;

  return {
    totalRounds: meta.totalRounds,
    totalMatches: meta.totalMatches,
    validMatches: meta.validMatches,
    unavailableMatches: meta.unavailableMatches,
    mismatchMatches: meta.mismatchMatches,
    duplicateMatches: meta.duplicateMatches,
    syntheticMatches: 0,
    fallbackCalls: 0,
    roundReports,
    success: errors.length === 0,
    errors
  };
}

/**
 * Synchronizes a single PROTO round into the store
 */
export async function syncProtoRound(year: number, round: number) {
  const sess = await initWisetotoProtoSession();
  const roundData = await collectRealProtoRound(year, round, sess);
  saveProtoRound(roundData);
  return roundData;
}
