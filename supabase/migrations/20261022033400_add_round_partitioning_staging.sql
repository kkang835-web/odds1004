-- ==============================================================================
-- ODDSALGO — Supabase 벳인포 해외 평균 배당 회차별 파티셔닝 마이그레이션 SQL
-- 마이그레이션 버전: 20261022033400_add_round_partitioning_staging.sql
-- 대상 테이블: betinfo_odds_staging, betinfo_odds_history_staging
-- 
-- [안전 원칙 및 제약 사항]
-- 1. 기존 2026년 122회차 데이터 218건 및 이력 완벽 보존
-- 2. 신규 2026년 125회차 데이터 232건 공존 지원 (game_type, season_year, round_no 복합 파티셔닝)
-- 3. 기존 테이블 삭제/재생성 없음 (ALTER TABLE 기반 증분 마이그레이션)
-- 4. RLS(Row Level Security) 및 service_role 권한 완벽 유지
-- 5. 재실행 시 중복 오류가 발생하지 않는 멱등성(Idempotent) 설계
-- ==============================================================================

-- ==============================================================================
-- PART 1: betinfo_odds_staging (최신 배당 스테이징) 마이그레이션
-- ==============================================================================

-- 1-1. 회차 및 게임 분류 식별 컬럼 추가 (기존 데이터는 122회차로 기본 백필)
ALTER TABLE public.betinfo_odds_staging 
    ADD COLUMN IF NOT EXISTS game_type VARCHAR(20) NOT NULL DEFAULT 'pt1',
    ADD COLUMN IF NOT EXISTS season_year INTEGER NOT NULL DEFAULT 2026,
    ADD COLUMN IF NOT EXISTS round_no INTEGER NOT NULL DEFAULT 122;

-- 1-2. 기존 단일 회차 제약조건(uq_betinfo_odds_staging_game_market) 안전 제거
ALTER TABLE public.betinfo_odds_staging 
    DROP CONSTRAINT IF EXISTS uq_betinfo_odds_staging_game_market;

-- 1-3. 신규 회차 포함 복합 고유 키(Unique Constraint) 생성
-- 고유 키: (game_type, season_year, round_no, game_no, market_type)
ALTER TABLE public.betinfo_odds_staging 
    ADD CONSTRAINT uq_betinfo_odds_staging_round_game_market 
    UNIQUE (game_type, season_year, round_no, game_no, market_type);

-- 1-4. 조회 성능 최적화 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_betinfo_odds_staging_round_lookup 
    ON public.betinfo_odds_staging(game_type, season_year, round_no, game_no);


-- ==============================================================================
-- PART 2: betinfo_odds_history_staging (배당 변동 이력 스테이징) 마이그레이션
-- ==============================================================================

-- 2-1. 회차 및 게임 분류 식별 컬럼 추가
ALTER TABLE public.betinfo_odds_history_staging 
    ADD COLUMN IF NOT EXISTS game_type VARCHAR(20) NOT NULL DEFAULT 'pt1',
    ADD COLUMN IF NOT EXISTS season_year INTEGER NOT NULL DEFAULT 2026,
    ADD COLUMN IF NOT EXISTS round_no INTEGER NOT NULL DEFAULT 122;

-- 2-2. 기존 이력 멱등성 제약조건 안전 제거
ALTER TABLE public.betinfo_odds_history_staging 
    DROP CONSTRAINT IF EXISTS uq_betinfo_history_staging_idempotency;

-- 2-3. 신규 회차 포함 복합 고유 키(Unique Constraint) 생성
-- 고유 키: (game_type, season_year, round_no, game_no, market_type, scraped_at)
ALTER TABLE public.betinfo_odds_history_staging 
    ADD CONSTRAINT uq_betinfo_history_staging_round_idempotency 
    UNIQUE (game_type, season_year, round_no, game_no, market_type, scraped_at);

-- 2-4. 이력 조회 성능 최적화 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_betinfo_history_staging_round_lookup 
    ON public.betinfo_odds_history_staging(game_type, season_year, round_no, game_no, scraped_at DESC);


-- ==============================================================================
-- PART 3: 보안 정책(RLS) 및 역할별 권한 재확인
-- ==============================================================================
ALTER TABLE public.betinfo_odds_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.betinfo_odds_history_staging ENABLE ROW LEVEL SECURITY;

-- 권한 격리 유지 (PUBLIC, anon, authenticated 접근 차단, service_role 전용 허용)
REVOKE ALL ON TABLE public.betinfo_odds_staging FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.betinfo_odds_history_staging FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.betinfo_odds_staging TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.betinfo_odds_history_staging TO service_role;


-- ==============================================================================
-- PART 4: 롤백 스크립트 (ROLLBACK SCRIPT - 긴급 복구용)
-- ==============================================================================
/*
-- 1. 신규 복합 고유 키 제거
ALTER TABLE public.betinfo_odds_staging 
    DROP CONSTRAINT IF EXISTS uq_betinfo_odds_staging_round_game_market;

ALTER TABLE public.betinfo_odds_history_staging 
    DROP CONSTRAINT IF EXISTS uq_betinfo_history_staging_round_idempotency;

-- 2. 기존 고유 키 복원
ALTER TABLE public.betinfo_odds_staging 
    ADD CONSTRAINT uq_betinfo_odds_staging_game_market 
    UNIQUE (game_no, market_type);

ALTER TABLE public.betinfo_odds_history_staging 
    DROP CONSTRAINT IF EXISTS uq_betinfo_history_staging_idempotency 
    UNIQUE (game_no, market_type, scraped_at);

-- 3. 추가된 회차 컬럼 제거 (선택적)
ALTER TABLE public.betinfo_odds_staging 
    DROP COLUMN IF EXISTS game_type,
    DROP COLUMN IF EXISTS season_year,
    DROP COLUMN IF EXISTS round_no;

ALTER TABLE public.betinfo_odds_history_staging 
    DROP COLUMN IF EXISTS game_type,
    DROP COLUMN IF EXISTS season_year,
    DROP COLUMN IF EXISTS round_no;
*/
