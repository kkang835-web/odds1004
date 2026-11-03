/**
 * SportsQuant Pro — PROTO Forward Shadow Store
 * 
 * [ABSOLUTE GUARDRAILS]
 * 1. Dedicated file: data/protoForwardShadowStore.json.
 * 2. Complete logical and physical isolation from historical backtest datasets.
 * 3. Enforces zero synthetic, zero simulated, zero fallback records.
 * 4. Prediction snapshots are immutable once created.
 * 5. Auto-promotion is PERMANENTLY_DISABLED.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  ProtoForwardShadowStoreData,
  ProtoForwardShadowRoundRecord,
  ProtoForwardShadowPredictionRecord
} from "./protoForwardShadowTypes.js";
import {
  atomicWrite,
  handleCorruptedFile,
  backupStore,
  rotateBackups
} from "./forwardStorageUtils.js";

export function computeSnapshotHash(m: any): string {
  const data = JSON.stringify({
    matchId: m.matchId,
    year: m.year,
    round: m.round,
    matchNo: m.matchNo,
    odds: m.odds,
    selectedOutcome: m.selectedOutcome,
    selectedOdds: m.selectedOdds,
    noVigProbability: m.noVigProbability,
    v1ModelProbability: m.v1ModelProbability,
    exp01Probability: m.exp01Probability,
    exp02Probability: m.exp02Probability,
    v1EV: m.v1EV,
    exp01EV: m.exp01EV,
    exp02EV: m.exp02EV,
    predictionCreatedAt: m.predictionCreatedAt
  });
  return crypto.createHash("sha256").update(data).digest("hex");
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const PROD_STORE_PATH = path.join(DATA_DIR, "protoForwardShadowStore.json");
const TEST_STORE_PATH = path.join("/tmp", "test_protoForwardShadowStore.json");

function getStorePath(): string {
  if (process.env.IS_TEST_MODE === "true" || process.env.NODE_ENV === "test") {
    return TEST_STORE_PATH;
  }
  return process.env.PROTO_FORWARD_STORE_PATH || PROD_STORE_PATH;
}

function getDefaultStore(): ProtoForwardShadowStoreData {
  return {
    version: "1.0.0-proto-forward-shadow",
    environment: "LIVE_SHADOW",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dataSource: "wisetoto_official_real",
    isSimulated: false,
    autoPromotion: "PERMANENTLY_DISABLED",
    productionModel: "PROTO_V1_PRODUCTION",
    shadowCandidates: ["PROTO_V2_EXP01_SHADOW", "PROTO_V2_EXP02_SHADOW"],
    benchmark: "NO_VIG_SHIN_BENCHMARK",
    rounds: {},
    auditTotals: {
      totalSnapshots: 0,
      predicted: 0,
      pending: 0,
      evaluated: 0,
      unavailable: 0,
      invalid: 0,
      syntheticRecords: 0,
      fallbackUsed: 0,
      lookaheadViolations: 0,
      temporalSequenceViolations: 0,
      duplicateRecords: 0,
      invalidOddsUsed: 0,
      inverseScoreRecords: 0
    }
  };
}

/**
 * Loads PROTO Forward Shadow Store from disk
 */
export function loadProtoForwardShadowStore(): ProtoForwardShadowStoreData {
  const storePath = getStorePath();
  if (fs.existsSync(storePath)) {
    try {
      const raw = fs.readFileSync(storePath, "utf-8");
      const parsed = JSON.parse(raw) as ProtoForwardShadowStoreData;
      return parsed;
    } catch (err) {
      handleCorruptedFile(storePath, err);
    }
  } else if (storePath === TEST_STORE_PATH && fs.existsSync(PROD_STORE_PATH)) {
    try {
      const raw = fs.readFileSync(PROD_STORE_PATH, "utf-8");
      const parsed = JSON.parse(raw) as ProtoForwardShadowStoreData;
      return parsed;
    } catch (err) {
      handleCorruptedFile(PROD_STORE_PATH, err);
    }
  }

  const defaultStore = getDefaultStore();
  saveProtoForwardShadowStore(defaultStore);
  return defaultStore;
}

/**
 * Saves PROTO Forward Shadow Store to disk with recalculation of audit totals
 */
export function saveProtoForwardShadowStore(store: ProtoForwardShadowStoreData): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Recompute audit totals and round-level integrity gates across all rounds
    let total = 0;
    let predicted = 0;
    let pending = 0;
    let evaluated = 0;
    let unavailable = 0;
    let invalid = 0;

    let storeSynthetic = 0;
    let storeFallback = 0;
    let storeLookahead = 0;
    let storeTemporal = 0;
    let storeDuplicate = 0;
    let storeInvalidOdds = 0;
    let storeInverseScore = 0;
    let storeImmutability = 0;
    let storeRetrospective = 0;
    let storeInvalidMarket = 0;
    let storeMissingTimestamp = 0;

    const seenIdsGlobal = new Set<string>();

    for (const round of Object.values(store.rounds)) {
      let rSynthetic = 0;
      let rFallback = 0;
      let rInvalidOdds = 0;
      let rInverseScore = 0;
      let rLookahead = 0;
      let rDuplicate = 0;
      let rTemporal = 0;
      let rImmutability = 0;
      let rRetrospective = 0;
      let rInvalidMarket = 0;
      let rMissingTimestamp = 0;

      const rSeenIds = new Set<string>();
      const rSeenMatchNos = new Set<number>();

      for (const m of round.matches) {
        total++;

        let isBlocked = false;

        const logEvent = (eventType: "SNAPSHOT_MUTATION" | "LOOKAHEAD_VIOLATION" | "DUPLICATE_MATCH" | "RETROSPECTIVE_PREDICTION" | "INVALID_RESULT" | "TEMPORAL_SEQUENCE_VIOLATION" | "SYNTHETIC_RECORD" | "FALLBACK_USED" | "INVALID_ODDS" | "INVERSE_SCORE" | "INVALID_MARKET" | "MISSING_TIMESTAMP", severity: "HIGH" | "MEDIUM" | "LOW", details: string) => {
          if (!store.auditEventLog) store.auditEventLog = [];
          const exists = store.auditEventLog.some(e => e.matchId === m.matchId && e.eventType === eventType);
          if (!exists) {
            store.auditEventLog.push({
              timestamp: new Date().toISOString(),
              year: m.year,
              round: m.round,
              matchId: m.matchId,
              eventType,
              severity,
              details
            });
          }
        };

        // 1. Synthetic Check
        const isSynthetic = (m as any).isSimulated || (m as any).syntheticUsed || m.dataSource !== "real" || (m as any).synthetic === true;
        if (isSynthetic) {
          rSynthetic++;
          isBlocked = true;
          logEvent("SYNTHETIC_RECORD", "HIGH", `Synthetic or simulated data detected.`);
        }

        // 2. Fallback Check
        const isFallback = (m as any).fallbackUsed === true || (m as any).fallback === true;
        if (isFallback) {
          rFallback++;
          isBlocked = true;
          logEvent("FALLBACK_USED", "MEDIUM", `Fallback data or odds detected.`);
        }

        // 3. Lookahead Check
        const isLookahead = m.lookaheadViolation === true || (m.resultPublishedAt && new Date(m.predictionCreatedAt).getTime() >= new Date(m.resultPublishedAt).getTime());
        if (isLookahead) {
          rLookahead++;
          isBlocked = true;
          logEvent("LOOKAHEAD_VIOLATION", "HIGH", `Lookahead violation: result was published prior to prediction creation.`);
        }

        // 4. Duplicate Check
        const isDuplicate = rSeenIds.has(m.matchId) || rSeenMatchNos.has(m.matchNo) || seenIdsGlobal.has(m.matchId);
        if (isDuplicate) {
          rDuplicate++;
          isBlocked = true;
          logEvent("DUPLICATE_MATCH", "HIGH", `Duplicate match ID (${m.matchId}) or match No (${m.matchNo}) detected.`);
        }
        rSeenIds.add(m.matchId);
        rSeenMatchNos.add(m.matchNo);
        seenIdsGlobal.add(m.matchId);

        // 5. Invalid Odds Check
        const isInvalidOdds = !m.odds || m.odds.win <= 1.0 || m.odds.lose <= 1.0 || (m.odds.draw !== null && m.odds.draw <= 1.0) || m.selectedOdds <= 1.0;
        if (isInvalidOdds) {
          rInvalidOdds++;
          isBlocked = true;
          logEvent("INVALID_ODDS", "MEDIUM", `Invalid odds values: ${JSON.stringify(m.odds)}`);
        }

        // 6. Inverse Score Check
        const isInverseScore = m.score && (m.score.home !== null && m.score.home < 0 || m.score.away !== null && m.score.away < 0);
        if (isInverseScore) {
          rInverseScore++;
          isBlocked = true;
          logEvent("INVERSE_SCORE", "HIGH", `Inverse or negative score detected: ${JSON.stringify(m.score)}`);
        }

        // 7. Temporal Sequence Check
        const isTemporalViolation = m.settledAt && m.predictionCreatedAt && (new Date(m.predictionCreatedAt).getTime() > new Date(m.settledAt).getTime() || (m.resultPublishedAt && new Date(m.resultPublishedAt).getTime() > new Date(m.settledAt).getTime()));
        if (isTemporalViolation) {
          rTemporal++;
          isBlocked = true;
          logEvent("TEMPORAL_SEQUENCE_VIOLATION", "HIGH", `Temporal sequence violation: predictionCreatedAt > settledAt or resultPublishedAt > settledAt.`);
        }

        // 8. Snapshot Mutation Check
        const currentHash = computeSnapshotHash(m);
        let isMutation = false;
        if (!m.snapshotHash) {
          m.snapshotHash = currentHash;
        } else if (m.snapshotHash !== currentHash) {
          isMutation = true;
          m.snapshotImmutabilityViolation = true;
          rImmutability++;
          isBlocked = true;
          logEvent("SNAPSHOT_MUTATION", "HIGH", `Snapshot mutation detected: hash mismatch.`);
        }

        // 9. Retrospective Check
        const isRetrospective = m.snapshotStatus === "INELIGIBLE_RETROSPECTIVE";
        if (isRetrospective) {
          rRetrospective++;
          isBlocked = true;
          logEvent("RETROSPECTIVE_PREDICTION", "HIGH", `Retrospective prediction created for already completed match.`);
        }

        // 10. Invalid Market Check
        const isInvalidMarket = m.market !== "Standard_1X2_ML";
        if (isInvalidMarket) {
          rInvalidMarket++;
          isBlocked = true;
          logEvent("INVALID_MARKET", "MEDIUM", `Invalid market type detected: ${m.market}`);
        }

        // 11. Missing Timestamp Check
        const isMissingTimestamp = !m.predictionCreatedAt || (m.snapshotStatus === "EVALUATED" && !m.settledAt);
        if (isMissingTimestamp) {
          rMissingTimestamp++;
          isBlocked = true;
          logEvent("MISSING_TIMESTAMP", "HIGH", `Critical timestamp missing.`);
        }

        // Hard Block Activation
        if (isBlocked) {
          m.snapshotStatus = "FORWARD_BLOCKED";
        }

        if (m.snapshotStatus === "PREDICTED") predicted++;
        else if (m.snapshotStatus === "RESULT_PENDING") pending++;
        else if (m.snapshotStatus === "EVALUATED") evaluated++;
        else if (m.snapshotStatus === "UNAVAILABLE" || m.snapshotStatus === "INELIGIBLE_RETROSPECTIVE") unavailable++;
        else if (m.snapshotStatus === "INVALID" || m.snapshotStatus === "FORWARD_BLOCKED") invalid++;
      }

      round.syntheticRecords = rSynthetic;
      round.fallbackUsed = rFallback;
      round.invalidOddsUsed = rInvalidOdds;
      round.inverseScoreRecords = rInverseScore;
      round.lookaheadViolations = rLookahead;
      round.duplicateRecords = rDuplicate;
      round.temporalSequenceViolations = rTemporal;
      round.snapshotImmutabilityViolations = rImmutability;

      const isRoundBlocked = (
        rSynthetic > 0 ||
        rFallback > 0 ||
        rInvalidOdds > 0 ||
        rInverseScore > 0 ||
        rLookahead > 0 ||
        rDuplicate > 0 ||
        rTemporal > 0 ||
        rImmutability > 0 ||
        rRetrospective > 0 ||
        rInvalidMarket > 0 ||
        rMissingTimestamp > 0
      );

      round.integrityGateStatus = isRoundBlocked ? "FORWARD_BLOCKED" : "FORWARD_ELIGIBLE";

      storeSynthetic += rSynthetic;
      storeFallback += rFallback;
      storeInvalidOdds += rInvalidOdds;
      storeInverseScore += rInverseScore;
      storeLookahead += rLookahead;
      storeDuplicate += rDuplicate;
      storeTemporal += rTemporal;
      storeImmutability += rImmutability;
      storeRetrospective += rRetrospective;
      storeInvalidMarket += rInvalidMarket;
      storeMissingTimestamp += rMissingTimestamp;
    }

    store.auditTotals = {
      totalSnapshots: total,
      predicted,
      pending,
      evaluated,
      unavailable,
      invalid,
      syntheticRecords: storeSynthetic,
      fallbackUsed: storeFallback,
      lookaheadViolations: storeLookahead,
      temporalSequenceViolations: storeTemporal,
      duplicateRecords: storeDuplicate,
      invalidOddsUsed: storeInvalidOdds,
      inverseScoreRecords: storeInverseScore,
      snapshotMutationRecords: storeImmutability,
      retrospectiveRecords: storeRetrospective,
      invalidMarketRecords: storeInvalidMarket,
      missingTimestampRecords: storeMissingTimestamp
    };

    store.updatedAt = new Date().toISOString();
    const storePath = getStorePath();
    atomicWrite(storePath, JSON.stringify(store, null, 2));

    // After successful atomic write, create a zipped backup and rotate oldest
    // Backup condition: on normal operations (non-test environments, or custom triggers)
    // We backup only if it's the live production path and auto backup is explicitly enabled
    if (storePath === PROD_STORE_PATH) {
      if (process.env.FORWARD_SHADOW_AUTO_BACKUP === "true") {
        backupStore(storePath, "protoForwardShadowStore", store);
        rotateBackups("protoForwardShadowStore", 30);
      } else {
        console.log("[ProtoForwardShadowStore] Automated backup skipped (FORWARD_SHADOW_AUTO_BACKUP is not 'true').");
      }
    }
  } catch (err) {
    console.error("[ProtoForwardShadowStore] Error saving store to disk:", err);
  }
}

/**
 * Upserts a forward shadow round ensuring snapshot immutability
 */
export function upsertProtoForwardShadowRound(round: ProtoForwardShadowRoundRecord): void {
  const store = loadProtoForwardShadowStore();
  const roundKey = `${round.year}_${round.round}`;
  const existing = store.rounds[roundKey];

  if (!existing) {
    store.rounds[roundKey] = round;
  } else {
    // Preserve existing immutable predictionCreated timestamp and snapshots
    const matchMap = new Map<number, ProtoForwardShadowPredictionRecord>();
    for (const m of existing.matches) {
      matchMap.set(m.matchNo, m);
    }

    const mergedMatches: ProtoForwardShadowPredictionRecord[] = [];
    for (const incoming of round.matches) {
      const prev = matchMap.get(incoming.matchNo);
      if (prev) {
        // If already evaluated, keep evaluation
        if (prev.snapshotStatus === "EVALUATED") {
          mergedMatches.push(prev);
        } else if (incoming.actualOutcome !== null && incoming.actualOutcome !== undefined) {
          // Transition from PREDICTED/RESULT_PENDING to EVALUATED
          mergedMatches.push({
            ...prev,
            score: incoming.score,
            actualOutcome: incoming.actualOutcome,
            settledAt: incoming.settledAt || new Date().toISOString(),
            snapshotStatus: "EVALUATED",
            isHitV1: incoming.isHitV1,
            isHitExp01: incoming.isHitExp01,
            isHitExp02: incoming.isHitExp02,
            isHitNoVig: incoming.isHitNoVig,
            isHitV1MaxEv: incoming.isHitV1MaxEv,
            isHitExp01MaxEv: incoming.isHitExp01MaxEv,
            isHitExp02MaxEv: incoming.isHitExp02MaxEv,
            roiV1: incoming.roiV1,
            roiExp01: incoming.roiExp01,
            roiExp02: incoming.roiExp02,
            roiNoVig: incoming.roiNoVig,
            brierV1: incoming.brierV1,
            brierExp01: incoming.brierExp01,
            brierExp02: incoming.brierExp02,
            brierNoVig: incoming.brierNoVig,
            logLossV1: incoming.logLossV1,
            logLossExp01: incoming.logLossExp01,
            logLossExp02: incoming.logLossExp02,
            logLossNoVig: incoming.logLossNoVig
          });
        } else {
          mergedMatches.push(prev);
        }
      } else {
        mergedMatches.push(incoming);
      }
    }

    round.matches = mergedMatches;
    store.rounds[roundKey] = round;
  }

  saveProtoForwardShadowStore(store);
}

/**
 * Retrieves a single forward shadow round
 */
export function getProtoForwardShadowRound(year: number, round: number): ProtoForwardShadowRoundRecord | null {
  const store = loadProtoForwardShadowStore();
  const roundKey = `${year}_${round}`;
  return store.rounds[roundKey] ?? null;
}

/**
 * Retrieves all flat prediction records across all forward shadow rounds
 */
export function getAllProtoForwardShadowRecords(): ProtoForwardShadowPredictionRecord[] {
  const store = loadProtoForwardShadowStore();
  const all: ProtoForwardShadowPredictionRecord[] = [];
  for (const r of Object.values(store.rounds)) {
    all.push(...r.matches);
  }
  return all;
}
