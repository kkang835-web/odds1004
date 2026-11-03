import fs from "fs";
import path from "path";
import { RealSportType, RealHistoricalRound } from "./realHistoryTypes.js";
import { collectRealHistoricalRound } from "./realWisetotoCollector.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DATASET_FILE = path.join(DATA_DIR, "realHistoricalDataset.json");

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface ExpansionPlan {
  sport: RealSportType;
  year: number;
  maxRound: number;
}

const PLANS: ExpansionPlan[] = [
  // 2025
  { sport: "sc1", year: 2025, maxRound: 57 },
  { sport: "bs1", year: 2025, maxRound: 75 },
  { sport: "bk1", year: 2025, maxRound: 27 },
  // 2026
  { sport: "sc1", year: 2026, maxRound: 55 },
  { sport: "bs1", year: 2026, maxRound: 30 },
  { sport: "bk1", year: 2026, maxRound: 20 },
];

export async function runHistoricalExpansion() {
  console.log("==================================================");
  console.log("Starting SportsQuant Pro TOTO Historical Data Expansion");
  console.log("==================================================");

  // 1. Load existing dataset
  let existingDataset: RealHistoricalRound[] = [];
  if (fs.existsSync(DATASET_FILE)) {
    try {
      existingDataset = JSON.parse(fs.readFileSync(DATASET_FILE, "utf-8"));
      console.log(`Loaded ${existingDataset.length} existing rounds from ${DATASET_FILE}`);
    } catch (e) {
      console.error("Failed to parse existing dataset:", e);
    }
  }

  const roundMap = new Map<string, RealHistoricalRound>();
  for (const r of existingDataset) {
    const key = `${r.sport}_${r.year}_${r.round}`;
    roundMap.set(key, r);
  }

  // Statistics counters
  let totalProbed = 0;
  let notFoundRounds = 0;
  let newlyCollectedRounds = 0;
  let preservedExistingRounds = 0;

  for (const plan of PLANS) {
    console.log(`\n>>> Processing ${plan.sport} ${plan.year} (Rounds 1..${plan.maxRound}) <<<`);
    for (let r = 1; r <= plan.maxRound; r++) {
      totalProbed++;
      const key = `${plan.sport}_${plan.year}_${r}`;

      // Check if already exists with VALID data
      const existing = roundMap.get(key);
      if (existing && existing.validCount === 14) {
        preservedExistingRounds++;
        process.stdout.write(`.`);
        continue;
      }

      // Polite rate limiting: 180ms
      await sleep(180);

      try {
        const roundData = await collectRealHistoricalRound(plan.sport, plan.year, r);

        // If no market matches found, mark as NOT_FOUND and skip adding
        if (roundData.matchCount === 0) {
          notFoundRounds++;
          process.stdout.write(`x`);
          continue;
        }

        // Add or update round in map
        roundMap.set(key, roundData);
        newlyCollectedRounds++;
        process.stdout.write(roundData.validCount === 14 ? `v` : `u`);

        // Save progress every 15 rounds
        if (newlyCollectedRounds % 15 === 0) {
          saveDataset(Array.from(roundMap.values()));
        }
      } catch (err: any) {
        console.error(`\nError collecting ${key}: ${err.message}`);
      }
    }
    // Save at end of each sport/year plan
    saveDataset(Array.from(roundMap.values()));
  }

  console.log("\n\nAll planned rounds probed. Finalizing dataset...");
  const finalRounds = Array.from(roundMap.values());
  saveDataset(finalRounds);

  // Run comprehensive analysis and quality report
  generateReportAndAudit(finalRounds, totalProbed, notFoundRounds, preservedExistingRounds, newlyCollectedRounds);
}

function saveDataset(rounds: RealHistoricalRound[]) {
  // Sort rounds cleanly
  rounds.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.sport !== b.sport) return a.sport.localeCompare(b.sport);
    return a.round - b.round;
  });
  fs.writeFileSync(DATASET_FILE, JSON.stringify(rounds, null, 2), "utf-8");
}

function generateReportAndAudit(
  rounds: RealHistoricalRound[],
  totalProbed: number,
  notFoundRounds: number,
  preservedExistingRounds: number,
  newlyCollectedRounds: number
) {
  console.log("\n==================================================");
  console.log("TOTO HISTORICAL COLLECTION REPORT");
  console.log("==================================================");

  let totalMatches = 0;
  let validMatches = 0;
  let unavailableMatches = 0;
  let mismatchMatches = 0;
  let duplicateMatches = 0;
  let syntheticCount = 0;
  let simulatedCount = 0;

  // Breakdown maps
  const byYearSport: Record<string, { rounds: number; matches: number; valid: number; unavailable: number }> = {};
  const bySport: Record<string, { rounds: number; matches: number; valid: number; unavailable: number }> = {
    sc1: { rounds: 0, matches: 0, valid: 0, unavailable: 0 },
    bs1: { rounds: 0, matches: 0, valid: 0, unavailable: 0 },
    bk1: { rounds: 0, matches: 0, valid: 0, unavailable: 0 }
  };
  const byYear: Record<string, { rounds: number; matches: number; valid: number; unavailable: number }> = {
    "2024": { rounds: 0, matches: 0, valid: 0, unavailable: 0 },
    "2025": { rounds: 0, matches: 0, valid: 0, unavailable: 0 },
    "2026": { rounds: 0, matches: 0, valid: 0, unavailable: 0 }
  };

  const allMatchIds = new Set<string>();
  let duplicateMatchIds = 0;
  let missingHome = 0;
  let missingAway = 0;
  let missingVoteRate = 0;
  let invalidVoteSum = 0;
  let impossibleScore = 0;
  let lookAheadFields = 0;

  const validMatchesList: any[] = [];

  for (const r of rounds) {
    const ysKey = `${r.year}_${r.sport}`;
    if (!byYearSport[ysKey]) byYearSport[ysKey] = { rounds: 0, matches: 0, valid: 0, unavailable: 0 };
    byYearSport[ysKey].rounds++;

    if (bySport[r.sport]) bySport[r.sport].rounds++;
    if (byYear[String(r.year)]) byYear[String(r.year)].rounds++;

    for (const m of r.matches) {
      totalMatches++;
      byYearSport[ysKey].matches++;
      if (bySport[r.sport]) bySport[r.sport].matches++;
      if (byYear[String(m.year)]) byYear[String(m.year)].matches++;

      if (m.integrityStatus === "VALID") {
        validMatches++;
        byYearSport[ysKey].valid++;
        if (bySport[r.sport]) bySport[r.sport].valid++;
        if (byYear[String(m.year)]) byYear[String(m.year)].valid++;
        if (m.outcome !== null) {
          validMatchesList.push(m);
        }
      } else if (m.integrityStatus === "UNAVAILABLE") {
        unavailableMatches++;
        byYearSport[ysKey].unavailable++;
        if (bySport[r.sport]) bySport[r.sport].unavailable++;
        if (byYear[String(m.year)]) byYear[String(m.year)].unavailable++;
      } else if (m.integrityStatus === "MISMATCH") {
        mismatchMatches++;
      } else if (m.integrityStatus === "DUPLICATE") {
        duplicateMatches++;
      }

      if ((m as any).isSimulated === true) simulatedCount++;
      if ((m as any).dataSource === "synthetic") syntheticCount++;

      // Quality checks
      if (allMatchIds.has(m.matchId)) duplicateMatchIds++;
      else allMatchIds.add(m.matchId);

      if (!m.homeTeam || m.homeTeam.trim() === "") missingHome++;
      if (!m.awayTeam || m.awayTeam.trim() === "") missingAway++;
      if (!m.voteRate || m.voteRate.win === null || m.voteRate.lose === null) missingVoteRate++;
      else {
        const sum = (m.voteRate.win || 0) + (m.voteRate.draw || 0) + (m.voteRate.lose || 0);
        if (sum < 95 || sum > 105) invalidVoteSum++;
      }

      if (m.homeScore !== null && (m.homeScore < 0 || m.homeScore > 300)) impossibleScore++;
      if (m.awayScore !== null && (m.awayScore < 0 || m.awayScore > 300)) impossibleScore++;
      if ((m as any).futureResult || (m as any).futureOdds) lookAheadFields++;
    }
  }

  console.log("\n[연도별 실측 수집 결과]");
  for (const y of ["2024", "2025", "2026"]) {
    console.log(`\n년도: ${y}년 (총 ${byYear[y]?.rounds || 0}회차, ${byYear[y]?.matches || 0}경기, VALID: ${byYear[y]?.valid || 0}, UNAVAILABLE: ${byYear[y]?.unavailable || 0})`);
    for (const sp of ["sc1", "bs1", "bk1"]) {
      const ys = byYearSport[`${y}_${sp}`];
      console.log(`  ${sp}: ${ys ? `${ys.rounds}회차 / ${ys.valid} VALID / ${ys.unavailable} UNAVAILABLE` : "0회차"}`);
    }
  }

  console.log("\n[종목별 실측 수집 결과]");
  console.log(`⚽ 축구 (sc1): 총 ${bySport.sc1.rounds}회차 | VALID ${bySport.sc1.valid}경기 | UNAVAILABLE ${bySport.sc1.unavailable}경기`);
  console.log(`⚾ 야구 (bs1): 총 ${bySport.bs1.rounds}회차 | VALID ${bySport.bs1.valid}경기 | UNAVAILABLE ${bySport.bs1.unavailable}경기`);
  console.log(`🏀 농구 (bk1): 총 ${bySport.bk1.rounds}회차 | VALID ${bySport.bk1.valid}경기 | UNAVAILABLE ${bySport.bk1.unavailable}경기`);

  console.log("\n[전체 통계]");
  console.log(`총 Probe 회차: ${totalProbed}`);
  console.log(`NOT_FOUND 회차: ${notFoundRounds}`);
  console.log(`기존 유지 회차: ${preservedExistingRounds}`);
  console.log(`신규 수집 회차: ${newlyCollectedRounds}`);
  console.log(`총 데이터셋 회차: ${rounds.length}`);
  console.log(`총 경기 수: ${totalMatches}`);
  console.log(`VALID 경기 수: ${validMatches}`);
  console.log(`UNAVAILABLE 경기 수: ${unavailableMatches}`);
  console.log(`MISMATCH 경기 수: ${mismatchMatches}`);
  console.log(`중복 경기 수: ${duplicateMatches}`);
  console.log(`synthetic count: ${syntheticCount} (반드시 0)`);
  console.log(`isSimulated=true: ${simulatedCount} (반드시 0)`);

  console.log("\n==================================================");
  console.log("데이터 품질 무결성 검증 (Data Quality Audit)");
  console.log("==================================================");
  console.log(`duplicate matchId:     ${duplicateMatchIds === 0 ? "PASS (0건)" : `FAIL (${duplicateMatchIds}건)`}`);
  console.log(`missing homeTeam:      ${missingHome === 0 ? "PASS (0건)" : `FAIL (${missingHome}건)`}`);
  console.log(`missing awayTeam:      ${missingAway === 0 ? "PASS (0건)" : `FAIL (${missingAway}건)`}`);
  console.log(`missing voteRate:      ${missingVoteRate === 0 ? "PASS (0건)" : `FAIL (${missingVoteRate}건)`}`);
  console.log(`invalid voteRate sum:  ${invalidVoteSum === 0 ? "PASS (0건)" : `FAIL (${invalidVoteSum}건)`}`);
  console.log(`impossible score:      ${impossibleScore === 0 ? "PASS (0건)" : `FAIL (${impossibleScore}건)`}`);
  console.log(`synthetic data:        ${syntheticCount === 0 ? "PASS (0건)" : `FAIL (${syntheticCount}건)`}`);
  console.log(`simulated data:        ${simulatedCount === 0 ? "PASS (0건)" : `FAIL (${simulatedCount}건)`}`);
  console.log(`look-ahead fields:     ${lookAheadFields === 0 ? "PASS (0건)" : `FAIL (${lookAheadFields}건)`}`);

  // Sort valid matches chronologically for Walk-Forward split calculation
  validMatchesList.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.round !== b.round) return a.round - b.round;
    return a.matchNo - b.matchNo;
  });

  const N = validMatchesList.length;
  const trainEnd = Math.floor(N * 0.6);
  const valEnd = Math.floor(N * 0.8);

  const trainMatches = validMatchesList.slice(0, trainEnd);
  const valMatches = validMatchesList.slice(trainEnd, valEnd);
  const testMatches = validMatchesList.slice(valEnd);

  const countBySport = (arr: any[]) => ({
    soccer: arr.filter(m => m.sport === "sc1").length,
    baseball: arr.filter(m => m.sport === "bs1").length,
    basketball: arr.filter(m => m.sport === "bk1").length,
    total: arr.length
  });

  const trCount = countBySport(trainMatches);
  const vaCount = countBySport(valMatches);
  const teCount = countBySport(testMatches);
  const totalCount = countBySport(validMatchesList);

  console.log("\n==================================================");
  console.log("최종 백테스트 준비 상태 (Walk-Forward Split 분포)");
  console.log("==================================================");
  console.log(`총 평가 가능 VALID 경기 수: ${N}경기`);
  console.log(`TRAIN      (60%): 총 ${trCount.total}경기 | 축구: ${trCount.soccer}, 야구: ${trCount.baseball}, 농구: ${trCount.basketball}`);
  console.log(`VALIDATION (20%): 총 ${vaCount.total}경기 | 축구: ${vaCount.soccer}, 야구: ${vaCount.baseball}, 농구: ${vaCount.basketball}`);
  console.log(`TEST       (20%): 총 ${teCount.total}경기 | 축구: ${teCount.soccer}, 야구: ${teCount.baseball}, 농구: ${teCount.basketball}`);
  console.log(`TOTAL     (100%): 총 ${totalCount.total}경기 | 축구: ${totalCount.soccer}, 야구: ${totalCount.baseball}, 농구: ${totalCount.basketball}`);
  console.log(`\n★ Basketball TEST 경기 수: ${teCount.basketball}경기 (이전 0경기 대비 대폭 확충 완료)`);
}

// Run directly if invoked
runHistoricalExpansion().catch(console.error);
