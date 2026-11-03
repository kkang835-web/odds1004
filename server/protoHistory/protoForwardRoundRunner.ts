/**
 * SportsQuant Pro — PROTO Forward Shadow Round Sync & Snapshot Runner V3
 * 
 * [ABSOLUTE INVARIANTS]
 * 1. Pre-kickoff snapshot creation only. Retrospective results strictly rejected.
 * 2. Standard 1X2 / Moneyline markets only.
 * 3. Idempotent round synchronization (multiple SYNC calls produce 0 extra snapshots).
 * 4. Immutable snapshots: modifications trigger SNAPSHOT_MUTATION -> FORWARD_BLOCKED.
 */

import {
  ProtoForwardShadowPredictionRecord,
  ProtoForwardShadowRoundRecord,
  ProtoForwardShadowStatus
} from "./protoForwardShadowTypes.js";
import {
  loadProtoForwardShadowStore,
  saveProtoForwardShadowStore,
  computeSnapshotHash
} from "./protoForwardShadowStore.js";
import {
  createForwardPredictionSnapshot,
  ForwardEloTracker
} from "./protoForwardShadow.js";
import { collectRealProtoRound } from "./realProtoCollector.js";
import { classifyProtoMarket } from "./realProtoWalkForwardRunner.js";

export interface SyncRoundV3Result {
  success: boolean;
  year: number;
  round: number;
  totalDiscovered: number;
  newSnapshots: number;
  skippedSnapshots: number;
  blockedMatches: number;
  status: "ROUND_OPEN" | "ROUND_PARTIAL" | "ROUND_SETTLED" | "ROUND_BLOCKED";
}

/**
 * Synchronizes a real WiseToto PROTO round with full pre-kickoff snapshotting and immutability checks
 */
export async function syncForwardRoundV3(
  year: number,
  round: number,
  options: { isPreMatch?: boolean } = {}
): Promise<SyncRoundV3Result> {
  const isPreMatch = options.isPreMatch ?? true;
  const store = loadProtoForwardShadowStore();
  const roundKey = `${year}_${round}`;
  const existingRound = store.rounds[roundKey];

  // 1. Ingest official real round from WiseToto or store
  let officialRound;
  try {
    officialRound = await collectRealProtoRound(year, round);
  } catch (err) {
    if (existingRound) {
      officialRound = {
        year,
        round,
        masterSeq: existingRound.masterSeq,
        matches: existingRound.matches as any,
        summary: {} as any
      };
    } else {
      throw err;
    }
  }
  const eloTracker = new ForwardEloTracker();

  let newSnapshots = 0;
  let skippedSnapshots = 0;
  let blockedMatches = 0;

  const existingMatchMap = new Map<string, ProtoForwardShadowPredictionRecord>();
  if (existingRound) {
    for (const m of existingRound.matches) {
      existingMatchMap.set(m.matchId, m);
    }
  }

  const finalMatches: ProtoForwardShadowPredictionRecord[] = [];

  for (const match of officialRound.matches) {
    if (match.integrityStatus !== "VALID") continue;

    const marketCat = classifyProtoMarket(match);
    // Standard 1X2 / Moneyline eligibility check
    if (marketCat !== "Standard_1X2_ML") {
      continue; // Exclude Handicap, Under/Over, SUM, special markets
    }

    const prev = existingMatchMap.get(match.matchId);

    if (prev) {
      // Check for snapshot mutation
      const currentHash = computeSnapshotHash(prev);
      if (prev.snapshotHash && prev.snapshotHash !== currentHash) {
        prev.snapshotImmutabilityViolation = true;
        prev.snapshotStatus = "FORWARD_BLOCKED";
        blockedMatches++;
      }
      // IDEMPOTENCY: Keep existing frozen snapshot strictly as-is
      finalMatches.push(prev);
      skippedSnapshots++;
    } else {
      // Create NEW pre-kickoff prediction snapshot
      const snap = createForwardPredictionSnapshot(match, eloTracker, { isPreMatch });
      if (snap.snapshotStatus === "FORWARD_BLOCKED" || snap.snapshotStatus === "INVALID") {
        blockedMatches++;
      }
      finalMatches.push(snap);
      newSnapshots++;
    }
  }

  const pendingCount = finalMatches.filter(s => s.snapshotStatus === "PREDICTED" || s.snapshotStatus === "RESULT_PENDING").length;
  const evaluatedCount = finalMatches.filter(s => s.snapshotStatus === "EVALUATED").length;
  const isAllSettled = finalMatches.length > 0 && finalMatches.every(m => m.snapshotStatus === "EVALUATED" || m.snapshotStatus === "UNAVAILABLE" || m.snapshotStatus === "INVALID" || m.snapshotStatus === "FORWARD_BLOCKED");

  let roundStatus: SyncRoundV3Result["status"] = "ROUND_OPEN";
  if (blockedMatches > 0) {
    roundStatus = "ROUND_BLOCKED";
  } else if (isAllSettled) {
    roundStatus = "ROUND_SETTLED";
  } else if (evaluatedCount > 0) {
    roundStatus = "ROUND_PARTIAL";
  }

  const updatedRoundRecord: ProtoForwardShadowRoundRecord = {
    year,
    round,
    masterSeq: officialRound.masterSeq,
    sourceUrl: `https://www.wisetoto.com/index.htm?tab_type=proto&game_type=pt&game_category=pt1&game_year=${year}&game_round=${round}`,
    syncedAt: existingRound?.syncedAt || new Date().toISOString(),
    allSettled: isAllSettled,
    status: roundStatus,
    totalMatches: finalMatches.length,
    predictedCount: finalMatches.filter(s => s.snapshotStatus === "PREDICTED").length,
    pendingCount,
    evaluatedCount,
    unavailableCount: finalMatches.filter(s => s.snapshotStatus === "UNAVAILABLE" || s.snapshotStatus === "INELIGIBLE_RETROSPECTIVE").length,
    invalidCount: finalMatches.filter(s => s.snapshotStatus === "INVALID" || s.snapshotStatus === "FORWARD_BLOCKED").length,
    integrityGateStatus: blockedMatches > 0 ? "FORWARD_BLOCKED" : "FORWARD_ELIGIBLE",
    matches: finalMatches
  };

  store.rounds[roundKey] = updatedRoundRecord;
  saveProtoForwardShadowStore(store);

  // Log Audit Event
  if (!store.auditEventLog) store.auditEventLog = [];
  store.auditEventLog.push({
    timestamp: new Date().toISOString(),
    year,
    round,
    matchId: `round_${year}_${round}`,
    eventType: "ROUND_SYNC_COMPLETED",
    severity: "LOW",
    details: `Round ${year}_${round} synced: ${newSnapshots} new snapshots, ${skippedSnapshots} skipped (idempotent).`
  });

  return {
    success: true,
    year,
    round,
    totalDiscovered: officialRound.matches.length,
    newSnapshots,
    skippedSnapshots,
    blockedMatches,
    status: roundStatus
  };
}
