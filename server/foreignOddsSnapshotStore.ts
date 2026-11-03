/**
 * SportsQuant Pro — WiseToto REAL Foreign Odds 15-Minute Snapshot Store
 * 
 * [ABSOLUTE INVARIANTS]
 * 1. Dedicated file: data/wiseTotoForeignOddsSnapshotStore.json (or process.env.FOREIGN_ODDS_SNAPSHOT_STORE_PATH).
 * 2. Atomic, thread-safe, fsync-enforced filesystem writes (temp file -> fsync -> rename).
 * 3. Exact provenance tracking: REAL_EXTERNAL only. Zero derived, simulation, mock, or fallback odds.
 * 4. 15-minute bucket deduplication: exactly one snapshot per gameId per 15-minute window.
 * 5. Deterministic Snapshot ID: gameId__bucketIso.
 * 6. Isolated from Quant Model, Walk-Forward, and Forward Shadow storage.
 * 7. Server restart safety: complete persistence, reload integrity, and timeline gap detection.
 */

import fs from "fs";
import path from "path";
import {
  ForeignOddsSnapshot,
  ForeignOddsOperationLog,
  TimelineAuditResult,
  TimelineBucketItem
} from "./wisetotoForeignOddsTypes.js";
import {
  atomicWrite,
  handleCorruptedFile,
  backupStore,
  rotateBackups
} from "./protoHistory/forwardStorageUtils.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
export function getSnapshotStorePath(): string {
  return path.resolve(
    process.cwd(),
    process.env.FOREIGN_ODDS_SNAPSHOT_STORE_PATH || "data/wiseTotoForeignOddsSnapshotStore.json"
  );
}
export const PRIMARY_SNAPSHOT_STORE_PATH = getSnapshotStorePath();
const LEGACY_SNAPSHOT_STORE_PATH = path.resolve(process.cwd(), "data/foreignOddsSnapshots.json");

export interface ForeignOddsStoreData {
  version: "1.0.0-foreign-odds-snapshots";
  updatedAt: string;
  source: "WiseToto";
  provenance: "REAL_EXTERNAL";
  snapshotsByMatch: Record<string, ForeignOddsSnapshot[]>;
  operationLogs: ForeignOddsOperationLog[];
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Calculates normalized 15-minute bucket UTC ISO timestamp
 * e.g. 2026-10-03T15:23:45.123Z -> 2026-10-03T15:15:00.000Z
 */
export function get15MinuteBucketIso(dateInput: Date | string | number = new Date()): string {
  const d = typeof dateInput === "string" || typeof dateInput === "number" ? new Date(dateInput) : dateInput;
  const ms = d.getTime();
  const BUCKET_MS = 15 * 60 * 1000;
  const bucketMs = Math.floor(ms / BUCKET_MS) * BUCKET_MS;
  return new Date(bucketMs).toISOString();
}

/**
 * Deterministically generates a unique snapshot ID based on matchId and 15-minute bucket
 */
export function generateSnapshotId(gameId: string, bucketIso: string): string {
  return `${gameId}__${bucketIso}`;
}

export function loadForeignOddsStore(): ForeignOddsStoreData {
  ensureDataDir();

  const primaryPath = getSnapshotStorePath();
  let targetPath = primaryPath;
  if (!fs.existsSync(primaryPath) && fs.existsSync(LEGACY_SNAPSHOT_STORE_PATH)) {
    targetPath = LEGACY_SNAPSHOT_STORE_PATH;
  }

  if (!fs.existsSync(targetPath)) {
    return {
      version: "1.0.0-foreign-odds-snapshots",
      updatedAt: new Date().toISOString(),
      source: "WiseToto",
      provenance: "REAL_EXTERNAL",
      snapshotsByMatch: {},
      operationLogs: []
    };
  }

  try {
    const raw = fs.readFileSync(targetPath, "utf-8");
    const data = JSON.parse(raw);
    if (!data.snapshotsByMatch || typeof data.snapshotsByMatch !== "object") {
      data.snapshotsByMatch = {};
    }
    if (!Array.isArray(data.operationLogs)) {
      data.operationLogs = [];
    }
    return data;
  } catch (err) {
    console.error("[ForeignOddsStore] Corrupted JSON detected in snapshot store:", err);
    try {
      handleCorruptedFile(targetPath, err);
    } catch {}
    return {
      version: "1.0.0-foreign-odds-snapshots",
      updatedAt: new Date().toISOString(),
      source: "WiseToto",
      provenance: "REAL_EXTERNAL",
      snapshotsByMatch: {},
      operationLogs: []
    };
  }
}

export function saveForeignOddsStore(data: ForeignOddsStoreData): void {
  ensureDataDir();
  data.updatedAt = new Date().toISOString();
  data.provenance = "REAL_EXTERNAL";
  data.source = "WiseToto";

  // Retain maximum 1000 operation logs to prevent unbounded file growth
  if (data.operationLogs && data.operationLogs.length > 1000) {
    data.operationLogs = data.operationLogs.slice(-1000);
  }

  const jsonStr = JSON.stringify(data, null, 2);
  atomicWrite(getSnapshotStorePath(), jsonStr);
}

export interface SaveSnapshotResult {
  saved: boolean;
  reason: "SAVED" | "SKIPPED_DUPLICATE" | "NO_REAL_EXTERNAL" | "INVALID_DATA";
  snapshotId?: string;
  gameId?: string;
  bucket?: string;
}

/**
 * Saves a single foreign odds snapshot with strict REAL_EXTERNAL validation and 15-minute deduplication
 */
export function saveForeignOddsSnapshotDetailed(snapshot: ForeignOddsSnapshot): SaveSnapshotResult {
  const gameId = snapshot.gameId || snapshot.matchId;
  if (!snapshot || !gameId || !Array.isArray(snapshot.bookmakers) || snapshot.bookmakers.length === 0) {
    return { saved: false, reason: "INVALID_DATA" };
  }

  // 1. Strict REAL_EXTERNAL Provenance Validation
  if (snapshot.source !== "WiseToto" || snapshot.provenance !== "REAL_EXTERNAL") {
    console.warn(`[ForeignOddsStore] Rejected snapshot ${snapshot.snapshotId}: Invalid provenance (${snapshot.provenance})`);
    return { saved: false, reason: "NO_REAL_EXTERNAL" };
  }

  const hasUnverifiedBookmaker = snapshot.bookmakers.some(
    b => b.source !== "WiseToto" || b.provenance !== "REAL_EXTERNAL" || (b as any).isSimulated || (b as any).isFallback
  );
  if (hasUnverifiedBookmaker) {
    console.warn(`[ForeignOddsStore] Rejected snapshot for ${gameId}: Contains non-REAL_EXTERNAL bookmaker.`);
    return { saved: false, reason: "NO_REAL_EXTERNAL" };
  }

  const store = loadForeignOddsStore();

  if (!store.snapshotsByMatch[gameId]) {
    store.snapshotsByMatch[gameId] = [];
  }

  const existingList = store.snapshotsByMatch[gameId];

  // 2. Ensure Normalized 15-Minute Bucket and Deterministic Snapshot ID
  const capturedAtDate = snapshot.capturedAt ? new Date(snapshot.capturedAt) : new Date();
  const bucketIso = snapshot.normalized15MinuteBucket || get15MinuteBucketIso(capturedAtDate);
  snapshot.normalized15MinuteBucket = bucketIso;
  snapshot.matchId = gameId;
  snapshot.gameId = gameId;

  if (!snapshot.snapshotId || !snapshot.snapshotId.includes("__")) {
    snapshot.snapshotId = generateSnapshotId(gameId, bucketIso);
  }

  // 3. Deduplication Check: Same gameId + same 15-minute bucket
  const duplicate = existingList.find(
    s => s.normalized15MinuteBucket === bucketIso || s.snapshotId === snapshot.snapshotId
  );

  if (duplicate) {
    appendForeignOddsOperationLogInternal(store, {
      logId: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      event: "FOREIGN_ODDS_SNAPSHOT_SKIPPED_DUPLICATE",
      gameId,
      gameNo: snapshot.gameNo,
      message: `Skipped duplicate snapshot for game ${gameId} in bucket ${bucketIso}`,
      metadata: { bucket: bucketIso, snapshotId: snapshot.snapshotId }
    });
    // Save store to persist log if needed
    saveForeignOddsStore(store);
    return {
      saved: false,
      reason: "SKIPPED_DUPLICATE",
      snapshotId: duplicate.snapshotId,
      gameId,
      bucket: bucketIso
    };
  }

  // 4. Append New Snapshot
  existingList.push(snapshot);

  appendForeignOddsOperationLogInternal(store, {
    logId: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    event: "FOREIGN_ODDS_SNAPSHOT_COLLECTED",
    gameId,
    gameNo: snapshot.gameNo,
    message: `Collected ${snapshot.bookmakers.length} bookmakers for game ${gameId} in bucket ${bucketIso}`,
    metadata: {
      bucket: bucketIso,
      snapshotId: snapshot.snapshotId,
      bookmakers: snapshot.bookmakers.map(b => b.normalizedName)
    }
  });

  saveForeignOddsStore(store);

  return {
    saved: true,
    reason: "SAVED",
    snapshotId: snapshot.snapshotId,
    gameId,
    bucket: bucketIso
  };
}

/**
 * Backward compatible boolean return for saveForeignOddsSnapshot
 */
export function saveForeignOddsSnapshot(snapshot: ForeignOddsSnapshot): boolean {
  const result = saveForeignOddsSnapshotDetailed(snapshot);
  return result.saved;
}

function appendForeignOddsOperationLogInternal(
  store: ForeignOddsStoreData,
  log: ForeignOddsOperationLog
): void {
  if (!store.operationLogs) store.operationLogs = [];
  store.operationLogs.push(log);
}

/**
 * Appends an operation log entry to store
 */
export function appendForeignOddsOperationLog(log: Omit<ForeignOddsOperationLog, "logId" | "timestamp"> & { logId?: string; timestamp?: string }): void {
  const store = loadForeignOddsStore();
  const completeLog: ForeignOddsOperationLog = {
    logId: log.logId || `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: log.timestamp || new Date().toISOString(),
    event: log.event,
    gameId: log.gameId,
    gameNo: log.gameNo,
    message: log.message,
    metadata: log.metadata
  };
  appendForeignOddsOperationLogInternal(store, completeLog);
  saveForeignOddsStore(store);
}

export function getForeignOddsOperationLogs(limit: number = 100): ForeignOddsOperationLog[] {
  const store = loadForeignOddsStore();
  const logs = store.operationLogs || [];
  return logs.slice(-limit);
}

/**
 * Retrieves the latest snapshot for a specific match
 */
export function getLatestForeignOddsSnapshot(matchId: string): ForeignOddsSnapshot | null {
  const store = loadForeignOddsStore();
  const list = store.snapshotsByMatch[matchId];
  if (!list || list.length === 0) return null;
  return list[list.length - 1];
}

/**
 * Retrieves all snapshots (optionally filtered by matchId/gameId)
 */
export function getAllForeignOddsSnapshots(matchId?: string): ForeignOddsSnapshot[] {
  const store = loadForeignOddsStore();
  if (matchId) {
    return store.snapshotsByMatch[matchId] || [];
  }

  const all: ForeignOddsSnapshot[] = [];
  for (const list of Object.values(store.snapshotsByMatch)) {
    all.push(...list);
  }
  return all;
}

/**
 * Performs timeline gap analysis across 15-minute buckets for a match
 */
export function auditForeignOddsSnapshotsTimeline(gameId: string): TimelineAuditResult {
  const store = loadForeignOddsStore();
  const list = store.snapshotsByMatch[gameId] || [];

  if (list.length === 0) {
    return {
      gameId,
      status: "NO_FOREIGN_ODDS_AVAILABLE",
      totalSnapshots: 0,
      firstCapturedAt: null,
      lastCapturedAt: null,
      expectedBuckets: 0,
      capturedBuckets: 0,
      missingBuckets: [],
      timeline: []
    };
  }

  // Sort by bucket ascending
  const sorted = [...list].sort(
    (a, b) => new Date(a.normalized15MinuteBucket).getTime() - new Date(b.normalized15MinuteBucket).getTime()
  );

  const firstBucketMs = new Date(sorted[0].normalized15MinuteBucket).getTime();
  const lastBucketMs = new Date(sorted[sorted.length - 1].normalized15MinuteBucket).getTime();
  const BUCKET_STEP_MS = 15 * 60 * 1000;

  const capturedMap = new Map<string, ForeignOddsSnapshot>();
  for (const snap of sorted) {
    capturedMap.set(snap.normalized15MinuteBucket, snap);
  }

  const timeline: TimelineBucketItem[] = [];
  const missingBuckets: string[] = [];

  for (let t = firstBucketMs; t <= lastBucketMs; t += BUCKET_STEP_MS) {
    const bucketIso = new Date(t).toISOString();
    const existing = capturedMap.get(bucketIso);
    if (existing) {
      timeline.push({
        bucket: bucketIso,
        status: "CAPTURED",
        snapshotId: existing.snapshotId,
        capturedAt: existing.capturedAt,
        bookmakerCount: existing.bookmakers.length
      });
    } else {
      timeline.push({
        bucket: bucketIso,
        status: "MISSING"
      });
      missingBuckets.push(bucketIso);
    }
  }

  let status: TimelineAuditResult["status"] = "COMPLETE";
  if (missingBuckets.length > 0) {
    status = "GAP_DETECTED";
  }

  return {
    gameId,
    status,
    totalSnapshots: list.length,
    firstCapturedAt: sorted[0].capturedAt,
    lastCapturedAt: sorted[sorted.length - 1].capturedAt,
    expectedBuckets: timeline.length,
    capturedBuckets: sorted.length,
    missingBuckets,
    timeline
  };
}

/**
 * Returns store summary statistics
 */
export function getForeignOddsStoreSummary(): {
  totalSnapshots: number;
  matchCount: number;
  uniqueBookmakers: string[];
  latestCapturedAt: string | null;
  storePath: string;
} {
  const store = loadForeignOddsStore();
  const matchIds = Object.keys(store.snapshotsByMatch);
  let totalSnapshots = 0;
  const bookmakerSet = new Set<string>();
  let latestCapturedAt: string | null = null;

  for (const list of Object.values(store.snapshotsByMatch)) {
    totalSnapshots += list.length;
    for (const snap of list) {
      if (!latestCapturedAt || snap.capturedAt > latestCapturedAt) {
        latestCapturedAt = snap.capturedAt;
      }
      for (const bm of snap.bookmakers) {
        bookmakerSet.add(bm.normalizedName || bm.bookmaker);
      }
    }
  }

  return {
    totalSnapshots,
    matchCount: matchIds.length,
    uniqueBookmakers: Array.from(bookmakerSet),
    latestCapturedAt,
    storePath: PRIMARY_SNAPSHOT_STORE_PATH
  };
}

/**
 * Creates a gzipped backup of the current snapshot store
 */
export function backupForeignOddsStore(): string | null {
  const store = loadForeignOddsStore();
  const backupPath = backupStore(
    PRIMARY_SNAPSHOT_STORE_PATH,
    "wiseTotoForeignOddsSnapshotStore",
    store
  );
  if (backupPath) {
    rotateBackups("wiseTotoForeignOddsSnapshotStore", 30);
  }
  return backupPath;
}
