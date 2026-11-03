/**
 * SportsQuant Pro — TOTO Forward Shadow Engine
 * 
 * [ABSOLUTE GUARDRAILS]
 * 1. Zero Look-Ahead: Prediction snapshot is created using ONLY pre-match vote rates, teams, and league.
 * 2. homeScore, awayScore, and outcome are strictly forbidden at prediction time.
 * 3. 14-game completeness check: If any match is missing, duplicate, or has invalid voteRate,
 *    prediction is marked PREDICTION_BLOCKED and NOT evaluated.
 * 4. Input Identity: V1 Production and EXP03 Shadow receive 100% identical inputs.
 * 5. Production model is permanently V1. EXP03 is Shadow candidate only.
 * 6. AUTO_PROMOTION = DISABLED.
 */

import { RealSportType } from "./realHistoryTypes.js";
import {
  calculateTotoSoccer3State,
  calculateTotoBaseball3State,
  calculateTotoBasketball3State,
  Toto3StatePrediction
} from "../quantEngine.js";
import {
  calculateTotoSoccer3State_V2,
  calculateTotoBaseball3State_V2,
  calculateTotoBasketball3State_V2
} from "./totoV2Exp03Engine.js";
import {
  ForwardShadowPredictionRecord,
  ForwardShadowRoundRecord,
  ForwardComparisonStatus,
  saveForwardShadowRound,
  getForwardShadowRound
} from "./totoForwardShadowStore.js";

export interface CandidateMatchInput {
  matchNo: number; // 1 ~ 14
  homeTeam: string;
  awayTeam: string;
  league: string;
  matchDate?: string;
  voteRate: {
    win: number | null;
    draw: number | null;
    lose: number | null;
    winCount?: number;
    drawCount?: number;
    loseCount?: number;
    totalCount?: number;
  };
  dataSource: "real";
  isSimulated: false;
}

export interface RoundValidationResult {
  isValid: boolean;
  issues: string[];
}

export interface RealMatchResultInput {
  matchNo: number;
  homeScore: number | null;
  awayScore: number | null;
  outcome: "win" | "draw" | "lose" | "canceled" | null;
}

/**
 * Validates the strict 14-match integrity criteria for a TOTO round
 */
export function validateRoundIntegrity(matches: CandidateMatchInput[]): RoundValidationResult {
  const issues: string[] = [];

  if (!matches || matches.length !== 14) {
    issues.push(`Match count mismatch: expected exactly 14 matches, received ${matches ? matches.length : 0}`);
  }

  const seenMatchNos = new Set<number>();

  for (let i = 0; i < (matches ? matches.length : 0); i++) {
    const m = matches[i];
    const prefix = `Match #${m.matchNo || i + 1}`;

    if (m.matchNo < 1 || m.matchNo > 14) {
      issues.push(`${prefix}: matchNo must be within range 1~14, got ${m.matchNo}`);
    }

    if (seenMatchNos.has(m.matchNo)) {
      issues.push(`${prefix}: duplicate matchNo ${m.matchNo} detected`);
    }
    seenMatchNos.add(m.matchNo);

    if (!m.homeTeam || m.homeTeam.trim() === "") {
      issues.push(`${prefix}: homeTeam is missing or empty`);
    }

    if (!m.awayTeam || m.awayTeam.trim() === "") {
      issues.push(`${prefix}: awayTeam is missing or empty`);
    }

    if (!m.voteRate) {
      issues.push(`${prefix}: voteRate object is missing`);
    } else {
      const { win, draw, lose } = m.voteRate;
      if (win === null || win === undefined || isNaN(win) || win < 0) {
        issues.push(`${prefix}: voteRate.win is invalid (${win})`);
      }
      if (draw === null || draw === undefined || isNaN(draw) || draw < 0) {
        issues.push(`${prefix}: voteRate.draw is invalid (${draw})`);
      }
      if (lose === null || lose === undefined || isNaN(lose) || lose < 0) {
        issues.push(`${prefix}: voteRate.lose is invalid (${lose})`);
      }

      if (win !== null && draw !== null && lose !== null) {
        const sum = win + draw + lose;
        // Accept typical rounding variance: sum must be between 98.0% and 102.0%
        if (sum < 98.0 || sum > 102.0) {
          issues.push(`${prefix}: voteRate sum abnormal (${sum.toFixed(1)}%), expected ~100%`);
        }
      }
    }

    if (m.dataSource !== "real") {
      issues.push(`${prefix}: dataSource must be 'real', got '${m.dataSource}'`);
    }

    if (m.isSimulated !== false) {
      issues.push(`${prefix}: isSimulated must be strictly false (synthetic/simulated data blocked)`);
    }
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Computes Multiclass Brier Score for 3-State outcomes: 1/3 * sum((p_k - y_k)^2)
 */
export function computeMulticlassBrier(p: { win: number; draw: number; lose: number }, outcome: string): number {
  const yW = outcome === "win" ? 1 : 0;
  const yD = outcome === "draw" ? 1 : 0;
  const yL = outcome === "lose" ? 1 : 0;
  const sqDiff = Math.pow(p.win - yW, 2) + Math.pow(p.draw - yD, 2) + Math.pow(p.lose - yL, 2);
  return +(sqDiff / 3).toFixed(5);
}

/**
 * Computes Multiclass Log Loss: -ln(p_actual)
 */
export function computeLogLoss(p: { win: number; draw: number; lose: number }, outcome: string): number {
  let prob = 0.333333;
  if (outcome === "win") prob = p.win;
  else if (outcome === "draw") prob = p.draw;
  else if (outcome === "lose") prob = p.lose;

  const clamped = Math.max(0.001, Math.min(0.999, prob));
  return +(-Math.log(clamped)).toFixed(5);
}

/**
 * Creates Forward Shadow dual prediction snapshots for a verified 14-game round.
 * 
 * CRITICAL ZERO LOOK-AHEAD GUARANTEE:
 * - Neither homeScore, awayScore, nor outcome can be passed here.
 * - Result fields are initialized strictly to null.
 * - Status is set to "PREDICTED".
 */
export function createForwardShadowRoundPrediction(
  sport: RealSportType,
  year: number,
  round: number,
  candidateMatches: CandidateMatchInput[]
): ForwardShadowRoundRecord {
  const validation = validateRoundIntegrity(candidateMatches);

  const predictionCreatedAt = new Date().toISOString();

  if (!validation.isValid) {
    const blockedRecord: ForwardShadowRoundRecord = {
      sport,
      year,
      round,
      validationStatus: "PREDICTION_BLOCKED",
      validationIssues: validation.issues,
      predictionCreatedAt,
      evaluatedAt: null,
      allResultsConfirmed: false,
      matches: []
    };
    saveForwardShadowRound(blockedRecord);
    return blockedRecord;
  }

  // Sort matches strictly by matchNo 1..14
  const sortedMatches = [...candidateMatches].sort((a, b) => a.matchNo - b.matchNo);

  const predictions: ForwardShadowPredictionRecord[] = [];

  for (const m of sortedMatches) {
    // 1. Run V1 Production Model
    let v1PredResult: Toto3StatePrediction;
    if (sport === "sc1") {
      v1PredResult = calculateTotoSoccer3State(m.voteRate, m.homeTeam, m.awayTeam, m.league);
    } else if (sport === "bs1") {
      v1PredResult = calculateTotoBaseball3State(m.voteRate, m.homeTeam, m.awayTeam, m.league);
    } else {
      v1PredResult = calculateTotoBasketball3State(m.voteRate, m.homeTeam, m.awayTeam, m.league);
    }

    // 2. Run EXP03 Candidate Shadow Model with 100% identical inputs
    let exp03PredResult: Toto3StatePrediction;
    if (sport === "sc1") {
      exp03PredResult = calculateTotoSoccer3State_V2(m.voteRate, m.homeTeam, m.awayTeam, m.league);
    } else if (sport === "bs1") {
      exp03PredResult = calculateTotoBaseball3State_V2(m.voteRate, m.homeTeam, m.awayTeam, m.league);
    } else {
      exp03PredResult = calculateTotoBasketball3State_V2(m.voteRate, m.homeTeam, m.awayTeam, m.league);
    }

    // Map standard recommended pick ('win', 'draw', 'lose')
    const v1RecPick: "win" | "draw" | "lose" =
      v1PredResult.recommendedPick === "middle" ? "draw" :
      v1PredResult.recommendedPick === "lose" ? "lose" : "win";

    const exp03RecPick: "win" | "draw" | "lose" =
      exp03PredResult.recommendedPick === "middle" ? "draw" :
      exp03PredResult.recommendedPick === "lose" ? "lose" : "win";

    const predictionId = `fs_${sport}_${year}_${round}_${m.matchNo}`;

    const record: ForwardShadowPredictionRecord = {
      predictionId,
      sport,
      year,
      round,
      matchNo: m.matchNo,
      predictionCreatedAt,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      league: m.league,
      matchDate: m.matchDate,
      voteRate: {
        win: m.voteRate.win,
        draw: m.voteRate.draw,
        lose: m.voteRate.lose,
        winCount: m.voteRate.winCount,
        drawCount: m.voteRate.drawCount,
        loseCount: m.voteRate.loseCount,
        totalCount: m.voteRate.totalCount
      },
      v1Prediction: v1RecPick,
      v1Probability: {
        win: +v1PredResult.probabilities.win.toFixed(6),
        draw: +v1PredResult.probabilities.middle.toFixed(6),
        lose: +v1PredResult.probabilities.lose.toFixed(6)
      },
      v1ConfidenceGrade: v1PredResult.confidenceGrade,
      exp03Prediction: exp03RecPick,
      exp03Probability: {
        win: +exp03PredResult.probabilities.win.toFixed(6),
        draw: +exp03PredResult.probabilities.middle.toFixed(6),
        lose: +exp03PredResult.probabilities.lose.toFixed(6)
      },
      exp03ConfidenceGrade: exp03PredResult.confidenceGrade,
      dataSource: "real",
      isSimulated: false,
      resultStatus: "PREDICTED",
      homeScore: null,
      awayScore: null,
      outcome: null,
      evaluatedAt: null
    };

    predictions.push(record);
  }

  const roundRecord: ForwardShadowRoundRecord = {
    sport,
    year,
    round,
    validationStatus: "VALID",
    predictionCreatedAt,
    evaluatedAt: null,
    allResultsConfirmed: false,
    matches: predictions
  };

  saveForwardShadowRound(roundRecord);
  return roundRecord;
}

/**
 * Resolves outcomes for a round that already has a prediction snapshot.
 * Links actual scores & outcomes and calculates comparative metrics.
 */
export function resolveForwardShadowRoundResults(
  sport: RealSportType,
  year: number,
  round: number,
  results: RealMatchResultInput[]
): ForwardShadowRoundRecord {
  const existingRound = getForwardShadowRound(sport, year, round);
  if (!existingRound) {
    throw new Error(`Round ${sport} ${year} R${round} does not exist in Forward Shadow Store`);
  }

  if (existingRound.validationStatus === "PREDICTION_BLOCKED") {
    return existingRound;
  }

  const resultMap = new Map<number, RealMatchResultInput>();
  for (const r of results) {
    resultMap.set(r.matchNo, r);
  }

  const evaluatedAt = new Date().toISOString();
  let allConfirmed = true;

  for (const m of existingRound.matches) {
    const res = resultMap.get(m.matchNo);
    if (!res || res.outcome === null) {
      allConfirmed = false;
      continue;
    }

    // Connect real results
    m.homeScore = res.homeScore;
    m.awayScore = res.awayScore;
    m.outcome = res.outcome;
    m.evaluatedAt = evaluatedAt;

    if (res.outcome === "canceled") {
      m.resultStatus = "RESULT_CONFIRMED";
      continue;
    }

    m.resultStatus = "EVALUATED";

    // Hit determination
    const v1Hit = (m.v1Prediction === res.outcome);
    const exp03Hit = (m.exp03Prediction === res.outcome);

    m.v1IsHit = v1Hit;
    m.exp03IsHit = exp03Hit;

    // Brier Score
    m.v1BrierScore = computeMulticlassBrier(m.v1Probability, res.outcome);
    m.exp03BrierScore = computeMulticlassBrier(m.exp03Probability, res.outcome);

    // Log Loss
    m.v1LogLoss = computeLogLoss(m.v1Probability, res.outcome);
    m.exp03LogLoss = computeLogLoss(m.exp03Probability, res.outcome);

    // Comparative Transition Status
    let compStatus: ForwardComparisonStatus = "BOTH_MISS";
    if (v1Hit && exp03Hit) compStatus = "BOTH_HIT";
    else if (v1Hit && !exp03Hit) compStatus = "V1_WON";
    else if (!v1Hit && exp03Hit) compStatus = "V2_WON";
    else compStatus = "BOTH_MISS";

    m.comparisonStatus = compStatus;
  }

  existingRound.allResultsConfirmed = allConfirmed;
  if (allConfirmed) {
    existingRound.evaluatedAt = evaluatedAt;
  }

  saveForwardShadowRound(existingRound);
  return existingRound;
}

/**
 * Synchronizes a round from WiseToto into Forward Shadow.
 * If the round does not exist, creates the prediction snapshot using pre-match data only.
 * If the round already exists and real outcomes have arrived, resolves the outcomes.
 */
export async function syncWiseTotoForwardRound(
  sport: RealSportType,
  year: number,
  round: number
): Promise<{
  action: "PREDICTION_CREATED" | "RESULTS_RESOLVED" | "BLOCKED" | "NO_CHANGE";
  roundRecord: ForwardShadowRoundRecord;
}> {
  const { collectRealHistoricalRound } = await import("./realWisetotoCollector.js");
  const rawRound = await collectRealHistoricalRound(sport, year, round);

  let existing = getForwardShadowRound(sport, year, round);

  if (!existing) {
    // 1. Snapshot creation: Extract candidate inputs ONLY (strictly no scores, no outcomes)
    const candidateMatches: CandidateMatchInput[] = rawRound.matches.map(m => ({
      matchNo: m.matchNo,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      league: m.league,
      matchDate: m.matchDate,
      voteRate: {
        win: m.voteRate.win,
        draw: m.voteRate.draw,
        lose: m.voteRate.lose,
        winCount: m.voteRate.winCount,
        drawCount: m.voteRate.drawCount,
        loseCount: m.voteRate.loseCount,
        totalCount: m.voteRate.totalCount
      },
      dataSource: "real",
      isSimulated: false
    }));

    const newRecord = createForwardShadowRoundPrediction(sport, year, round, candidateMatches);
    if (newRecord.validationStatus === "PREDICTION_BLOCKED") {
      return { action: "BLOCKED", roundRecord: newRecord };
    }
    existing = newRecord;

    // Check if any results are already available to resolve
    const availableResults: RealMatchResultInput[] = rawRound.matches
      .filter(m => m.outcome !== null)
      .map(m => ({
        matchNo: m.matchNo,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        outcome: m.outcome
      }));

    if (availableResults.length > 0) {
      const resolved = resolveForwardShadowRoundResults(sport, year, round, availableResults);
      return { action: "RESULTS_RESOLVED", roundRecord: resolved };
    }

    return { action: "PREDICTION_CREATED", roundRecord: newRecord };
  } else {
    // Round already has a frozen prediction snapshot. Check if new outcomes have arrived.
    const unconfirmedMatches = existing.matches.filter(m => m.resultStatus === "PREDICTED");
    if (unconfirmedMatches.length > 0) {
      const newResults: RealMatchResultInput[] = rawRound.matches
        .filter(m => m.outcome !== null)
        .map(m => ({
          matchNo: m.matchNo,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
          outcome: m.outcome
        }));

      if (newResults.length > 0) {
        const resolved = resolveForwardShadowRoundResults(sport, year, round, newResults);
        return { action: "RESULTS_RESOLVED", roundRecord: resolved };
      }
    }
    return { action: "NO_CHANGE", roundRecord: existing };
  }
}
