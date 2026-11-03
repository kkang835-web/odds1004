/**
 * SportsQuant Pro — PROTO Out-of-Sample Walk-Forward Policy Empirical Validation Suite
 * 
 * Objectives:
 * 1. Validate "Golden Score → Tier 1~5 → Fallback → Primary Pick" policy on OOS Walk-Forward data.
 * 2. Strict READ-ONLY audit: Zero modification of thresholds, weights, datasets, or baselines.
 * 3. Comparative benchmarks:
 *    - Strategy A: Pure Max Probability
 *    - Strategy B: Pure Max EV
 *    - Strategy C: Pure Max Golden Score (Gate-free)
 *    - Strategy D: Primary Pick All (including Pass)
 *    - Strategy E: Primary Pick Active (excluding Pass)
 *    - Strategy F: Pass Filter Group (Auditing capital preservation efficiency)
 * 4. Tier-by-Tier decomposition (Tier 1~5 & Fallback).
 */

import fs from "fs";
import path from "path";
import assert from "assert";
import { getPrimaryPickInfo } from "./src/utils/quantPickEvaluator.js";

interface MatchEvaluationResult {
  matchId: string;
  sport: string;
  year: number;
  round: number;
  matchNo: number;
  actualOutcome: string;
  odds: { win: number; draw: number | null; lose: number };
  primary: {
    pickOutcome: string;
    odds: number;
    prob: number;
    roi: number;
    score: number;
    tier: string;
    status: string;
    isPass: boolean;
  };
  maxProb: { pickOutcome: string; odds: number; prob: number; roi: number };
  maxEv: { pickOutcome: string; odds: number; prob: number; roi: number };
  maxScore: { pickOutcome: string; odds: number; prob: number; score: number };
}

export function runWalkForwardPolicyValidation() {
  console.log("==================================================");
  console.log("PROTO OUT-OF-SAMPLE WALK-FORWARD POLICY EMPIRICAL AUDIT");
  console.log("==================================================\n");

  const wfPath = path.join(process.cwd(), "data", "protoRealWalkForwardV1.json");
  const wf = JSON.parse(fs.readFileSync(wfPath, "utf-8"));
  const settled = wf.records.filter((r: any) => r.isSettled);

  assert.strictEqual(settled.length, 1413, "Settled Walk-Forward records must be exactly 1413");

  const mapOutcome = (lbl: string) => {
    if (lbl.includes("승")) return "win";
    if (lbl.includes("무")) return "draw";
    if (lbl.includes("패")) return "lose";
    return "win";
  };

  const results: MatchEvaluationResult[] = [];

  for (const r of settled) {
    const m = {
      id: r.matchId,
      gameNo: r.matchNo,
      sport: r.sport === "sc" ? "soccer" : (r.sport === "bs" ? "baseball" : (r.sport === "bk" ? "basketball" : "volleyball")),
      homeTeam: r.homeTeam,
      awayTeam: r.awayTeam,
      domestic: { win: r.odds.win, draw: r.odds.draw, lose: r.odds.lose }
    };

    const p = getPrimaryPickInfo(m as any);
    const candidates = p.candidates || [];

    const sortedProb = [...candidates].sort((a,b) => b.prob - a.prob);
    const sortedEv = [...candidates].sort((a,b) => b.expectedRoi - a.expectedRoi);
    const sortedScore = [...candidates].sort((a,b) => b.score - a.score);

    const eligible = candidates.filter(c => c && c.odds >= 1.45);
    const superGolden = eligible.filter(c => c.odds >= 1.45 && c.odds <= 2.20 && c.prob >= 58.0 && c.expectedRoi >= -0.5).sort((a,b)=>b.prob-a.prob||b.score-a.score)[0];
    const premiumGolden = eligible.filter(c => c.odds >= 1.45 && c.odds <= 2.30 && c.prob >= 52.0 && c.expectedRoi >= 0).sort((a,b)=>b.prob-a.prob||b.score-a.score)[0];
    const standardProb = eligible.filter(c => c.prob >= 50.0).sort((a,b)=>b.prob-a.prob||b.score-a.score)[0];
    const solidAnchor = eligible.filter(c => c.prob >= 45.0 && c.expectedRoi >= 0).sort((a,b)=>b.prob-a.prob||b.score-a.score)[0];
    const positiveEv = eligible.find(c => c.expectedRoi >= 0);
    const highestProb = [...eligible].sort((a,b)=>b.prob-a.prob||b.score-a.score)[0];

    let tier = "None";
    if (superGolden) tier = "Tier 1 (Super Golden)";
    else if (premiumGolden) tier = "Tier 2 (Premium Golden)";
    else if (standardProb) tier = "Tier 3 (Standard Prob)";
    else if (solidAnchor) tier = "Tier 4 (Solid Anchor)";
    else if (positiveEv && positiveEv.prob >= 40.0) tier = "Tier 5 (Positive EV)";
    else if (highestProb) tier = "Fallback (Max Prob)";
    else tier = "No Eligible";

    results.push({
      matchId: r.matchId,
      sport: r.sport,
      year: r.year,
      round: r.round,
      matchNo: r.matchNo,
      actualOutcome: r.actualOutcome,
      odds: r.odds,
      primary: {
        pickOutcome: mapOutcome(p.marketLabel),
        odds: p.odds,
        prob: p.prob,
        roi: p.expectedRoi,
        score: candidates.find(c => c.marketLabel === p.marketLabel)?.score || 0,
        tier,
        status: p.status,
        isPass: p.status === "pass"
      },
      maxProb: {
        pickOutcome: mapOutcome(sortedProb[0].marketLabel),
        odds: sortedProb[0].odds,
        prob: sortedProb[0].prob,
        roi: sortedProb[0].expectedRoi
      },
      maxEv: {
        pickOutcome: mapOutcome(sortedEv[0].marketLabel),
        odds: sortedEv[0].odds,
        prob: sortedEv[0].prob,
        roi: sortedEv[0].expectedRoi
      },
      maxScore: {
        pickOutcome: mapOutcome(sortedScore[0].marketLabel),
        odds: sortedScore[0].odds,
        prob: sortedScore[0].prob,
        score: sortedScore[0].score
      }
    });
  }

  function evaluate(items: { actual: string; pick: string; odds: number }[]) {
    if (items.length === 0) return { bets: 0, wins: 0, hitRate: 0, totalStaked: 0, totalReturn: 0, netProfit: 0, roi: 0, avgOdds: 0, mdd: 0, profitFactor: 0, sharpe: 0 };
    let wins = 0;
    let totalReturn = 0;
    let grossWins = 0;
    let grossLosses = 0;
    let oddsSum = 0;

    let peak = 0;
    let cum = 0;
    let maxDd = 0;
    const pnlSeries: number[] = [];

    for (const item of items) {
      oddsSum += item.odds;
      const isWin = item.actual === item.pick;
      const pnl = isWin ? (item.odds - 1) : -1;
      pnlSeries.push(pnl);
      cum += pnl;
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDd) maxDd = dd;

      if (isWin) {
        wins++;
        totalReturn += item.odds;
        grossWins += (item.odds - 1);
      } else {
        grossLosses += 1;
      }
    }

    const bets = items.length;
    const totalStaked = bets;
    const netProfit = +(totalReturn - totalStaked).toFixed(2);
    const hitRate = +(wins / bets * 100).toFixed(2);
    const roi = +(netProfit / totalStaked * 100).toFixed(2);
    const avgOdds = +(oddsSum / bets).toFixed(3);
    const profitFactor = grossLosses > 0 ? +(grossWins / grossLosses).toFixed(3) : 999;
    
    const meanPnl = netProfit / bets;
    const variance = pnlSeries.reduce((acc, p) => acc + Math.pow(p - meanPnl, 2), 0) / bets;
    const std = Math.sqrt(variance);
    const sharpe = std > 0 ? +( (meanPnl / std) * Math.sqrt(250) ).toFixed(2) : 0;

    return { bets, wins, hitRate, totalStaked, totalReturn: +totalReturn.toFixed(2), netProfit, roi, avgOdds, mdd: +maxDd.toFixed(2), profitFactor, sharpe };
  }

  const resMaxProb = evaluate(results.map(m => ({ actual: m.actualOutcome, pick: m.maxProb.pickOutcome, odds: m.maxProb.odds })));
  const resMaxEv = evaluate(results.map(m => ({ actual: m.actualOutcome, pick: m.maxEv.pickOutcome, odds: m.maxEv.odds })));
  const resMaxScore = evaluate(results.map(m => ({ actual: m.actualOutcome, pick: m.maxScore.pickOutcome, odds: m.maxScore.odds })));
  const resPrimaryAll = evaluate(results.map(m => ({ actual: m.actualOutcome, pick: m.primary.pickOutcome, odds: m.primary.odds })));
  const resPrimaryActive = evaluate(results.filter(m => !m.primary.isPass).map(m => ({ actual: m.actualOutcome, pick: m.primary.pickOutcome, odds: m.primary.odds })));
  const resPassGroup = evaluate(results.filter(m => m.primary.isPass).map(m => ({ actual: m.actualOutcome, pick: m.primary.pickOutcome, odds: m.primary.odds })));

  const resTier1 = evaluate(results.filter(m => m.primary.tier === "Tier 1 (Super Golden)").map(m => ({ actual: m.actualOutcome, pick: m.primary.pickOutcome, odds: m.primary.odds })));
  const resTier2 = evaluate(results.filter(m => m.primary.tier === "Tier 2 (Premium Golden)").map(m => ({ actual: m.actualOutcome, pick: m.primary.pickOutcome, odds: m.primary.odds })));
  const resTier3 = evaluate(results.filter(m => m.primary.tier === "Tier 3 (Standard Prob)").map(m => ({ actual: m.actualOutcome, pick: m.primary.pickOutcome, odds: m.primary.odds })));
  const resFallbackActive = evaluate(results.filter(m => m.primary.tier === "Fallback (Max Prob)" && !m.primary.isPass).map(m => ({ actual: m.actualOutcome, pick: m.primary.pickOutcome, odds: m.primary.odds })));

  console.log("1. Pure Max Prob       :", resMaxProb);
  console.log("2. Pure Max EV         :", resMaxEv);
  console.log("3. Pure Max Score      :", resMaxScore);
  console.log("4. Primary Pick (All)  :", resPrimaryAll);
  console.log("5. Primary Pick (Active):", resPrimaryActive);
  console.log("6. Pass Group (Filtered):", resPassGroup);
  console.log("7. Tier 1 (Super Golden):", resTier1);

  // Assertions to guarantee validation consistency
  assert.strictEqual(resPrimaryActive.bets, 957, "Active bets must be exactly 957");
  assert.strictEqual(resPassGroup.bets, 456, "Pass group bets must be exactly 456");
  assert.strictEqual(resTier1.bets, 181, "Tier 1 bets must be exactly 181");
  assert.strictEqual(resTier1.wins, 116, "Tier 1 wins must be exactly 116");
  assert.strictEqual(resTier1.hitRate, 64.09, "Tier 1 hit rate must be 64.09%");
  assert.strictEqual(resTier1.roi, 15.69, "Tier 1 ROI must be +15.69%");

  console.log("\n✅ ALL WALK-FORWARD POLICY VALIDATIONS PASSED");
  return { resMaxProb, resMaxEv, resMaxScore, resPrimaryAll, resPrimaryActive, resPassGroup, resTier1, resTier2, resTier3, resFallbackActive };
}

if (process.argv[1]?.endsWith("test_proto_walk_forward_policy_validation.ts")) {
  runWalkForwardPolicyValidation();
}
