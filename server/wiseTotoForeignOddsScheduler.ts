/**
 * SportsQuant Pro — WiseToto REAL Foreign Odds 15-Minute Operational Scheduler
 * 
 * [ABSOLUTE INVARIANTS]
 * 1. Default interval: 15 minutes (900,000 ms).
 * 2. Concurrency Lock: Strictly rejects overlapping executions (SKIP_OVERLAP / RUN_ALREADY_IN_PROGRESS).
 * 3. Fail-Closed Resilience: On error, retains existing store state and records audit event.
 * 4. Graceful shutdown: Cleanly clears timers.
 * 5. Full observability: Real-time telemetry on scheduler status, uptime, next run, statistics.
 */

import {
  runForeignOddsSnapshotCycle,
  isForeignOddsCycleRunning,
  getLastForeignOddsCycleSummary,
  RunForeignOddsOptions
} from "./wiseTotoForeignOddsRunner.js";
import {
  ForeignOddsCycleSummary,
  ForeignOddsSchedulerStatus
} from "./wisetotoForeignOddsTypes.js";
import {
  appendForeignOddsOperationLog,
  loadForeignOddsStore
} from "./foreignOddsSnapshotStore.js";

class WiseTotoForeignOddsScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isCycleActive: boolean = false;
  private intervalMs: number = 15 * 60 * 1000; // 15 minutes
  private startedAt: string | null = null;
  private lastRunStartedAt: string | null = null;
  private lastRunCompletedAt: string | null = null;
  private nextRunAt: string | null = null;
  private totalScheduledRuns: number = 0;
  private successfulRuns: number = 0;
  private failedRuns: number = 0;
  private lastRunSummary: ForeignOddsCycleSummary | null = null;
  private lastError: string | null = null;

  constructor() {
    const envInterval = process.env.FOREIGN_ODDS_SNAPSHOT_INTERVAL_MS;
    if (envInterval) {
      const parsed = parseInt(envInterval, 10);
      if (!isNaN(parsed) && parsed >= 5000) {
        this.intervalMs = parsed;
      }
    }
  }

  /**
   * Starts the 15-minute periodic foreign odds scheduler.
   */
  public start(intervalMs?: number): ForeignOddsSchedulerStatus {
    if (intervalMs && intervalMs >= 5000) {
      this.intervalMs = intervalMs;
    }

    if (this.isRunning && this.timer) {
      return this.getStatus();
    }

    this.isRunning = true;
    this.startedAt = new Date().toISOString();
    this.calculateNextRun();

    appendForeignOddsOperationLog({
      event: "SCHEDULER_STARTED",
      message: `WiseToto foreign odds 15-minute scheduler started with interval ${this.intervalMs}ms (${(this.intervalMs / 60000).toFixed(1)}m).`
    });

    this.timer = setInterval(() => {
      this.executeCycle(false).catch((err) => {
        console.error("[FOREIGN ODDS SCHEDULER CYCLE ERROR]", err);
      });
    }, this.intervalMs);

    console.log(`[FOREIGN ODDS SCHEDULER] Started. Interval: ${(this.intervalMs / 60000).toFixed(1)}m. Next run: ${this.nextRunAt}`);
    return this.getStatus();
  }

  /**
   * Stops the operational scheduler.
   */
  public stop(): ForeignOddsSchedulerStatus {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.isRunning = false;
    this.nextRunAt = null;

    appendForeignOddsOperationLog({
      event: "SCHEDULER_STOPPED",
      message: "WiseToto foreign odds 15-minute scheduler stopped."
    });

    console.log("[FOREIGN ODDS SCHEDULER] Stopped.");
    return this.getStatus();
  }

  /**
   * Triggers an immediate manual collection cycle under run lock.
   */
  public async triggerManual(options: RunForeignOddsOptions = {}): Promise<ForeignOddsCycleSummary> {
    console.log("[FOREIGN ODDS SCHEDULER] Manual cycle triggered by operator.");
    return this.executeCycle(true, options);
  }

  /**
   * Executes a single operational cycle with fail-closed safety.
   */
  private async executeCycle(
    isManual: boolean,
    options: RunForeignOddsOptions = {}
  ): Promise<ForeignOddsCycleSummary> {
    if (this.isCycleActive || (isForeignOddsCycleRunning() && !options.forceUnlock)) {
      const err = new Error("RUN_ALREADY_IN_PROGRESS");
      (err as any).code = "RUN_ALREADY_IN_PROGRESS";
      (err as any).status = "SKIP_OVERLAP";
      throw err;
    }

    this.isCycleActive = true;
    this.lastRunStartedAt = new Date().toISOString();
    this.totalScheduledRuns++;

    try {
      const summary = await runForeignOddsSnapshotCycle(options);
      this.lastRunSummary = summary;
      this.lastRunCompletedAt = new Date().toISOString();
      this.lastError = null;

      if (summary.status === "SUCCESS" || summary.status === "PARTIAL") {
        this.successfulRuns++;
      } else {
        this.failedRuns++;
      }

      this.calculateNextRun();
      return summary;
    } catch (err: any) {
      this.failedRuns++;
      this.lastError = err.message || String(err);
      this.lastRunCompletedAt = new Date().toISOString();
      this.calculateNextRun();
      throw err;
    } finally {
      this.isCycleActive = false;
    }
  }

  private calculateNextRun(): void {
    if (!this.isRunning) {
      this.nextRunAt = null;
      return;
    }
    const nextMs = Date.now() + this.intervalMs;
    this.nextRunAt = new Date(nextMs).toISOString();
  }

  /**
   * Returns complete real-time status of the scheduler
   */
  public getStatus(): ForeignOddsSchedulerStatus {
    const store = loadForeignOddsStore();
    return {
      isRunning: this.isRunning,
      isCycleActive: this.isCycleActive || isForeignOddsCycleRunning(),
      intervalMs: this.intervalMs,
      intervalMinutes: +(this.intervalMs / (60 * 1000)).toFixed(1),
      startedAt: this.startedAt,
      lastRunStartedAt: this.lastRunStartedAt,
      lastRunCompletedAt: this.lastRunCompletedAt,
      nextRunAt: this.nextRunAt,
      totalScheduledRuns: this.totalScheduledRuns,
      successfulRuns: this.successfulRuns,
      failedRuns: this.failedRuns,
      lastRunSummary: this.lastRunSummary || getLastForeignOddsCycleSummary(),
      lastError: this.lastError
    };
  }
}

// Global Singleton Instance
export const foreignOddsScheduler = new WiseTotoForeignOddsScheduler();
