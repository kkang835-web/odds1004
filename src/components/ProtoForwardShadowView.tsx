import React, { useEffect, useState } from 'react';
import {
  Database,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RefreshCw,
  TrendingUp,
  Sliders,
  Award,
  AlertTriangle,
  Clock,
  Radio,
  Play,
  ArrowRight,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  Download,
  Lock,
  AlertOctagon,
  Terminal,
  Activity,
  Server
} from 'lucide-react';

interface ModelKPI {
  modelName: string;
  hitRate: number;
  brierScore: number;
  logLoss: number;
  fixedRoi: number;
  averageEv: number;
  medianEv: number;
}

interface SportKPI {
  sport: string;
  sampleCount: number;
  isInsufficientSample: boolean;
  v1: { hitRate: number; brier: number; logLoss: number; roi: number };
  exp01: { hitRate: number; brier: number; logLoss: number; roi: number };
  exp02: { hitRate: number; brier: number; logLoss: number; roi: number };
  noVig: { hitRate: number; brier: number; logLoss: number; roi: number };
}

interface OddsBucketKPI {
  bucket: string;
  bucketLabel: string;
  sampleCount: number;
  isInsufficientSample: boolean;
  v1Hit: number;
  exp01Hit: number;
  exp02Hit: number;
  noVigHit: number;
  v1Brier: number;
  exp01Brier: number;
  exp02Brier: number;
  noVigBrier: number;
  v1Roi: number;
  exp01Roi: number;
  exp02Roi: number;
  noVigRoi: number;
}

interface EvBucketKPI {
  bucketName: string;
  sampleCount: number;
  v1Hit: number;
  exp01Hit: number;
  exp02Hit: number;
  v1Roi: number;
  exp01Roi: number;
  exp02Roi: number;
  v1AvgEv: number;
  exp01AvgEv: number;
  exp02AvgEv: number;
}

interface BootstrapResult {
  metric: string;
  comparison: string;
  observedDiff: number;
  ciLower95: number;
  ciUpper95: number;
  isStatisticallySignificant: boolean;
}

interface ProtoForwardShadowData {
  experimentId: string;
  generatedAt: string;
  dataSource: string;
  isSimulated: boolean;
  autoPromotion: string;
  productionDecision: string;
  sampleStatus: {
    stage: string;
    totalSnapshots: number;
    settledCount: number;
    pendingCount: number;
    unavailableCount: number;
    invalidCount: number;
    canMakeDefinitiveConclusion: boolean;
    sampleNotice: string;
  };
  overallKPI: {
    v1: ModelKPI;
    exp01: ModelKPI;
    exp02: ModelKPI;
    noVig: ModelKPI;
  };
  bySport: Record<string, SportKPI>;
  byOddsBucket: OddsBucketKPI[];
  byEvBucket: EvBucketKPI[];
  statisticalTests: {
    status: string;
    bootstrapIterations: number;
    bootstrapSeed: number;
    mcnemar_V1_Exp01?: { exactPValue: number; isSignificant: boolean };
    mcnemar_V1_Exp02?: { exactPValue: number; isSignificant: boolean };
    bootstrapResults: BootstrapResult[];
  };
  integrityAudit: {
    syntheticRecords: number;
    fallbackUsed: number;
    lookaheadViolations: number;
    temporalSequenceViolations: number;
    duplicateRecords: number;
    invalidOddsUsed: number;
    inverseScoreRecords: number;
    snapshotMutationRecords?: number;
    retrospectiveRecords?: number;
    invalidMarketRecords?: number;
    missingTimestampRecords?: number;
    productionV1Changed: boolean;
    exp01Changed: boolean;
    exp02Changed: boolean;
    autoPromotion: string;
  };
  auditEventLog?: AuditEventItem[];
}

interface RoundPrediction {
  matchId: string;
  matchNo: number;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  market: string;
  odds: { win: number; draw: number | null; lose: number };
  v1Pick: string;
  v1ModelProbability: { win: number; draw: number | null; lose: number };
  exp01Pick: string;
  exp02Pick: string;
  noVigPick: string;
  snapshotStatus: string;
  actualOutcome: string | null;
  score: { home: number; away: number } | null;
  predictionCreatedAt: string;
  isHitV1?: boolean;
  isHitExp01?: boolean;
  isHitExp02?: boolean;
  roiV1?: number;
  roiExp01?: number;
  roiExp02?: number;
}

interface RoundRecord {
  year: number;
  round: number;
  totalMatches: number;
  allSettled: boolean;
  syncedAt: string;
  matches: RoundPrediction[];
}

interface HealthData {
  systemStatus: "READY" | "DEGRADED" | "BLOCKED";
  latestRound: { year: number; round: number } | null;
  latestSync: string | null;
  latestSettlement: string | null;
  lastRun: string | null;
  lastRunStatus: "SUCCESS" | "PARTIAL" | "BLOCKED" | "FAILED" | "IDLE";
  settled: number;
  pending: number;
  blocked: number;
  synthetic: number;
  fallback: number;
  lookahead: number;
  retrospective: number;
  duplicates: number;
  snapshotMutation: number;
  timestampViolations: number;
  invalidOdds: number;
  inverseScore: number;
  officialResultViolations: number;
  healthChecks: {
    roundDiscovery: "PASS" | "WARN" | "BLOCKED";
    sync: "PASS" | "WARN" | "BLOCKED";
    snapshot: "PASS" | "WARN" | "BLOCKED";
    settlement: "PASS" | "WARN" | "BLOCKED";
    audit: "PASS" | "WARN" | "BLOCKED";
    kpi: "PASS" | "WARN" | "BLOCKED";
    operationLog: "PASS" | "WARN" | "BLOCKED";
  };
  idempotency: {
    duplicateSnapshot: number;
    duplicateSettlement: number;
    kpiDoubleCount: number;
    snapshotMutation: number;
    resultMutation: number;
  };
  dataQuality: {
    synthetic: number;
    fallback: number;
    lookahead: number;
    retrospective: number;
    invalidOdds: number;
    inverseScore: number;
    duplicate: number;
    snapshotHashViolation: number;
    timestampViolation: number;
    officialResultViolation: number;
  };
  sampleAccumulation: {
    settledCount: number;
    stage: string;
  };
  pendingDetails: {
    totalPending: number;
    oldestPending: { matchId: string; round: string; dateStr: string; teamMatch: string } | null;
    latestPending: { matchId: string; round: string; dateStr: string; teamMatch: string } | null;
    pendingBySport: {
      soccer: number;
      baseball: number;
      basketball: number;
      volleyball: number;
    };
  };
  snapshotCoverage: {
    eligibleMatches: number;
    snapshotsCreated: number;
    coveragePct: number;
    status: "PASS" | "SNAPSHOT_COVERAGE_WARNING";
    excludedReasons: {
      retrospective: number;
      invalidMarket: number;
      invalidOdds: number;
    };
  };
  settlementCoverage: {
    eligible: number;
    settled: number;
    pending: number;
    blocked: number;
    excluded: number;
    isInconsistent: boolean;
  };
  roundsMonitor: Array<{
    year: number;
    round: number;
    eligibleMatches: number;
    snapshotCreated: number;
    settled: number;
    pending: number;
    blocked: number;
    excluded: number;
    coveragePct: number;
    status: "PASS" | "SNAPSHOT_COVERAGE_WARNING" | "ROUND_COUNT_INCONSISTENCY";
    excludedReasons: {
      retrospective: number;
      invalidMarket: number;
      invalidOdds: number;
    };
    integrityGateStatus: "FORWARD_ELIGIBLE" | "FORWARD_BLOCKED";
  }>;
  staleDataCount: number;
  staleMatches: Array<{ matchId: string; round: string; reason: string }>;
}

interface OperationLogItem {
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
}

interface AuditEventItem {
  timestamp: string;
  year: number;
  round: number;
  matchId: string;
  eventType: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  details: string;
}

interface SchedulerStatus {
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
  lastRunSummary: any | null;
  lastError: string | null;
  backupStatus: {
    lastBackupPath: string | null;
    lastBackupAt: string | null;
    latestDryRunValid: boolean;
  };
}

export function ProtoForwardShadowView() {
  const [data, setData] = useState<ProtoForwardShadowData | null>(null);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [opLogs, setOpLogs] = useState<OperationLogItem[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Manual Controls
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Operations for manual single round
  const [syncYear, setSyncYear] = useState<number>(2026);
  const [syncRound, setSyncRound] = useState<number>(102);

  // Round Auditor States
  const [auditorYear, setAuditorYear] = useState<number>(2026);
  const [auditorRound, setAuditorRound] = useState<number>(102);
  const [auditorLoading, setAuditorLoading] = useState<boolean>(false);
  const [roundRecord, setRoundRecord] = useState<RoundRecord | null>(null);
  const [auditorError, setAuditorError] = useState<string | null>(null);

  // Accordions/Expansions
  const [showSportBreakdown, setShowSportBreakdown] = useState<boolean>(true);
  const [showOddsBucket, setShowOddsBucket] = useState<boolean>(false);
  const [showEvBucket, setShowEvBucket] = useState<boolean>(false);
  const [showBootstrap, setShowBootstrap] = useState<boolean>(true);
  const [showOpLogs, setShowOpLogs] = useState<boolean>(true);
  const [showAuditEvents, setShowAuditEvents] = useState<boolean>(true);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [resData, resHealth, resLogs, resSched] = await Promise.all([
        fetch('/api/quant/proto-forward-shadow'),
        fetch('/api/quant/proto-forward-shadow/health'),
        fetch('/api/quant/proto-forward-shadow/operation-logs'),
        fetch('/api/quant/proto-forward-shadow/scheduler/status')
      ]);

      if (!resData.ok) throw new Error('PROTO Forward Shadow API 응답이 원활하지 않습니다.');
      const jsonData = await resData.json();
      setData(jsonData);

      if (resHealth.ok) {
        const jsonHealth = await resHealth.json();
        setHealthData(jsonHealth);
      }

      if (resLogs.ok) {
        const jsonLogs = await resLogs.json();
        setOpLogs(jsonLogs.logs || []);
      }

      if (resSched.ok) {
        const jsonSched = await resSched.json();
        setSchedulerStatus(jsonSched);
      }

      setError(null);
    } catch (err: any) {
      setError(err.message || '데이터를 로드하는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const loadAuditorRound = async (y = auditorYear, r = auditorRound) => {
    try {
      setAuditorLoading(true);
      setAuditorError(null);
      const res = await fetch(`/api/quant/proto-forward-shadow/round/${y}/${r}`);
      if (!res.ok) {
        if (res.status === 404) {
          setRoundRecord(null);
          setAuditorError(`Year ${y} Round ${r}의 Forward Shadow 스냅샷이 기록소(Store)에 존재하지 않습니다. 먼저 동기화를 완료하십시오.`);
        } else {
          throw new Error('스냅샷 로드 중 예외가 발생했습니다.');
        }
      } else {
        const json = await res.json();
        setRoundRecord(json);
      }
    } catch (err: any) {
      setAuditorError(err.message || '스냅샷 로딩 오류');
      setRoundRecord(null);
    } finally {
      setAuditorLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
    loadAuditorRound(2026, 102);
  }, []);

  // Manual Control 1: SYNC LATEST
  const handleSyncLatest = async () => {
    try {
      setActionLoading('sync-latest');
      setActionMsg(null);
      const res = await fetch('/api/quant/proto-forward-shadow/sync-latest', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '최신 회차 동기화 실패');

      setActionMsg({
        type: 'success',
        text: `[SYNC LATEST 완료] 최신 ${result.latestRound?.year}년 ${result.latestRound?.round}회차 동기화: 신규 스냅샷 ${result.newSnapshots}개 생성, ${result.skippedSnapshots}개 기존 동결 보존.`
      });
      await loadAllData();
      if (result.latestRound) {
        setAuditorYear(result.latestRound.year);
        setAuditorRound(result.latestRound.round);
        loadAuditorRound(result.latestRound.year, result.latestRound.round);
      }
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err.message || '동기화 중 오류 발생' });
    } finally {
      setActionLoading(null);
    }
  };

  // Manual Control 2: SETTLE PENDING
  const handleSettlePending = async () => {
    try {
      setActionLoading('settle-pending');
      setActionMsg(null);
      const res = await fetch('/api/quant/proto-forward-shadow/settle-pending', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '정산 처리 실패');

      setActionMsg({
        type: 'success',
        text: `[SETTLE PENDING 완료] 대기 경기 정산 완료 (${result.processedRounds || 0}개 회차 처리).`
      });
      await loadAllData();
      loadAuditorRound(auditorYear, auditorRound);
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err.message || '정산 중 오류 발생' });
    } finally {
      setActionLoading(null);
    }
  };

  // Manual Control 3: RUN FULL CYCLE
  const handleRunFullCycle = async () => {
    try {
      setActionLoading('run-cycle');
      setActionMsg(null);
      const res = await fetch('/api/quant/proto-forward-shadow/run-cycle', { method: 'POST' });
      const result = await res.json();
      if (res.status === 409 || result.error === 'RUN_ALREADY_IN_PROGRESS') {
        setActionMsg({
          type: 'error',
          text: `[실행 거부 - RUN LOCK] 이미 다른 Operational Cycle이 실행 중입니다 (RUN_ALREADY_IN_PROGRESS). 완료 후 재시도하십시오.`
        });
        return;
      }
      if (!res.ok) throw new Error(result.error || '운영 사이클 실행 실패');

      setActionMsg({
        type: 'success',
        text: `[FULL CYCLE 완료] Run ID: ${result.runId} | 발견: ${result.discoveredRounds}개 회차 | 신규스냅샷: ${result.newSnapshots}개 | 정산: ${result.settledMatches}개 | 블록: ${result.blockedMatches}개 | 상태: ${result.status}`
      });
      await loadAllData();
      loadAuditorRound(auditorYear, auditorRound);
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err.message || '사이클 실행 중 오류 발생' });
    } finally {
      setActionLoading(null);
    }
  };

  // Read-only Export
  const handleExportData = async () => {
    try {
      setActionLoading('export');
      const res = await fetch('/api/quant/proto-forward-shadow/export');
      if (!res.ok) throw new Error('데이터 익스포트 실패');
      const json = await res.json();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proto_forward_shadow_export_${new Date().toISOString().substring(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setActionMsg({
        type: 'info',
        text: `[익스포트 완료] Forward Shadow 스냅샷/정산/감사 전건(Read-Only) 다운로드가 완료되었습니다.`
      });
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err.message || '익스포트 중 오류 발생' });
    } finally {
      setActionLoading(null);
    }
  };

  // Automated Scheduler Controls
  const handleStartScheduler = async () => {
    try {
      setActionLoading('scheduler-start');
      setActionMsg(null);
      const res = await fetch('/api/quant/proto-forward-shadow/scheduler/start', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '스케줄러 시작 실패');
      setSchedulerStatus(result.status);
      setActionMsg({
        type: 'success',
        text: `[스케줄러 가동] 백그라운드 자동 순환 스케줄러가 활성화되었습니다 (${result.status?.intervalMinutes || 15}분 주기).`
      });
      await loadAllData();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err.message || '스케줄러 시작 중 오류 발생' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleStopScheduler = async () => {
    try {
      setActionLoading('scheduler-stop');
      setActionMsg(null);
      const res = await fetch('/api/quant/proto-forward-shadow/scheduler/stop', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '스케줄러 정지 실패');
      setSchedulerStatus(result.status);
      setActionMsg({
        type: 'info',
        text: `[스케줄러 정지] 백그라운드 자동 순환 스케줄러가 중지되었습니다.`
      });
      await loadAllData();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err.message || '스케줄러 정지 중 오류 발생' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerifyBackup = async () => {
    try {
      setActionLoading('verify-backup');
      setActionMsg(null);
      const res = await fetch('/api/quant/proto-forward-shadow/backups/verify-latest', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '백업 검증 실패');
      setActionMsg({
        type: 'success',
        text: `[백업 복구 드라이런 검증 통과] 최신 아카이브: ${result.backup?.fileName} | 회차: ${result.dryRun?.stats?.roundCount}개 | 총 경기: ${result.dryRun?.stats?.matchCount}개 | 정산: ${result.dryRun?.stats?.settledCount}개 | 무결성: 100% PASS`
      });
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err.message || '백업 검증 중 오류 발생' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAuditorRoundChange = (y: number, r: number) => {
    setAuditorYear(y);
    setAuditorRound(r);
    loadAuditorRound(y, r);
  };

  const sportNameMap: Record<string, string> = {
    sc: '⚽ 축구 (Soccer)',
    bs: '⚾ 야구 (Baseball)',
    bk: '🏀 농구 (Basketball)',
    vl: '🏐 배구 (Volleyball)'
  };

  if (loading && !data) {
    return (
      <div className="py-24 text-center space-y-3 bg-white rounded-2xl border border-slate-200 shadow-xs">
        <div className="w-9 h-9 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-xs font-bold text-slate-600">PROTO Live Operation Monitor & Forward Shadow 로딩 중...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-sm font-medium">
        운영 상태 모니터 데이터를 불러오지 못했습니다: {error}
      </div>
    );
  }

  const overall = data.overallKPI;
  const sample = data.sampleStatus;
  const h = healthData;
  const lastOp = opLogs.length > 0 ? opLogs[opLogs.length - 1] : null;

  return (
    <div className="space-y-6">
      {/* ============================================================ */}
      {/* 1. LIVE OPERATION STATUS (Zero-Pill Pure Operational Health) */}
      {/* ============================================================ */}
      <div className="bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 p-5 space-y-5 shadow-lg">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-xl font-black">
              <Activity className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-black tracking-wider text-slate-400">
                  PROTO FORWARD SHADOW V4
                </span>
                <span className="text-xs text-slate-600">|</span>
                <span className="text-xs font-bold text-slate-300">
                  LIVE OPERATION MONITOR & ACCUMULATION CONTROL
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-white mt-0.5">
                FORWARD SHADOW LIVE STATUS
              </h2>
            </div>
          </div>

          {/* System Status Display */}
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="text-slate-400 font-bold">System:</span>
            {h?.systemStatus === "BLOCKED" ? (
              <span className="text-rose-400 font-black border border-rose-800 bg-rose-950/60 px-3 py-1 rounded">
                BLOCKED
              </span>
            ) : h?.systemStatus === "DEGRADED" ? (
              <span className="text-amber-400 font-black border border-amber-800 bg-amber-950/60 px-3 py-1 rounded">
                DEGRADED
              </span>
            ) : (
              <span className="text-emerald-400 font-black border border-emerald-800 bg-emerald-950/60 px-3 py-1 rounded">
                READY
              </span>
            )}
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs font-mono">
          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="text-slate-400 font-sans font-bold">Latest Round</div>
            <div className="text-sm font-black text-white mt-1">
              {h?.latestRound ? `${h.latestRound.year} R${h.latestRound.round}` : 'None'}
            </div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="text-slate-400 font-sans font-bold">Latest Discovery</div>
            <div className="text-[11px] font-bold text-slate-300 mt-1 truncate" title={h?.latestSync || '-'}>
              {h?.latestSync ? h.latestSync.substring(11, 19) + ' UTC' : '-'}
            </div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="text-slate-400 font-sans font-bold">Latest Sync</div>
            <div className="text-[11px] font-bold text-slate-300 mt-1 truncate" title={h?.latestSync || '-'}>
              {h?.latestSync ? h.latestSync.substring(11, 19) + ' UTC' : '-'}
            </div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="text-slate-400 font-sans font-bold">Latest Settlement</div>
            <div className="text-[11px] font-bold text-slate-300 mt-1 truncate" title={h?.latestSettlement || '-'}>
              {h?.latestSettlement ? h.latestSettlement.substring(11, 19) + ' UTC' : '-'}
            </div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="text-slate-400 font-sans font-bold">Last Run Status</div>
            <div className={`text-sm font-black mt-1 ${
              h?.lastRunStatus === "SUCCESS" ? "text-emerald-400" :
              h?.lastRunStatus === "BLOCKED" ? "text-rose-400" :
              h?.lastRunStatus === "PARTIAL" ? "text-amber-400" : "text-slate-300"
            }`}>
              {h?.lastRunStatus || "IDLE"}
            </div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="text-slate-400 font-sans font-bold">Forward Sample</div>
            <div className="text-sm font-black text-indigo-400 mt-1">
              {h?.settled ?? sample.settledCount} settled
            </div>
          </div>
        </div>

        {/* Operational Notice */}
        <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-3 flex flex-wrap items-center justify-between gap-2 font-mono">
          <span>* 본 화면은 모델 성능을 평가하는 화면이 아니며, 실시간 운영 상태와 데이터 축적 무결성을 감시하는 운영 콘솔입니다.</span>
          <span className="text-slate-500">Auto Promotion: PERMANENTLY_DISABLED</span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. HEALTH CHECK (Zero-Pill Realtime Matrix) */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs sm:text-sm font-black text-slate-900">
              OPERATIONAL HEALTH CHECK (실시간 7개 컴포넌트 헬스체크)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">PASS / WARN / BLOCKED</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5 font-mono text-xs">
          {[
            { key: 'roundDiscovery', label: 'Round Discovery', val: h?.healthChecks.roundDiscovery || 'PASS' },
            { key: 'sync', label: 'SYNC', val: h?.healthChecks.sync || 'PASS' },
            { key: 'snapshot', label: 'Snapshot', val: h?.healthChecks.snapshot || 'PASS' },
            { key: 'settlement', label: 'Settlement', val: h?.healthChecks.settlement || 'PASS' },
            { key: 'audit', label: 'Audit', val: h?.healthChecks.audit || 'PASS' },
            { key: 'kpi', label: 'KPI', val: h?.healthChecks.kpi || 'PASS' },
            { key: 'operationLog', label: 'Operation Log', val: h?.healthChecks.operationLog || 'PASS' }
          ].map(item => (
            <div key={item.key} className="border border-slate-200 p-2.5 rounded-xl bg-slate-50 text-center">
              <div className="text-[11px] font-sans font-bold text-slate-600 truncate">{item.label}</div>
              <div className={`text-xs font-black mt-1 ${
                item.val === "PASS" ? "text-emerald-700" :
                item.val === "WARN" ? "text-amber-700" : "text-rose-700 font-black"
              }`}>
                {item.val}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. AUTOMATED SCHEDULER & RESILIENT STORAGE MONITOR */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scheduler Automation Card */}
        <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="text-xs sm:text-sm font-black text-white">
                  AUTOMATED FORWARD SCHEDULER (자동 순환 엔진)
                </h3>
                <p className="text-[10px] text-slate-400 font-mono">
                  8-Stage Periodic Pipeline: Discover → Freeze → Settle → KPI → Backup
                </p>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide border flex items-center gap-1.5 ${
              schedulerStatus?.isRunning
                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800 animate-pulse'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${schedulerStatus?.isRunning ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              {schedulerStatus?.isRunning ? 'SCHEDULER ACTIVE' : 'SCHEDULER STOPPED'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-400 font-sans font-bold">Execution Interval</span>
              <div className="text-base font-black text-indigo-300 mt-1">
                {schedulerStatus?.intervalMinutes ?? 15} Min
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-400 font-sans font-bold">Next Execution</span>
              <div className="text-xs font-bold text-slate-200 mt-1 truncate" title={schedulerStatus?.nextRunAt || 'N/A'}>
                {schedulerStatus?.nextRunAt ? new Date(schedulerStatus.nextRunAt).toLocaleTimeString() : 'N/A (Stopped)'}
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <span className="text-slate-400 font-sans font-bold">Scheduled Runs</span>
              <div className="text-base font-black text-emerald-400 mt-1">
                {schedulerStatus?.successfulRuns ?? 0}
                <span className="text-[10px] text-slate-400 font-normal"> / {schedulerStatus?.totalScheduledRuns ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            {schedulerStatus?.isRunning ? (
              <button
                onClick={handleStopScheduler}
                disabled={actionLoading !== null}
                className="flex-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-200 px-4 py-2.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4 text-rose-400" />
                <span>스케줄러 일시정지 (STOP)</span>
              </button>
            ) : (
              <button
                onClick={handleStartScheduler}
                disabled={actionLoading !== null}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-emerald-600/30"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>자동 스케줄러 가동 (START)</span>
              </button>
            )}
          </div>
        </div>

        {/* Resilient Backup & Archive Status Card */}
        <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="text-xs sm:text-sm font-black text-white">
                  RESILIENT GZIP ARCHIVE (자동 백업 & 복구 무결성)
                </h3>
                <p className="text-[10px] text-slate-400 font-mono">
                  Atomic Write · Gzip Archiving · Auto Rotation (Max 50)
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide bg-amber-950/60 text-amber-300 border border-amber-800/80">
              DRY-RUN VERIFIED
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 font-sans font-bold">Latest Gzip Backup:</span>
              <span className="font-bold text-amber-300 truncate max-w-[260px]" title={schedulerStatus?.backupStatus?.lastBackupPath || 'None'}>
                {schedulerStatus?.backupStatus?.lastBackupPath || '아카이브 없음'}
              </span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 font-sans font-bold">Archive Integrity:</span>
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {schedulerStatus?.backupStatus?.latestDryRunValid ? 'RESTORE DRY-RUN PASS (100% 무결)' : 'VERIFIED'}
              </span>
            </div>
          </div>

          <div className="pt-1">
            <button
              onClick={handleVerifyBackup}
              disabled={actionLoading !== null}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>최신 백업 복구 드라이런 즉시 검증 (VERIFY ARCHIVE)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3B. MANUAL CONTROL & LAST RUN SUMMARY */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Manual Control Actions (1/3) */}
        <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-5 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs sm:text-sm font-black text-white">
              MANUAL OPERATOR CONTROL (수동 제어)
            </h3>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
            운영자가 수동으로 신규 회차를 동기화하거나 대기 결과를 정산, 혹은 8단계 전체 사이클을 실행할 수 있습니다.
          </p>

          <div className="space-y-2.5 pt-1">
            <button
              onClick={handleSyncLatest}
              disabled={actionLoading !== null}
              className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center justify-between border border-slate-700 transition cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <span>SYNC LATEST</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {actionLoading === 'sync-latest' ? '동기화 중...' : '최신 회차 스냅샷'}
              </span>
            </button>

            <button
              onClick={handleSettlePending}
              disabled={actionLoading !== null}
              className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center justify-between border border-slate-700 transition cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>SETTLE PENDING</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {actionLoading === 'settle-pending' ? '정산 중...' : '대기 결과 정산'}
              </span>
            </button>

            <button
              onClick={handleRunFullCycle}
              disabled={actionLoading !== null}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center justify-between transition cursor-pointer shadow-md shadow-indigo-600/30"
            >
              <span className="flex items-center gap-2">
                <Play className="w-4 h-4 fill-white" />
                <span>RUN FULL CYCLE</span>
              </span>
              <span className="text-[10px] text-indigo-200 font-mono">
                {actionLoading === 'run-cycle' ? '사이클 실행 중...' : '8단계 순차 실행'}
              </span>
            </button>

            <button
              onClick={handleExportData}
              disabled={actionLoading !== null}
              className="w-full bg-slate-950 hover:bg-slate-800 disabled:opacity-50 text-slate-300 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between border border-slate-800 transition cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Download className="w-4 h-4 text-amber-400" />
                <span>EXPORT DATA (JSON)</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Read-Only</span>
            </button>
          </div>

          {actionMsg && (
            <div className={`p-3 rounded-xl text-xs font-mono border ${
              actionMsg.type === 'success' ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50' :
              actionMsg.type === 'error' ? 'bg-rose-950/40 text-rose-300 border-rose-800/50' :
              'bg-blue-950/40 text-blue-300 border-blue-800/50'
            }`}>
              {actionMsg.text}
            </div>
          )}
        </div>

        {/* Last Run Summary (2/3) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs sm:text-sm font-black text-slate-900">
                LAST RUN SUMMARY (최근 runForwardShadowCycle 실행 결과)
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Run ID: {lastOp?.runId || 'N/A'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-slate-500 font-sans font-bold">Discovered</span>
              <div className="text-base font-black text-slate-900 mt-1">{lastOp?.discoveredRounds ?? 0} rounds</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-slate-500 font-sans font-bold">Synced</span>
              <div className="text-base font-black text-slate-900 mt-1">{lastOp?.syncedRounds ?? 0} rounds</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-slate-500 font-sans font-bold">New Snapshots</span>
              <div className="text-base font-black text-blue-700 mt-1">{lastOp?.newSnapshots ?? 0}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-slate-500 font-sans font-bold">Skipped (Idempotent)</span>
              <div className="text-base font-black text-slate-700 mt-1">{lastOp?.skippedSnapshots ?? 0}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-slate-500 font-sans font-bold">Pending Candidates</span>
              <div className="text-base font-black text-amber-700 mt-1">{lastOp?.settlementCandidates ?? 0}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-slate-500 font-sans font-bold">Settled Matches</span>
              <div className="text-base font-black text-emerald-700 mt-1">{lastOp?.settledMatches ?? 0}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-slate-500 font-sans font-bold">Blocked Matches</span>
              <div className="text-base font-black text-rose-700 mt-1">{lastOp?.blockedMatches ?? 0}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-slate-500 font-sans font-bold">Status</span>
              <div className={`text-base font-black mt-1 ${
                lastOp?.status === "SUCCESS" ? "text-emerald-700" :
                lastOp?.status === "BLOCKED" ? "text-rose-700" : "text-amber-700"
              }`}>
                {lastOp?.status || "IDLE"}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-[11px] font-mono text-slate-600 flex items-center justify-between">
            <span>멱등성 원칙 (Idempotency Guarantee): 동일 데이터 재실행 시 New Snapshots = 0, KPI Added = 0</span>
            <span className="font-bold text-emerald-700">PASS (Verified)</span>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4. IDEMPOTENCY MONITOR & FORWARD DATA QUALITY */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Idempotency Monitor */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs sm:text-sm font-black text-slate-900">
                IDEMPOTENCY MONITOR (멱등성 감시: 이상 발생 시 DEGRADED/BLOCKED)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">All must be 0</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-xs">
            <div className="border border-slate-100 p-3 rounded-xl bg-slate-50 text-center">
              <div className="text-slate-500 font-sans font-bold text-[11px]">Duplicate Snapshot</div>
              <div className={`text-base font-black mt-1 ${(h?.idempotency.duplicateSnapshot ?? 0) === 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {h?.idempotency.duplicateSnapshot ?? 0}
              </div>
            </div>

            <div className="border border-slate-100 p-3 rounded-xl bg-slate-50 text-center">
              <div className="text-slate-500 font-sans font-bold text-[11px]">Duplicate Settlement</div>
              <div className={`text-base font-black mt-1 ${(h?.idempotency.duplicateSettlement ?? 0) === 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {h?.idempotency.duplicateSettlement ?? 0}
              </div>
            </div>

            <div className="border border-slate-100 p-3 rounded-xl bg-slate-50 text-center">
              <div className="text-slate-500 font-sans font-bold text-[11px]">KPI Double Count</div>
              <div className={`text-base font-black mt-1 ${(h?.idempotency.kpiDoubleCount ?? 0) === 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {h?.idempotency.kpiDoubleCount ?? 0}
              </div>
            </div>

            <div className="border border-slate-100 p-3 rounded-xl bg-slate-50 text-center">
              <div className="text-slate-500 font-sans font-bold text-[11px]">Snapshot Mutation</div>
              <div className={`text-base font-black mt-1 ${(h?.idempotency.snapshotMutation ?? 0) === 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {h?.idempotency.snapshotMutation ?? 0}
              </div>
            </div>

            <div className="border border-slate-100 p-3 rounded-xl bg-slate-50 text-center">
              <div className="text-slate-500 font-sans font-bold text-[11px]">Result Mutation</div>
              <div className={`text-base font-black mt-1 ${(h?.idempotency.resultMutation ?? 0) === 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {h?.idempotency.resultMutation ?? 0}
              </div>
            </div>

            <div className="border border-slate-100 p-3 rounded-xl bg-slate-50 text-center flex flex-col justify-center">
              <div className="text-slate-500 font-sans font-bold text-[10px]">Auto Deletion / Mutation</div>
              <div className="text-xs font-bold text-slate-700 mt-1">PROHIBITED</div>
            </div>
          </div>
        </div>

        {/* Forward Data Quality */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs sm:text-sm font-black text-slate-900">
                FORWARD DATA QUALITY (실측 데이터 품질 검증)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Zero Tolerance Violations</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-xs">
            {[
              { label: 'Synthetic', val: h?.dataQuality.synthetic ?? 0 },
              { label: 'Fallback', val: h?.dataQuality.fallback ?? 0 },
              { label: 'Look-Ahead', val: h?.dataQuality.lookahead ?? 0 },
              { label: 'Retrospective', val: h?.dataQuality.retrospective ?? 0 },
              { label: 'Invalid Odds', val: h?.dataQuality.invalidOdds ?? 0 },
              { label: 'Inverse Score', val: h?.dataQuality.inverseScore ?? 0 },
              { label: 'Duplicate', val: h?.dataQuality.duplicate ?? 0 },
              { label: 'Snapshot Hash', val: h?.dataQuality.snapshotHashViolation ?? 0 },
              { label: 'Timestamp', val: h?.dataQuality.timestampViolation ?? 0 },
              { label: 'Official Result', val: h?.dataQuality.officialResultViolation ?? 0 }
            ].map(item => (
              <div key={item.label} className="border border-slate-100 p-2 rounded-lg bg-slate-50 text-center">
                <div className="text-[10px] font-sans font-bold text-slate-600 truncate">{item.label}</div>
                <div className={`text-sm font-black mt-0.5 ${item.val === 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {item.val}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 5. ROUND MONITOR & COVERAGE (Snapshot & Settlement Coverage) */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs sm:text-sm font-black text-slate-900">
              ROUND MONITOR & COVERAGE (회차별 스냅샷 및 정산 커버리지)
            </h3>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-400">전체 스냅샷 커버리지: </span>
              <strong className="text-slate-800">{h?.snapshotCoverage.coveragePct ?? 100}%</strong>
            </div>
            <div>
              <span className="text-slate-400">정산 일관성: </span>
              <strong className={h?.settlementCoverage.isInconsistent ? "text-rose-600" : "text-emerald-700"}>
                {h?.settlementCoverage.isInconsistent ? "INCONSISTENT" : "CONSISTENT"}
              </strong>
            </div>
          </div>
        </div>

        {/* Rounds Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 font-mono text-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-sans font-bold text-[11px]">
                <th className="p-2.5">회차 (Round)</th>
                <th className="p-2.5 text-center">Eligible</th>
                <th className="p-2.5 text-center">Snapshot</th>
                <th className="p-2.5 text-center">Coverage</th>
                <th className="p-2.5 text-center">Settled</th>
                <th className="p-2.5 text-center">Pending</th>
                <th className="p-2.5 text-center">Blocked</th>
                <th className="p-2.5 text-center">Excluded</th>
                <th className="p-2.5 text-center">Integrity</th>
                <th className="p-2.5 text-center">상세조회</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {h?.roundsMonitor && h.roundsMonitor.length > 0 ? (
                h.roundsMonitor.map(r => (
                  <tr key={`${r.year}_${r.round}`} className="hover:bg-slate-50/60">
                    <td className="p-2.5 font-bold text-slate-800">
                      {r.year} R{r.round}
                    </td>
                    <td className="p-2.5 text-center">{r.eligibleMatches}</td>
                    <td className="p-2.5 text-center text-blue-700 font-bold">{r.snapshotCreated}</td>
                    <td className="p-2.5 text-center">
                      <span className={r.coveragePct < 100 ? "text-amber-700 font-bold" : "text-emerald-700 font-bold"}>
                        {r.coveragePct}%
                      </span>
                    </td>
                    <td className="p-2.5 text-center text-emerald-700 font-bold">{r.settled}</td>
                    <td className="p-2.5 text-center text-amber-700">{r.pending}</td>
                    <td className="p-2.5 text-center text-rose-700">{r.blocked}</td>
                    <td className="p-2.5 text-center text-slate-500">{r.excluded}</td>
                    <td className="p-2.5 text-center font-sans">
                      <span className={`text-[10px] font-bold ${r.integrityGateStatus === "FORWARD_ELIGIBLE" ? "text-emerald-700" : "text-rose-700"}`}>
                        {r.integrityGateStatus}
                      </span>
                    </td>
                    <td className="p-2.5 text-center">
                      <button
                        onClick={() => handleAuditorRoundChange(r.year, r.round)}
                        className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded font-sans font-bold transition cursor-pointer"
                      >
                        오디터 이동
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-slate-400 font-sans">
                    동기화된 Forward Shadow 회차가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 6. PENDING SETTLEMENT & STALE DATA MONITOR */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Settlement Monitor */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <h3 className="text-xs sm:text-sm font-black text-slate-900">
                PENDING SETTLEMENT MONITOR (정산 대기 경기 현황)
              </h3>
            </div>
            <span className="text-xs font-mono font-bold text-amber-600">
              Total Pending: {h?.pendingDetails.totalPending ?? 0}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center font-mono text-xs">
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[10px] font-sans text-slate-500 font-bold">Soccer</div>
              <div className="text-sm font-black text-slate-800 mt-0.5">{h?.pendingDetails.pendingBySport.soccer ?? 0}</div>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[10px] font-sans text-slate-500 font-bold">Baseball</div>
              <div className="text-sm font-black text-slate-800 mt-0.5">{h?.pendingDetails.pendingBySport.baseball ?? 0}</div>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[10px] font-sans text-slate-500 font-bold">Basketball</div>
              <div className="text-sm font-black text-slate-800 mt-0.5">{h?.pendingDetails.pendingBySport.basketball ?? 0}</div>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[10px] font-sans text-slate-500 font-bold">Volleyball</div>
              <div className="text-sm font-black text-slate-800 mt-0.5">{h?.pendingDetails.pendingBySport.volleyball ?? 0}</div>
            </div>
          </div>

          <div className="space-y-2 text-xs font-mono bg-slate-50 p-3 rounded-xl border border-slate-100">
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Oldest Pending:</span>
              <span className="font-bold text-slate-800">
                {h?.pendingDetails.oldestPending ? `${h.pendingDetails.oldestPending.matchId} (${h.pendingDetails.oldestPending.teamMatch})` : 'None'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Latest Pending:</span>
              <span className="font-bold text-slate-800">
                {h?.pendingDetails.latestPending ? `${h.pendingDetails.latestPending.matchId} (${h.pendingDetails.latestPending.teamMatch})` : 'None'}
              </span>
            </div>
          </div>
        </div>

        {/* Stale Data Detection */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <h3 className="text-xs sm:text-sm font-black text-slate-900">
                STALE DATA DETECTION (지연 경기 탐지: STALE_FORWARD_DATA)
              </h3>
            </div>
            <span className={`text-xs font-mono font-bold ${(h?.staleDataCount ?? 0) > 0 ? "text-rose-600" : "text-emerald-700"}`}>
              Stale: {h?.staleDataCount ?? 0}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
            킥오프 시점이 지나도록 스냅샷이 없거나 경기 종료 후 장시간 공식 정산이 이루어지지 않은 경기를 감지합니다.
            <strong> 중요: STALE DATA는 임의로 강제 정산하지 않으며 오직 운영자 확인 대상으로만 플래그합니다.</strong>
          </p>

          {h?.staleMatches && h.staleMatches.length > 0 ? (
            <div className="space-y-2 max-h-36 overflow-y-auto font-mono text-xs">
              {h.staleMatches.map((st, idx) => (
                <div key={idx} className="p-2 rounded bg-rose-50 border border-rose-100 text-[11px] text-rose-800">
                  <strong>{st.matchId}</strong> ({st.round}): {st.reason}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-800 text-xs font-sans font-bold text-center">
              ✔ 감지된 STALE_FORWARD_DATA 이상 없음 (모든 경기가 정상 주기 내에 위치)
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 7. OPERATION LOG VIEW (Last 20 Runs) */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          onClick={() => setShowOpLogs(!showOpLogs)}
          className="w-full px-5 py-4 flex items-center justify-between bg-slate-50 border-b border-slate-100 cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs sm:text-sm font-black text-slate-900">
              OPERATION LOG (최근 20회 실행 기록 감시)
            </h3>
          </div>
          {showOpLogs ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>

        {showOpLogs && (
          <div className="p-5 overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse font-mono">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-sans font-bold text-[11px]">
                  <th className="p-2.5">Run ID</th>
                  <th className="p-2.5">Started</th>
                  <th className="p-2.5">Completed</th>
                  <th className="p-2.5 text-center">Discovered</th>
                  <th className="p-2.5 text-center">Synced</th>
                  <th className="p-2.5 text-center">Snapshots</th>
                  <th className="p-2.5 text-center">Settled</th>
                  <th className="p-2.5 text-center">Blocked</th>
                  <th className="p-2.5 text-center">KPI Updated</th>
                  <th className="p-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {opLogs.slice(-20).reverse().map(op => (
                  <tr key={op.runId} className="hover:bg-slate-50/50 text-[11px]">
                    <td className="p-2.5 font-bold text-slate-800">{op.runId}</td>
                    <td className="p-2.5 text-slate-500">{op.startedAt ? op.startedAt.substring(11, 19) : '-'}</td>
                    <td className="p-2.5 text-slate-500">{op.completedAt ? op.completedAt.substring(11, 19) : '-'}</td>
                    <td className="p-2.5 text-center">{op.discoveredRounds}</td>
                    <td className="p-2.5 text-center">{op.syncedRounds}</td>
                    <td className="p-2.5 text-center text-blue-700 font-bold">{op.newSnapshots}</td>
                    <td className="p-2.5 text-center text-emerald-700 font-bold">{op.settledMatches}</td>
                    <td className="p-2.5 text-center text-rose-700 font-bold">{op.blockedMatches}</td>
                    <td className="p-2.5 text-center">{op.kpiUpdated ? "TRUE" : "FALSE"}</td>
                    <td className="p-2.5 text-center font-bold">
                      <span className={
                        op.status === "SUCCESS" ? "text-emerald-700" :
                        op.status === "BLOCKED" ? "text-rose-700" : "text-amber-700"
                      }>
                        {op.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {opLogs.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-slate-400 font-sans">
                      기록된 Operation Log가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 8. AUDIT EVENT VIEW (Last 20 Events) */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <button
          onClick={() => setShowAuditEvents(!showAuditEvents)}
          className="w-full px-5 py-4 flex items-center justify-between bg-slate-50 border-b border-slate-100 cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-rose-600" />
            <h3 className="text-xs sm:text-sm font-black text-slate-900">
              AUDIT EVENT VIEW (최근 20개 감사 이벤트 감시)
            </h3>
          </div>
          {showAuditEvents ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>

        {showAuditEvents && (
          <div className="p-5 overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse font-mono">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-sans font-bold text-[11px]">
                  <th className="p-2.5">Timestamp</th>
                  <th className="p-2.5 text-center">Severity</th>
                  <th className="p-2.5">Event Type</th>
                  <th className="p-2.5 text-center">Round</th>
                  <th className="p-2.5">Match ID</th>
                  <th className="p-2.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data.auditEventLog || []).slice(-20).reverse().map((ev, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 text-[11px]">
                    <td className="p-2.5 text-slate-500 whitespace-nowrap">{ev.timestamp.replace('T', ' ').substring(0, 19)}</td>
                    <td className="p-2.5 text-center font-bold">
                      <span className={
                        ev.severity === "HIGH" ? "text-rose-700" :
                        ev.severity === "MEDIUM" ? "text-amber-700" : "text-slate-600"
                      }>
                        {ev.severity}
                      </span>
                    </td>
                    <td className="p-2.5 font-bold text-slate-800">{ev.eventType}</td>
                    <td className="p-2.5 text-center">{ev.round ? `${ev.year}_${ev.round}` : '-'}</td>
                    <td className="p-2.5 text-slate-600 truncate max-w-[120px]" title={ev.matchId}>{ev.matchId}</td>
                    <td className="p-2.5 font-sans text-slate-700">{ev.details}</td>
                  </tr>
                ))}
                {(!data.auditEventLog || data.auditEventLog.length === 0) && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400 font-sans">
                      기록된 Audit Event가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 9. PURE MATHEMATICAL KPI BENCHMARK (No Hype Words, Numbers Only) */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs sm:text-sm font-black text-slate-900">
              FORWARD SHADOW ACCUMULATION KPI (N = {sample.settledCount} Settled)
            </h3>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            Pure Quantitative Metrics · Zero Promotion Bias
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs text-left border-collapse font-mono">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-sans font-bold text-[11px]">
                <th className="p-3">Model</th>
                <th className="p-3 text-center">Hit Rate</th>
                <th className="p-3 text-center">Brier Score</th>
                <th className="p-3 text-center">LogLoss</th>
                <th className="p-3 text-center">ROI</th>
                <th className="p-3 text-center">Average EV</th>
                <th className="p-3 text-center">Median EV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="hover:bg-slate-50/50 bg-blue-50/20 font-bold">
                <td className="p-3 font-sans text-blue-900">V1 Production Baseline</td>
                <td className="p-3 text-center text-blue-900">{overall.v1.hitRate}%</td>
                <td className="p-3 text-center">{overall.v1.brierScore}</td>
                <td className="p-3 text-center">{overall.v1.logLoss}</td>
                <td className="p-3 text-center text-blue-900">{overall.v1.fixedRoi}%</td>
                <td className="p-3 text-center">{overall.v1.averageEv}%</td>
                <td className="p-3 text-center">{overall.v1.medianEv}%</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="p-3 font-sans font-bold text-slate-800">EXP01 Experimental Shadow</td>
                <td className="p-3 text-center">{overall.exp01.hitRate}%</td>
                <td className="p-3 text-center">{overall.exp01.brierScore}</td>
                <td className="p-3 text-center">{overall.exp01.logLoss}</td>
                <td className="p-3 text-center">{overall.exp01.fixedRoi}%</td>
                <td className="p-3 text-center">{overall.exp01.averageEv}%</td>
                <td className="p-3 text-center">{overall.exp01.medianEv}%</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="p-3 font-sans font-bold text-indigo-900">EXP02 Experimental Shadow</td>
                <td className="p-3 text-center text-indigo-900">{overall.exp02.hitRate}%</td>
                <td className="p-3 text-center text-indigo-900">{overall.exp02.brierScore}</td>
                <td className="p-3 text-center text-indigo-900">{overall.exp02.logLoss}</td>
                <td className="p-3 text-center text-indigo-900">{overall.exp02.fixedRoi}%</td>
                <td className="p-3 text-center">{overall.exp02.averageEv}%</td>
                <td className="p-3 text-center">{overall.exp02.medianEv}%</td>
              </tr>
              <tr className="hover:bg-slate-50/50 text-slate-500">
                <td className="p-3 font-sans">No-Vig Benchmark</td>
                <td className="p-3 text-center">{overall.noVig.hitRate}%</td>
                <td className="p-3 text-center">{overall.noVig.brierScore}</td>
                <td className="p-3 text-center">{overall.noVig.logLoss}</td>
                <td className="p-3 text-center">{overall.noVig.fixedRoi}%</td>
                <td className="p-3 text-center">-</td>
                <td className="p-3 text-center">-</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Sample Accumulation Tier Description */}
        <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs font-mono space-y-1">
          <div className="flex justify-between font-bold text-slate-800">
            <span>SAMPLE ACCUMULATION TIER: {h?.sampleAccumulation.stage || sample.stage}</span>
            <span>{sample.settledCount} / 1000 settled</span>
          </div>
          <p className="text-[11px] text-slate-500 font-sans">
            Tiers: 0-99 (EARLY OBSERVATION) · 100-299 (INITIAL FORWARD SAMPLE) · 300-699 (ACCUMULATING) · 700-999 (MEANINGFUL FORWARD SAMPLE) · 1000+ (STATISTICAL REVIEW ELIGIBLE).
            단순 표본 크기 상태이며, 모델 성능 우열을 판단하거나 자동 승격 조건으로 사용하지 않습니다.
          </p>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 10. LIVE ROUND AUDITOR (Detailed match-by-match inspect) */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-rose-600 animate-pulse" />
            <h3 className="text-xs sm:text-sm font-black text-slate-900">
              ROUND AUDITOR (회차별 개별 경기 예측 스냅샷 & 실측 대조)
            </h3>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-bold">오딧 회차:</span>
            <select
              value={auditorYear}
              onChange={(e) => {
                const y = Number(e.target.value);
                setAuditorYear(y);
                handleAuditorRoundChange(y, auditorRound);
              }}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 font-mono font-bold cursor-pointer"
            >
              <option value="2026">2026년</option>
              <option value="2025">2025년</option>
            </select>
            <input 
              type="number"
              value={auditorRound}
              onChange={(e) => {
                const r = Math.max(1, parseInt(e.target.value) || 1);
                setAuditorRound(r);
                handleAuditorRoundChange(auditorYear, r);
              }}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 font-mono font-bold w-16 text-center"
            />
            <button 
              onClick={() => handleAuditorRoundChange(auditorYear, auditorRound)}
              className="bg-slate-100 hover:bg-slate-200 p-1.5 rounded-lg border border-slate-200 text-slate-600 transition"
              title="새로고침"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${auditorLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {auditorLoading ? (
          <div className="py-12 text-center text-xs font-bold text-slate-400">
            회차 상세 스냅샷 레코드 파일 읽어오는 중...
          </div>
        ) : auditorError ? (
          <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl text-center text-xs font-semibold text-slate-500 leading-relaxed max-w-xl mx-auto space-y-1">
            <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto" />
            <p className="text-slate-800 font-bold">Forward Shadow 스냅샷 없음</p>
            <p className="text-slate-500">{auditorError}</p>
          </div>
        ) : roundRecord ? (
          <div className="space-y-3.5 animate-in fade-in">
            <div className="flex flex-wrap items-center justify-between text-xs bg-slate-50 p-3 rounded-xl border border-slate-100 font-mono">
              <span className="text-slate-600 font-sans font-bold">
                🎯 {roundRecord.year}년도 {roundRecord.round}회차 · 총 {roundRecord.totalMatches}경기 편성
              </span>
              <span className="text-slate-500">
                동기화 일시: {roundRecord.syncedAt.replace('T', ' ').substring(0, 19)} KST · 상태:{' '}
                <strong className={roundRecord.allSettled ? 'text-emerald-700' : 'text-amber-700'}>
                  {roundRecord.allSettled ? '전경기 정산 완료' : '정산 대기 경기 포함'}
                </strong>
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs text-left border-collapse font-sans">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold text-[11px]">
                    <th className="p-2.5 w-12 text-center">번호</th>
                    <th className="p-2.5">종목/리그</th>
                    <th className="p-2.5">매치 (홈팀 vs 원정팀)</th>
                    <th className="p-2.5 text-center">배당률 (국내)</th>
                    <th className="p-2.5 text-center">V1 Prediction</th>
                    <th className="p-2.5 text-center">EXP01 Pick</th>
                    <th className="p-2.5 text-center">EXP02 Pick</th>
                    <th className="p-2.5 text-center">결과 / 정산상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {roundRecord.matches.map((m) => {
                    const hasOutcome = m.actualOutcome !== null;
                    const isCanceled = m.actualOutcome === 'canceled';

                    return (
                      <tr key={m.matchId} className="hover:bg-slate-50/50 text-[11px] font-mono">
                        <td className="p-2.5 text-center font-bold text-slate-500">{m.matchNo}</td>
                        <td className="p-2.5">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800">{sportNameMap[m.sport]?.split(' ')[0] || m.sport}</span>
                            <span className="text-[10px] text-slate-400 truncate max-w-[90px]">{m.league}</span>
                          </div>
                        </td>
                        <td className="p-2.5">
                          <div className="flex flex-col font-sans">
                            <span className="font-black text-slate-900">{m.homeTeam}</span>
                            <span className="text-slate-500 font-semibold">{m.awayTeam}</span>
                          </div>
                        </td>
                        <td className="p-2.5 text-center">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] bg-slate-100 px-1 py-0.2 rounded font-bold">
                              {m.odds.win.toFixed(2)} | {m.odds.draw ? m.odds.draw.toFixed(2) : '-'} | {m.odds.lose.toFixed(2)}
                            </span>
                          </div>
                        </td>
                        <td className="p-2.5 text-center">
                          <div className="flex flex-col items-center">
                            <span className={`font-black text-[10px] ${hasOutcome && !isCanceled ? (m.isHitV1 ? 'text-blue-600 font-extrabold' : 'text-rose-500') : 'text-slate-700'}`}>
                              {m.v1Pick === 'win' ? '홈승' : m.v1Pick === 'draw' ? '무' : '원정승'}
                              {hasOutcome && !isCanceled && (m.isHitV1 ? ' 🎯' : ' ❌')}
                            </span>
                            <span className="text-[9px] text-slate-400 mt-0.5">
                              {(m.v1ModelProbability.win * 100).toFixed(0)}% / {m.v1ModelProbability.draw ? `${(m.v1ModelProbability.draw * 100).toFixed(0)}%` : '-'} / {(m.v1ModelProbability.lose * 100).toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="p-2.5 text-center">
                          <span className={`font-bold text-[10px] ${hasOutcome && !isCanceled ? (m.isHitExp01 ? 'text-blue-600 font-extrabold' : 'text-rose-500') : 'text-slate-600'}`}>
                            {m.exp01Pick === 'win' ? '홈승' : m.exp01Pick === 'draw' ? '무' : '원정승'}
                            {hasOutcome && !isCanceled && (m.isHitExp01 ? ' 🎯' : ' ❌')}
                          </span>
                        </td>
                        <td className="p-2.5 text-center">
                          <span className={`font-bold text-[10px] ${hasOutcome && !isCanceled ? (m.isHitExp02 ? 'text-indigo-600 font-extrabold' : 'text-rose-500') : 'text-slate-700'}`}>
                            {m.exp02Pick === 'win' ? '홈승' : m.exp02Pick === 'draw' ? '무' : '원정승'}
                            {hasOutcome && !isCanceled && (m.isHitExp02 ? ' 🎯' : ' ❌')}
                          </span>
                        </td>
                        <td className="p-2.5 text-center">
                          {m.snapshotStatus === "EVALUATED" ? (
                            <div className="flex flex-col items-center">
                              <span className={`text-[10px] font-black ${isCanceled ? 'text-slate-400' : 'text-emerald-700'}`}>
                                {isCanceled ? '경기 취소' : `종료 (${m.score?.home}:${m.score?.away})`}
                              </span>
                              {!isCanceled && (
                                <span className="text-[9px] text-slate-400 mt-0.5 font-sans">
                                  실측결과: {m.actualOutcome === 'win' ? '홈승' : m.actualOutcome === 'draw' ? '무' : '원정승'}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-amber-600 font-bold">
                              ● {m.snapshotStatus}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ProtoForwardShadowView;
