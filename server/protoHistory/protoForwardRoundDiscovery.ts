/**
 * SportsQuant Pro — PROTO Forward Shadow Real Round Discovery Engine
 * 
 * [ABSOLUTE INVARIANTS]
 * 1. Discovers genuine WiseToto PROTO rounds automatically without hardcoding.
 * 2. Complete isolation from historical backtests.
 * 3. Zero synthetic/simulated round generation.
 */

import { loadProtoHistoryStore } from "./realProtoHistoryStore.js";
import { loadProtoForwardShadowStore } from "./protoForwardShadowStore.js";

export interface DiscoveredRoundSummary {
  year: number;
  round: number;
  totalMatches: number;
  isSynced: boolean;
  pendingCount: number;
  evaluatedCount: number;
  isAllSettled: boolean;
  status: "UNSYNCED" | "ROUND_OPEN" | "ROUND_PARTIAL" | "ROUND_SETTLED" | "ROUND_BLOCKED";
}

export interface ProtoRoundDiscoveryResult {
  availableRounds: DiscoveredRoundSummary[];
  latestRound: { year: number; round: number } | null;
  currentRound: { year: number; round: number } | null;
  alreadySyncedRounds: Array<{ year: number; round: number }>;
  pendingSettlementRounds: Array<{ year: number; round: number }>;
  completedRounds: Array<{ year: number; round: number }>;
}

/**
 * Discovers real PROTO rounds across real history and forward shadow stores
 */
export function discoverProtoRounds(): ProtoRoundDiscoveryResult {
  const historyStore = loadProtoHistoryStore();
  const shadowStore = loadProtoForwardShadowStore();

  const roundMap = new Map<string, DiscoveredRoundSummary>();

  // 1. Gather rounds from Real History Store
  for (const rKey of Object.keys(historyStore.rounds)) {
    const r = historyStore.rounds[rKey];
    roundMap.set(rKey, {
      year: r.year,
      round: r.round,
      totalMatches: r.matches.length,
      isSynced: false,
      pendingCount: 0,
      evaluatedCount: 0,
      isAllSettled: false,
      status: "UNSYNCED"
    });
  }

  // 2. Overlay rounds from Forward Shadow Store
  const alreadySyncedRounds: Array<{ year: number; round: number }> = [];
  const pendingSettlementRounds: Array<{ year: number; round: number }> = [];
  const completedRounds: Array<{ year: number; round: number }> = [];

  for (const sKey of Object.keys(shadowStore.rounds)) {
    const s = shadowStore.rounds[sKey];
    const pendingCount = s.matches.filter(m => m.snapshotStatus === "PREDICTED" || m.snapshotStatus === "RESULT_PENDING").length;
    const evaluatedCount = s.matches.filter(m => m.snapshotStatus === "EVALUATED").length;
    const isAllSettled = s.matches.length > 0 && s.matches.every(m => m.snapshotStatus === "EVALUATED" || m.snapshotStatus === "UNAVAILABLE" || m.snapshotStatus === "INVALID" || m.snapshotStatus === "FORWARD_BLOCKED");

    let status: DiscoveredRoundSummary["status"] = "ROUND_OPEN";
    if (s.integrityGateStatus === "FORWARD_BLOCKED") {
      status = "ROUND_BLOCKED";
    } else if (isAllSettled) {
      status = "ROUND_SETTLED";
    } else if (evaluatedCount > 0) {
      status = "ROUND_PARTIAL";
    }

    alreadySyncedRounds.push({ year: s.year, round: s.round });
    if (pendingCount > 0) {
      pendingSettlementRounds.push({ year: s.year, round: s.round });
    }
    if (isAllSettled) {
      completedRounds.push({ year: s.year, round: s.round });
    }

    roundMap.set(sKey, {
      year: s.year,
      round: s.round,
      totalMatches: s.matches.length,
      isSynced: true,
      pendingCount,
      evaluatedCount,
      isAllSettled,
      status
    });
  }

  const availableRounds = Array.from(roundMap.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.round - a.round;
  });

  const latestRound = availableRounds.length > 0 ? { year: availableRounds[0].year, round: availableRounds[0].round } : null;
  
  // Current active round = highest round with pending settlement, or latest available
  const currentRound = pendingSettlementRounds.length > 0
    ? pendingSettlementRounds.sort((a, b) => (b.year !== a.year ? b.year - a.year : b.round - a.round))[0]
    : latestRound;

  return {
    availableRounds,
    latestRound,
    currentRound,
    alreadySyncedRounds,
    pendingSettlementRounds,
    completedRounds
  };
}
