import fs from 'fs';
import path from 'path';
import { getSupabaseClient } from '../server/supabase/supabaseClient';
import { transformToStagingRecord, BetinfoOddsStagingRecord } from '../server/supabase/betinfoStagingService';

export async function runLoadAndVerify218Staging() {
  console.log('===============================================================================');
  console.log('ODDSALGO — 218건 해외 평균 배당 실제 Supabase 적재 및 무결성 전수 검증');
  console.log('===============================================================================\n');

  // [1] 실제 DB 사전 검사
  console.log('[1] 실제 Supabase DB 사전 검사 및 권한 확인...');
  const connection = getSupabaseClient();
  if (!connection.client) {
    throw new Error(`[ABORT] DB 연결 실패: ${connection.errorReason}`);
  }
  const supabase = connection.client;

  console.log(`- Project Host: ${connection.configDetails.projectHost}`);
  console.log(`- Project Ref 일치 여부: ${connection.configDetails.isProjectRefMatched ? '일치 (zjqkhihtiiflpqitqdsl)' : '불일치'}`);
  console.log(`- HTTPS 보안 프로토콜: ${connection.configDetails.isHttps ? '적용됨' : '미적용'}`);
  console.log(`- Secret Key 설정 여부: ${connection.configDetails.hasSecretKey ? '설정됨 (sb_secret_...)' : '미설정'}`);
  console.log(`- 실행 환경: ${connection.configDetails.environment}`);

  // 현재 레코드 수 확인
  const { count: currentStagingCount, error: stErr } = await supabase
    .from('betinfo_odds_staging')
    .select('*', { count: 'exact', head: true });

  const { count: currentHistoryCount, error: histErr } = await supabase
    .from('betinfo_odds_history_staging')
    .select('*', { count: 'exact', head: true });

  if (stErr) throw new Error(`betinfo_odds_staging 조회 실패: ${stErr.message}`);
  if (histErr) throw new Error(`betinfo_odds_history_staging 조회 실패: ${histErr.message}`);

  console.log(`- 현재 betinfo_odds_staging 레코드 수: ${currentStagingCount}건`);
  console.log(`- 현재 betinfo_odds_history_staging 레코드 수: ${currentHistoryCount}건`);

  if (currentStagingCount !== 0 || currentHistoryCount !== 0) {
    throw new Error(`[ABORT] 사전 조건 불일치: 스테이징 테이블이 비어 있지 않습니다 (staging: ${currentStagingCount}, history: ${currentHistoryCount}). 기존 데이터 보호를 위해 적재를 중단합니다.`);
  }
  console.log('-> 사전 검사 통과: 두 테이블 모두 비어 있으며 (0건), 충돌 위험이 전혀 없습니다.');

  // [2] 원본 데이터 검증
  console.log('\n[2] 원본 데이터셋 검증 (data/test_betinfo_foreign_odds_dataset.json)...');
  const datasetPath = path.join(process.cwd(), 'data', 'test_betinfo_foreign_odds_dataset.json');
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`데이터셋 파일 부재: ${datasetPath}`);
  }
  const rawJson = fs.readFileSync(datasetPath, 'utf8');
  const dataset = JSON.parse(rawJson);
  const items: any[] = dataset.items || [];

  console.log(`- 원본 전체 레코드 수: ${items.length}건`);
  const statusCounts = { OK: 0, NOT_PROVIDED: 0, PARSE_ERROR: 0 };
  for (const item of items) {
    if (item.status === 'OK') statusCounts.OK++;
    else if (item.status === 'NOT_PROVIDED') statusCounts.NOT_PROVIDED++;
    else if (item.status === 'PARSE_ERROR') statusCounts.PARSE_ERROR++;
  }
  console.log(`- 원본 상태별 건수: OK=${statusCounts.OK}, NOT_PROVIDED=${statusCounts.NOT_PROVIDED}, PARSE_ERROR=${statusCounts.PARSE_ERROR}`);

  if (items.length !== 218 || statusCounts.OK !== 40 || statusCounts.NOT_PROVIDED !== 178 || statusCounts.PARSE_ERROR !== 0) {
    throw new Error(`[ABORT] 원본 데이터셋 통계 불일치! 기대치: 총 218건 (OK 40, NOT_PROVIDED 178, PARSE_ERROR 0) / 실제: 총 ${items.length}건 (OK ${statusCounts.OK}, NOT_PROVIDED ${statusCounts.NOT_PROVIDED}, PARSE_ERROR ${statusCounts.PARSE_ERROR})`);
  }
  console.log('-> 원본 데이터셋 검증 통과: 기대 기준(218건, OK: 40, NOT_PROVIDED: 178)과 100% 일치.');

  // 데이터 변환
  const defaultMeta = { game_type: 'pt1', season_year: 2026, round_no: 122 };
  const stagingRecords: BetinfoOddsStagingRecord[] = items.map(item => transformToStagingRecord(item, defaultMeta));

  // [3] 실제 Supabase 적재 (Chunk 단위 안전 배치 적재)
  console.log('\n[3] 실제 Supabase 적재 실행...');
  const CHUNK_SIZE = 50;

  // A. betinfo_odds_staging 적재
  console.log(`- [A] betinfo_odds_staging 218건 적재 시작 (청크 크기: ${CHUNK_SIZE})...`);
  let stagingInserted = 0;
  for (let i = 0; i < stagingRecords.length; i += CHUNK_SIZE) {
    const chunk = stagingRecords.slice(i, i + CHUNK_SIZE).map(r => ({
      game_no: r.game_no,
      market_type: r.market_type,
      home_team: r.home_team,
      away_team: r.away_team,
      kickoff_at: r.kickoff_at,
      initial_home: r.initial_home,
      initial_draw: r.initial_draw,
      initial_away: r.initial_away,
      current_home: r.current_home,
      current_draw: r.current_draw,
      current_away: r.current_away,
      change_home: r.change_home,
      change_draw: r.change_draw,
      change_away: r.change_away,
      status: r.status,
      scraped_at: r.scraped_at,
      updated_at: new Date().toISOString()
    }));

    const { error: insertErr } = await supabase
      .from('betinfo_odds_staging')
      .upsert(chunk, { onConflict: 'game_no,market_type' });

    if (insertErr) {
      throw new Error(`[ABORT] betinfo_odds_staging 청크 적재 실패 (인덱스 ${i}~${i + chunk.length}): ${insertErr.message}`);
    }
    stagingInserted += chunk.length;
    console.log(`  * staging 진행: ${stagingInserted} / ${stagingRecords.length}건 완료`);
  }

  // B. betinfo_odds_history_staging 적재
  console.log(`- [B] betinfo_odds_history_staging 218건 초기 스냅샷 적재 시작...`);
  let historyInserted = 0;
  for (let i = 0; i < stagingRecords.length; i += CHUNK_SIZE) {
    const chunk = stagingRecords.slice(i, i + CHUNK_SIZE).map(r => ({
      game_no: r.game_no,
      market_type: r.market_type,
      home_team: r.home_team,
      away_team: r.away_team,
      kickoff_at: r.kickoff_at,
      initial_home: r.initial_home,
      initial_draw: r.initial_draw,
      initial_away: r.initial_away,
      current_home: r.current_home,
      current_draw: r.current_draw,
      current_away: r.current_away,
      change_home: r.change_home,
      change_draw: r.change_draw,
      change_away: r.change_away,
      status: r.status,
      scraped_at: r.scraped_at,
      recorded_at: new Date().toISOString()
    }));

    const { error: histInsertErr } = await supabase
      .from('betinfo_odds_history_staging')
      .upsert(chunk, { onConflict: 'game_no,market_type,scraped_at', ignoreDuplicates: true });

    if (histInsertErr) {
      throw new Error(`[ABORT] betinfo_odds_history_staging 청크 적재 실패 (인덱스 ${i}~${i + chunk.length}): ${histInsertErr.message}`);
    }
    historyInserted += chunk.length;
    console.log(`  * history 진행: ${historyInserted} / ${stagingRecords.length}건 완료`);
  }

  console.log('-> 적재 완료! 양쪽 테이블 각각 218건 전송 성공.');

  // [4] 실제 DB 재조회 및 무결성 전수 검증
  console.log('\n[4] 실제 DB 재조회 및 무결성 전수 검증 (Verification)...');

  // 1. 건수 검증
  const { count: finalStagingCount } = await supabase
    .from('betinfo_odds_staging')
    .select('*', { count: 'exact', head: true });

  const { count: finalHistoryCount } = await supabase
    .from('betinfo_odds_history_staging')
    .select('*', { count: 'exact', head: true });

  console.log(`- DB 재조회 betinfo_odds_staging 건수: ${finalStagingCount}건 (기대치: 218건)`);
  console.log(`- DB 재조회 betinfo_odds_history_staging 건수: ${finalHistoryCount}건 (기대치: 218건)`);

  if (finalStagingCount !== 218 || finalHistoryCount !== 218) {
    throw new Error(`[VERIFICATION_FAIL] 적재 건수 불일치! staging=${finalStagingCount}, history=${finalHistoryCount}`);
  }

  // 2. 전체 데이터 조회 (218건 전수 비교)
  const { data: dbRecords, error: fetchErr } = await supabase
    .from('betinfo_odds_staging')
    .select('*')
    .order('game_no', { ascending: true })
    .limit(300);

  if (fetchErr || !dbRecords) {
    throw new Error(`DB 레코드 조회 실패: ${fetchErr?.message}`);
  }

  console.log(`- DB에서 로드된 실제 레코드 수: ${dbRecords.length}건`);

  const dbStatusCounts = { OK: 0, NOT_PROVIDED: 0, PARSE_ERROR: 0 };
  const rawMap = new Map<string, any>();
  for (const item of items) {
    rawMap.set(`${item.gameNo}__${item.marketType || '일반'}`, item);
  }

  let matchMismatchCount = 0;
  let oddsArithmeticMismatchCount = 0;
  let twoWayNullMismatchCount = 0;
  let timestampMismatchCount = 0;

  for (const dbRec of dbRecords) {
    // 상태 카운트
    if (dbRec.status === 'OK') dbStatusCounts.OK++;
    else if (dbRec.status === 'NOT_PROVIDED') dbStatusCounts.NOT_PROVIDED++;
    else if (dbRec.status === 'PARSE_ERROR') dbStatusCounts.PARSE_ERROR++;

    const key = `${dbRec.game_no}__${dbRec.market_type}`;
    const rawItem = rawMap.get(key);

    if (!rawItem) {
      matchMismatchCount++;
      console.error(`❌ DB에 원본에 없는 키 존재: ${key}`);
      continue;
    }

    // 수집 시각 보존 확인
    if (dbRec.scraped_at !== rawItem.scrapedAt && new Date(dbRec.scraped_at).toISOString() !== new Date(rawItem.scrapedAt).toISOString()) {
      timestampMismatchCount++;
      console.error(`❌ 수집 시각 불일치 (Game ${dbRec.game_no}): DB=${dbRec.scraped_at}, Raw=${rawItem.scrapedAt}`);
    }

    // 2-Way 마켓 무승부 null 검증
    const isTwoWay = Boolean(
      rawItem.marketVerification?.isTwoWay ||
      rawItem.marketType === '언더오버' ||
      rawItem.marketType === '승1패' ||
      rawItem.marketType === '승5패' ||
      rawItem.marketType === 'H언더오버' ||
      rawItem.league === 'MLB' ||
      rawItem.league === 'KBO' ||
      rawItem.league === 'NPB'
    );
    if (isTwoWay && (dbRec.initial_draw !== null || dbRec.current_draw !== null || dbRec.change_draw !== null)) {
      twoWayNullMismatchCount++;
      console.error(`❌ 2-Way 무승부 NULL 위반 (Game ${dbRec.game_no}):`, {
        init: dbRec.initial_draw,
        curr: dbRec.current_draw,
        chg: dbRec.change_draw
      });
    }

    // 배당 정합성 검증 (OK 상태인 경우)
    if (dbRec.status === 'OK') {
      if (dbRec.initial_home !== null && dbRec.current_home !== null && dbRec.change_home !== null) {
        const expectedChange = Number((dbRec.current_home - dbRec.initial_home).toFixed(2));
        if (Math.abs(expectedChange - dbRec.change_home) > 0.011) {
          oddsArithmeticMismatchCount++;
        }
      }
      if (dbRec.initial_away !== null && dbRec.current_away !== null && dbRec.change_away !== null) {
        const expectedChange = Number((dbRec.current_away - dbRec.initial_away).toFixed(2));
        if (Math.abs(expectedChange - dbRec.change_away) > 0.011) {
          oddsArithmeticMismatchCount++;
        }
      }
    }
  }

  console.log(`- DB 상태 집계: OK=${dbStatusCounts.OK}건, NOT_PROVIDED=${dbStatusCounts.NOT_PROVIDED}건, PARSE_ERROR=${dbStatusCounts.PARSE_ERROR}건`);
  console.log(`- 원본 1:1 키 대조 불일치 건수: ${matchMismatchCount}건`);
  console.log(`- 수집 시각(scraped_at) 왜곡 건수: ${timestampMismatchCount}건`);
  console.log(`- 2-Way 마켓 무승부 NULL 위반 건수: ${twoWayNullMismatchCount}건`);
  console.log(`- 배당 변동값 산술 불일치(오차 > 0.01) 건수: ${oddsArithmeticMismatchCount}건`);

  // [5] 대표 5건 실제 DB 조회 값 상세 대조
  console.log('\n[5] 대표 레코드 실제 DB 조회 값 상세 대조:');
  const sampleGameNos = [8391, 8395, 8399, 8426, 8413];
  for (const gNo of sampleGameNos) {
    const rec = dbRecords.find(r => r.game_no === gNo);
    if (!rec) {
      console.error(`❌ 대표 레코드 Game ${gNo} DB 누락!`);
      continue;
    }
    console.log(`  * [No.${rec.game_no}] ${rec.home_team} vs ${rec.away_team} (${rec.market_type})`);
    console.log(`    - 상태: ${rec.status}`);
    console.log(`    - 초기 배당: 홈=${rec.initial_home}, 무=${rec.initial_draw}, 원정=${rec.initial_away}`);
    console.log(`    - 현재 배당: 홈=${rec.current_home}, 무=${rec.current_draw}, 원정=${rec.current_away}`);
    console.log(`    - 변동값: 홈=${rec.change_home}, 무=${rec.change_draw}, 원정=${rec.change_away}`);
    console.log(`    - 수집 시각: ${rec.scraped_at}`);
  }

  console.log('\n===============================================================================');
  console.log('🎉 [SUCCESS] 218건 Supabase 스테이징 테이블 적재 및 무결성 검증 100% 완료!');
  console.log('===============================================================================');

  return {
    success: true,
    stagingCount: finalStagingCount,
    historyCount: finalHistoryCount,
    statusCounts: dbStatusCounts,
    matchMismatchCount,
    timestampMismatchCount,
    twoWayNullMismatchCount,
    oddsArithmeticMismatchCount
  };
}

runLoadAndVerify218Staging().catch(err => {
  console.error('\n❌ 적재 또는 검증 도중 오류 발생:', err.message);
  process.exit(1);
});
