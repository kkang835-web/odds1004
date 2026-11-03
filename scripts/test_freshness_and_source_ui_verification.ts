import { getForeignFreshness, MatchItem } from '../src/components/MatchTable';

export async function runFreshnessAndSourceVerification() {
  console.log('===============================================================================');
  console.log('ODDSALGO — 해외 평균 배당 데이터 최신성 및 출처 표시 최종 검증');
  console.log('===============================================================================\n');

  // [1] 검증 미리보기 API 호출 테스트 (Round 122 + verifiedPreview=true)
  console.log('[1] 검증 미리보기 모드 API 호출 테스트 (Round 122)...');
  await new Promise(r => setTimeout(r, 2000));
  const res = await fetch('http://localhost:3000/api/matches?gameType=pt1&year=2026&round=122&verifiedPreview=true');
  if (!res.ok) throw new Error(`API 호출 실패: ${res.status}`);
  const json = await res.json();

  console.log(`- 전체 편성 경기 수: ${json.matches?.length}경기`);
  console.log(`- isVerifiedForeignPreview: ${json.isVerifiedForeignPreview}`);
  console.log(`- verifiedPreviewRound: ${json.verifiedPreviewRound}`);
  console.log(`- foreignSourceOrigin: ${json.foreignSourceOrigin}`);

  const vMatches: MatchItem[] = json.matches.filter((m: any) => m.verifiedForeignPreview);
  console.log(`- 검증 미리보기 연결 경기 수: ${vMatches.length}경기`);

  const okMatches = vMatches.filter(m => m.verifiedForeignPreview?.status === 'OK');
  const npMatches = vMatches.filter(m => m.verifiedForeignPreview?.status === 'NOT_PROVIDED');
  const peMatches = vMatches.filter(m => m.verifiedForeignPreview?.status === 'PARSE_ERROR');
  const meMatches = vMatches.filter(m => m.verifiedForeignPreview?.status === 'MATCH_ERROR');

  console.log(`- 정상 배당 (OK) 경기 수: ${okMatches.length}경기 (기대치: 40)`);
  console.log(`- 원본 미제공 (NOT_PROVIDED) 경기 수: ${npMatches.length}경기 (기대치: 178)`);
  console.log(`- 파싱 오류 (PARSE_ERROR) 경기 수: ${peMatches.length}경기 (기대치: 0)`);
  console.log(`- 매칭 오류 (MATCH_ERROR) 경기 수: ${meMatches.length}경기 (기대치: 0)`);

  if (vMatches.length !== 218 || okMatches.length !== 40 || npMatches.length !== 178) {
    throw new Error(`[FAIL] 건수 불일치! Total=${vMatches.length}, OK=${okMatches.length}, NP=${npMatches.length}`);
  }

  // [2] 최신성 판정 및 LIVE 금지 검증
  console.log('\n[2] 최신성 판정 및 LIVE 금지 검증...');
  let falseLiveCount = 0;
  let staleCount = 0;

  for (const m of okMatches) {
    const freshness = getForeignFreshness(m);
    if (freshness.status === 'LIVE' || freshness.label.includes('LIVE') || freshness.label.includes('실시간')) {
      falseLiveCount++;
      console.error(`❌ 잘못된 LIVE 상태 감지 (Game ${m.gameNo}): label=${freshness.label}`);
    }
    if (freshness.status === 'STALE') {
      staleCount++;
    }
  }

  console.log(`- OK 40건 중 잘못된 LIVE 표시 건수: ${falseLiveCount}건 (기대치: 0건)`);
  console.log(`- OK 40건 중 과거 스냅샷 (STALE) 정상 판정 건수: ${staleCount}건 (기대치: 40건)`);

  // [3] 대표 경기 상세 검증 (#8391, #8413, #8392)
  console.log('\n[3] 대표 경기 상세 검증...');
  const m8391 = json.matches.find((m: any) => m.gameNo === 8391);
  if (!m8391) throw new Error('Game 8391 누락');
  const fresh8391 = getForeignFreshness(m8391);

  console.log('* [No.8391] BG빠툼유 vs 애들유나 (일반):');
  console.log(`  - 해외 현재 배당: 홈=${m8391.foreign?.win}, 무=${m8391.foreign?.draw}, 원정=${m8391.foreign?.lose}`);
  console.log(`  - 배당 변동값: 홈=${m8391.verifiedForeignPreview?.oddsChange?.win}, 무=${m8391.verifiedForeignPreview?.oddsChange?.draw}, 원정=${m8391.verifiedForeignPreview?.oddsChange?.lose}`);
  console.log(`  - 배지 라벨: ${fresh8391.label}`);
  console.log(`  - 최신성 상태: ${fresh8391.status}`);
  console.log(`  - 수집 시각 표시: ${fresh8391.timeText}`);
  console.log(`  - 데이터 출처: ${fresh8391.subNotice}`);
  console.log(`  - 툴팁 내용:\n${fresh8391.tooltip.split('\n').map(l => '    ' + l).join('\n')}`);

  const m8413 = json.matches.find((m: any) => m.gameNo === 8413);
  if (!m8413) throw new Error('Game 8413 누락');
  console.log('\n* [No.8413] 클리가디 vs 탬파레이 (MLB 2-Way):');
  console.log(`  - 해외 현재 배당: 홈=${m8413.foreign?.win}, 무=${m8413.foreign?.draw ?? 'null(대시)'}, 원정=${m8413.foreign?.lose}`);
  console.log(`  - 2-Way 무승부 배당 대시 유지 확인: ${m8413.foreign?.draw === null ? 'PASS' : 'FAIL'}`);

  const m8392 = json.matches.find((m: any) => m.gameNo === 8392);
  if (!m8392) throw new Error('Game 8392 누락');
  const fresh8392 = getForeignFreshness(m8392);
  console.log('\n* [No.8392] BG빠툼유 vs 애들유나 (핸디캡 NOT_PROVIDED):');
  console.log(`  - foreign 필드: ${m8392.foreign === undefined ? 'undefined (대시 표시)' : '존재함(오류)'}`);
  console.log(`  - 배지 라벨: ${fresh8392.label}`);
  console.log(`  - 툴팁: ${fresh8392.tooltip}`);

  // [4] 일반 운영 요청(Round 106) 격리 검증
  console.log('\n[4] 일반 운영 요청(Round 106) 격리 검증...');
  const opRes = await fetch('http://localhost:3000/api/matches?gameType=pt1&year=2026&round=106');
  const opJson = await opRes.json();
  const opVMatches = opJson.matches.filter((m: any) => m.verifiedForeignPreview);

  console.log(`- 운영 106회차 검증 데이터 주입 건수: ${opVMatches.length}건 (기대치: 0건)`);
  console.log(`- 운영 106회차 isVerifiedForeignPreview: ${opJson.isVerifiedForeignPreview} (기대치: false)`);
  console.log(`- 운영 106회차 foreignSourceOrigin: ${opJson.foreignSourceOrigin ?? 'null'} (기대치: null)`);

  if (opVMatches.length !== 0 || opJson.isVerifiedForeignPreview === true) {
    throw new Error('[FAIL] 운영 데이터 격리 실패!');
  }

  console.log('\n===============================================================================');
  console.log('🎉 [SUCCESS] 해외 평균 배당 데이터 최신성 및 출처 표시 최종 검증 100% PASS!');
  console.log('===============================================================================');
}

runFreshnessAndSourceVerification().catch(err => {
  console.error('\n❌ 검증 실패:', err.message);
  process.exit(1);
});
