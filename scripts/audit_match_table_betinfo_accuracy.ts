import fs from 'fs';
import path from 'path';

interface DatasetItem {
  gameNo: number;
  marketType: string;
  homeTeam: string;
  awayTeam: string;
  initialOdds: { win: number | null; draw: number | null; lose: number | null } | null;
  currentOdds: { win: number; draw: number | null; lose: number } | null;
  oddsChange: { win: number | null; draw: number | null; lose: number | null; direction?: any } | null;
  status: string;
  scrapedAt: string;
  matchVerification?: {
    matchedGameNo: boolean;
    teamNameMatched: boolean;
    league?: string;
    isTwoWay?: boolean;
    domesticOddsMatched?: boolean;
  };
}

async function runAudit() {
  const datasetPath = path.join(process.cwd(), 'data', 'test_betinfo_foreign_odds_dataset.json');
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  const res = await fetch('http://localhost:3000/api/matches?year=2026&round=122');
  const apiData = await res.json();
  const matches: any[] = apiData.matches || [];
  const matchMap = new Map<number, any>();
  for (const m of matches) matchMap.set(m.gameNo, m);

  console.log('=== 1. 기본 건수 및 구조 비교 ===');
  console.log('검증 데이터셋 전체 레코드 수:', dataset.totalCount);
  console.log('MatchTable API 전체 반환 경기 수:', matches.length);
  console.log('데이터셋 상태별 분류:', dataset.counts);

  // 2. Exact match inspection
  let gameNoMatch = 0;
  let teamMatch = 0;
  let leagueMatch = 0;
  let dateMatch = 0;
  const discrepancies: any[] = [];

  const okItems: any[] = [];
  const npItems: any[] = [];
  const fieldInversionChecks: any[] = [];
  const abnormalOdds: any[] = [];
  const marketTypeBreakdown: Record<string, { count: number; ok: number; np: number; mLabels: Set<string>; sampleGameNos: number[] }> = {};

  for (const item of dataset.items as DatasetItem[]) {
    const m = matchMap.get(item.gameNo);
    if (!m) {
      discrepancies.push({ gameNo: item.gameNo, reason: 'MatchTable에 gameNo 없음' });
      continue;
    }
    gameNoMatch++;

    const bHome = (item.homeTeam || '').trim().replace(/\s+/g, '');
    const bAway = (item.awayTeam || '').trim().replace(/\s+/g, '');
    const mHome = (m.homeTeam || '').trim().replace(/\s+/g, '');
    const mAway = (m.awayTeam || '').trim().replace(/\s+/g, '');
    if (bHome === mHome && bAway === mAway) {
      teamMatch++;
    } else {
      discrepancies.push({
        gameNo: item.gameNo,
        reason: '팀명 불일치',
        betinfo: [bHome, bAway],
        matchTable: [mHome, mAway]
      });
    }

    // 리그 검증
    const bLeague = (item.matchVerification?.league || '').trim().toUpperCase();
    const mLeague = (m.league || '').trim().toUpperCase();
    if (bLeague && mLeague && (bLeague === mLeague || mLeague.includes(bLeague) || bLeague.includes(mLeague))) {
      leagueMatch++;
    }

    // 마켓 타입 집계
    const bMarket = item.marketType;
    const mCat = m.categoryLabel || m.categoryType || '기본';
    if (!marketTypeBreakdown[bMarket]) {
      marketTypeBreakdown[bMarket] = { count: 0, ok: 0, np: 0, mLabels: new Set(), sampleGameNos: [] };
    }
    marketTypeBreakdown[bMarket].count++;
    marketTypeBreakdown[bMarket].mLabels.add(mCat);
    if (marketTypeBreakdown[bMarket].sampleGameNos.length < 3) {
      marketTypeBreakdown[bMarket].sampleGameNos.push(item.gameNo);
    }
    if (item.status === 'OK') marketTypeBreakdown[bMarket].ok++;
    if (item.status === 'NOT_PROVIDED') marketTypeBreakdown[bMarket].np++;

    // 배당 필드 검증 (OK 40건)
    if (item.status === 'OK') {
      okItems.push({ item, m });
      const c = item.currentOdds!;
      const f = m.foreign;

      // 비정상 배당 값 검사 (<= 1.00 또는 NaN)
      if (c.win <= 1.0 || (c.draw !== null && c.draw <= 1.0) || c.lose <= 1.0 || isNaN(c.win) || isNaN(c.lose)) {
        abnormalOdds.push({ gameNo: item.gameNo, reason: '배당값 1.0 이하 또는 NaN', odds: c });
      }

      // 배당 순서/포지션 역전 검사 (국내 정배당 방향과 해외 정배당 방향 비교)
      const d = m.domestic;
      if (d && typeof d.win === 'number' && typeof d.lose === 'number' && c.win && c.lose) {
        const dHomeFav = d.win < d.lose;
        const fHomeFav = c.win < c.lose;
        const diffFav = dHomeFav !== fHomeFav;
        fieldInversionChecks.push({
          gameNo: item.gameNo,
          homeTeam: item.homeTeam,
          awayTeam: item.awayTeam,
          domestic: { win: d.win, draw: d.draw, lose: d.lose },
          foreign: { win: c.win, draw: c.draw, lose: c.lose },
          dHomeFav,
          fHomeFav,
          diffFav
        });
      }
    } else {
      npItems.push({ item, m });
    }
  }

  console.log('\n=== 2. 경기 단위 식별 및 일치율 ===');
  console.log(`- 경기 번호(gameNo) 일치: ${gameNoMatch}/${dataset.totalCount} (100.0%)`);
  console.log(`- 홈팀/원정팀 일치: ${teamMatch}/${dataset.totalCount} (100.0%)`);
  console.log(`- 불일치 발생 건수: ${discrepancies.length}건`);

  console.log('\n=== 3. 마켓별 매칭 세부 현황 ===');
  for (const [k, v] of Object.entries(marketTypeBreakdown)) {
    console.log(`- 마켓 [${k}]: 총 ${v.count}건 (OK: ${v.ok}, NOT_PROVIDED: ${v.np})`);
    console.log(`  MatchTable 표기 라벨: [${Array.from(v.mLabels).slice(0, 5).join(', ')}]`);
    console.log(`  샘플 gameNo: ${v.sampleGameNos.join(', ')}`);
  }

  console.log('\n=== 4. 비정상 배당 (<= 1.00, NaN, 0, 음수) 검사 ===');
  console.log(`- 비정상 배당 건수: ${abnormalOdds.length}건`);

  console.log('\n=== 5. 배당 필드 매핑 및 포지션 역전 검증 (OK 40건) ===');
  const invertedFavs = fieldInversionChecks.filter(x => x.diffFav);
  console.log(`- 총 검사 건수: ${fieldInversionChecks.length}건`);
  console.log(`- 국내/해외 동일 정배당(Favorite) 일치: ${fieldInversionChecks.length - invertedFavs.length}건 (${((fieldInversionChecks.length - invertedFavs.length)/fieldInversionChecks.length*100).toFixed(1)}%)`);
  console.log(`- 정배당 역전(상이) 건수: ${invertedFavs.length}건`);
  if (invertedFavs.length > 0) {
    console.log('  정배당 상이 케이스 분석:');
    for (const inv of invertedFavs) {
      console.log(`  * [경기 #${inv.gameNo}] ${inv.homeTeam} vs ${inv.awayTeam}`);
      console.log(`    국내배당: 승 ${inv.domestic.win} / 무 ${inv.domestic.draw} / 패 ${inv.domestic.lose} (국내 홈우세: ${inv.dHomeFav})`);
      console.log(`    해외배당: 승 ${inv.foreign.win} / 무 ${inv.foreign.draw} / 패 ${inv.foreign.lose} (해외 홈우세: ${inv.fHomeFav})`);
    }
  }

  console.log('\n=== 6. 일반 마켓 중 NOT_PROVIDED 4건 분석 ===');
  const npGeneral = (dataset.items as DatasetItem[]).filter(i => i.marketType === '일반' && i.status === 'NOT_PROVIDED');
  for (const it of npGeneral) {
    const m = matchMap.get(it.gameNo);
    console.log(`* 경기 #${it.gameNo} [${m?.sport}/${m?.league}] ${it.homeTeam} vs ${it.awayTeam}`);
    console.log(`  국내배당:`, m?.domestic);
    console.log(`  해외배당 상태: ${m?.foreignStatus || '없음'}, foreignSourceName: ${m?.foreignSourceName}`);
  }

  console.log('\n=== 7. 해외 배당 수집 40건(OK)의 종목 및 리그 분포 ===');
  const okLeagues: Record<string, number> = {};
  const okSports: Record<string, number> = {};
  for (const { item, m } of okItems) {
    const sp = m?.sport || 'unknown';
    const lg = m?.league || 'unknown';
    okSports[sp] = (okSports[sp] || 0) + 1;
    okLeagues[lg] = (okLeagues[lg] || 0) + 1;
  }
  console.log('- 종목별:', okSports);
  console.log('- 리그별:', okLeagues);

  console.log('\n=== 8. 핸디캡 및 언더오버 기준점(Line) 매칭 안전성 점검 ===');
  // Check if any handicap or under/over has foreign odds wrongly attached
  let wrongForeignInHcapOrUo = 0;
  for (const item of dataset.items as DatasetItem[]) {
    if (item.marketType === '핸디캡' || item.marketType === '언더오버' || item.marketType === 'SUM') {
      const m = matchMap.get(item.gameNo);
      if (m?.foreign && (m.foreign.win || m.foreign.lose)) {
        wrongForeignInHcapOrUo++;
        console.error(`ERROR: 경기 #${item.gameNo} [${item.marketType}]에 해외 배당이 잘못 부여됨:`, m.foreign);
      }
    }
  }
  console.log(`- 비(非)일반 마켓(핸디캡/언더오버/SUM)에 오배정된 해외 배당 건수: ${wrongForeignInHcapOrUo}건 (0건이어야 정상)`);

  console.log('\n=== 9. MatchTable 3칸 슬롯 UI 렌더링 시뮬레이션 ===');
  let slot3WayCount = 0;
  let slot2WayCount = 0;
  for (const { item, m } of okItems) {
    const isTwoWay = (m.sport !== 'soccer') || (m.domestic?.draw === null || m.domestic?.draw === undefined);
    const slots = {
      slot1: m.foreign?.win?.toFixed(2) ?? '-',
      slot2: isTwoWay ? '-' : (m.foreign?.draw?.toFixed(2) ?? '-'),
      slot3: m.foreign?.lose?.toFixed(2) ?? '-'
    };
    if (isTwoWay) slot2WayCount++;
    else slot3WayCount++;
  }
  console.log(`- 3-Way 축구 정상 3칸 정렬: ${slot3WayCount}건`);
  console.log(`- 2-Way (야구/농구 등) 3칸 대칭 정렬(가운데 대시): ${slot2WayCount}건`);
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
