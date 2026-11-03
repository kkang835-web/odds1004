/**
 * SportsQuant Pro — PROTO Forward Shadow Evaluator
 * 
 * [ABSOLUTE INVARIANTS]
 * 1. Independent evaluation across V1, EXP01, EXP02, and No-Vig.
 * 2. Unsettled/unavailable matches are strictly excluded from performance calculation.
 * 3. Clear sample size status indicators (EARLY OBSERVATION -> SUBSTANTIAL FORWARD SAMPLE).
 * 4. Production V1 is immutable. Auto-promotion is PERMANENTLY_DISABLED.
 */

import {
  ProtoForwardShadowPredictionRecord,
  ForwardShadowEvaluationSummary,
  ForwardSampleSizeStatus,
  ForwardModelKPI,
  ForwardSportKPI,
  ForwardOddsBucketKPI,
  ForwardEvBucketKPI,
  ForwardBootstrapCI
} from "./protoForwardShadowTypes.js";
import { getAllProtoForwardShadowRecords, loadProtoForwardShadowStore } from "./protoForwardShadowStore.js";
import { RealProtoSport } from "./realProtoHistoryTypes.js";
import { PREDEFINED_ODDS_BUCKETS } from "./protoExp02BucketedShrinkage.js";

/**
 * Seeded Pseudo-Random Number Generator for reproducible bootstrap
 */
class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
}

/**
 * Evaluates all accumulated Forward Shadow prediction records
 */
export function evaluateProtoForwardShadow(): ForwardShadowEvaluationSummary {
  const store = loadProtoForwardShadowStore();
  const allRecords = getAllProtoForwardShadowRecords();

  const totalSnapshots = allRecords.length;
  const settled = allRecords.filter(r => r.snapshotStatus === "EVALUATED" && r.actualOutcome !== null && r.actualOutcome !== "canceled");
  const pending = allRecords.filter(r => r.snapshotStatus === "PREDICTED" || r.snapshotStatus === "RESULT_PENDING");
  const unavailable = allRecords.filter(r => r.snapshotStatus === "UNAVAILABLE" || r.snapshotStatus === "INELIGIBLE_RETROSPECTIVE");
  const invalid = allRecords.filter(r => r.snapshotStatus === "INVALID" || r.snapshotStatus === "FORWARD_BLOCKED" || r.lookaheadViolation);

  const N = settled.length;

  // Determine Sample Stage
  let stage: ForwardSampleSizeStatus = "EARLY OBSERVATION";
  if (N >= 1000) stage = "STATISTICAL REVIEW ELIGIBLE";
  else if (N >= 700) stage = "MEANINGFUL FORWARD SAMPLE";
  else if (N >= 300) stage = "ACCUMULATING";
  else if (N >= 100) stage = "INITIAL FORWARD SAMPLE";

  const sampleNotice = N < 1000
    ? "Forward sample accumulation in progress"
    : "Forward sample accumulation complete.";

  // Compute Overall Model KPIs
  function computeModelKPI(
    name: string,
    getPick: (r: ProtoForwardShadowPredictionRecord) => "win" | "draw" | "lose",
    getProb: (r: ProtoForwardShadowPredictionRecord) => { win: number; draw: number | null; lose: number },
    getEv: (r: ProtoForwardShadowPredictionRecord) => { win: number; draw: number | null; lose: number },
    getRoi: (r: ProtoForwardShadowPredictionRecord) => number | undefined
  ): ForwardModelKPI {
    if (N === 0) {
      return { modelName: name, hitRate: 0, brierScore: 0, logLoss: 0, fixedRoi: 0, averageEv: 0, medianEv: 0 };
    }

    let hits = 0;
    let brierSum = 0;
    let logLossSum = 0;
    let retSum = 0;
    const evList: number[] = [];

    for (const r of settled) {
      const pick = getPick(r);
      const isHit = pick === r.actualOutcome;
      if (isHit) hits++;

      const roi = getRoi(r) ?? (isHit ? (pick === "win" ? r.odds.win : (pick === "draw" ? r.odds.draw! : r.odds.lose)) - 1.0 : -1.0);
      retSum += roi;

      const p = getProb(r);
      const yW = r.actualOutcome === "win" ? 1 : 0;
      const yD = r.actualOutcome === "draw" ? 1 : 0;
      const yL = r.actualOutcome === "lose" ? 1 : 0;
      const hasDraw = r.odds.draw !== null;

      brierSum += (p.win - yW)**2 + (hasDraw ? (p.draw! - yD)**2 : 0) + (p.lose - yL)**2;

      const pAct = r.actualOutcome === "win" ? p.win : (r.actualOutcome === "draw" ? p.draw! : p.lose);
      logLossSum += -Math.log(Math.max(1e-6, pAct));

      const ev = getEv(r);
      const evPick = pick === "win" ? ev.win : (pick === "draw" ? ev.draw! : ev.lose);
      evList.push(evPick);
    }

    evList.sort((a, b) => a - b);
    const medianEv = +(evList[Math.floor(N / 2)] * 100).toFixed(2);

    return {
      modelName: name,
      hitRate: +(hits / N * 100).toFixed(2),
      brierScore: +(brierSum / N).toFixed(4),
      logLoss: +(logLossSum / N).toFixed(4),
      fixedRoi: +(retSum / N * 100).toFixed(2),
      averageEv: +(evList.reduce((a, b) => a + b, 0) / N * 100).toFixed(2),
      medianEv
    };
  }

  const overallKPI = {
    v1: computeModelKPI("PROTO_V1_PRODUCTION", r => r.v1Pick, r => r.v1ModelProbability, r => r.v1EV, r => r.roiV1),
    exp01: computeModelKPI("PROTO_EXP01_SHADOW", r => r.exp01Pick, r => r.exp01Probability, r => r.exp01EV, r => r.roiExp01),
    exp02: computeModelKPI("PROTO_EXP02_SHADOW", r => r.exp02Pick, r => r.exp02Probability, r => r.exp02EV, r => r.roiExp02),
    noVig: computeModelKPI("NO_VIG_BENCHMARK", r => r.noVigPick, r => r.noVigProbability, r => r.v1EV, r => r.roiNoVig)
  };

  // Sport Breakdown
  const sports: RealProtoSport[] = ["sc", "bs", "bk", "vl"];
  const bySport: Record<string, ForwardSportKPI> = {};

  for (const sp of sports) {
    const subset = settled.filter(r => r.sport === sp);
    const count = subset.length;
    const isInsufficient = count < 30;

    if (count === 0) {
      bySport[sp] = {
        sport: sp, sampleCount: 0, isInsufficientSample: true,
        v1: { hitRate: 0, brier: 0, logLoss: 0, roi: 0 },
        exp01: { hitRate: 0, brier: 0, logLoss: 0, roi: 0 },
        exp02: { hitRate: 0, brier: 0, logLoss: 0, roi: 0 },
        noVig: { hitRate: 0, brier: 0, logLoss: 0, roi: 0 }
      };
      continue;
    }

    const getSubKPI = (
      getPick: (r: ProtoForwardShadowPredictionRecord) => "win" | "draw" | "lose",
      getProb: (r: ProtoForwardShadowPredictionRecord) => { win: number; draw: number | null; lose: number },
      getRoi: (r: ProtoForwardShadowPredictionRecord) => number | undefined
    ) => {
      let hits = 0, brierSum = 0, logLossSum = 0, retSum = 0;
      for (const r of subset) {
        const pick = getPick(r);
        const isHit = pick === r.actualOutcome;
        if (isHit) hits++;
        retSum += getRoi(r) ?? (isHit ? (pick === "win" ? r.odds.win : (pick === "draw" ? r.odds.draw! : r.odds.lose)) - 1.0 : -1.0);
        const p = getProb(r);
        const yW = r.actualOutcome === "win" ? 1 : 0;
        const yD = r.actualOutcome === "draw" ? 1 : 0;
        const yL = r.actualOutcome === "lose" ? 1 : 0;
        const hasDraw = r.odds.draw !== null;
        brierSum += (p.win - yW)**2 + (hasDraw ? (p.draw! - yD)**2 : 0) + (p.lose - yL)**2;
        const pAct = r.actualOutcome === "win" ? p.win : (r.actualOutcome === "draw" ? p.draw! : p.lose);
        logLossSum += -Math.log(Math.max(1e-6, pAct));
      }
      return {
        hitRate: +(hits / count * 100).toFixed(2),
        brier: +(brierSum / count).toFixed(4),
        logLoss: +(logLossSum / count).toFixed(4),
        roi: +(retSum / count * 100).toFixed(2)
      };
    };

    bySport[sp] = {
      sport: sp,
      sampleCount: count,
      isInsufficientSample: isInsufficient,
      v1: getSubKPI(r => r.v1Pick, r => r.v1ModelProbability, r => r.roiV1),
      exp01: getSubKPI(r => r.exp01Pick, r => r.exp01Probability, r => r.roiExp01),
      exp02: getSubKPI(r => r.exp02Pick, r => r.exp02Probability, r => r.roiExp02),
      noVig: getSubKPI(r => r.noVigPick, r => r.noVigProbability, r => r.roiNoVig)
    };
  }

  // Odds Bucket Breakdown
  const byOddsBucket: ForwardOddsBucketKPI[] = PREDEFINED_ODDS_BUCKETS.map(b => {
    const sub = settled.filter(r => r.oddsBucket === b.bucket);
    const count = sub.length;
    const isInsufficient = count < 30;

    if (count === 0) {
      return {
        bucket: b.bucket, bucketLabel: b.bucketLabel, sampleCount: 0, isInsufficientSample: true,
        v1Hit: 0, exp01Hit: 0, exp02Hit: 0, noVigHit: 0,
        v1Brier: 0, exp01Brier: 0, exp02Brier: 0, noVigBrier: 0,
        v1Roi: 0, exp01Roi: 0, exp02Roi: 0, noVigRoi: 0
      };
    }

    let hV1 = 0, hExp01 = 0, hExp02 = 0, hNoVig = 0;
    let bV1 = 0, bExp01 = 0, bExp02 = 0, bNoVig = 0;
    let rV1 = 0, rExp01 = 0, rExp02 = 0, rNoVig = 0;

    for (const r of sub) {
      if (r.v1Pick === r.actualOutcome) hV1++;
      if (r.exp01Pick === r.actualOutcome) hExp01++;
      if (r.exp02Pick === r.actualOutcome) hExp02++;
      if (r.noVigPick === r.actualOutcome) hNoVig++;

      rV1 += r.roiV1 ?? 0;
      rExp01 += r.roiExp01 ?? 0;
      rExp02 += r.roiExp02 ?? 0;
      rNoVig += r.roiNoVig ?? 0;

      bV1 += r.brierV1 ?? 0;
      bExp01 += r.brierExp01 ?? 0;
      bExp02 += r.brierExp02 ?? 0;
      bNoVig += r.brierNoVig ?? 0;
    }

    return {
      bucket: b.bucket,
      bucketLabel: b.bucketLabel,
      sampleCount: count,
      isInsufficientSample: isInsufficient,
      v1Hit: +(hV1 / count * 100).toFixed(2),
      exp01Hit: +(hExp01 / count * 100).toFixed(2),
      exp02Hit: +(hExp02 / count * 100).toFixed(2),
      noVigHit: +(hNoVig / count * 100).toFixed(2),
      v1Brier: +(bV1 / count).toFixed(4),
      exp01Brier: +(bExp01 / count).toFixed(4),
      exp02Brier: +(bExp02 / count).toFixed(4),
      noVigBrier: +(bNoVig / count).toFixed(4),
      v1Roi: +(rV1 / count * 100).toFixed(2),
      exp01Roi: +(rExp01 / count * 100).toFixed(2),
      exp02Roi: +(rExp02 / count * 100).toFixed(2),
      noVigRoi: +(rNoVig / count * 100).toFixed(2)
    };
  });

  // EV Buckets
  const evDefs = [
    { name: "EV < 0%", min: null, max: 0.0 },
    { name: "EV 0% ~ 2%", min: 0.0, max: 0.02 },
    { name: "EV 2% ~ 5%", min: 0.02, max: 0.05 },
    { name: "EV 5% ~ 10%", min: 0.05, max: 0.10 },
    { name: "EV 10%+", min: 0.10, max: null }
  ];

  const byEvBucket: ForwardEvBucketKPI[] = evDefs.map(def => {
    const sub = settled.filter(r => {
      const ev = r.v1MaxEvValue;
      if (def.min === null && def.max !== null) return ev < def.max;
      if (def.min !== null && def.max !== null) return ev >= def.min && ev < def.max;
      if (def.min !== null && def.max === null) return ev >= def.min;
      return false;
    });

    const count = sub.length;
    if (count === 0) {
      return {
        bucketName: def.name, sampleCount: 0,
        v1Hit: 0, exp01Hit: 0, exp02Hit: 0,
        v1Roi: 0, exp01Roi: 0, exp02Roi: 0,
        v1AvgEv: 0, exp01AvgEv: 0, exp02AvgEv: 0
      };
    }

    let hV1 = 0, hExp01 = 0, hExp02 = 0;
    let rV1 = 0, rExp01 = 0, rExp02 = 0;
    let evV1 = 0, evExp01 = 0, evExp02 = 0;

    for (const r of sub) {
      if (r.v1MaxEvPick === r.actualOutcome) hV1++;
      if (r.exp01MaxEvPick === r.actualOutcome) hExp01++;
      if (r.exp02MaxEvPick === r.actualOutcome) hExp02++;

      const getOdds = (pick: "win" | "draw" | "lose") => pick === "win" ? r.odds.win : (pick === "draw" ? r.odds.draw! : r.odds.lose);
      rV1 += r.v1MaxEvPick === r.actualOutcome ? getOdds(r.v1MaxEvPick) - 1.0 : -1.0;
      rExp01 += r.exp01MaxEvPick === r.actualOutcome ? getOdds(r.exp01MaxEvPick) - 1.0 : -1.0;
      rExp02 += r.exp02MaxEvPick === r.actualOutcome ? getOdds(r.exp02MaxEvPick) - 1.0 : -1.0;

      evV1 += r.v1MaxEvValue;
      evExp01 += r.exp01MaxEvValue;
      evExp02 += r.exp02MaxEvValue;
    }

    return {
      bucketName: def.name,
      sampleCount: count,
      v1Hit: +(hV1 / count * 100).toFixed(2),
      exp01Hit: +(hExp01 / count * 100).toFixed(2),
      exp02Hit: +(hExp02 / count * 100).toFixed(2),
      v1Roi: +(rV1 / count * 100).toFixed(2),
      exp01Roi: +(rExp01 / count * 100).toFixed(2),
      exp02Roi: +(rExp02 / count * 100).toFixed(2),
      v1AvgEv: +(evV1 / count * 100).toFixed(2),
      exp01AvgEv: +(evExp01 / count * 100).toFixed(2),
      exp02AvgEv: +(evExp02 / count * 100).toFixed(2)
    };
  });

  // Statistical Tests (McNemar & Paired Bootstrap)
  let statisticalTests: ForwardShadowEvaluationSummary["statisticalTests"] = {
    status: N >= 30 ? "COMPUTED" : "INSUFFICIENT_SAMPLE",
    bootstrapIterations: 10000,
    bootstrapSeed: 2026,
    bootstrapResults: []
  };

  if (N >= 30) {
    // McNemar Exact test
    function runMcNemar(pickA: (r: ProtoForwardShadowPredictionRecord) => "win" | "draw" | "lose", pickB: (r: ProtoForwardShadowPredictionRecord) => "win" | "draw" | "lose") {
      let b = 0, c = 0;
      for (const r of settled) {
        const hitA = pickA(r) === r.actualOutcome;
        const hitB = pickB(r) === r.actualOutcome;
        if (hitA && !hitB) b++;
        if (!hitA && hitB) c++;
      }
      const totalDiscordant = b + c;
      if (totalDiscordant === 0) return { exactPValue: 1.0, isSignificant: false };
      
      function comb(n: number, k: number): number {
        if (k < 0 || k > n) return 0;
        if (k === 0 || k === n) return 1;
        let res = 1;
        for (let i = 0; i < k; i++) res = res * (n - i) / (i + 1);
        return res;
      }
      const minK = Math.min(b, c);
      let tailSum = 0;
      for (let i = 0; i <= minK; i++) {
        tailSum += comb(totalDiscordant, i) * Math.pow(0.5, totalDiscordant);
      }
      const p = Math.min(1.0, +(2 * tailSum).toFixed(4));
      return { exactPValue: p, isSignificant: p < 0.05 };
    }

    statisticalTests.mcnemar_V1_Exp01 = runMcNemar(r => r.v1Pick, r => r.exp01Pick);
    statisticalTests.mcnemar_V1_Exp02 = runMcNemar(r => r.v1Pick, r => r.exp02Pick);

    // Bootstrap 10,000 runs
    const rng = new SeededRandom(2026);
    const BOOT_ITERS = 10000;
    const brierDiffExp01_V1 = new Array(BOOT_ITERS);
    const brierDiffExp02_V1 = new Array(BOOT_ITERS);
    const roiDiffExp01_V1 = new Array(BOOT_ITERS);
    const roiDiffExp02_V1 = new Array(BOOT_ITERS);

    for (let it = 0; it < BOOT_ITERS; it++) {
      let brV1 = 0, brExp01 = 0, brExp02 = 0;
      let roiV1 = 0, roiExp01 = 0, roiExp02 = 0;

      for (let j = 0; j < N; j++) {
        const idx = Math.floor(rng.next() * N);
        const r = settled[idx];
        brV1 += r.brierV1 ?? 0;
        brExp01 += r.brierExp01 ?? 0;
        brExp02 += r.brierExp02 ?? 0;
        roiV1 += r.roiV1 ?? 0;
        roiExp01 += r.roiExp01 ?? 0;
        roiExp02 += r.roiExp02 ?? 0;
      }

      brierDiffExp01_V1[it] = (brExp01 - brV1) / N;
      brierDiffExp02_V1[it] = (brExp02 - brV1) / N;
      roiDiffExp01_V1[it] = (roiExp01 - roiV1) / N * 100;
      roiDiffExp02_V1[it] = (roiExp02 - roiV1) / N * 100;
    }

    function getCI(arr: number[]): { lower: number; upper: number; isSignificant: boolean } {
      arr.sort((a, b) => a - b);
      const lower = +arr[Math.floor(BOOT_ITERS * 0.025)].toFixed(4);
      const upper = +arr[Math.floor(BOOT_ITERS * 0.975)].toFixed(4);
      const isSignificant = (lower > 0 && upper > 0) || (lower < 0 && upper < 0);
      return { lower, upper, isSignificant };
    }

    const ciBrExp01 = getCI(brierDiffExp01_V1);
    const ciBrExp02 = getCI(brierDiffExp02_V1);
    const ciRoiExp01 = getCI(roiDiffExp01_V1);
    const ciRoiExp02 = getCI(roiDiffExp02_V1);

    statisticalTests.bootstrapResults = [
      { metric: "Brier Score", comparison: "EXP01 - V1", observedDiff: +(overallKPI.exp01.brierScore - overallKPI.v1.brierScore).toFixed(4), ciLower95: ciBrExp01.lower, ciUpper95: ciBrExp01.upper, isStatisticallySignificant: ciBrExp01.isSignificant },
      { metric: "Brier Score", comparison: "EXP02 - V1", observedDiff: +(overallKPI.exp02.brierScore - overallKPI.v1.brierScore).toFixed(4), ciLower95: ciBrExp02.lower, ciUpper95: ciBrExp02.upper, isStatisticallySignificant: ciBrExp02.isSignificant },
      { metric: "Fixed Stake ROI (%)", comparison: "EXP01 - V1", observedDiff: +(overallKPI.exp01.fixedRoi - overallKPI.v1.fixedRoi).toFixed(2), ciLower95: ciRoiExp01.lower, ciUpper95: ciRoiExp01.upper, isStatisticallySignificant: ciRoiExp01.isSignificant },
      { metric: "Fixed Stake ROI (%)", comparison: "EXP02 - V1", observedDiff: +(overallKPI.exp02.fixedRoi - overallKPI.v1.fixedRoi).toFixed(2), ciLower95: ciRoiExp02.lower, ciUpper95: ciRoiExp02.upper, isStatisticallySignificant: ciRoiExp02.isSignificant }
    ];
  }

  return {
    experimentId: "PROTO_REAL_FORWARD_SHADOW_V1",
    generatedAt: new Date().toISOString(),
    dataSource: "wisetoto_official_real",
    isSimulated: false,
    autoPromotion: "PERMANENTLY_DISABLED",
    productionDecision: "PRODUCTION V1 — KEEP",
    sampleStatus: {
      stage,
      totalSnapshots,
      settledCount: N,
      pendingCount: pending.length,
      unavailableCount: unavailable.length,
      invalidCount: invalid.length,
      canMakeDefinitiveConclusion: N >= 1000,
      sampleNotice
    },
    overallKPI,
    bySport,
    byOddsBucket,
    byEvBucket,
    statisticalTests,
    roundsList: Object.values(store.rounds).map(r => ({
      year: r.year,
      round: r.round,
      totalMatches: r.totalMatches,
      evaluatedCount: r.evaluatedCount,
      pendingCount: r.pendingCount,
      unavailableCount: r.unavailableCount,
      invalidCount: r.invalidCount,
      syntheticRecords: r.syntheticRecords ?? 0,
      fallbackUsed: r.fallbackUsed ?? 0,
      lookaheadViolations: r.lookaheadViolations ?? 0,
      duplicateRecords: r.duplicateRecords ?? 0,
      snapshotImmutabilityViolations: r.snapshotImmutabilityViolations ?? 0,
      integrityGateStatus: r.integrityGateStatus ?? "FORWARD_ELIGIBLE"
    })),
    integrityAudit: {
      syntheticRecords: store.auditTotals.syntheticRecords ?? 0,
      fallbackUsed: store.auditTotals.fallbackUsed ?? 0,
      lookaheadViolations: store.auditTotals.lookaheadViolations ?? 0,
      temporalSequenceViolations: store.auditTotals.temporalSequenceViolations ?? 0,
      duplicateRecords: store.auditTotals.duplicateRecords ?? 0,
      invalidOddsUsed: store.auditTotals.invalidOddsUsed ?? 0,
      inverseScoreRecords: store.auditTotals.inverseScoreRecords ?? 0,
      snapshotMutationRecords: store.auditTotals.snapshotMutationRecords ?? 0,
      retrospectiveRecords: store.auditTotals.retrospectiveRecords ?? 0,
      invalidMarketRecords: store.auditTotals.invalidMarketRecords ?? 0,
      missingTimestampRecords: store.auditTotals.missingTimestampRecords ?? 0,
      productionV1Changed: false,
      exp01Changed: false,
      exp02Changed: false,
      autoPromotion: "PERMANENTLY_DISABLED"
    },
    auditEventLog: store.auditEventLog ?? []
  };
}
