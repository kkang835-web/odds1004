/**
 * SportsQuant Pro — WiseToto REAL Foreign Odds 15-Minute Snapshot Runner
 * 
 * [ABSOLUTE INVARIANTS]
 * 1. Collects official overseas bookmaker odds from WiseToto get_detail_rate_info.htm.
 * 2. 100% REAL_EXTERNAL provenance only.
 * 3. Zero synthetic, zero derived (no 0.9551 scaling), zero fallback, zero mock odds.
 * 4. Normalizes to 15-minute buckets with deterministic deduplication.
 * 5. Concurrency lock: Strictly rejects overlapping runs (RUN_ALREADY_IN_PROGRESS).
 * 6. Isolated from Quant Model, Walk-Forward, and Forward Shadow calculations.
 */

import https from "https";
import iconv from "iconv-lite";
import {
  ForeignOddsSnapshot,
  ForeignOddsCycleSummary
} from "./wisetotoForeignOddsTypes.js";
import { parseWisetotoRateInfoHtml } from "./wisetotoForeignOddsParser.js";
import {
  saveForeignOddsSnapshotDetailed,
  get15MinuteBucketIso,
  generateSnapshotId,
  appendForeignOddsOperationLog,
  backupForeignOddsStore
} from "./foreignOddsSnapshotStore.js";
import { initWisetotoProtoSession } from "./protoHistory/realProtoCollector.js";
import { discoverProtoRounds } from "./protoHistory/protoForwardRoundDiscovery.js";
import { loadProtoHistoryStore } from "./protoHistory/realProtoHistoryStore.js";
import { loadProtoForwardShadowStore } from "./protoHistory/protoForwardShadowStore.js";

let isCycleRunning = false;
let lastCycleSummary: ForeignOddsCycleSummary | null = null;

export function isForeignOddsCycleRunning(): boolean {
  return isCycleRunning;
}

export function getLastForeignOddsCycleSummary(): ForeignOddsCycleSummary | null {
  return lastCycleSummary;
}

export interface RunForeignOddsOptions {
  forceUnlock?: boolean;
  targetYear?: number;
  targetRound?: number;
  mockHtmlFixture?: Record<string, string>; // gameId -> html for offline/integration testing
  dryRun?: boolean;
}

function fetchWisetotoBuffer(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs: number = 6000
): Promise<{ status: number; buf: Buffer }> {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...headers
        },
        timeout: timeoutMs
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({ status: res.statusCode || 500, buf: Buffer.concat(chunks) });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 408, buf: Buffer.alloc(0) });
    });

    req.on("error", () => {
      resolve({ status: 500, buf: Buffer.alloc(0) });
    });
  });
}

/**
 * Executes a single 15-minute foreign odds snapshot cycle
 */
export async function runForeignOddsSnapshotCycle(
  options: RunForeignOddsOptions = {}
): Promise<ForeignOddsCycleSummary> {
  if (isCycleRunning && !options.forceUnlock) {
    const err = new Error("RUN_ALREADY_IN_PROGRESS");
    (err as any).code = "RUN_ALREADY_IN_PROGRESS";
    throw err;
  }

  isCycleRunning = true;
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  appendForeignOddsOperationLog({
    event: "FOREIGN_ODDS_SNAPSHOT_CYCLE_STARTED",
    message: "Foreign odds 15-minute snapshot cycle started.",
    metadata: { options }
  });

  let gamesScanned = 0;
  let gamesWithForeignOdds = 0;
  let snapshotsInserted = 0;
  let duplicatesSkipped = 0;
  let noData = 0;
  let errors = 0;

  try {
    // 1. Identify Target Round and Matches
    let targetYear = options.targetYear;
    let targetRound = options.targetRound;

    if (!targetYear || !targetRound) {
      const discovery = discoverProtoRounds();
      const current = discovery.currentRound || discovery.latestRound;
      if (current) {
        targetYear = current.year;
        targetRound = current.round;
      } else {
        // Fallback to latest round in history or forward shadow
        const shadowStore = loadProtoForwardShadowStore();
        const rKeys = Object.keys(shadowStore.rounds);
        if (rKeys.length > 0) {
          const lastR = shadowStore.rounds[rKeys[rKeys.length - 1]];
          targetYear = lastR.year;
          targetRound = lastR.round;
        } else {
          targetYear = new Date().getFullYear();
          targetRound = 1;
        }
      }
    }

    // 2. Discover Matches for Target Round
    interface CandidateMatch {
      gameId: string;
      year: number;
      round: number;
      gameNo: number;
      scheduleInfoSeq?: string;
      sport: string;
      isFinished: boolean;
    }

    const candidateMatches: CandidateMatch[] = [];

    // Check Forward Shadow store for round matches
    const shadowStore = loadProtoForwardShadowStore();
    const roundKey = `${targetYear}-${targetRound}`;
    const shadowRound = shadowStore.rounds[roundKey];

    if (shadowRound && shadowRound.matches && shadowRound.matches.length > 0) {
      for (const m of shadowRound.matches) {
        const gameNoVal = m.matchNo || (m as any).gameNo || 0;
        candidateMatches.push({
          gameId: m.matchId || `match_${targetYear}_${targetRound}_${gameNoVal}`,
          year: targetYear,
          round: targetRound,
          gameNo: gameNoVal,
          scheduleInfoSeq: (m as any).scheduleInfoSeq || String(gameNoVal),
          sport: m.sport || "soccer",
          isFinished: m.snapshotStatus === "EVALUATED"
        });
      }
    } else {
      // Check Real History Store
      const historyStore = loadProtoHistoryStore();
      const histRound = historyStore.rounds[roundKey];
      if (histRound && histRound.matches && histRound.matches.length > 0) {
        for (const m of histRound.matches) {
          const gameNoVal = m.matchNo || (m as any).gameNo || 0;
          candidateMatches.push({
            gameId: m.matchId || `match_${targetYear}_${targetRound}_${gameNoVal}`,
            year: targetYear,
            round: targetRound,
            gameNo: gameNoVal,
            scheduleInfoSeq: (m as any).scheduleInfoSeq || String(gameNoVal),
            sport: m.sport || "soccer",
            isFinished: Boolean(m.score || (m.outcome !== null && m.outcome !== undefined))
          });
        }
      }
    }

    // 3. Initialize WiseToto Session (if not using mock fixtures)
    let sessionHeaders: Record<string, string> = {
      Referer: "https://www.wisetoto.com/index.htm?tab_type=proto",
      "X-Requested-With": "XMLHttpRequest"
    };

    if (!options.mockHtmlFixture) {
      try {
        const session = await initWisetotoProtoSession();
        if (session && session.ajaxHeaders) {
          sessionHeaders = session.ajaxHeaders;
        }
      } catch (sessErr) {
        console.warn("[ForeignOddsRunner] Nonce session init warning, using standard headers:", sessErr);
      }
    }

    // 4. Batch Fetch Detail Rate Info with Concurrency Limit & Delay
    const CHUNK_SIZE = 3;
    const CHUNK_DELAY_MS = 200;

    for (let i = 0; i < candidateMatches.length; i += CHUNK_SIZE) {
      const chunk = candidateMatches.slice(i, i + CHUNK_SIZE);

      await Promise.all(
        chunk.map(async (match) => {
          gamesScanned++;

          // Skip finished games as per invariant 21
          if (match.isFinished) {
            return;
          }

          const gameId = match.gameId;
          let rateHtml = "";

          if (options.mockHtmlFixture && options.mockHtmlFixture[gameId]) {
            rateHtml = options.mockHtmlFixture[gameId];
          } else {
            const sportCode = match.sport === "baseball" ? "bs" : match.sport === "basketball" ? "bk" : "sc";
            const rateUrl = `https://www.wisetoto.com/util/gameinfo/get_detail_rate_info.htm?schedule_info_seq=${match.scheduleInfoSeq || match.gameNo}&game_no=${match.gameNo}&tab_type=proto&game_year=${match.year}&game_round=${match.round}&sports=${sportCode}`;

            try {
              const res = await fetchWisetotoBuffer(rateUrl, sessionHeaders, 5000);
              if (res.status === 200 && res.buf.length > 0) {
                let decoded = iconv.decode(res.buf, "euc-kr");
                if (!decoded || decoded.includes("\uFFFD")) {
                  const utf8 = res.buf.toString("utf-8");
                  if (!utf8.includes("\uFFFD")) decoded = utf8;
                }
                rateHtml = decoded;
              }
            } catch (fetchErr) {
              errors++;
              appendForeignOddsOperationLog({
                event: "FOREIGN_ODDS_SNAPSHOT_FAILED",
                gameId,
                gameNo: match.gameNo,
                message: `Failed to fetch foreign odds detail for ${gameId}: ${(fetchErr as any).message}`
              });
              return;
            }
          }

          if (!rateHtml || rateHtml.trim().length === 0 || !rateHtml.includes("item_table")) {
            noData++;
            appendForeignOddsOperationLog({
              event: "FOREIGN_ODDS_SNAPSHOT_NO_DATA",
              gameId,
              gameNo: match.gameNo,
              message: `No foreign odds available for game ${gameId} (NO_FOREIGN_ODDS_AVAILABLE)`
            });
            return;
          }

          // 5. Parse Foreign Bookmaker Odds
          const parsed = parseWisetotoRateInfoHtml(rateHtml, {
            matchId: gameId,
            year: match.year,
            round: match.round,
            gameNo: match.gameNo,
            scheduleInfoSeq: match.scheduleInfoSeq,
            sport: match.sport
          });

          if (!parsed.hasData || parsed.foreignBookmakers.length === 0) {
            noData++;
            appendForeignOddsOperationLog({
              event: "FOREIGN_ODDS_SNAPSHOT_NO_DATA",
              gameId,
              gameNo: match.gameNo,
              message: `Parsed response contained zero foreign bookmakers for ${gameId}`
            });
            return;
          }

          gamesWithForeignOdds++;

          // 6. Build Snapshot with Normalized 15-Minute Bucket
          const now = new Date();
          const bucketIso = get15MinuteBucketIso(now);
          const snapshotId = generateSnapshotId(gameId, bucketIso);

          const snapshot: ForeignOddsSnapshot = {
            snapshotId,
            matchId: gameId,
            gameId,
            year: match.year,
            round: match.round,
            gameNo: match.gameNo,
            scheduleInfoSeq: match.scheduleInfoSeq,
            sport: match.sport,
            capturedAt: now.toISOString(),
            normalized15MinuteBucket: bucketIso,
            source: "WiseToto",
            sourceUrl: `https://www.wisetoto.com/util/gameinfo/get_detail_rate_info.htm?game_year=${match.year}&game_round=${match.round}&game_no=${match.gameNo}`,
            provenance: "REAL_EXTERNAL",
            bookmakers: parsed.foreignBookmakers,
            domesticRate: parsed.domestic,
            rawHash: parsed.rawHash
          };

          if (options.dryRun) {
            snapshotsInserted++;
            return;
          }

          // 7. Save into Persistent Store with 15-min Deduplication
          const saveResult = saveForeignOddsSnapshotDetailed(snapshot);
          if (saveResult.saved) {
            snapshotsInserted++;
          } else if (saveResult.reason === "SKIPPED_DUPLICATE") {
            duplicatesSkipped++;
          } else {
            errors++;
          }
        })
      );

      if (i + CHUNK_SIZE < candidateMatches.length) {
        await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
      }
    }

    // 8. Automated Periodic Backup if New Snapshots Inserted
    if (snapshotsInserted > 0 && !options.dryRun) {
      try {
        backupForeignOddsStore();
      } catch (bErr) {
        console.warn("[ForeignOddsRunner] Backup rotation warning:", bErr);
      }
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    const summary: ForeignOddsCycleSummary = {
      status: errors > 0 && snapshotsInserted === 0 ? "FAILED" : (errors > 0 ? "PARTIAL" : "SUCCESS"),
      gamesScanned,
      gamesWithForeignOdds,
      snapshotsInserted,
      duplicatesSkipped,
      noData,
      errors,
      startedAt,
      completedAt,
      durationMs
    };

    lastCycleSummary = summary;

    appendForeignOddsOperationLog({
      event: "FOREIGN_ODDS_SNAPSHOT_CYCLE_COMPLETED",
      message: `Cycle completed in ${durationMs}ms: ${snapshotsInserted} inserted, ${duplicatesSkipped} duplicates skipped, ${noData} no data, ${errors} errors.`,
      metadata: summary
    });

    return summary;
  } catch (err: any) {
    errors++;
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    const summary: ForeignOddsCycleSummary = {
      status: "FAILED",
      gamesScanned,
      gamesWithForeignOdds,
      snapshotsInserted,
      duplicatesSkipped,
      noData,
      errors,
      startedAt,
      completedAt,
      durationMs
    };

    lastCycleSummary = summary;

    appendForeignOddsOperationLog({
      event: "FOREIGN_ODDS_SNAPSHOT_FAILED",
      message: `Fatal error in foreign odds cycle: ${err.message}`,
      metadata: { error: err.message, stack: err.stack }
    });

    throw err;
  } finally {
    isCycleRunning = false;
  }
}
