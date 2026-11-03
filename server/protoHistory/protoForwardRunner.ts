/**
 * SportsQuant Pro — PROTO Forward Shadow Operational Cycle Runner V4
 * 
 * [ABSOLUTE INVARIANTS]
 * 1. Fully idempotent run-cycle execution (multiple run-cycle calls yield identical results).
 * 2. 8-stage automated workflow:
 *    DISCOVER -> SYNC ELIGIBLE -> SNAPSHOT FREEZE -> SCAN PENDING -> SETTLE OFFICIAL -> AUDIT -> UPDATE KPI -> LOG OPERATION.
 * 3. Run Lock: Prevents concurrent execution. Rejects parallel runs with RUN_ALREADY_IN_PROGRESS.
 * 4. Run Timeout Safety: Detects stalled runs, logs RUN_TIMEOUT audit event, prevents data corruption.
 * 5. Fail-Closed: Preserves existing snapshots and settlements on failure.
 */

import { ProtoOperationLog } from "./protoForwardShadowTypes.js";
import { discoverProtoRounds } from "./protoForwardRoundDiscovery.js";
import { syncForwardRoundV3 } from "./protoForwardRoundRunner.js";
import { scanPendingSettlements, settleForwardRoundV3 } from "./protoForwardSettlementRunner.js";
import { rebuildForwardKpi, saveRoundKpiSnapshot } from "./protoForwardKpiAccumulator.js";
import { logOperationRun } from "./protoForwardOperationLog.js";
import { loadProtoForwardShadowStore, saveProtoForwardShadowStore } from "./protoForwardShadowStore.js";

export interface ForwardCycleSummary {
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
  errorCode?: string;
}

let isCycleRunning = false;
let currentRunStartedTime: number | null = null;
const DEFAULT_CYCLE_TIMEOUT_MS = 60000; // 60 seconds

export function isForwardCycleRunning(): boolean {
  if (!isCycleRunning) return false;
  // If timed out, automatically release lock
  if (currentRunStartedTime && (Date.now() - currentRunStartedTime > DEFAULT_CYCLE_TIMEOUT_MS)) {
    isCycleRunning = false;
    currentRunStartedTime = null;
    return false;
  }
  return true;
}

export function resetRunLock(): void {
  isCycleRunning = false;
  currentRunStartedTime = null;
}

/**
 * Runs a complete, safe, and idempotent Forward Shadow Operational Cycle
 */
export async function runForwardShadowCycle(options: { timeoutMs?: number; forceUnlock?: boolean } = {}): Promise<ForwardCycleSummary> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CYCLE_TIMEOUT_MS;

  // 1. RUN LOCK CHECK
  if (isCycleRunning && !options.forceUnlock) {
    if (currentRunStartedTime && (Date.now() - currentRunStartedTime <= timeoutMs)) {
      const store = loadProtoForwardShadowStore();
      if (!store.auditEventLog) store.auditEventLog = [];
      store.auditEventLog.push({
        timestamp: new Date().toISOString(),
        year: 2026,
        round: 0,
        matchId: "run_cycle_lock",
        eventType: "RUN_LOCK_REJECTED",
        severity: "HIGH",
        details: "Concurrent cycle execution rejected: RUN_ALREADY_IN_PROGRESS"
      });
      saveProtoForwardShadowStore(store);

      const err = new Error("RUN_ALREADY_IN_PROGRESS");
      (err as any).code = "RUN_ALREADY_IN_PROGRESS";
      throw err;
    }
  }

  isCycleRunning = true;
  currentRunStartedTime = Date.now();

  const startedAt = new Date().toISOString();
  const runId = `run_${Date.now()}`;

  let discoveredCount = 0;
  let syncedCount = 0;
  let newSnapshotsCount = 0;
  let skippedSnapshotsCount = 0;
  let pendingCandidatesCount = 0;
  let settledMatchesCount = 0;
  let skippedSettlementsCount = 0;
  let blockedMatchesCount = 0;
  let integrityErrorsCount = 0;

  // Audit event log for run start
  const storeInit = loadProtoForwardShadowStore();
  if (!storeInit.auditEventLog) storeInit.auditEventLog = [];
  storeInit.auditEventLog.push({
    timestamp: startedAt,
    year: 2026,
    round: 0,
    matchId: runId,
    eventType: "RUN_CYCLE_STARTED",
    severity: "LOW",
    details: `Operational forward cycle ${runId} started.`
  });
  saveProtoForwardShadowStore(storeInit);

  try {
    // Stage 1: DISCOVER
    const discovery = discoverProtoRounds();
    discoveredCount = discovery.availableRounds.length;

    // Timeout Check after Discovery
    if (Date.now() - currentRunStartedTime > timeoutMs) {
      throw new Error("RUN_TIMEOUT");
    }

    // Stage 2 & 3: SYNC ELIGIBLE ROUNDS & CREATE PRE-KICKOFF SNAPSHOTS
    for (const rd of discovery.availableRounds) {
      if (Date.now() - currentRunStartedTime > timeoutMs) {
        throw new Error("RUN_TIMEOUT");
      }

      if (!rd.isSynced) {
        const syncRes = await syncForwardRoundV3(rd.year, rd.round);
        syncedCount++;
        newSnapshotsCount += syncRes.newSnapshots;
        skippedSnapshotsCount += syncRes.skippedSnapshots;
        blockedMatchesCount += syncRes.blockedMatches;
      } else {
        // Re-sync existing round to enforce immutability check
        const syncRes = await syncForwardRoundV3(rd.year, rd.round);
        skippedSnapshotsCount += syncRes.skippedSnapshots;
        blockedMatchesCount += syncRes.blockedMatches;
      }
    }

    // Stage 4: SCAN PENDING SETTLEMENTS
    const pendingList = scanPendingSettlements();
    pendingCandidatesCount = pendingList.length;

    // Stage 5: SETTLE OFFICIAL RESULTS
    const pendingRoundsMap = new Map<string, { year: number; round: number }>();
    for (const p of pendingList) {
      pendingRoundsMap.set(`${p.year}_${p.round}`, { year: p.year, round: p.round });
    }

    for (const target of pendingRoundsMap.values()) {
      if (Date.now() - currentRunStartedTime > timeoutMs) {
        throw new Error("RUN_TIMEOUT");
      }

      const settleRes = await settleForwardRoundV3(target.year, target.round);
      settledMatchesCount += settleRes.settledCount;
      skippedSettlementsCount += settleRes.alreadySettledCount;
      blockedMatchesCount += settleRes.blockedCount;
      saveRoundKpiSnapshot(target.year, target.round);
    }

    // Stage 6 & 7: RUN AUDIT & UPDATE KPI
    const store = loadProtoForwardShadowStore();
    saveProtoForwardShadowStore(store); // Triggers recalculation audit
    const kpiRes = rebuildForwardKpi();

    integrityErrorsCount = (store.auditTotals.syntheticRecords ?? 0) +
                           (store.auditTotals.fallbackUsed ?? 0) +
                           (store.auditTotals.lookaheadViolations ?? 0) +
                           (store.auditTotals.duplicateRecords ?? 0) +
                           (store.auditTotals.snapshotMutationRecords ?? 0);

    const completedAt = new Date().toISOString();
    const cycleStatus = blockedMatchesCount > 0 ? "BLOCKED" : "SUCCESS";

    const opLog: ProtoOperationLog = {
      runId,
      startedAt,
      completedAt,
      discoveredRounds: discoveredCount,
      syncedRounds: syncedCount,
      newSnapshots: newSnapshotsCount,
      skippedSnapshots: skippedSnapshotsCount,
      settlementCandidates: pendingCandidatesCount,
      settledMatches: settledMatchesCount,
      skippedSettlements: skippedSettlementsCount,
      blockedMatches: blockedMatchesCount,
      integrityErrors: integrityErrorsCount,
      kpiUpdated: kpiRes.isMatch,
      status: cycleStatus
    };

    if (!store.operationLogs) store.operationLogs = [];
    store.operationLogs.push(opLog);

    if (!store.auditEventLog) store.auditEventLog = [];
    store.auditEventLog.push({
      timestamp: completedAt,
      year: 2026,
      round: 0,
      matchId: runId,
      eventType: "RUN_CYCLE_COMPLETED",
      severity: "LOW",
      details: `Operational cycle ${runId} completed with status: ${cycleStatus}.`
    });
    saveProtoForwardShadowStore(store);

    return opLog;
  } catch (err: any) {
    const completedAt = new Date().toISOString();
    const isTimeout = err.message === "RUN_TIMEOUT";

    const store = loadProtoForwardShadowStore();
    if (!store.auditEventLog) store.auditEventLog = [];

    if (isTimeout) {
      store.auditEventLog.push({
        timestamp: completedAt,
        year: 2026,
        round: 0,
        matchId: runId,
        eventType: "RUN_TIMEOUT",
        severity: "HIGH",
        details: `Operational cycle ${runId} timed out after ${timeoutMs}ms. Partial state retained.`
      });
    }

    const failedStatus = isTimeout ? "PARTIAL" : "FAILED";
    const failedLog: ProtoOperationLog = {
      runId,
      startedAt,
      completedAt,
      discoveredRounds: discoveredCount,
      syncedRounds: syncedCount,
      newSnapshots: newSnapshotsCount,
      skippedSnapshots: skippedSnapshotsCount,
      settlementCandidates: pendingCandidatesCount,
      settledMatches: settledMatchesCount,
      skippedSettlements: skippedSettlementsCount,
      blockedMatches: blockedMatchesCount,
      integrityErrors: integrityErrorsCount + (isTimeout ? 0 : 1),
      kpiUpdated: false,
      status: failedStatus
    };

    if (!store.operationLogs) store.operationLogs = [];
    store.operationLogs.push(failedLog);
    saveProtoForwardShadowStore(store);
    return failedLog;
  } finally {
    isCycleRunning = false;
    currentRunStartedTime = null;
  }
}
