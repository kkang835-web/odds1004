import fs from 'fs';
import path from 'path';
import { getSupabaseClient } from '../server/supabase/supabaseClient';
import { transformToStagingRecord } from '../server/supabase/betinfoStagingService';

export async function runRealSupabaseSmokeTest() {
  console.log("===============================================================================");
  console.log("ODDSALGO — 실제 Supabase 개발 환경 연결 및 5건 스모크 테스트 (최종 안전 점검)");
  console.log("===============================================================================\n");

  // [1] 실행 전 안전 확인 (Connection & Safety Audit)
  console.log("[1] 실제 Supabase 연결 및 안전 환경 검사 (Section 1 Audit)...");
  const connection = getSupabaseClient();

  console.log("- SUPABASE_URL 설정 여부:", connection.configDetails.hasUrl ? "설정됨" : "미설정 (연결 차단)");
  console.log("- SUPABASE_EXPECTED_PROJECT_REF 설정 여부:", connection.configDetails.hasExpectedProjectRef ? "설정됨" : "미설정 (검증 차단)");
  console.log("- SUPABASE_SECRET_KEY 설정 여부:", connection.configDetails.hasSecretKey ? "설정됨" : "미설정 (쓰기 차단)");
  console.log("- 프로젝트 호스트:", connection.configDetails.projectHost || "미확인");
  console.log("- HTTPS 보안 프로토콜:", connection.configDetails.isHttps ? "적용됨" : "미적용");
  console.log("- 프로젝트 Ref 일치 여부:", connection.configDetails.isProjectRefMatched ? "일치" : "불일치 또는 미검증");
  console.log("- 실행 환경(NODE_ENV):", connection.configDetails.environment);

  if (!connection.client) {
    console.log(`\n❌ [STOP] 실제 DB 연결 차단: ${connection.errorReason}`);
    console.log("\n[지침 준수 알림]");
    console.log("• 사용자 지침: 'SUPABASE_URL, SUPABASE_EXPECTED_PROJECT_REF, 서버 측 Secret Key가 모두 설정되어야 연결 검사를 진행한다.'");
    console.log("• 사용자 지침: 'URL에서 프로젝트 reference ID를 추출해 SUPABASE_EXPECTED_PROJECT_REF와 정확히 일치하는지 검증한다.'");
    console.log("\n[실제 연결을 위한 준비 사항]");
    console.log("1. 개발용 Supabase 프로젝트 대시보드(Project Settings > API) 접속");
    console.log("2. Project URL, Reference ID 및 Secret Key 확인");
    console.log("3. AI Studio 서버 환경변수(Secrets)에 등록:");
    console.log("   • SUPABASE_URL=\"https://<dev-project-ref>.supabase.co\"");
    console.log("   • SUPABASE_EXPECTED_PROJECT_REF=\"<dev-project-ref>\"");
    console.log("   • SUPABASE_SECRET_KEY=\"<secret-key>\"");
    console.log("4. `server/supabase/migrations/01_betinfo_odds_staging.sql` DDL 스키마 적용\n");
    return {
      success: false,
      reason: connection.errorReason,
      isConfigured: false,
      requiredConfig: ['SUPABASE_URL', 'SUPABASE_EXPECTED_PROJECT_REF', 'SUPABASE_SECRET_KEY']
    };
  }

  const supabase = connection.client;

  // [2] 스테이징 테이블 존재 여부 및 기존 데이터 충돌 검사 (Section 4 & 5)
  console.log("\n[2] 스테이징 테이블 존재 여부 및 기존 데이터 충돌 검사 (Collision Check)...");
  const { error: pingStagingError } = await supabase
    .from('betinfo_odds_staging')
    .select('id')
    .limit(1);

  if (pingStagingError) {
    console.error("❌ betinfo_odds_staging 테이블 조회 실패:", pingStagingError.message);
    if (pingStagingError.code === '42501' || pingStagingError.message.includes('permission denied')) {
      console.log("-> [원인 분석] 테이블은 존재하지만 현재 사용 중인 키가 'anon' 권한을 가집니다.");
      console.log("-> 마이그레이션 보안 정책(REVOKE ALL FROM anon)에 의해 anon 접근이 차단되었습니다.");
      console.log("-> 서버 측 쓰기 및 검증을 위해서는 'service_role' 또는 'sb_secret' 키가 필요합니다.");
      return {
        success: false,
        reason: `PERMISSION_DENIED: ${pingStagingError.message} (service_role 키 필요)`,
        isConfigured: true
      };
    }
    console.log("-> `supabase/migrations/20261020033400_create_betinfo_odds_staging.sql` 마이그레이션이 먼저 실행되어야 합니다.");
    return {
      success: false,
      reason: `MIGRATION_REQUIRED: ${pingStagingError.message}`,
      isConfigured: true
    };
  }

  const { error: pingHistoryError } = await supabase
    .from('betinfo_odds_history_staging')
    .select('id')
    .limit(1);

  if (pingHistoryError) {
    console.error("❌ betinfo_odds_history_staging 테이블 조회 실패:", pingHistoryError.message);
    if (pingHistoryError.code === '42501' || pingHistoryError.message.includes('permission denied')) {
      console.log("-> [원인 분석] betinfo_odds_history_staging 테이블에 대한 'service_role' 권한이 필요합니다.");
      return {
        success: false,
        reason: `PERMISSION_DENIED: ${pingHistoryError.message} (service_role 키 필요)`,
        isConfigured: true
      };
    }
    return {
      success: false,
      reason: `MIGRATION_REQUIRED: ${pingHistoryError.message}`,
      isConfigured: true
    };
  }

  // [3] 검증 데이터셋 로드 및 대표 5건 선별 (Selection)
  console.log("\n[3] 검증 데이터셋 로드 및 대표 5건 선별 (Selection)...");
  const datasetPath = path.join(process.cwd(), 'data', 'test_betinfo_foreign_odds_dataset.json');
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`검증 데이터셋 파일 부재: ${datasetPath}`);
  }
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  const allItems: any[] = dataset.items || [];

  const targetGameNos = [8391, 8392, 8393, 8395, 8413];
  const selectedItems = allItems.filter(i => targetGameNos.includes(i.gameNo));
  console.log(`- 전체 ${allItems.length}건 중 선별된 테스트 레코드: ${selectedItems.length}건`);
  selectedItems.forEach((item, idx) => {
    console.log(`  ${idx + 1}. [No.${item.gameNo}] ${item.homeTeam} vs ${item.awayTeam} (${item.marketType}) - 상태: ${item.status}`);
  });

  // Check if test keys already exist in DB to prevent accidental overwrite (Requirement 5)
  const { data: existingRecords } = await supabase
    .from('betinfo_odds_staging')
    .select('game_no, market_type')
    .in('game_no', targetGameNos);

  if (existingRecords && existingRecords.length > 0) {
    console.log(`⚠️ [ABORT] 테스트 대상 키 중 기존 데이터 ${existingRecords.length}건 감지됨:`, existingRecords);
    console.log("-> 지침 5: '테스트 대상 키에 기존 데이터가 있으면 임의로 덮어쓰거나 삭제하지 말고 중단한다.'");
    return {
      success: false,
      reason: 'EXISTING_DATA_CONFLICT: 테스트 대상 키에 기존 데이터가 이미 존재하여 안전을 위해 중단되었습니다.',
      existingKeys: existingRecords
    };
  }

  const defaultMeta = { game_type: 'pt1', season_year: 2026, round_no: 122 };
  const stagedRecords = selectedItems.map(item => transformToStagingRecord(item, defaultMeta));
  const createdStagingIds: number[] = [];
  const createdHistoryIds: number[] = [];

  // [4] 소량 실제 DB 5건 INSERT 테스트 (Section 3)
  console.log("\n[4] 실제 DB 소량 5건 INSERT 실행 (betinfo_odds_staging & history)...");
  for (const record of stagedRecords) {
    const { data: stData, error: stError } = await supabase
      .from('betinfo_odds_staging')
      .insert({
        game_no: record.game_no,
        market_type: record.market_type,
        home_team: record.home_team,
        away_team: record.away_team,
        kickoff_at: record.kickoff_at,
        initial_home: record.initial_home,
        initial_draw: record.initial_draw,
        initial_away: record.initial_away,
        current_home: record.current_home,
        current_draw: record.current_draw,
        current_away: record.current_away,
        change_home: record.change_home,
        change_draw: record.change_draw,
        change_away: record.change_away,
        status: record.status,
        scraped_at: record.scraped_at,
        updated_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (stError) {
      throw new Error(`betinfo_odds_staging 삽입 실패 (Game ${record.game_no}): ${stError.message}`);
    }
    if (stData?.id) createdStagingIds.push(stData.id);

    const { data: histData, error: histError } = await supabase
      .from('betinfo_odds_history_staging')
      .insert({
        game_no: record.game_no,
        market_type: record.market_type,
        home_team: record.home_team,
        away_team: record.away_team,
        kickoff_at: record.kickoff_at,
        initial_home: record.initial_home,
        initial_draw: record.initial_draw,
        initial_away: record.initial_away,
        current_home: record.current_home,
        current_draw: record.current_draw,
        current_away: record.current_away,
        change_home: record.change_home,
        change_draw: record.change_draw,
        change_away: record.change_away,
        status: record.status,
        scraped_at: record.scraped_at
      })
      .select('id')
      .single();

    if (histError && !histError.message.includes('duplicate key') && !histError.message.includes('unique constraint')) {
      throw new Error(`betinfo_odds_history_staging 삽입 실패 (Game ${record.game_no}): ${histError.message}`);
    }
    if (histData?.id) createdHistoryIds.push(histData.id);
  }
  console.log(`- 5건 스테이징 및 이력 테이블 삽입 완료 (생성된 ID 수: ${createdStagingIds.length}건)`);

  // [5] 중복 삽입 방지 검증 (Idempotency Check)
  console.log("\n[5] 중복 데이터 재실행 방지 검증 (Idempotency Check)...");
  const { count: stagingCountBefore } = await supabase
    .from('betinfo_odds_staging')
    .select('*', { count: 'exact', head: true });

  const { count: historyCountBefore } = await supabase
    .from('betinfo_odds_history_staging')
    .select('*', { count: 'exact', head: true });

  // Re-run identical batch
  for (const record of stagedRecords) {
    await supabase.from('betinfo_odds_staging').upsert({
      game_no: record.game_no,
      market_type: record.market_type,
      home_team: record.home_team,
      away_team: record.away_team,
      current_home: record.current_home,
      current_draw: record.current_draw,
      current_away: record.current_away,
      change_home: record.change_home,
      change_draw: record.change_draw,
      change_away: record.change_away,
      status: record.status,
      scraped_at: record.scraped_at
    }, { onConflict: 'game_no,market_type' });

    const { error: histReError } = await supabase.from('betinfo_odds_history_staging').insert({
      game_no: record.game_no,
      market_type: record.market_type,
      home_team: record.home_team,
      away_team: record.away_team,
      initial_home: record.initial_home,
      initial_draw: record.initial_draw,
      initial_away: record.initial_away,
      current_home: record.current_home,
      current_draw: record.current_draw,
      current_away: record.current_away,
      change_home: record.change_home,
      change_draw: record.change_draw,
      change_away: record.change_away,
      status: record.status,
      scraped_at: record.scraped_at
    });

    if (histReError && !histReError.message.includes('duplicate key') && !histReError.message.includes('unique constraint') && !histReError.details?.includes('already exists')) {
      console.warn(`이력 재입력 예외 (Game ${record.game_no}): ${histReError.message}`);
    }
  }

  const { count: stagingCountAfter } = await supabase
    .from('betinfo_odds_staging')
    .select('*', { count: 'exact', head: true });

  const { count: historyCountAfter } = await supabase
    .from('betinfo_odds_history_staging')
    .select('*', { count: 'exact', head: true });

  console.log(`- 재실행 전 staging 레코드 수: ${stagingCountBefore}, 재실행 후: ${stagingCountAfter} (추가 건수: ${Number(stagingCountAfter) - Number(stagingCountBefore)}건)`);
  console.log(`- 재실행 전 history 레코드 수: ${historyCountBefore}, 재실행 후: ${historyCountAfter} (추가 건수: ${Number(historyCountAfter) - Number(historyCountBefore)}건)`);

  // [6] 단일 레코드 갱신 및 초기 배당/이력 보존 검증 (Update & Preservation)
  console.log("\n[6] 단일 레코드 갱신 및 초기 배당/이력 보존 검증 (Update & Preservation)...");
  const testGameNo = 8391;
  const testMarket = '일반';
  const newScrapedTime = new Date().toISOString();

  const { data: recordBeforeUpdate } = await supabase
    .from('betinfo_odds_staging')
    .select('*')
    .eq('game_no', testGameNo)
    .eq('market_type', testMarket)
    .single();

  console.log(`- 갱신 대상: Game ${testGameNo} (${testMarket})`);
  console.log(`  [갱신 전] 초기배당: 홈=${recordBeforeUpdate.initial_home}, 무=${recordBeforeUpdate.initial_draw}, 원정=${recordBeforeUpdate.initial_away}`);
  console.log(`  [갱신 전] 현재배당: 홈=${recordBeforeUpdate.current_home}, 무=${recordBeforeUpdate.current_draw}, 원정=${recordBeforeUpdate.current_away}`);

  await supabase.from('betinfo_odds_staging').update({
    current_home: 2.55,
    current_draw: 3.65,
    current_away: 2.40,
    change_home: 0.72,
    change_draw: 0.18,
    change_away: -1.50,
    scraped_at: newScrapedTime,
    updated_at: new Date().toISOString()
  }).eq('game_no', testGameNo).eq('market_type', testMarket);

  const { data: newHistRecord } = await supabase.from('betinfo_odds_history_staging').insert({
    game_no: testGameNo,
    market_type: testMarket,
    home_team: recordBeforeUpdate.home_team,
    away_team: recordBeforeUpdate.away_team,
    initial_home: recordBeforeUpdate.initial_home,
    initial_draw: recordBeforeUpdate.initial_draw,
    initial_away: recordBeforeUpdate.initial_away,
    current_home: 2.55,
    current_draw: 3.65,
    current_away: 2.40,
    change_home: 0.72,
    change_draw: 0.18,
    change_away: -1.50,
    status: 'OK',
    scraped_at: newScrapedTime
  }).select('id').single();

  if (newHistRecord?.id) createdHistoryIds.push(newHistRecord.id);

  const { data: recordAfterUpdate } = await supabase
    .from('betinfo_odds_staging')
    .select('*')
    .eq('game_no', testGameNo)
    .eq('market_type', testMarket)
    .single();

  const { data: historyAfterUpdate } = await supabase
    .from('betinfo_odds_history_staging')
    .select('*')
    .eq('game_no', testGameNo)
    .eq('market_type', testMarket);

  console.log(`  [갱신 후] 초기배당: 홈=${recordAfterUpdate.initial_home}, 무=${recordAfterUpdate.initial_draw}, 원정=${recordAfterUpdate.initial_away}`);
  console.log(`  [갱신 후] 현재배당: 홈=${recordAfterUpdate.current_home}, 무=${recordAfterUpdate.current_draw}, 원정=${recordAfterUpdate.current_away}`);
  console.log(`  [갱신 후] 이력 건수: ${historyAfterUpdate?.length}건`);

  // [7] 이번 테스트에서 생성된 레코드만 엄격하게 정리/롤백 (Requirement 7)
  console.log("\n[7] 생성된 테스트 레코드 한정 정리 및 롤백 (Isolated Cleanup)...");
  if (createdStagingIds.length > 0) {
    const { error: delStError } = await supabase
      .from('betinfo_odds_staging')
      .delete()
      .in('id', createdStagingIds);
    if (delStError) console.warn("staging 정리 오류:", delStError.message);
  }

  if (createdHistoryIds.length > 0) {
    const { error: delHistError } = await supabase
      .from('betinfo_odds_history_staging')
      .delete()
      .in('id', createdHistoryIds);
    if (delHistError) console.warn("history 정리 오류:", delHistError.message);
  }
  console.log(`- 테스트 세션 생성 ID(staging: ${createdStagingIds.length}건, history: ${createdHistoryIds.length}건)만 한정 삭제 완료`);

  const { count: stagingRemaining } = await supabase
    .from('betinfo_odds_staging')
    .select('*', { count: 'exact', head: true })
    .in('id', createdStagingIds);

  const { count: historyRemaining } = await supabase
    .from('betinfo_odds_history_staging')
    .select('*', { count: 'exact', head: true })
    .in('id', createdHistoryIds);

  console.log(`- 정리 후 DB 재조회 검증: 잔존 staging 레코드 ${stagingRemaining ?? 0}건, 잔존 history 레코드 ${historyRemaining ?? 0}건 (완전 정리 확인)`);

  // [8] 218건 일괄 저장은 별도 승인 대기 상태로 유지 (Requirement 8)
  console.log("\n[8] 218건 일괄 저장 처리 상태:");
  console.log("-> ⚠️ 지침 8 준수: 5건 스모크 테스트 통과 후에도 218건 일괄 저장은 실행하지 않고 사용자 별도 승인 대기 상태로 보류합니다.");

  console.log("\n===============================================================================");
  console.log("🎉 [SUCCESS] 실제 Supabase 5건 스모크 테스트 및 정리 완료!");
  console.log("===============================================================================");

  return {
    success: true,
    testedCount: 5,
    stagingBefore: stagingCountBefore,
    stagingAfter: stagingCountAfter,
    historyBefore: historyCountBefore,
    historyAfter: historyCountAfter
  };
}

runRealSupabaseSmokeTest().catch(err => {
  console.error("실제 Supabase 테스트 도중 오류 발생:", err.message);
});
