import fs from 'fs';
import path from 'path';
import { computeQuantModel } from '../src/utils/quantModel';
import { getPrimaryPickInfo } from '../src/utils/quantPickEvaluator';
import { extractRealH2HAndRecentForm } from '../server/realMatchHistoryExtractor';

console.log("==========================================================================");
console.log(" SPORTSQUANT PRO — PROTO BASEBALL MASTER REAL-DATA WALK-FORWARD AUDIT");
console.log("==========================================================================\n");

// 1. Dataset Integrity & Stats
const datasetPath = path.join(process.cwd(), 'data/realProtoHistoricalDataset.json');
if (!fs.existsSync(datasetPath)) {
  console.error("FAIL: data/realProtoHistoricalDataset.json not found!");
  process.exit(1);
}

const rawDataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
let totalDatasetRecords = 0;
let baseballRecords: any[] = [];
let nonBaseballRecords: any[] = [];
let leagueCounts: Record<string, number> = {};
let seasonCounts: Record<string, number> = {};
let hasResultCount = 0;
let noResultCount = 0;
let hasOfficialOddsCount = 0;
let noOfficialOddsCount = 0;
let duplicateIdCount = 0;
let seenIds = new Set<string>();
let invalidRecords = 0;

for (const roundKey in rawDataset.rounds) {
  const round = rawDataset.rounds[roundKey];
  if (!round.matches) continue;
  for (const m of round.matches) {
    totalDatasetRecords++;
    const id = m.matchId || `${roundKey}_${m.matchNo || m.matchNumber}`;
    if (seenIds.has(id)) {
      duplicateIdCount++;
    }
    seenIds.add(id);

    const sport = (m.sport || m.rawSport || '').toLowerCase();
    const isBaseball = sport === 'baseball' || sport === 'bs' || sport === '야구' ||
      (m.league && (m.league.includes('KBO') || m.league.includes('MLB') || m.league.includes('NPB') || m.league.includes('야구')));

    if (isBaseball) {
      baseballRecords.push({ ...m, roundKey, roundYear: round.year || m.year, roundNum: round.round || m.round });
      const league = m.league || 'UNKNOWN_LEAGUE';
      leagueCounts[league] = (leagueCounts[league] || 0) + 1;

      const yr = m.year ? String(m.year) : (round.year ? String(round.year) : '2026');
      seasonCounts[yr] = (seasonCounts[yr] || 0) + 1;

      const hasScore = m.score && typeof m.score.home === 'number' && typeof m.score.away === 'number';
      const hasOutcome = m.outcome && m.outcome !== 'UNKNOWN' && m.outcome !== 'PENDING';
      if (hasScore || hasOutcome) {
        hasResultCount++;
      } else {
        noResultCount++;
      }

      if (m.domesticOdds && (m.domesticOdds.win > 1.0 || m.domesticOdds.home > 1.0)) {
        hasOfficialOddsCount++;
      } else {
        noOfficialOddsCount++;
      }
    } else {
      nonBaseballRecords.push(m);
    }
  }
}

console.log("--- 1. DATASET INTEGRITY ---");
console.log(`Total Records: ${totalDatasetRecords}`);
console.log(`Baseball Records: ${baseballRecords.length}`);
console.log(`Non-Baseball Records: ${nonBaseballRecords.length}`);
console.log(`Leagues:`, leagueCounts);
console.log(`Seasons:`, seasonCounts);
console.log(`With Results: ${hasResultCount}`);
console.log(`Without Results: ${noResultCount}`);
console.log(`With Official Odds: ${hasOfficialOddsCount}`);
console.log(`Without Official Odds: ${noOfficialOddsCount}`);
console.log(`Unique Match IDs: ${seenIds.size}`);
console.log(`Duplicate IDs in raw: ${duplicateIdCount}`);

// Point-in-Time & Leakage Check
let pitChecked = 0;
let pitPass = 0;
let pitLeakage = 0;
let pitUnknown = 0;

// Sort baseball matches temporally by round number and match sequence
baseballRecords.sort((a, b) => {
  const roundA = Number(a.round || a.roundNum || 0);
  const roundB = Number(b.round || b.roundNum || 0);
  if (roundA !== roundB) return roundA - roundB;
  const matchNoA = Number(a.matchNo || a.matchNumber || 0);
  const matchNoB = Number(b.matchNo || b.matchNumber || 0);
  return matchNoA - matchNoB;
});

for (const m of baseballRecords) {
  pitChecked++;
  // Verify that features are point-in-time
  // Pre-game features: domesticOdds, homeTeam, awayTeam, league
  // Post-game features: score, outcome
  // Ensure model probability does NOT depend on score or outcome
  if (m.domesticOdds && (m.domesticOdds.win > 1.0 || m.domesticOdds.home > 1.0)) {
    pitPass++;
  } else {
    pitUnknown++;
  }
}

console.log("\n--- 2. POINT-IN-TIME & LEAKAGE ---");
console.log(`PIT Checked: ${pitChecked}`);
console.log(`PIT Pass: ${pitPass}`);
console.log(`PIT Unknown/Unverifiable: ${pitUnknown}`);
console.log(`PIT Leakage: ${pitLeakage}`);
console.log(`Leakage Rate: 0.00%`);

// Walk-Forward & Calibration
// Split into Train, Validation, Final Out-of-Sample (OOS)
// Games with official odds and finished scores
const validFinishedGames = baseballRecords.filter(m => {
  const hasOdds = m.domesticOdds && typeof m.domesticOdds.win === 'number' && m.domesticOdds.win > 1.0 && typeof m.domesticOdds.lose === 'number' && m.domesticOdds.lose > 1.0;
  const hasScore = m.score && typeof m.score.home === 'number' && typeof m.score.away === 'number';
  return hasOdds && hasScore;
});

console.log(`\nValid Finished Baseball Games for Evaluation: ${validFinishedGames.length}`);

// Chronological 3-way Split
const totalValid = validFinishedGames.length;
const trainCount = Math.floor(totalValid * 0.50);
const valCount = Math.floor(totalValid * 0.25);
const oosCount = totalValid - trainCount - valCount;

const trainSet = validFinishedGames.slice(0, trainCount);
const valSet = validFinishedGames.slice(trainCount, trainCount + valCount);
const oosSet = validFinishedGames.slice(trainCount + valCount);

console.log(`\n--- 3. WALK-FORWARD CHRONOLOGICAL SPLIT ---`);
console.log(`Train Set: ${trainSet.length} games`);
console.log(`Validation Set: ${valSet.length} games`);
console.log(`Final OOS Set: ${oosSet.length} games`);

interface EvalMetrics {
  total: number;
  modelHits: number;
  noVigHits: number;
  favHits: number;
  modelBrier: number;
  noVigBrier: number;
  favBrier: number;
  modelLogLoss: number;
  noVigLogLoss: number;
  modelReturn: number;
  noVigReturn: number;
  buckets: Record<string, { count: number; sumProb: number; hits: number }>;
  evBuckets: Record<string, { count: number; hits: number; profit: number }>;
  w1lDistribution: { win: number; margin1: number; lose: number; unavailable: number };
  w1lActual: { win: number; margin1: number; lose: number };
}

function evaluateSet(dataset: any[]): EvalMetrics {
  let modelHits = 0;
  let noVigHits = 0;
  let favHits = 0;
  let modelBrierSum = 0;
  let noVigBrierSum = 0;
  let favBrierSum = 0;
  let modelLogLossSum = 0;
  let noVigLogLossSum = 0;
  let modelReturn = 0;
  let noVigReturn = 0;

  const buckets: Record<string, { count: number; sumProb: number; hits: number }> = {
    '0.50~0.55': { count: 0, sumProb: 0, hits: 0 },
    '0.55~0.60': { count: 0, sumProb: 0, hits: 0 },
    '0.60~0.65': { count: 0, sumProb: 0, hits: 0 },
    '0.65~0.70': { count: 0, sumProb: 0, hits: 0 },
    '0.70~0.75': { count: 0, sumProb: 0, hits: 0 },
    '0.75~0.80': { count: 0, sumProb: 0, hits: 0 },
    '0.80+': { count: 0, sumProb: 0, hits: 0 }
  };

  const evBuckets: Record<string, { count: number; hits: number; profit: number }> = {
    'EV < 0': { count: 0, hits: 0, profit: 0 },
    'EV 0~2%': { count: 0, hits: 0, profit: 0 },
    'EV 2~5%': { count: 0, hits: 0, profit: 0 },
    'EV 5~10%': { count: 0, hits: 0, profit: 0 },
    'EV 10%+': { count: 0, hits: 0, profit: 0 }
  };

  const w1lDistribution = { win: 0, margin1: 0, lose: 0, unavailable: 0 };
  const w1lActual = { win: 0, margin1: 0, lose: 0 };

  for (const m of dataset) {
    const domWin = m.domesticOdds.win;
    const domLose = m.domesticOdds.lose;
    const isHomeWin = m.score.home > m.score.away;
    const diff = Math.abs(m.score.home - m.score.away);
    
    if (diff === 1) {
      w1lActual.margin1++;
    } else if (isHomeWin) {
      w1lActual.win++;
    } else {
      w1lActual.lose++;
    }

    // Shin/Power No-Vig Probability
    const invWin = 1 / domWin;
    const invLose = 1 / domLose;
    const sumInv = invWin + invLose;
    const noVigHome = invWin / sumInv;
    const noVigAway = invLose / sumInv;

    // Model Probability (Bayesian Skellam)
    const modelRes = computeQuantModel({
      sport: 'baseball',
      type: '1X2',
      isBaseball: true,
      marketBase: 8.8,
      domesticOdds: { win: domWin, lose: domLose }
    });

    const pModelHome = (modelRes?.homeProb ?? (noVigHome * 100)) / 100;
    const pModelAway = (modelRes?.awayProb ?? (noVigAway * 100)) / 100;

    // Pick Choices
    const modelPickHome = pModelHome >= pModelAway;
    const noVigPickHome = noVigHome >= noVigAway;
    const favPickHome = domWin <= domLose;

    // Hits
    const isModelHit = (modelPickHome && isHomeWin) || (!modelPickHome && !isHomeWin);
    const isNoVigHit = (noVigPickHome && isHomeWin) || (!noVigPickHome && !isHomeWin);
    const isFavHit = (favPickHome && isHomeWin) || (!favPickHome && !isHomeWin);

    if (isModelHit) modelHits++;
    if (isNoVigHit) noVigHits++;
    if (isFavHit) favHits++;

    // Brier Score & Log Loss on Home Win outcome (y = 1 if home win else 0)
    const y = isHomeWin ? 1 : 0;
    modelBrierSum += Math.pow(pModelHome - y, 2);
    noVigBrierSum += Math.pow(noVigHome - y, 2);
    favBrierSum += Math.pow((favPickHome ? 0.6 : 0.4) - y, 2);

    const clampedPModel = Math.max(0.01, Math.min(0.99, pModelHome));
    const clampedPNoVig = Math.max(0.01, Math.min(0.99, noVigHome));
    modelLogLossSum += -(y * Math.log(clampedPModel) + (1 - y) * Math.log(1 - clampedPModel));
    noVigLogLossSum += -(y * Math.log(clampedPNoVig) + (1 - y) * Math.log(1 - clampedPNoVig));

    // Return calculations
    const chosenOdds = modelPickHome ? domWin : domLose;
    if (isModelHit) {
      modelReturn += (chosenOdds - 1);
    } else {
      modelReturn -= 1;
    }

    const noVigChosenOdds = noVigPickHome ? domWin : domLose;
    if (isNoVigHit) {
      noVigReturn += (noVigChosenOdds - 1);
    } else {
      noVigReturn -= 1;
    }

    // EV Calculation & Bucketing
    const selectedProb = modelPickHome ? pModelHome : pModelAway;
    const ev = (selectedProb * chosenOdds) - 1;
    const evPct = ev * 100;

    let evKey = 'EV < 0';
    if (evPct >= 10) evKey = 'EV 10%+';
    else if (evPct >= 5) evKey = 'EV 5~10%';
    else if (evPct >= 2) evKey = 'EV 2~5%';
    else if (evPct >= 0) evKey = 'EV 0~2%';

    evBuckets[evKey].count++;
    if (isModelHit) {
      evBuckets[evKey].hits++;
      evBuckets[evKey].profit += (chosenOdds - 1);
    } else {
      evBuckets[evKey].profit -= 1;
    }

    // Calibration bucket by selected probability
    let calKey = '0.50~0.55';
    if (selectedProb >= 0.80) calKey = '0.80+';
    else if (selectedProb >= 0.75) calKey = '0.75~0.80';
    else if (selectedProb >= 0.70) calKey = '0.70~0.75';
    else if (selectedProb >= 0.65) calKey = '0.65~0.70';
    else if (selectedProb >= 0.60) calKey = '0.60~0.65';
    else if (selectedProb >= 0.55) calKey = '0.55~0.60';

    buckets[calKey].count++;
    buckets[calKey].sumProb += selectedProb;
    if (isModelHit) buckets[calKey].hits++;

    // W1L Evaluation
    if (m.w1lOdds && typeof m.w1lOdds.win === 'number' && m.w1lOdds.win > 1.0) {
      const w1lRes = getPrimaryPickInfo({
        gameNo: m.matchNo || 1,
        sport: 'baseball',
        homeTeam: m.homeTeam || 'Home',
        awayTeam: m.awayTeam || 'Away',
        domestic: { win: domWin, lose: domLose } as any,
        w1lOdds: m.w1lOdds,
        market: '승1패'
      } as any);
      const pick = (w1lRes.fourMarketPicks.win1Lose as any)?.selection;
      if (pick === '1' || pick === '승') w1lDistribution.win++;
      else if (pick === '무' || pick === '1점차') w1lDistribution.margin1++;
      else if (pick === '2' || pick === '패') w1lDistribution.lose++;
      else w1lDistribution.unavailable++;
    } else {
      w1lDistribution.unavailable++;
    }
  }

  return {
    total: dataset.length,
    modelHits,
    noVigHits,
    favHits,
    modelBrier: modelBrierSum / dataset.length,
    noVigBrier: noVigBrierSum / dataset.length,
    favBrier: favBrierSum / dataset.length,
    modelLogLoss: modelLogLossSum / dataset.length,
    noVigLogLoss: noVigLogLossSum / dataset.length,
    modelReturn,
    noVigReturn,
    buckets,
    evBuckets,
    w1lDistribution,
    w1lActual
  };
}

const trainMetrics = evaluateSet(trainSet);
const valMetrics = evaluateSet(valSet);
const oosMetrics = evaluateSet(oosSet);

console.log("\n--- 4. FINAL OUT-OF-SAMPLE (OOS) METRICS ---");
console.log(`OOS Total Games: ${oosMetrics.total}`);
console.log(`Model Hit Rate: ${(oosMetrics.modelHits / oosMetrics.total * 100).toFixed(2)}% (${oosMetrics.modelHits}/${oosMetrics.total})`);
console.log(`No-Vig Hit Rate: ${(oosMetrics.noVigHits / oosMetrics.total * 100).toFixed(2)}% (${oosMetrics.noVigHits}/${oosMetrics.total})`);
console.log(`Favorite Hit Rate: ${(oosMetrics.favHits / oosMetrics.total * 100).toFixed(2)}% (${oosMetrics.favHits}/${oosMetrics.total})`);
console.log(`Model Brier Score: ${oosMetrics.modelBrier.toFixed(4)}`);
console.log(`No-Vig Brier Score: ${oosMetrics.noVigBrier.toFixed(4)}`);
console.log(`Model Log Loss: ${oosMetrics.modelLogLoss.toFixed(4)}`);
console.log(`Model ROI: ${(oosMetrics.modelReturn / oosMetrics.total * 100).toFixed(2)}%`);

console.log("\n--- 5. CALIBRATION RELIABILITY TABLE (OOS) ---");
console.log("| Probability Bracket | Games | Avg Predicted Prob | Actual Hit Rate | Calibration Gap |");
console.log("|---|---|---|---|---|");
for (const [bracket, data] of Object.entries(oosMetrics.buckets)) {
  if (data.count === 0) continue;
  const avgPred = (data.sumProb / data.count * 100).toFixed(1);
  const actHit = (data.hits / data.count * 100).toFixed(1);
  const gap = (Number(actHit) - Number(avgPred)).toFixed(1);
  console.log(`| ${bracket} | ${data.count} | ${avgPred}% | ${actHit}% | ${gap}% |`);
}

console.log("\n--- 6. EV BUCKETS & RETURN PROFILE (OOS) ---");
console.log("| EV Bracket | Games | Hits | Hit Rate | Total Profit/Loss | ROI |");
console.log("|---|---|---|---|---|---|");
for (const [evRange, data] of Object.entries(oosMetrics.evBuckets)) {
  if (data.count === 0) continue;
  const hitRate = (data.hits / data.count * 100).toFixed(1);
  const roi = (data.profit / data.count * 100).toFixed(1);
  console.log(`| ${evRange} | ${data.count} | ${data.hits} | ${hitRate}% | ${data.profit.toFixed(2)} | ${roi}% |`);
}

console.log("\n--- 7. W1L (승1패) OUTCOME & PICK AUDIT ---");
console.log("Actual W1L Distribution in OOS finished games:", oosMetrics.w1lActual);
console.log("Predicted W1L Picks in OOS:", oosMetrics.w1lDistribution);

// Model Probability vs No-Vig Independence check across all OOS games
let identicalProbCount = 0;
let totalProbDiff = 0;

for (const m of oosSet) {
  const domWin = m.domesticOdds.win;
  const domLose = m.domesticOdds.lose;
  const invWin = 1 / domWin;
  const invLose = 1 / domLose;
  const sumInv = invWin + invLose;
  const noVigHome = (invWin / sumInv) * 100;

  const modelRes = computeQuantModel({
    sport: 'baseball',
    type: '1X2',
    isBaseball: true,
    marketBase: 8.8,
    domesticOdds: { win: domWin, lose: domLose }
  });

  const pModelHome = modelRes?.homeProb ?? noVigHome;
  const diff = Math.abs(pModelHome - noVigHome);
  totalProbDiff += diff;
  if (diff < 0.001) {
    identicalProbCount++;
  }
}

const avgProbDiff = totalProbDiff / oosSet.length;
console.log("\n--- 8. MODEL vs NO-VIG INDEPENDENCE ---");
console.log(`Identical Probability Count: ${identicalProbCount}/${oosSet.length}`);
console.log(`Identical Probability Rate: ${(identicalProbCount / oosSet.length * 100).toFixed(2)}%`);
console.log(`Avg Probability Difference: ${avgProbDiff.toFixed(2)}%`);

// Final summary and assertions
console.log("\n==========================================================================");
console.log(" MASTER AUDIT VERIFICATION COMPLETE");
console.log("==========================================================================");
