import { computeQuantModel } from '../src/utils/quantModel';
import { getPrimaryPickInfo } from '../src/utils/quantPickEvaluator';
import * as fs from 'fs';

interface RawMatch {
  matchNo: number;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  categoryLabel?: string;
  domestic?: { win: number; draw?: number | null; lose: number };
  foreign?: { win: number; draw?: number | null; lose: number };
}

async function runDiagnostic() {
  console.log("==================================================");
  console.log("PROTO BASEBALL WIN1LOSS RECOMMENDATION DIAGNOSTIC");
  console.log("==================================================\n");

  const rawData = JSON.parse(fs.readFileSync('data/realProtoHistoricalDataset.json', 'utf8'));
  const baseballMatches: RawMatch[] = [];

  for (const roundKey of Object.keys(rawData.rounds)) {
    const round = rawData.rounds[roundKey];
    for (const m of (round.matches || [])) {
      const dom = m.domesticOdds || m.domestic;
      if (m.sport === 'bs' && dom?.win && dom?.lose) {
        baseballMatches.push({
          matchNo: m.matchNo,
          homeTeam: m.homeTeam || '홈팀',
          awayTeam: m.awayTeam || '원정팀',
          sport: 'baseball',
          league: m.league || 'KBO',
          categoryLabel: m.categoryLabel || m.gameType || '일반',
          domestic: {
            win: Number(dom.win),
            draw: dom.draw ? Number(dom.draw) : null,
            lose: Number(dom.lose)
          },
          foreign: m.foreignOdds || m.foreign ? {
            win: Number((m.foreignOdds || m.foreign).win),
            draw: (m.foreignOdds || m.foreign).draw ? Number((m.foreignOdds || m.foreign).draw) : null,
            lose: Number((m.foreignOdds || m.foreign).lose)
          } : undefined
        });
      }
    }
  }

  console.log(`Loaded ${baseballMatches.length} valid baseball matches with domestic odds.`);

  const sample20 = baseballMatches.slice(0, 25);
  let total1 = 0;
  let total2 = 0;
  let totalW1L1 = 0;
  let totalW1LWin = 0;
  let totalW1LLose = 0;

  console.log("\n[ANALYSIS OF 25 REAL BASEBALL MATCHES]");
  console.log("--------------------------------------------------------------------------------------------------------------------------------");
  console.log("No | Home vs Away | DomOdds(W/L) | MatchTable Pick | MatchTable EV | W1L Prob(Win/1/Lose) | W1L Pick | W1L 1-Score Bonus");
  console.log("--------------------------------------------------------------------------------------------------------------------------------");

  sample20.forEach((m, idx) => {
    // 1. MatchTable path: computeQuantModel with hardcoded stats
    const domWin = m.domestic!.win;
    const domLose = m.domestic!.lose;

    const quantRes = computeQuantModel({
      league: m.league,
      sport: 'baseball',
      type: '1X2',
      domesticOdds: { win: domWin, draw: null, lose: domLose },
      foreignOdds: m.foreign,
      homeStats: { elo: 1540, attack: 1.15, defense: 0.92, era: 3.45, pace: 101.2 },
      awayStats: { elo: 1515, attack: 0.98, defense: 1.08, era: 4.12, pace: 99.4 },
      isBaseball: true,
      marketBase: 8.8
    });

    const hProb = quantRes?.homeProb ?? 55;
    const aProb = quantRes?.awayProb ?? 25;
    const modelChoice = (hProb >= aProb) ? '홈 승 (1)' : '원정 승 (2)';
    if (modelChoice.includes('(1)')) total1++;
    else total2++;

    // 2. quantPickEvaluator path: getPrimaryPickInfo
    const evalRes = getPrimaryPickInfo({
      ...m,
      homeWinProb: hProb,
      drawProb: 0,
      awayWinProb: aProb,
    } as any);

    const bestW1L = evalRes.fourMarketPicks?.win1Lose;
    const w1lCand1 = evalRes.candidates.find(c => c.marketLabel === '승1패(1)');
    const w1lCandWin = evalRes.candidates.find(c => c.marketLabel === '승1패(승)');
    const w1lCandLose = evalRes.candidates.find(c => c.marketLabel === '승1패(패)');

    if (bestW1L?.marketLabel === '승1패(1)') totalW1L1++;
    else if (bestW1L?.marketLabel === '승1패(승)') totalW1LWin++;
    else if (bestW1L?.marketLabel === '승1패(패)') totalW1LLose++;

    console.log(
      `${(idx + 1).toString().padStart(2)} | ` +
      `${m.homeTeam} vs ${m.awayTeam} | ` +
      `${domWin.toFixed(2)} / ${domLose.toFixed(2)} | ` +
      `${modelChoice} | ` +
      `hP:${hProb}% vs aP:${aProb}% | ` +
      `W:${w1lCandWin?.prob}% / 1:${w1lCand1?.prob}% / L:${w1lCandLose?.prob}% | ` +
      `${bestW1L?.pick || 'N/A'} | ` +
      `Score:${w1lCand1?.score?.toFixed(1)} (WinScore:${w1lCandWin?.score?.toFixed(1)})`
    );
  });

  console.log("--------------------------------------------------------------------------------------------------------------------------------");
  console.log(`\nMatchTable ModelChoice Distribution: 홈 승(1) = ${total1} (${((total1/sample20.length)*100).toFixed(1)}%), 원정 승(2) = ${total2} (${((total2/sample20.length)*100).toFixed(1)}%)`);
  console.log(`QuantPickEvaluator W1L Distribution: 1점차(1) = ${totalW1L1} (${((totalW1L1/sample20.length)*100).toFixed(1)}%), 승 = ${totalW1LWin}, 패 = ${totalW1LLose}`);
}

runDiagnostic();
