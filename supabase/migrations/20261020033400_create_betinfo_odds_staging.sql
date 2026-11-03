-- ==============================================================================
-- ODDSALGO — Supabase 벳인포 해외 평균 배당 테스트 테이블 DDL 스키마 (보안 강화 버전)
-- 마이그레이션 버전: 20261020033400_create_betinfo_odds_staging.sql
-- 테이블 A: betinfo_odds_staging (최신 배당 스테이징)
-- 테이블 B: betinfo_odds_history_staging (배당 변동 이력 스테이징)
-- ==============================================================================

-- 1. 최신 배당 테스트 테이블 (betinfo_odds_staging)
CREATE TABLE IF NOT EXISTS public.betinfo_odds_staging (
    id BIGSERIAL PRIMARY KEY,
    game_no INTEGER NOT NULL,
    market_type VARCHAR(32) NOT NULL,
    home_team VARCHAR(100) NOT NULL,
    away_team VARCHAR(100) NOT NULL,
    kickoff_at TIMESTAMPTZ,
    initial_home NUMERIC(6, 2),
    initial_draw NUMERIC(6, 2),
    initial_away NUMERIC(6, 2),
    current_home NUMERIC(6, 2),
    current_draw NUMERIC(6, 2),
    current_away NUMERIC(6, 2),
    change_home NUMERIC(6, 2),
    change_draw NUMERIC(6, 2),
    change_away NUMERIC(6, 2),
    status VARCHAR(20) NOT NULL CHECK (status IN ('OK', 'NOT_PROVIDED', 'PARSE_ERROR')),
    scraped_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 경기 번호와 마켓 유형의 복합 고유 키 (중복 저장 방지)
    CONSTRAINT uq_betinfo_odds_staging_game_market UNIQUE (game_no, market_type)
);

-- 최신 배당 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_betinfo_odds_staging_game_no 
    ON public.betinfo_odds_staging(game_no);
CREATE INDEX IF NOT EXISTS idx_betinfo_odds_staging_status 
    ON public.betinfo_odds_staging(status);
CREATE INDEX IF NOT EXISTS idx_betinfo_odds_staging_scraped_at 
    ON public.betinfo_odds_staging(scraped_at);


-- 2. 배당 이력 테스트 테이블 (betinfo_odds_history_staging)
CREATE TABLE IF NOT EXISTS public.betinfo_odds_history_staging (
    id BIGSERIAL PRIMARY KEY,
    game_no INTEGER NOT NULL,
    market_type VARCHAR(32) NOT NULL,
    home_team VARCHAR(100) NOT NULL,
    away_team VARCHAR(100) NOT NULL,
    kickoff_at TIMESTAMPTZ,
    initial_home NUMERIC(6, 2),
    initial_draw NUMERIC(6, 2),
    initial_away NUMERIC(6, 2),
    current_home NUMERIC(6, 2),
    current_draw NUMERIC(6, 2),
    current_away NUMERIC(6, 2),
    change_home NUMERIC(6, 2),
    change_draw NUMERIC(6, 2),
    change_away NUMERIC(6, 2),
    status VARCHAR(20) NOT NULL CHECK (status IN ('OK', 'NOT_PROVIDED', 'PARSE_ERROR')),
    scraped_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 동일 수집 시점의 중복 이력 반복 삽입 방지 멱등성 복합 키
    CONSTRAINT uq_betinfo_history_staging_idempotency UNIQUE (game_no, market_type, scraped_at)
);

-- 배당 이력 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_betinfo_history_staging_lookup 
    ON public.betinfo_odds_history_staging(game_no, market_type, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_betinfo_history_staging_recorded_at 
    ON public.betinfo_odds_history_staging(recorded_at);


-- ==============================================================================
-- 3. RLS (Row Level Security) 활성화 및 보안 격리 설정
-- ==============================================================================
ALTER TABLE public.betinfo_odds_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.betinfo_odds_history_staging ENABLE ROW LEVEL SECURITY;

-- 기존 불특정 다수 허용 정책(allow_select_staging, allow_select_history) 제거
DROP POLICY IF EXISTS allow_select_staging ON public.betinfo_odds_staging;
DROP POLICY IF EXISTS allow_select_history ON public.betinfo_odds_history_staging;

-- ==============================================================================
-- 4. 역할별 테이블 및 시퀀스 권한 설정
-- ==============================================================================
-- PUBLIC, anon, authenticated 역할의 모든 테이블 접근 권한 완전 박탈 (기본 차단)
REVOKE ALL ON TABLE public.betinfo_odds_staging FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.betinfo_odds_history_staging FROM PUBLIC, anon, authenticated;

-- BIGSERIAL 시퀀스에 대한 PUBLIC, anon, authenticated 권한 박탈
REVOKE ALL ON SEQUENCE public.betinfo_odds_staging_id_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.betinfo_odds_history_staging_id_seq FROM PUBLIC, anon, authenticated;

-- 서버 측 service_role 역할에 필요한 작업 권한 명시적 부여 (테이블)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.betinfo_odds_staging TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.betinfo_odds_history_staging TO service_role;

-- 서버 측 service_role 역할에 시퀀스 증가 및 조회를 위한 권한 부여 (시퀀스)
GRANT USAGE, SELECT ON SEQUENCE public.betinfo_odds_staging_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.betinfo_odds_history_staging_id_seq TO service_role;
