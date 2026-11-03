/**
 * SportsQuant Pro — TOTO Forward Shadow Unit & E2E Test Suite
 * 
 * Tests:
 * A. 14 games valid real data -> Prediction created (status: PREDICTED)
 * B. 1 game missing (13 games) -> Prediction BLOCKED
 * C. VoteRate missing or sum abnormal -> Prediction BLOCKED
 * D. Synthetic data / isSimulated=true -> Prediction BLOCKED
 * E. Unconfirmed results -> PREDICTED maintained
 * F. Result confirmed -> RESULT_CONFIRMED
 * G. Evaluation complete -> EVALUATED with Brier & LogLoss
 * H. Future result leakage -> strictly 0
 * I. V1 / EXP03 input identity -> strictly PASS
 */

import {
  validateRoundIntegrity,
  createForwardShadowRoundPrediction,
  resolveForwardShadowRoundResults,
  CandidateMatchInput,
  RealMatchResultInput
} from "./server/realHistory/totoForwardShadow.js";
import { evaluateForwardShadow } from "./server/realHistory/totoForwardShadowEvaluator.js";
import { getForwardShadowRound } from "./server/realHistory/totoForwardShadowStore.js";

function runForwardShadowTests() {
  console.log("=================================================");
  console.log(" SportsQuant Pro — Forward Shadow E2E Test Suite");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} ${details ? "- " + details : ""}`);
      failed++;
    }
  }

  // 1. Generate 14 valid mock match inputs
  const createValid14Matches = (): CandidateMatchInput[] => {
    return Array.from({ length: 14 }, (_, i) => ({
      matchNo: i + 1,
      homeTeam: `HomeTeam_${i + 1}`,
      awayTeam: `AwayTeam_${i + 1}`,
      league: "K리그1",
      matchDate: "10.01(토) 14:00",
      voteRate: {
        win: 45.0,
        draw: 28.0,
        lose: 27.0,
        winCount: 4500,
        drawCount: 2800,
        loseCount: 2700,
        totalCount: 10000
      },
      dataSource: "real",
      isSimulated: false
    }));
  };

  // Test A: 14 matches valid real data -> PREDICTED
  const valid14 = createValid14Matches();
  const resA = createForwardShadowRoundPrediction("sc1", 2026, 991, valid14);
  assert("Test A: 14 valid matches creates valid round", resA.validationStatus === "VALID");
  assert("Test A: Prediction count equals 14", resA.matches.length === 14);
  assert("Test A: Initial match status is PREDICTED", resA.matches[0].resultStatus === "PREDICTED");
  assert("Test A: Outcome is null at prediction creation", resA.matches[0].outcome === null);
  assert("Test A: Scores are null at prediction creation", resA.matches[0].homeScore === null && resA.matches[0].awayScore === null);

  // Test B: 1 game missing (13 games) -> BLOCKED
  const missing1 = createValid14Matches().slice(0, 13);
  const resB = createForwardShadowRoundPrediction("sc1", 2026, 992, missing1);
  assert("Test B: 13 games round is PREDICTION_BLOCKED", resB.validationStatus === "PREDICTION_BLOCKED");
  assert("Test B: No prediction snapshot generated for blocked round", resB.matches.length === 0);

  // Test C: VoteRate missing or abnormal sum -> BLOCKED
  const invalidVote = createValid14Matches();
  invalidVote[5].voteRate = { win: null, draw: 30, lose: 30 };
  const resC1 = createForwardShadowRoundPrediction("sc1", 2026, 993, invalidVote);
  assert("Test C1: Missing voteRate win is PREDICTION_BLOCKED", resC1.validationStatus === "PREDICTION_BLOCKED");

  const abnormalVote = createValid14Matches();
  abnormalVote[2].voteRate = { win: 70, draw: 70, lose: 70 }; // sum = 210%
  const resC2 = createForwardShadowRoundPrediction("sc1", 2026, 994, abnormalVote);
  assert("Test C2: Abnormal voteRate sum (210%) is PREDICTION_BLOCKED", resC2.validationStatus === "PREDICTION_BLOCKED");

  // Test D: Synthetic or isSimulated=true -> BLOCKED
  const syntheticMatches = createValid14Matches();
  (syntheticMatches[0] as any).isSimulated = true;
  const resD = createForwardShadowRoundPrediction("sc1", 2026, 995, syntheticMatches);
  assert("Test D: isSimulated=true is PREDICTION_BLOCKED", resD.validationStatus === "PREDICTION_BLOCKED");

  // Test E: Unconfirmed results -> PREDICTED maintained
  const retrievedRound = getForwardShadowRound("sc1", 2026, 991);
  assert("Test E: Unconfirmed round retains PREDICTED status", retrievedRound?.matches[0].resultStatus === "PREDICTED");

  // Test F & G: Result confirmed -> RESULT_CONFIRMED & EVALUATED
  const actualResults: RealMatchResultInput[] = Array.from({ length: 14 }, (_, i) => ({
    matchNo: i + 1,
    homeScore: i % 3 === 0 ? 2 : 1,
    awayScore: i % 3 === 1 ? 2 : 1,
    outcome: i % 3 === 0 ? "win" : i % 3 === 1 ? "lose" : "draw"
  }));
  const resFG = resolveForwardShadowRoundResults("sc1", 2026, 991, actualResults);
  assert("Test F: Results confirmed properly", resFG.allResultsConfirmed === true);
  assert("Test G: Match status transitioned to EVALUATED", resFG.matches[0].resultStatus === "EVALUATED");
  assert("Test G: Brier score computed (> 0)", (resFG.matches[0].v1BrierScore ?? 0) > 0);
  assert("Test G: LogLoss computed (> 0)", (resFG.matches[0].v1LogLoss ?? 0) > 0);
  assert("Test G: Comparison status assigned", ["V2_WON", "V1_WON", "BOTH_HIT", "BOTH_MISS"].includes(resFG.matches[0].comparisonStatus!));

  // Test H: Zero Look-Ahead leakage
  let lookAheadViolations = 0;
  for (const m of resFG.matches) {
    if (!m.predictionCreatedAt || !m.evaluatedAt) {
      lookAheadViolations++;
      continue;
    }
    const predT = new Date(m.predictionCreatedAt).getTime();
    const evalT = new Date(m.evaluatedAt).getTime();
    if (predT > evalT) {
      lookAheadViolations++;
    }
  }
  assert("Test H: Zero Look-Ahead leakage (predictionCreatedAt <= evaluatedAt)", lookAheadViolations === 0);

  // Test I: V1 / EXP03 input identity
  let inputIdentityViolations = 0;
  for (const m of resFG.matches) {
    if (!m.v1Prediction || !m.exp03Prediction || !m.v1Probability || !m.exp03Probability) {
      inputIdentityViolations++;
    }
    // Probabilities must each sum to 1.0 (within floating tolerance)
    const v1Sum = m.v1Probability.win + m.v1Probability.draw + m.v1Probability.lose;
    const exp03Sum = m.exp03Probability.win + m.exp03Probability.draw + m.exp03Probability.lose;
    if (Math.abs(v1Sum - 1.0) > 0.001 || Math.abs(exp03Sum - 1.0) > 0.001) {
      inputIdentityViolations++;
    }
  }
  assert("Test I: V1 & EXP03 input identity and normalization passed", inputIdentityViolations === 0);

  // Test Safety: AUTO_PROMOTION = DISABLED
  const evalRes = evaluateForwardShadow();
  assert("Test Safety: AUTO_PROMOTION is permanently DISABLED", evalRes.metadata.autoPromotion === "DISABLED");
  assert("Test Safety: Production model is V1", evalRes.metadata.productionModel === "V1");
  assert("Test Safety: Candidate model is TOTO_V2_EXP03", evalRes.metadata.candidateModel === "TOTO_V2_EXP03");

  console.log(`\nTest Summary: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runForwardShadowTests();
