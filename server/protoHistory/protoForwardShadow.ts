/**
 * SportsQuant Pro — PROTO Forward Shadow Pipeline
 * 
 * [ABSOLUTE INVARIANTS]
 * 1. Zero Look-Ahead leakage: prediction snapshots are generated & timestamped strictly prior to results.
 * 2. Simultaneous snapshot of V1 (Production), EXP01 (Shadow), EXP02 (Shadow), and No-Vig (Benchmark).
 * 3. Exact official data only via WiseToto session communication.
 * 4. Production V1 is immutable. Auto-promotion is PERMANENTLY_DISABLED.
 */

import { RealProtoMatch, RealProtoOutcome, RealProtoSport } from "./realProtoHistoryTypes.js";
import {
  ProtoForwardShadowPredictionRecord,
  ProtoForwardShadowRoundRecord,
  ProtoForwardShadowStatus
} from "./protoForwardShadowTypes.js";
import {
  loadProtoForwardShadowStore,
  saveProtoForwardShadowStore,
  getProtoForwardShadowRound,
  upsertProtoForwardShadowRound,
  computeSnapshotHash
} from "./protoForwardShadowStore.js";
import { solveAdaptiveShinZ } from "../quantEngine.js";
import { resolveOddsBucket, computeBucketedShrinkageProbabilities } from "./protoExp02BucketedShrinkage.js";
import { classifyProtoMarket } from "./realProtoWalkForwardRunner.js";
import { collectRealProtoRound } from "./realProtoCollector.js";

/**
 * Historical Team Elo tracker for Forward Shadow
 */
export class ForwardEloTracker {
  private ratings: Map<string, number> = new Map();
  private readonly DEFAULT_RATING = 1500;
  private readonly K_FACTOR = 24;

  public getRating(teamName: string): number {
    const clean = teamName.trim();
    if (!this.ratings.has(clean)) return this.DEFAULT_RATING;
    return this.ratings.get(clean)!;
  }

  public recordMatchResult(homeTeam: string, awayTeam: string, outcome: RealProtoOutcome): void {
    if (!outcome || outcome === "canceled") return;
    const hClean = homeTeam.trim();
    const aClean = awayTeam.trim();

    const rH = this.getRating(hClean);
    const rA = this.getRating(aClean);

    const expH = 1 / (1 + Math.pow(10, (rA - rH) / 400));
    const expA = 1 - expH;

    let scoreH = 0.5;
    let scoreA = 0.5;
    if (outcome === "win") { scoreH = 1.0; scoreA = 0.0; }
    else if (outcome === "lose") { scoreH = 0.0; scoreA = 1.0; }

    this.ratings.set(hClean, +(rH + this.K_FACTOR * (scoreH - expH)).toFixed(2));
    this.ratings.set(aClean, +(rA + this.K_FACTOR * (scoreA - expA)).toFixed(2));
  }
}

/**
 * Creates an immutable forward prediction snapshot for a single match before results are known
 */
export function createForwardPredictionSnapshot(
  match: RealProtoMatch,
  eloTracker: ForwardEloTracker,
  options: { isPreMatch: boolean } = { isPreMatch: true }
): ProtoForwardShadowPredictionRecord {
  // Reject synthetic or simulated matches
  if ((match as any).isSimulated === true || match.dataSource !== "real") {
    throw new Error(`[ForwardShadow] Non-real match rejected for matchId: ${match.matchId}`);
  }

  const marketCat = classifyProtoMarket(match);
  const oddsWin = match.domesticOdds?.win;
  const oddsDraw = match.domesticOdds?.draw ?? null;
  const oddsLose = match.domesticOdds?.lose;

  const isValidOdds = oddsWin && oddsWin > 1.0 && oddsLose && oddsLose > 1.0;
  const hasDraw = oddsDraw !== null && typeof oddsDraw === "number" && !isNaN(oddsDraw) && oddsDraw > 1.0;

  if (!isValidOdds || marketCat !== "Standard_1X2_ML") {
    return {
      matchId: match.matchId,
      year: match.year,
      round: match.round,
      matchNo: match.matchNo,
      dateStr: match.dateStr || "",
      sport: match.sport,
      league: match.league || "",
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      market: marketCat,
      odds: { win: oddsWin || 0, draw: oddsDraw, lose: oddsLose || 0 },
      selectedOutcome: "win",
      selectedOdds: 0,
      oddsBucket: "BUCKET_D_LONGSHOT",
      oddsBucketLabel: "Invalid Odds",
      lambdaExp02: 0.50,
      noVigProbability: { win: 0, draw: null, lose: 0 },
      noVigPick: "win",
      v1ModelProbability: { win: 0, draw: null, lose: 0 },
      v1EV: { win: 0, draw: null, lose: 0 },
      v1Pick: "win",
      v1MaxEvPick: "win",
      v1MaxEvValue: 0,
      exp01Probability: { win: 0, draw: null, lose: 0 },
      exp01EV: { win: 0, draw: null, lose: 0 },
      exp01Pick: "win",
      exp01MaxEvPick: "win",
      exp01MaxEvValue: 0,
      exp02Probability: { win: 0, draw: null, lose: 0 },
      exp02EV: { win: 0, draw: null, lose: 0 },
      exp02Pick: "win",
      exp02MaxEvPick: "win",
      exp02MaxEvValue: 0,
      predictionCreatedAt: new Date().toISOString(),
      settledAt: null,
      dataSource: "real",
      isSimulated: false,
      fallbackUsed: false,
      syntheticUsed: false,
      lookaheadViolation: false,
      snapshotStatus: "INVALID",
      score: null,
      actualOutcome: null
    };
  }

  // 1. No-Vig Baseline via Shin (1993)
  const piWin = 1 / oddsWin;
  const piDraw = hasDraw ? 1 / oddsDraw! : 0;
  const piLose = 1 / oddsLose;
  const invArr = hasDraw ? [piWin, piDraw, piLose] : [piWin, piLose];
  const shinRes = solveAdaptiveShinZ(invArr);

  const noVigProbs = hasDraw ? {
    win: +shinRes.trueProbs[0].toFixed(4),
    draw: +shinRes.trueProbs[1].toFixed(4),
    lose: +shinRes.trueProbs[2].toFixed(4)
  } : {
    win: +shinRes.trueProbs[0].toFixed(4),
    draw: null,
    lose: +shinRes.trueProbs[1].toFixed(4)
  };

  // 2. V1 Production Model
  const homeElo = eloTracker.getRating(match.homeTeam);
  const awayElo = eloTracker.getRating(match.awayTeam);
  const eloWinProb = 1 / (1 + Math.pow(10, (awayElo - homeElo) / 400));
  const eloLoseProb = 1 - eloWinProb;

  let v1Probs: { win: number; draw: number | null; lose: number };
  if (hasDraw) {
    const drawBase = noVigProbs.draw!;
    const rem = 1.0 - drawBase;
    const rawModelWin = noVigProbs.win * 0.70 + (eloWinProb * rem) * 0.30;
    const rawModelLose = noVigProbs.lose * 0.70 + (eloLoseProb * rem) * 0.30;
    const modelSum = rawModelWin + drawBase + rawModelLose;
    v1Probs = {
      win: +(rawModelWin / modelSum).toFixed(4),
      draw: +(drawBase / modelSum).toFixed(4),
      lose: +(rawModelLose / modelSum).toFixed(4)
    };
  } else {
    const rawW = noVigProbs.win * 0.70 + eloWinProb * 0.30;
    const rawL = noVigProbs.lose * 0.70 + eloLoseProb * 0.30;
    const sum2 = rawW + rawL;
    v1Probs = {
      win: +(rawW / sum2).toFixed(4),
      draw: null,
      lose: +(rawL / sum2).toFixed(4)
    };
  }

  // Determine Selected Outcome and Selected Odds
  function getArgMaxOutcome(p: { win: number; draw: number | null; lose: number }): "win" | "draw" | "lose" {
    if (p.draw !== null && p.draw >= p.win && p.draw >= p.lose) return "draw";
    if (p.lose >= p.win && (p.draw === null || p.lose >= p.draw)) return "lose";
    return "win";
  }

  const selectedOutcome = getArgMaxOutcome(v1Probs);
  const selectedOdds = selectedOutcome === "win" ? oddsWin : (selectedOutcome === "draw" ? oddsDraw! : oddsLose);

  // 3. EXP01 Probability (Constant lambda = 0.25)
  const exp01Probs = computeBucketedShrinkageProbabilities(v1Probs, noVigProbs, 0.25);

  // 4. EXP02 Bucketed Shrinkage Probability
  const bucketInfo = resolveOddsBucket(selectedOdds);
  const exp02Probs = computeBucketedShrinkageProbabilities(v1Probs, noVigProbs, bucketInfo.lambda);

  // 5. EVs
  const v1EV = {
    win: +(v1Probs.win * oddsWin - 1.0).toFixed(4),
    draw: hasDraw ? +(v1Probs.draw! * oddsDraw! - 1.0).toFixed(4) : null,
    lose: +(v1Probs.lose * oddsLose - 1.0).toFixed(4)
  };
  const exp01EV = {
    win: +(exp01Probs.win * oddsWin - 1.0).toFixed(4),
    draw: hasDraw ? +(exp01Probs.draw! * oddsDraw! - 1.0).toFixed(4) : null,
    lose: +(exp01Probs.lose * oddsLose - 1.0).toFixed(4)
  };
  const exp02EV = {
    win: +(exp02Probs.win * oddsWin - 1.0).toFixed(4),
    draw: hasDraw ? +(exp02Probs.draw! * oddsDraw! - 1.0).toFixed(4) : null,
    lose: +(exp02Probs.lose * oddsLose - 1.0).toFixed(4)
  };

  // 6. Selection Picks
  function getMaxEvPick(ev: { win: number; draw: number | null; lose: number }): { pick: "win" | "draw" | "lose"; val: number } {
    let pick: "win" | "draw" | "lose" = "win";
    let val = ev.win;
    if (ev.draw !== null && ev.draw > val) { pick = "draw"; val = ev.draw; }
    if (ev.lose > val) { pick = "lose"; val = ev.lose; }
    return { pick, val };
  }

  const v1Pick = getArgMaxOutcome(v1Probs);
  const exp01Pick = getArgMaxOutcome(exp01Probs);
  const exp02Pick = getArgMaxOutcome(exp02Probs);
  const noVigPick = getArgMaxOutcome(noVigProbs);

  const v1MaxEv = getMaxEvPick(v1EV);
  const exp01MaxEv = getMaxEvPick(exp01EV);
  const exp02MaxEv = getMaxEvPick(exp02EV);

  // If the match outcome is already present when discovered for the first time without prior snapshot,
  // we do not allow retrospective look-ahead prediction; mark as INELIGIBLE_RETROSPECTIVE or LOOKAHEAD_VIOLATION.
  const hasOutcomeAlready = match.outcome !== null && match.outcome !== undefined;
  let initialStatus: ProtoForwardShadowStatus = "PREDICTED";
  let lookaheadViolation = false;

  if (hasOutcomeAlready) {
    if (options.isPreMatch) {
      lookaheadViolation = true;
      initialStatus = "FORWARD_BLOCKED";
    } else {
      initialStatus = "INELIGIBLE_RETROSPECTIVE";
    }
  }

  const snapObj: ProtoForwardShadowPredictionRecord = {
    matchId: match.matchId,
    year: match.year,
    round: match.round,
    matchNo: match.matchNo,
    dateStr: match.dateStr || "",
    sport: match.sport,
    league: match.league || "",
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    market: marketCat,
    odds: { win: oddsWin, draw: oddsDraw, lose: oddsLose },
    selectedOutcome,
    selectedOdds,
    oddsBucket: bucketInfo.bucket,
    oddsBucketLabel: bucketInfo.bucketLabel,
    lambdaExp02: bucketInfo.lambda,
    noVigProbability: noVigProbs,
    noVigPick,
    v1ModelProbability: v1Probs,
    v1EV,
    v1Pick,
    v1MaxEvPick: v1MaxEv.pick,
    v1MaxEvValue: v1MaxEv.val,
    exp01Probability: exp01Probs,
    exp01EV,
    exp01Pick,
    exp01MaxEvPick: exp01MaxEv.pick,
    exp01MaxEvValue: exp01MaxEv.val,
    exp02Probability: exp02Probs,
    exp02EV,
    exp02Pick,
    exp02MaxEvPick: exp02MaxEv.pick,
    exp02MaxEvValue: exp02MaxEv.val,
    predictionCreatedAt: new Date().toISOString(),
    settledAt: null,
    dataSource: "real",
    isSimulated: false,
    fallbackUsed: false,
    syntheticUsed: false,
    lookaheadViolation,
    snapshotStatus: initialStatus,
    score: null,
    actualOutcome: null
  };
  snapObj.snapshotHash = computeSnapshotHash(snapObj);
  return snapObj;
}

/**
 * Settles official results for an existing forward shadow round
 */
export function settleForwardShadowRound(
  year: number,
  round: number,
  officialMatches: RealProtoMatch[],
  eloTracker?: ForwardEloTracker
): { settledCount: number; evaluatedCount: number } {
  const store = loadProtoForwardShadowStore();
  const roundKey = `${year}_${round}`;
  const roundRecord = store.rounds[roundKey];

  if (!roundRecord) {
    throw new Error(`[ForwardShadow] Round ${year}_${round} not found in store to settle`);
  }

  const tracker = eloTracker || new ForwardEloTracker();
  let settledCount = 0;
  let evaluatedCount = 0;

  const officialMap = new Map<number, RealProtoMatch>();
  for (const om of officialMatches) {
    officialMap.set(om.matchNo, om);
  }

  for (const pred of roundRecord.matches) {
    if (pred.snapshotStatus === "EVALUATED") {
      evaluatedCount++;
      continue;
    }

    const official = officialMap.get(pred.matchNo);
    if (!official || official.outcome === null || official.outcome === undefined) {
      if (pred.snapshotStatus === "PREDICTED") {
        pred.snapshotStatus = "RESULT_PENDING";
      }
      continue;
    }

    const outcome = official.outcome;
    if (outcome === "canceled") {
      pred.actualOutcome = "canceled";
      pred.score = official.score;
      pred.snapshotStatus = "EVALUATED";
      const pubTime = official.provenance?.collectedAt ? new Date(official.provenance.collectedAt).getTime() : Date.now();
      pred.settledAt = new Date(Math.max(Date.now(), pubTime)).toISOString();
      settledCount++;
      continue;
    }

    // Check Look-ahead violation
    const resultPublishedAt = official.provenance?.collectedAt || new Date().toISOString();
    pred.resultPublishedAt = resultPublishedAt;

    if (new Date(pred.predictionCreatedAt).getTime() > new Date(resultPublishedAt).getTime()) {
      pred.lookaheadViolation = true;
      pred.snapshotStatus = "INELIGIBLE_RETROSPECTIVE";
      continue;
    }

    pred.actualOutcome = outcome;
    pred.score = official.score;
    const pubTime = new Date(resultPublishedAt).getTime();
    pred.settledAt = new Date(Math.max(Date.now(), pubTime)).toISOString();
    pred.snapshotStatus = "EVALUATED";

    // Compute Hit flags
    pred.isHitV1 = pred.v1Pick === outcome;
    pred.isHitExp01 = pred.exp01Pick === outcome;
    pred.isHitExp02 = pred.exp02Pick === outcome;
    pred.isHitNoVig = pred.noVigPick === outcome;
    pred.isHitV1MaxEv = pred.v1MaxEvPick === outcome;
    pred.isHitExp01MaxEv = pred.exp01MaxEvPick === outcome;
    pred.isHitExp02MaxEv = pred.exp02MaxEvPick === outcome;

    // Compute Returns
    const getOdds = (pick: "win" | "draw" | "lose") => pick === "win" ? pred.odds.win : (pick === "draw" ? pred.odds.draw! : pred.odds.lose);
    const getRet = (pick: "win" | "draw" | "lose") => pick === outcome ? getOdds(pick) - 1.0 : -1.0;

    pred.roiV1 = +getRet(pred.v1Pick).toFixed(4);
    pred.roiExp01 = +getRet(pred.exp01Pick).toFixed(4);
    pred.roiExp02 = +getRet(pred.exp02Pick).toFixed(4);
    pred.roiNoVig = +getRet(pred.noVigPick).toFixed(4);

    // Compute Brier Scores
    const yW = outcome === "win" ? 1 : 0;
    const yD = outcome === "draw" ? 1 : 0;
    const yL = outcome === "lose" ? 1 : 0;
    const hasDraw = pred.odds.draw !== null;

    pred.brierV1 = +((pred.v1ModelProbability.win - yW)**2 + (hasDraw ? (pred.v1ModelProbability.draw! - yD)**2 : 0) + (pred.v1ModelProbability.lose - yL)**2).toFixed(4);
    pred.brierExp01 = +((pred.exp01Probability.win - yW)**2 + (hasDraw ? (pred.exp01Probability.draw! - yD)**2 : 0) + (pred.exp01Probability.lose - yL)**2).toFixed(4);
    pred.brierExp02 = +((pred.exp02Probability.win - yW)**2 + (hasDraw ? (pred.exp02Probability.draw! - yD)**2 : 0) + (pred.exp02Probability.lose - yL)**2).toFixed(4);
    pred.brierNoVig = +((pred.noVigProbability.win - yW)**2 + (hasDraw ? (pred.noVigProbability.draw! - yD)**2 : 0) + (pred.noVigProbability.lose - yL)**2).toFixed(4);

    // Compute LogLoss
    const pActV1 = outcome === "win" ? pred.v1ModelProbability.win : (outcome === "draw" ? pred.v1ModelProbability.draw! : pred.v1ModelProbability.lose);
    const pActExp01 = outcome === "win" ? pred.exp01Probability.win : (outcome === "draw" ? pred.exp01Probability.draw! : pred.exp01Probability.lose);
    const pActExp02 = outcome === "win" ? pred.exp02Probability.win : (outcome === "draw" ? pred.exp02Probability.draw! : pred.exp02Probability.lose);
    const pActNoVig = outcome === "win" ? pred.noVigProbability.win : (outcome === "draw" ? pred.noVigProbability.draw! : pred.noVigProbability.lose);

    pred.logLossV1 = +(-Math.log(Math.max(1e-6, pActV1))).toFixed(4);
    pred.logLossExp01 = +(-Math.log(Math.max(1e-6, pActExp01))).toFixed(4);
    pred.logLossExp02 = +(-Math.log(Math.max(1e-6, pActExp02))).toFixed(4);
    pred.logLossNoVig = +(-Math.log(Math.max(1e-6, pActNoVig))).toFixed(4);

    tracker.recordMatchResult(pred.homeTeam, pred.awayTeam, outcome);
    settledCount++;
    evaluatedCount++;
  }

  roundRecord.allSettled = roundRecord.matches.every(m => m.snapshotStatus === "EVALUATED" || m.snapshotStatus === "UNAVAILABLE" || m.snapshotStatus === "INVALID");
  saveProtoForwardShadowStore(store);

  console.log(`
[PROTO FORWARD SHADOW SETTLE]
timestamp: ${new Date().toISOString()}
year: ${year}
round: ${round}

evaluated: ${settledCount}
pending: ${roundRecord.matches.filter(m => m.snapshotStatus === "PREDICTED" || m.snapshotStatus === "RESULT_PENDING").length}
unavailable: ${roundRecord.matches.filter(m => m.snapshotStatus === "UNAVAILABLE" || m.snapshotStatus === "INELIGIBLE_RETROSPECTIVE").length}
duplicate: ${roundRecord.duplicateRecords ?? 0}
integrity: ${roundRecord.integrityGateStatus ?? "UNKNOWN"}

status: SUCCESS
`);

  return { settledCount, evaluatedCount };
}

/**
 * Synchronizes real official PROTO round from WiseToto into Forward Shadow store
 */
export async function syncWiseTotoProtoForwardRound(
  year: number,
  round: number,
  options: { isPreMatch?: boolean } = {}
): Promise<{ success: boolean; roundKey: string; snapshotCount: number; evaluatedCount: number }> {
  const isPreMatch = options.isPreMatch ?? true;

  // 1. Ingest official real round
  const officialRound = await collectRealProtoRound(year, round);
  const eloTracker = new ForwardEloTracker();

  const snapshots: ProtoForwardShadowPredictionRecord[] = [];
  for (const m of officialRound.matches) {
    if (m.integrityStatus !== "VALID") continue;
    const snap = createForwardPredictionSnapshot(m, eloTracker, { isPreMatch });
    snapshots.push(snap);
  }

  const roundRecord: ProtoForwardShadowRoundRecord = {
    year,
    round,
    masterSeq: officialRound.masterSeq,
    sourceUrl: `https://www.wisetoto.com/index.htm?tab_type=proto&game_type=pt&game_category=pt1&game_year=${year}&game_round=${round}`,
    syncedAt: new Date().toISOString(),
    allSettled: false,
    totalMatches: snapshots.length,
    predictedCount: snapshots.filter(s => s.snapshotStatus === "PREDICTED").length,
    pendingCount: snapshots.filter(s => s.snapshotStatus === "RESULT_PENDING").length,
    evaluatedCount: snapshots.filter(s => s.snapshotStatus === "EVALUATED").length,
    unavailableCount: snapshots.filter(s => s.snapshotStatus === "UNAVAILABLE" || s.snapshotStatus === "INELIGIBLE_RETROSPECTIVE").length,
    invalidCount: snapshots.filter(s => s.snapshotStatus === "INVALID").length,
    matches: snapshots
  };

  upsertProtoForwardShadowRound(roundRecord);

  // If official results exist and round was already in store, settle them
  const settleRes = settleForwardShadowRound(year, round, officialRound.matches, eloTracker);

  return {
    success: true,
    roundKey: `${year}_${round}`,
    snapshotCount: snapshots.length,
    evaluatedCount: settleRes.evaluatedCount
  };
}
