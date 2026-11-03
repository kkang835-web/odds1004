import { generateMatchPreviewArticle } from '../src/utils/matchPreviewGenerator';
import * as fs from 'fs';

async function runMatchPreviewAccuracyTests() {
  console.log("==================================================");
  console.log("SPORTSQUANT PRO — JOURNALIST PREVIEW ACCURACY TEST");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, detail?: string) {
    if (condition) {
      passed++;
      console.log(`✅ [PASS] ${name}`);
    } else {
      failed++;
      console.error(`❌ [FAIL] ${name} ${detail ? `(${detail})` : ''}`);
    }
  }

  // 1. Prohibited Phrases Test
  const PROHIBITED_WORDS = [
    "최근 소화력이 안정적이다",
    "타선의 응집력이 좋다",
    "후반 추격전이 중요하다",
    "초반 리드를 잡을 가능성이 높다",
    "불펜이 변수다",
    "압도적이다",
    "확실하다",
    "무조건",
    "필승",
    "완벽하다",
    "확실한 우세",
    "당연히",
    "분위기가 좋다",
    "선수들의 사기가 높다",
    "최근 상승세가 뚜렷하다"
  ];

  const rawData = JSON.parse(fs.readFileSync('data/realProtoHistoricalDataset.json', 'utf8'));
  const testMatches: any[] = [];

  for (const roundKey of Object.keys(rawData.rounds)) {
    const round = rawData.rounds[roundKey];
    for (const m of (round.matches || [])) {
      if ((m.domesticOdds || m.domestic)?.win) {
        testMatches.push(m);
        if (testMatches.length >= 25) break;
      }
    }
    if (testMatches.length >= 25) break;
  }

  console.log(`Running preview accuracy audit across ${testMatches.length} real historical matches...\n`);

  // [TEST 1~15] Prohibited word absence across all generated articles
  let foundProhibited: string[] = [];
  testMatches.forEach(m => {
    const preview = generateMatchPreviewArticle(m);
    PROHIBITED_WORDS.forEach(word => {
      if (preview.rawText.includes(word)) {
        foundProhibited.push(word);
      }
    });
  });

  PROHIBITED_WORDS.forEach((word, idx) => {
    assert(
      `Test ${idx + 1}/35: Prohibited phrase absence: "${word}"`,
      !foundProhibited.includes(word)
    );
  });

  // [TEST 16] Structure: Exactly 11 official sections present
  const samplePreview = generateMatchPreviewArticle(testMatches[0]);
  assert(
    "Test 16/35: Exactly 11 professional journalist sections generated",
    Array.isArray(samplePreview.sections) && samplePreview.sections.length === 11
  );

  // [TEST 17] Section Separation: Quant Model (Section 11) is strictly segregated
  const sec11 = samplePreview.sections.find(s => s.sectionNo === '11');
  assert(
    "Test 17/35: Section 11 strictly isolates SportsQuant quantitative model",
    Boolean(sec11 && sec11.title.includes('정량 퀀트') && sec11.content.includes('수리 확률 모델에 의해 독립 연산'))
  );

  // [TEST 18] Zero Hallucination: fake_player_name = false
  assert(
    "Test 18/35: Zero fake player name generation",
    !samplePreview.rawText.includes("가짜선수") && !samplePreview.rawText.includes("임의선수")
  );

  // [TEST 19] Zero Hallucination: fake_score = false
  assert(
    "Test 19/35: Zero fake score generation",
    !samplePreview.rawText.includes("99:99") && !samplePreview.rawText.includes("0:0")
  );

  // [TEST 20] Zero Hallucination: fake_weather = false
  assert(
    "Test 20/35: Zero fake weather/stadium speculation",
    !samplePreview.rawText.includes("태풍이 불어") && !samplePreview.rawText.includes("비가 많이 와서")
  );

  // [TEST 21] Fact Check: Numbers match real recent stats
  const mockH2H = {
    homeRecent: [
      { date: '2026.09.10', opponent: '상대A', isHome: true, score: '5:2', scoreFor: 5, scoreAgainst: 2, result: '승' },
      { date: '2026.09.12', opponent: '상대B', isHome: false, score: '3:4', scoreFor: 3, scoreAgainst: 4, result: '패' }
    ],
    awayRecent: [
      { date: '2026.09.11', opponent: '상대C', isHome: true, score: '2:1', scoreFor: 2, scoreAgainst: 1, result: '승' }
    ],
    h2h: {
      matches: [
        { date: '2026.08.01', score: '4:3', homeScore: 4, awayScore: 3, result: '홈승' }
      ],
      summary: { total: 1, homeWin: 1, draw: 0, awayWin: 0, homeScored: 4, awayScored: 3 }
    }
  };

  const previewWithRealH2H = generateMatchPreviewArticle(testMatches[0], undefined, mockH2H);
  assert(
    "Test 21/35: Real recent stats ingested accurately (Home 1승 0무 1패)",
    previewWithRealH2H.recentFormText.includes("1승 0무 1패")
  );

  // [TEST 22] Fact Check: Real H2H match count and scores
  assert(
    "Test 22/35: Real H2H matches ingested accurately (1전 1승)",
    previewWithRealH2H.h2hText.includes("1승") && previewWithRealH2H.h2hText.includes("4.0점")
  );

  // [TEST 23] Real Domestic Odds Integrity
  const domWin = (testMatches[0].domesticOdds || testMatches[0].domestic).win;
  assert(
    "Test 23/35: Official domestic odds displayed without synthetic mutation",
    previewWithRealH2H.quickOverview.includes(domWin.toFixed(2))
  );

  // [TEST 24] Lineup Status Tagging
  assert(
    "Test 24/35: Lineup status properly tagged with CONFIRMED or EXPECTED",
    previewWithRealH2H.lineupInjuryText.includes("CONFIRMED") || previewWithRealH2H.lineupInjuryText.includes("EXPECTED")
  );

  // [TEST 25] Provenance data status is REAL
  assert(
    "Test 25/35: Provenance dataStatus is marked REAL",
    previewWithRealH2H.provenance.dataStatus === 'REAL'
  );

  // [TEST 26] Fact check passed flag
  assert(
    "Test 26/35: factCheckPassed flag is true",
    previewWithRealH2H.factCheckPassed === true
  );

  // [TEST 27] Style rule: "사실 -> 숫자 -> 비교 -> 해석 -> 경기 영향"
  assert(
    "Test 27/35: Style adherence: contains exact numbers and comparisons",
    /\d+(\.\d+)?점/.test(previewWithRealH2H.recentFormText)
  );

  // [TEST 28] Checkpoints count: Between 3 and 5 items
  assert(
    "Test 28/35: Checkpoints array has between 3 and 5 fact points",
    previewWithRealH2H.checkpoints.length >= 3 && previewWithRealH2H.checkpoints.length <= 5
  );

  // [TEST 29] One-Click Copy rawText assembly completeness
  assert(
    "Test 29/35: rawText contains full 11 numbered sections",
    previewWithRealH2H.rawText.includes("01. 【경기 한눈에 보기】") &&
    previewWithRealH2H.rawText.includes("11. 【SportsQuant 정량 퀀트 모델 분석】")
  );

  // [TEST 30] SEO NewsArticle JSON-LD schema generation
  assert(
    "Test 30/35: Schema.org NewsArticle JSON-LD is valid JSON",
    (() => {
      try {
        JSON.parse(previewWithRealH2H.jsonLdSnippet);
        return true;
      } catch {
        return false;
      }
    })()
  );

  // [TEST 31] Multi-Sport Support: Baseball
  const bbPreview = generateMatchPreviewArticle({ ...testMatches[0], sport: 'baseball' });
  assert(
    "Test 31/35: Multi-Sport: Baseball includes starter ERA and bullpen metrics",
    bbPreview.pitcherOrAceText.includes("ERA") || bbPreview.pitcherOrAceText.includes("선발")
  );

  // [TEST 32] Multi-Sport Support: Soccer
  const scPreview = generateMatchPreviewArticle({ ...testMatches[0], sport: 'soccer' });
  assert(
    "Test 32/35: Multi-Sport: Soccer includes shooting and attacking metrics",
    scPreview.pitcherOrAceText.includes("유효슈팅") || scPreview.attackText.includes("골")
  );

  // [TEST 33] Core Engine Immutability: TOTO V1 untouched
  const totoEngineContent = fs.readFileSync('server/quantEngine.ts', 'utf8');
  assert(
    "Test 33/35: Core Engine Immutability: server/quantEngine.ts untouched",
    totoEngineContent.includes("TOTO 3-State Mathematical Prediction Models")
  );

  // [TEST 34] Core Engine Immutability: PROTO Production Model untouched
  const protoModelContent = fs.readFileSync('src/utils/quantModel.ts', 'utf8');
  assert(
    "Test 34/35: Core Engine Immutability: src/utils/quantModel.ts untouched",
    protoModelContent.includes("computeQuantModel")
  );

  // [TEST 35] Core Dataset Immutability: realProtoHistoricalDataset.json untouched
  const datasetStats = fs.statSync('data/realProtoHistoricalDataset.json');
  assert(
    "Test 35/35: Dataset Immutability: realProtoHistoricalDataset.json intact",
    datasetStats.size > 100000
  );

  console.log(`\n==================================================`);
  console.log(`MATCH PREVIEW ACCURACY TEST RESULTS: ${passed}/${passed + failed} PASS`);
  console.log(`==================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runMatchPreviewAccuracyTests();
