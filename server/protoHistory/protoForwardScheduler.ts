import crypto from "crypto";
import { runForwardShadowCycle, isForwardCycleRunning, ForwardCycleSummary } from "./protoForwardRunner.js";
import { backupStore, rotateBackups, verifyBackupDryRun, getLatestBackup } from "./forwardStorageUtils.js";
import { loadProtoForwardShadowStore, saveProtoForwardShadowStore } from "./protoForwardShadowStore.js";

export interface ForwardSchedulerStatus {
  isRunning: boolean;
  isCycleActive: boolean;
  intervalMs: number;
  intervalMinutes: number;
  startedAt: string | null;
  lastRunStartedAt: string | null;
  lastRunCompletedAt: string | null;
  nextRunAt: string | null;
  totalScheduledRuns: number;
  successfulRuns: number;
  failedRuns: number;
  lastRunSummary: ForwardCycleSummary | null;
  lastError: string | null;
  scheduledRun?: {
    scheduledRunId: string;
    scheduledAt: string;
    executeAt: string;
    delayMs: number;
    delayMinutes: number;
  } | null;
  backupStatus: {
    lastBackupPath: string | null;
    lastBackupAt: string | null;
    latestDryRunValid: boolean;
  };
}

class ForwardScheduler {
  private timer: NodeJS.Timeout | null = null;
  private singleShotTimer: NodeJS.Timeout | null = null;
  private scheduledRunInfo: {
    scheduledRunId: string;
    scheduledAt: string;
    executeAt: string;
    delayMs: number;
  } | null = null;
  private isRunning: boolean = false;
  private isCycleActive: boolean = false;
  private intervalMs: number = 15 * 60 * 1000;
  private startedAt: string | null = null;
  private lastRunStartedAt: string | null = null;
  private lastRunCompletedAt: string | null = null;
  private nextRunAt: string | null = null;
  private totalScheduledRuns: number = 0;
  private successfulRuns: number = 0;
  private failedRuns: number = 0;
  private lastRunSummary: ForwardCycleSummary | null = null;
  private lastError: string | null = null;

  constructor() {
    const envInterval = process.env.PROTO_FORWARD_CYCLE_INTERVAL_MS;
    if (envInterval) {
      const parsed = parseInt(envInterval, 10);
      if (!isNaN(parsed) && parsed >= 5000) {
        this.intervalMs = parsed;
      }
    }
    this.recoverPersistentSchedule();
  }

  public recoverPersistentSchedule(): void {
    try {
      const store = loadProtoForwardShadowStore();
      const persisted = store.singleShotSchedule;
      if (!persisted) return;

      const now = Date.now();
      const executeTime = new Date(persisted.executeAt).getTime();

      if (persisted.status === "PENDING") {
        if (executeTime > now) {
          const remainingDelayMs = executeTime - now;
          this.scheduledRunInfo = {
            scheduledRunId: persisted.scheduledRunId,
            scheduledAt: persisted.scheduledAt,
            executeAt: persisted.executeAt,
            delayMs: remainingDelayMs
          };
          this.singleShotTimer = setTimeout(async () => {
            try {
              this.updatePersistentScheduleStatus(persisted.scheduledRunId, "RUNNING");
              const summary = await this.executeCycle(true);
              this.updatePersistentScheduleStatus(persisted.scheduledRunId, "COMPLETED", summary.runId);
            } catch (err: any) {
              this.updatePersistentScheduleStatus(persisted.scheduledRunId, "FAILED", undefined, err.message);
            } finally {
              if (this.singleShotTimer) {
                clearTimeout(this.singleShotTimer);
                this.singleShotTimer = null;
              }
              this.scheduledRunInfo = null;
              this.isRunning = false;
              this.nextRunAt = null;
            }
          }, remainingDelayMs);
        } else {
          this.updatePersistentScheduleStatus(persisted.scheduledRunId, "MISSED");
        }
      } else if (persisted.status === "RUNNING") {
        this.updatePersistentScheduleStatus(persisted.scheduledRunId, "FAILED", undefined, "Process interrupted during execution");
      }
    } catch (err) {}
  }

  private updatePersistentScheduleStatus(
    scheduledRunId: string,
    status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "MISSED",
    runId?: string,
    error?: string,
    scheduleData?: { scheduledAt: string; executeAt: string; delayMs: number }
  ): void {
    try {
      const store = loadProtoForwardShadowStore();
      if (!store.singleShotSchedule && scheduleData) {
        store.singleShotSchedule = {
          scheduledRunId,
          scheduledAt: scheduleData.scheduledAt,
          executeAt: scheduleData.executeAt,
          delayMs: scheduleData.delayMs,
          status
        };
      } else if (store.singleShotSchedule && store.singleShotSchedule.scheduledRunId === scheduledRunId) {
        store.singleShotSchedule.status = status;
        if (runId) store.singleShotSchedule.runId = runId;
        if (status === "COMPLETED" || status === "FAILED" || status === "MISSED") {
          store.singleShotSchedule.completedAt = new Date().toISOString();
        }
        if (error) store.singleShotSchedule.error = error;
      }
      saveProtoForwardShadowStore(store);
    } catch (e) {}
  }

  public stop(): ForwardSchedulerStatus {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.singleShotTimer) {
      clearTimeout(this.singleShotTimer);
      this.singleShotTimer = null;
    }
    if (this.scheduledRunInfo) {
      this.updatePersistentScheduleStatus(this.scheduledRunInfo.scheduledRunId, "CANCELLED");
    }
    this.scheduledRunInfo = null;
    this.isRunning = false;
    this.nextRunAt = null;
    this.logAuditEvent("SCHEDULER_STOPPED", "Forward Shadow operational scheduler stopped by operator.");
    return this.getStatus();
  }

  public start(intervalMs?: number, options?: { __internalAuthorizedBypass?: boolean }): ForwardSchedulerStatus {
    if (intervalMs && intervalMs >= 5000) {
      this.intervalMs = intervalMs;
    }
    if (process.env.AUTO_START_FORWARD_SCHEDULER !== "true" && options?.__internalAuthorizedBypass !== true) {
      console.warn("[FORWARD SCHEDULER] Blocked start() attempt: AUTO_START_FORWARD_SCHEDULER is not true and not manual authorized.");
      throw new Error("SCHEDULER_START_BLOCKED_BY_SAFETY_POLICY");
    }
    if (this.isRunning && this.timer) {
      return this.getStatus();
    }
    this.isRunning = true;
    this.startedAt = new Date().toISOString();
    this.calculateNextRun();
    this.logAuditEvent("SCHEDULER_STARTED", `Forward Shadow operational scheduler started with interval \${this.intervalMs}ms.`);
    this.timer = setInterval(() => {
      this.executeCycle(false).catch(err => {
        console.error("[FORWARD SCHEDULER CYCLE ERROR]", err);
      });
    }, this.intervalMs);
    return this.getStatus();
  }

  public startLimited(maxCycles: number, intervalMs?: number, options?: { __internalAuthorizedBypass?: boolean }): ForwardSchedulerStatus {
    if (intervalMs && intervalMs >= 5000) {
      this.intervalMs = intervalMs;
    }
    if (process.env.AUTO_START_FORWARD_SCHEDULER !== "true" && options?.__internalAuthorizedBypass !== true) {
      console.warn("[FORWARD SCHEDULER] Blocked startLimited() attempt.");
      throw new Error("SCHEDULER_START_BLOCKED_BY_SAFETY_POLICY");
    }
    if (this.isRunning && this.timer) {
      return this.getStatus();
    }
    this.isRunning = true;
    this.startedAt = new Date().toISOString();
    this.calculateNextRun();
    let cyclesExecuted = 0;
    this.logAuditEvent("SCHEDULER_STARTED", `Forward Shadow operational scheduler started limited mode (maxCycles: \${maxCycles}).`);
    this.timer = setInterval(async () => {
      if (!this.isRunning) return;
      try {
        await this.executeCycle(false);
        cyclesExecuted++;
        if (cyclesExecuted >= maxCycles) {
          this.stop();
        }
      } catch (err) {
        this.stop();
      }
    }, this.intervalMs);
    return this.getStatus();
  }

  public scheduleSingleShot(delayMs: number = 15 * 60 * 1000, options: { forceUnlock?: boolean } = {}): ForwardSchedulerStatus {
    return this.getStatus();
  }

  public async executeCycle(isSingleShot: boolean = false): Promise<ForwardCycleSummary> {
    this.lastRunStartedAt = new Date().toISOString();
    this.isCycleActive = true;
    try {
      const summary = await runForwardShadowCycle();
      this.lastRunSummary = summary;
      this.successfulRuns++;
      this.lastRunCompletedAt = new Date().toISOString();
      this.totalScheduledRuns++;
      this.lastError = null;
      return summary;
    } catch (err: any) {
      this.failedRuns++;
      this.lastError = err.message || String(err);
      this.lastRunCompletedAt = new Date().toISOString();
      this.totalScheduledRuns++;
      throw err;
    } finally {
      this.isCycleActive = false;
      this.calculateNextRun();
    }
  }

  public async triggerManual(options?: { forceUnlock?: boolean }): Promise<ForwardCycleSummary> {
    return this.executeCycle(true);
  }

  public cancelSingleShot(): ForwardSchedulerStatus {
    if (this.singleShotTimer) {
      clearTimeout(this.singleShotTimer);
      this.singleShotTimer = null;
    }
    if (this.scheduledRunInfo) {
      this.updatePersistentScheduleStatus(this.scheduledRunInfo.scheduledRunId, "CANCELLED");
    }
    this.scheduledRunInfo = null;
    this.nextRunAt = null;
    return this.getStatus();
  }

  private calculateNextRun(): void {
    if (this.isRunning) {
      this.nextRunAt = new Date(Date.now() + this.intervalMs).toISOString();
    } else {
      this.nextRunAt = null;
    }
  }

  private logAuditEvent(eventType: any, details: string): void {
    try {
      const store = loadProtoForwardShadowStore();
      if (!store.auditEventLog) store.auditEventLog = [];
      store.auditEventLog.push({
        timestamp: new Date().toISOString(),
        year: 2026,
        round: 0,
        matchId: "scheduler",
        eventType: eventType as any,
        severity: eventType.includes("ERROR") || eventType.includes("FAILED") ? "HIGH" : "LOW",
        details
      });
      saveProtoForwardShadowStore(store);
    } catch (e) {}
  }

  public getStatus(): ForwardSchedulerStatus {
    const latestBackup = getLatestBackup("protoForwardShadowStore");
    let dryRunValid = false;
    if (latestBackup) {
      const dryRun = verifyBackupDryRun(latestBackup.filePath);
      dryRunValid = dryRun.isValid;
    }

    return {
      isRunning: this.isRunning,
      isCycleActive: this.isCycleActive || isForwardCycleRunning(),
      intervalMs: this.intervalMs,
      intervalMinutes: Math.round(this.intervalMs / 60000),
      startedAt: this.startedAt,
      lastRunStartedAt: this.lastRunStartedAt,
      lastRunCompletedAt: this.lastRunCompletedAt,
      nextRunAt: this.nextRunAt,
      totalScheduledRuns: this.totalScheduledRuns,
      successfulRuns: this.successfulRuns,
      failedRuns: this.failedRuns,
      lastRunSummary: this.lastRunSummary,
      lastError: this.lastError,
      scheduledRun: this.scheduledRunInfo
        ? {
            scheduledRunId: this.scheduledRunInfo.scheduledRunId,
            scheduledAt: this.scheduledRunInfo.scheduledAt,
            executeAt: this.scheduledRunInfo.executeAt,
            delayMs: this.scheduledRunInfo.delayMs,
            delayMinutes: Math.round(this.scheduledRunInfo.delayMs / 60000)
          }
        : null,
      backupStatus: {
        lastBackupPath: latestBackup ? latestBackup.fileName : null,
        lastBackupAt: latestBackup ? latestBackup.createdAt : null,
        latestDryRunValid: dryRunValid
      }
    };
  }
}

export const forwardScheduler = new ForwardScheduler();

export function startForwardScheduler(intervalMs?: number, options?: { __internalAuthorizedBypass?: boolean }): ForwardSchedulerStatus {
  return forwardScheduler.start(intervalMs, options);
}

export function stopForwardScheduler(): ForwardSchedulerStatus {
  return forwardScheduler.stop();
}

export function triggerManualForwardCycle(options?: { forceUnlock?: boolean }): Promise<ForwardCycleSummary> {
  return forwardScheduler.triggerManual(options);
}

export function scheduleSingleShotForwardCycle(delayMs?: number, options?: { forceUnlock?: boolean }): ForwardSchedulerStatus {
  return forwardScheduler.scheduleSingleShot(delayMs, options);
}

export function cancelSingleShotForwardCycle(): ForwardSchedulerStatus {
  return forwardScheduler.cancelSingleShot();
}

export function getForwardSchedulerStatus(): ForwardSchedulerStatus {
  return forwardScheduler.getStatus();
}

const SERVER_INTERNAL_SECRET = process.env.OPERATIONAL_SECRET || crypto.randomBytes(32).toString("hex");

export function requestAuthorizedSchedulerStart(intervalMs?: number, secret?: string) {
  if (secret !== SERVER_INTERNAL_SECRET) {
    throw new Error("UNAUTHORIZED_SCHEDULER_START_ATTEMPT");
  }
  return forwardScheduler.start(intervalMs, { __internalAuthorizedBypass: true });
}

export function requestAuthorizedSchedulerStartLimited(maxCycles: number, intervalMs?: number, secret?: string) {
  if (secret !== SERVER_INTERNAL_SECRET) {
    throw new Error("UNAUTHORIZED_SCHEDULER_START_ATTEMPT");
  }
  return forwardScheduler.startLimited(maxCycles, intervalMs, { __internalAuthorizedBypass: true });
}

export function getServerInternalSecret(): string {
  return SERVER_INTERNAL_SECRET;
}
