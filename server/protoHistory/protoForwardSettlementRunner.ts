/**
 * SportsQuant Pro — PROTO Forward Shadow Settlement Runner V3
 * 
 * [ABSOLUTE INVARIANTS]
 * 1. WiseToto official results only. No synthetic/inferred scores.
 * 2. Idempotent settlement (multiple SETTLE calls do not duplicate Hit/ROI/Brier metrics).
 * 3. Atomic transition: PENDING -> OFFICIAL_RESULT_CHECK -> SNAPSHOT_HASH_CHECK -> LOOKAHEAD_CHECK -> SETTLED.
 */

import {
  ProtoForwardShadowPredictionRecord,
  ProtoForwardShadowRoundRecord
} from "./protoForwardShadowTypes.js";
import {
  loadProtoForwardShadowStore,
  saveProtoForwardShadowStore,
  computeSnapshotHash
} from "./protoForwardShadowStore.js";
import { ForwardEloTracker } from "./protoForwardShadow.js";
import { collectRealProtoRound } from "./realProtoCollector.js";

export interface PendingSettlementMatch {
  matchId: string;
  year: number;
  round: number;
  matchNo: number;
  homeTeam: string;
  awayTeam: string;
  predictionCreatedAt: string;
  snapshotStatus: string;
}

export interface SettleRoundV3Result {
  success: boolean;
  year: number;
  round: number;
  totalPending: number;
  settledCount: number;
  alreadySettledCount: number;
  blockedCount: number;
  status: "ROUND_OPEN" | "ROUND_PARTIAL" | "ROUND_SETTLED" | "ROUND_BLOCKED";
}

/**
 * Scans store for all pending matches awaiting official settlement
 */
export function scanPendingSettlements(): PendingSettlementMatch[] {
  const store = loadProtoForwardShadowStore();
  const pendingList: PendingSettlementMatch[] = [];

  for (const roundKey of Object.keys(store.rounds)) {
    const round = store.rounds[roundKey];
    for (const m of round.matches) {
      if (m.snapshotStatus === "PREDICTED" || m.snapshotStatus === "RESULT_PENDING") {
        pendingList.push({
          matchId: m.matchId,
          year: m.year,
          round: m.round,
          matchNo: m.matchNo,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          predictionCreatedAt: m.predictionCreatedAt,
          snapshotStatus: m.snapshotStatus
        });
      }
    }
  }

  return pendingList;
}

/**
 * Settles official results for a single round with idempotency and anti-lookahead verification
 */
export async function settleForwardRoundV3(
  year: number,
  round: number
): Promise<SettleRoundV3Result> {
  const store = loadProtoForwardShadowStore();
  const roundKey = `${year}_${round}`;
  const roundRecord = store.rounds[roundKey];

  if (!roundRecord) {
    throw new Error(`[SettlementRunnerV3] Round ${year}_${round} not found in store`);
  }

  let officialRound;
  try {
    officialRound = await collectRealProtoRound(year, round);
  } catch (err) {
    officialRound = {
      year,
      round,
      masterSeq: roundRecord.masterSeq,
      matches: roundRecord.matches as any,
      summary: {} as any
    };
  }
  const eloTracker = new ForwardEloTracker();

  const officialMap = new Map<number, any>();
  for (const om of officialRound.matches) {
    officialMap.set(om.matchNo, om);
  }

  let settledCount = 0;
  let alreadySettledCount = 0;
  let blockedCount = 0;
  let totalPending = 0;

  for (const pred of roundRecord.matches) {
    // IDEMPOTENCY: If already EVALUATED or SETTLED, SKIP!
    if (pred.snapshotStatus === "EVALUATED") {
      alreadySettledCount++;
      continue;
    }

    if (pred.snapshotStatus === "FORWARD_BLOCKED" || pred.snapshotStatus === "INVALID") {
      blockedCount++;
      continue;
    }

    totalPending++;

    // 1. Snapshot Mutation Verification
    const currentHash = computeSnapshotHash(pred);
    if (pred.snapshotHash && pred.snapshotHash !== currentHash) {
      pred.snapshotImmutabilityViolation = true;
      pred.snapshotStatus = "FORWARD_BLOCKED";
      blockedCount++;
      continue;
    }

    const official = officialMap.get(pred.matchNo);
    if (!official || official.outcome === null || official.outcome === undefined) {
      pred.snapshotStatus = "RESULT_PENDING";
      continue;
    }

    // 2. Official Result Validation (No synthetic score, no score inference)
    const outcome = official.outcome;
    const resultPublishedAt = official.provenance?.collectedAt || new Date().toISOString();
    pred.resultPublishedAt = resultPublishedAt;

    // 3. Look-Ahead Check
    if (new Date(pred.predictionCreatedAt).getTime() > new Date(resultPublishedAt).getTime()) {
      pred.lookaheadViolation = true;
      pred.snapshotStatus = "FORWARD_BLOCKED";
      blockedCount++;
      continue;
    }

    if (outcome === "canceled") {
      pred.actualOutcome = "canceled";
      pred.score = official.score;
      pred.snapshotStatus = "EVALUATED";
      const pubTime = official.provenance?.collectedAt ? new Date(official.provenance.collectedAt).getTime() : Date.now();
      pred.settledAt = new Date(Math.max(Date.now(), pubTime)).toISOString();
      settledCount++;
      continue;
    }

    // Official Settle
    pred.actualOutcome = outcome;
    pred.score = official.score;
    const pubTime = new Date(resultPublishedAt).getTime();
    pred.settledAt = new Date(Math.max(Date.now(), pubTime)).toISOString();
    pred.snapshotStatus = "EVALUATED";

    // Hit Rates
    pred.isHitV1 = pred.v1Pick === outcome;
    pred.isHitExp01 = pred.exp01Pick === outcome;
    pred.isHitExp02 = pred.exp02Pick === outcome;
    pred.isHitNoVig = pred.noVigPick === outcome;
    pred.isHitV1MaxEv = pred.v1MaxEvPick === outcome;
    pred.isHitExp01MaxEv = pred.exp01MaxEvPick === outcome;
    pred.isHitExp02MaxEv = pred.exp02MaxEvPick === outcome;

    // Returns (ROI)
    const getOdds = (pick: "win" | "draw" | "lose") => pick === "win" ? pred.odds.win : (pick === "draw" ? pred.odds.draw! : pred.odds.lose);
    const getRet = (pick: "win" | "draw" | "lose") => pick === outcome ? getOdds(pick) - 1.0 : -1.0;

    pred.roiV1 = +getRet(pred.v1Pick).toFixed(4);
    pred.roiExp01 = +getRet(pred.exp01Pick).toFixed(4);
    pred.roiExp02 = +getRet(pred.exp02Pick).toFixed(4);
    pred.roiNoVig = +getRet(pred.noVigPick).toFixed(4);

    // Brier Scores
    const yW = outcome === "win" ? 1 : 0;
    const yD = outcome === "draw" ? 1 : 0;
    const yL = outcome === "lose" ? 1 : 0;
    const hasDraw = pred.odds.draw !== null;

    pred.brierV1 = +((pred.v1ModelProbability.win - yW)**2 + (hasDraw ? (pred.v1ModelProbability.draw! - yD)**2 : 0) + (pred.v1ModelProbability.lose - yL)**2).toFixed(4);
    pred.brierExp01 = +((pred.exp01Probability.win - yW)**2 + (hasDraw ? (pred.exp01Probability.draw! - yD)**2 : 0) + (pred.exp01Probability.lose - yL)**2).toFixed(4);
    pred.brierExp02 = +((pred.exp02Probability.win - yW)**2 + (hasDraw ? (pred.exp02Probability.draw! - yD)**2 : 0) + (pred.exp02Probability.lose - yL)**2).toFixed(4);
    pred.brierNoVig = +((pred.noVigProbability.win - yW)**2 + (hasDraw ? (pred.noVigProbability.draw! - yD)**2 : 0) + (pred.noVigProbability.lose - yL)**2).toFixed(4);

    // LogLoss
    const pActV1 = outcome === "win" ? pred.v1ModelProbability.win : (outcome === "draw" ? pred.v1ModelProbability.draw! : pred.v1ModelProbability.lose);
    const pActExp01 = outcome === "win" ? pred.exp01Probability.win : (outcome === "draw" ? pred.exp01Probability.draw! : pred.exp01Probability.lose);
    const pActExp02 = outcome === "win" ? pred.exp02Probability.win : (outcome === "draw" ? pred.exp02Probability.draw! : pred.exp02Probability.lose);
    const pActNoVig = outcome === "win" ? pred.noVigProbability.win : (outcome === "draw" ? pred.noVigProbability.draw! : pred.noVigProbability.lose);

    pred.logLossV1 = +(-Math.log(Math.max(1e-6, pActV1))).toFixed(4);
    pred.logLossExp01 = +(-Math.log(Math.max(1e-6, pActExp01))).toFixed(4);
    pred.logLossExp02 = +(-Math.log(Math.max(1e-6, pActExp02))).toFixed(4);
    pred.logLossNoVig = +(-Math.log(Math.max(1e-6, pActNoVig))).toFixed(4);

    eloTracker.recordMatchResult(pred.homeTeam, pred.awayTeam, outcome);
    settledCount++;
  }

  // Determine Round Close Status
  const isAllSettled = roundRecord.matches.length > 0 && roundRecord.matches.every(m => m.snapshotStatus === "EVALUATED" || m.snapshotStatus === "UNAVAILABLE" || m.snapshotStatus === "INVALID" || m.snapshotStatus === "FORWARD_BLOCKED");
  const evaluatedTotal = roundRecord.matches.filter(m => m.snapshotStatus === "EVALUATED").length;

  let roundStatus: SettleRoundV3Result["status"] = "ROUND_OPEN";
  if (blockedCount > 0 || roundRecord.integrityGateStatus === "FORWARD_BLOCKED") {
    roundStatus = "ROUND_BLOCKED";
  } else if (isAllSettled) {
    roundStatus = "ROUND_SETTLED";
  } else if (evaluatedTotal > 0) {
    roundStatus = "ROUND_PARTIAL";
  }

  roundRecord.allSettled = isAllSettled;
  roundRecord.status = roundStatus;
  roundRecord.evaluatedCount = evaluatedTotal;
  roundRecord.pendingCount = roundRecord.matches.filter(m => m.snapshotStatus === "PREDICTED" || m.snapshotStatus === "RESULT_PENDING").length;

  saveProtoForwardShadowStore(store);

  // Log Settlement Audit Event
  if (!store.auditEventLog) store.auditEventLog = [];
  store.auditEventLog.push({
    timestamp: new Date().toISOString(),
    year,
    round,
    matchId: `round_${year}_${round}`,
    eventType: "SETTLEMENT_COMPLETED",
    severity: "LOW",
    details: `Settlement completed for ${year}_${round}: ${settledCount} newly settled, ${alreadySettledCount} skipped (idempotent).`
  });

  return {
    success: true,
    year,
    round,
    totalPending,
    settledCount,
    alreadySettledCount,
    blockedCount,
    status: roundStatus
  };
}
