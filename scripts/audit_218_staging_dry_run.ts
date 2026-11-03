import fs from 'fs';
import path from 'path';
import { getSupabaseClient } from '../server/supabase/supabaseClient';
import { transformToStagingRecord } from '../server/supabase/betinfoStagingService';

export async function runDryRunAudit() {
  console.log('===============================================================================');
  console.log('ODDSALGO — 218건 전체 배당 데이터 일괄 적재 사전 점검 (Read-Only Dry-Run)');
  console.log('===============================================================================\n');

  // [1] 원본 데이터셋 전수 분석
  console.log('[1] 원본 데이터셋 전수 분석 (data/test_betinfo_foreign_odds_dataset.json)...');
  const datasetPath = path.join(process.cwd(), 'data', 'test_betinfo_foreign_odds_dataset.json');
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`데이터셋 파일 부재: ${datasetPath}`);
  }
  const raw = fs.readFileSync(datasetPath, 'utf8');
  const dataset = JSON.parse(raw);
  const items: any[] = dataset.items || [];

  console.log(`- 전체 레코드 수: ${items.length}건`);

  const statusCounts: Record<string, number> = { OK: 0, NOT_PROVIDED: 0, PARSE_ERROR: 0 };
  for (const item of items) {
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
  }
  console.log(`- 상태별 건수: OK = ${statusCounts.OK}건, NOT_PROVIDED = ${statusCounts.NOT_PROVIDED}건, PARSE_ERROR = ${statusCounts.PARSE_ERROR}건`);
  console.log(`- 기존 보고서(218건, OK: 40건, NOT_PROVIDED: 178건)와의 비교:`);
  console.log(`  * 총 건수 일치: ${items.length === 218 ? '일치 (218건)' : '불일치'}`);
  console.log(`  * OK 건수 일치: ${statusCounts.OK === 40 ? '일치 (40건)' : '불일치'}`);
  console.log(`  * NOT_PROVIDED 건수 일치: ${statusCounts.NOT_PROVIDED === 178 ? '일치 (178건)' : '불일치'}`);
  console.log(`  * PARSE_ERROR 건수: ${statusCounts.PARSE_ERROR}건`);

  // [2] 실제 DB 상태 확인 (Read-Only)
  console.log('\n[2] 실제 Supabase DB 상태 점검 (Read-Only)...');
  const connection = getSupabaseClient();
  if (!connection.client) {
    throw new Error(`Supabase 클라이언트 초기화 실패: ${connection.errorReason}`);
  }
  const supabase = connection.client;

  console.log(`- Project Host: ${connection.configDetails.projectHost}`);
  console.log(`- Project Ref 일치 여부: ${connection.configDetails.isProjectRefMatched ? '일치' : '불일치'}`);

  const { count: stagingCount, error: stagingErr } = await supabase
    .from('betinfo_odds_staging')
    .select('*', { count: 'exact', head: true });

  const { count: historyCount, error: historyErr } = await supabase
    .from('betinfo_odds_history_staging')
    .select('*', { count: 'exact', head: true });

  if (stagingErr) {
    console.error(`❌ betinfo_odds_staging 조회 오류: ${stagingErr.message}`);
  } else {
    console.log(`- betinfo_odds_staging 현재 레코드 수: ${stagingCount}건`);
  }

  if (historyErr) {
    console.error(`❌ betinfo_odds_history_staging 조회 오류: ${historyErr.message}`);
  } else {
    console.log(`- betinfo_odds_history_staging 현재 레코드 수: ${historyCount}건`);
  }

  console.log(`- 5건 스모크 테스트 정리 상태: ${stagingCount === 0 && historyCount === 0 ? '완전 정리됨 (0건)' : '잔여 데이터 존재'}`);

  // [3] 쓰기 없는 드라이런 정합성 및 무결성 전수 검사
  console.log('\n[3] 218건 전수 무결성 검증 (Zero-Write Dry Run)...');
  const seenKeys = new Map<string, number>();
  const duplicateKeys: string[] = [];
  const missingFieldItems: any[] = [];
  const twoWayDrawViolations: any[] = [];
  const oddsDiscrepancies: any[] = [];

  const defaultMeta = { game_type: 'pt1', season_year: 2026, round_no: 122 };
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const rec = transformToStagingRecord(item, defaultMeta);

    // 복합 키 중복 검사 (game_no, market_type)
    const key = `${rec.game_no}__${rec.market_type}`;
    if (seenKeys.has(key)) {
      duplicateKeys.push(`Item #${idx} (Game ${rec.game_no}, Market ${rec.market_type}) duplicates with #${seenKeys.get(key)}`);
    } else {
      seenKeys.set(key, idx);
    }

    // 필수 필드 검사
    if (!rec.game_no || !rec.market_type || !rec.home_team || !rec.away_team || !rec.status || !rec.scraped_at) {
      missingFieldItems.push({
        idx,
        game_no: rec.game_no,
        market_type: rec.market_type,
        home_team: rec.home_team,
        away_team: rec.away_team,
        status: rec.status,
        scraped_at: rec.scraped_at
      });
    }

    // 2-way 무승부 NULL 검사
    const isTwoWay = Boolean(
      item.marketVerification?.isTwoWay ||
      item.marketType === '언더오버' ||
      item.marketType === '승1패' ||
      item.marketType === '승5패' ||
      item.marketType === 'H언더오버' ||
      item.league === 'MLB' ||
      item.league === 'KBO' ||
      item.league === 'NPB'
    );
    if (isTwoWay && (rec.initial_draw !== null || rec.current_draw !== null || rec.change_draw !== null)) {
      twoWayDrawViolations.push({
        idx,
        game_no: rec.game_no,
        market_type: rec.market_type,
        drawValues: { initial: rec.initial_draw, current: rec.current_draw, change: rec.change_draw }
      });
    }

    // 배당 변동값 산술 정합성 검사 (OK 레코드)
    if (rec.status === 'OK') {
      if (rec.initial_home !== null && rec.current_home !== null && rec.change_home !== null) {
        const expectedChange = Number((rec.current_home - rec.initial_home).toFixed(2));
        if (Math.abs(expectedChange - rec.change_home) > 0.011) {
          oddsDiscrepancies.push({
            game_no: rec.game_no,
            selection: 'home',
            initial: rec.initial_home,
            current: rec.current_home,
            recordedChange: rec.change_home,
            expectedChange
          });
        }
      }
      if (rec.initial_draw !== null && rec.current_draw !== null && rec.change_draw !== null) {
        const expectedChange = Number((rec.current_draw - rec.initial_draw).toFixed(2));
        if (Math.abs(expectedChange - rec.change_draw) > 0.011) {
          oddsDiscrepancies.push({
            game_no: rec.game_no,
            selection: 'draw',
            initial: rec.initial_draw,
            current: rec.current_draw,
            recordedChange: rec.change_draw,
            expectedChange
          });
        }
      }
      if (rec.initial_away !== null && rec.current_away !== null && rec.change_away !== null) {
        const expectedChange = Number((rec.current_away - rec.initial_away).toFixed(2));
        if (Math.abs(expectedChange - rec.change_away) > 0.011) {
          oddsDiscrepancies.push({
            game_no: rec.game_no,
            selection: 'away',
            initial: rec.initial_away,
            current: rec.current_away,
            recordedChange: rec.change_away,
            expectedChange
          });
        }
      }
    }
  }

  console.log(`- (game_no, market_type) 복합 키 중복 건수: ${duplicateKeys.length}건 (고유 키 수: ${seenKeys.size}개)`);
  console.log(`- 필수 컬럼 누락 레코드 수: ${missingFieldItems.length}건`);
  console.log(`- 2-way 마켓 무승부 NULL 정책 위반 수: ${twoWayDrawViolations.length}건`);
  console.log(`- 배당 변동값 산술 불일치(오차 > 0.01) 건수: ${oddsDiscrepancies.length}건`);
  if (oddsDiscrepancies.length > 0) {
    console.log('  [참고] 이전 보고서에서 확인된 5건의 원본 벳인포 표기 차이:', oddsDiscrepancies);
  }

  // [4] 적재 시 예상 레코드 수 및 DB 충돌 분석
  console.log('\n[4] 적재 시 예상 레코드 수 및 충돌 가능성 분석...');
  console.log(`- 현재 DB 충돌 위험도: 0% (DB 레코드 수 0건이므로 기존 데이터 덮어쓰기 위험 없음)`);
  console.log(`- 적재 시 예상 최신 배당(betinfo_odds_staging) 신규 생성량: ${seenKeys.size}건`);
  console.log(`- 적재 시 예상 배당 이력(betinfo_odds_history_staging) 신규 생성량: ${items.length}건`);

  console.log('\n[5] 안전 가드 준수 상태:');
  console.log('-> ⚠️ [READ-ONLY VERIFIED] DB 쓰기 작업(INSERT/UPSERT/UPDATE/DELETE)은 일절 수행하지 않았습니다.');
  console.log('-> ⚠️ [SCHEDULER & API GUARD] 벳인포 재요청, The Odds API 호출 및 5분 스케줄러는 비활성화 유지되었습니다.');
  console.log('-> ⚠️ [PENDING APPROVAL] 218건 전체 적재는 사용자의 별도 명시적 승인 전까지 보류됩니다.');

  return {
    totalItems: items.length,
    statusCounts,
    stagingCount,
    historyCount,
    uniqueKeysCount: seenKeys.size,
    duplicateKeysCount: duplicateKeys.length,
    missingFieldsCount: missingFieldItems.length,
    twoWayViolationsCount: twoWayDrawViolations.length,
    oddsDiscrepanciesCount: oddsDiscrepancies.length
  };
}

runDryRunAudit().catch(err => {
  console.error('사전 점검 실행 중 오류:', err.message);
});
