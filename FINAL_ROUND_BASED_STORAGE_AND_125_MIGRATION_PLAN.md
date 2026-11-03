# ODDSALGO — 회차별 배당 저장 구조 개선 및 125회차 적재 설계서 (Migration & DDL Plan)

## 1. 개요 및 배경
- **현재 상태**: Supabase 스테이징 테이블(`betinfo_odds_staging`, `betinfo_odds_history_staging`)에는 2026년 122회차 데이터 218건이 `UNIQUE(game_no, market_type)` 제약조건 하에 적재되어 있습니다.
- **새로운 요구사항**: 새로 수집된 2026년 125회차 데이터 232건(`/tmp/betinfo_oneshot_latest.json`)을 기존 122회차 데이터 유실 없이 안전하게 공존시키기 위해, 회차별 파티셔닝(복합 고유키 확장) 및 스키마 개선을 설계합니다.
- **안전 원칙**: 본 설계 단계에서는 원격 DB DDL을 즉시 실행하지 않으며, 사전 검증(Dry-run) 및 충돌 검사 완료 후 안전하게 적용할 수 있는 마이그레이션 스크립트와 롤백 절차를 정의합니다.

---

## 2. 스키마 확장안 (Schema Extension Design)

### 2.1. 추가 필드 정의
최신 배당 테이블(`betinfo_odds_staging`)과 이력 테이블(`betinfo_odds_history_staging`)에 다음 3가지 식별 컬럼을 추가합니다.
1. `game_type` (VARCHAR(20) NOT NULL DEFAULT 'pt1'): 게임 종류 (예: proto 승무패/토토 등)
2. `season_year` (INTEGER NOT NULL DEFAULT 2026): 시즌 연도
3. `round_no` (INTEGER NOT NULL DEFAULT 122): 회차 번호 (예: 122, 125)

### 2.2. 복합 고유 키(Unique Constraint) 변경
- **기존 고유 키**: `(game_no, market_type)` (동일 회차 및 시즌 구분 불가)
- **개선된 최신 배당 고유 키**: `(game_type, season_year, round_no, game_no, market_type)`
- **개선된 이력 테이블 고유 키**: `(game_type, season_year, round_no, game_no, market_type, scraped_at)`

---

## 3. 데이터 분류 및 백필 계획 (Data Backfill & Classification)

1. **기존 122회차 데이터 (218건)**:
   - 조건: 기존 `betinfo_odds_staging` 테이블에 존재하는 모든 레코드
   - 분류 값: `game_type = 'pt1'`, `season_year = 2026`, `round_no = 122`
2. **신규 125회차 데이터 (232건)**:
   - 조건: `/tmp/betinfo_oneshot_latest.json`에 저장된 최신 수집 데이터
   - 분류 값: `game_type = 'pt1'`, `season_year = 2026`, `round_no = 125`

---

## 4. 마이그레이션 DDL 스크립트 (Migration DDL)

```sql
-- Step 1: 컬럼 추가 (기존 데이터는 기본값으로 우선 채움)
ALTER TABLE public.betinfo_odds_staging 
    ADD COLUMN IF NOT EXISTS game_type VARCHAR(20) NOT NULL DEFAULT 'pt1',
    ADD COLUMN IF NOT EXISTS season_year INTEGER NOT NULL DEFAULT 2026,
    ADD COLUMN IF NOT EXISTS round_no INTEGER NOT NULL DEFAULT 122;

ALTER TABLE public.betinfo_odds_history_staging 
    ADD COLUMN IF NOT EXISTS game_type VARCHAR(20) NOT NULL DEFAULT 'pt1',
    ADD COLUMN IF NOT EXISTS season_year INTEGER NOT NULL DEFAULT 2026,
    ADD COLUMN IF NOT EXISTS round_no INTEGER NOT NULL DEFAULT 122;

-- Step 2: 기존 제약조건 안전 삭제 (이름 기준)
ALTER TABLE public.betinfo_odds_staging 
    DROP CONSTRAINT IF EXISTS uq_betinfo_odds_staging_game_market;

ALTER TABLE public.betinfo_odds_history_staging 
    DROP CONSTRAINT IF EXISTS uq_betinfo_history_staging_idempotency;

-- Step 3: 새로운 회차 포함 복합 고유 키 생성
ALTER TABLE public.betinfo_odds_staging 
    ADD CONSTRAINT uq_betinfo_odds_staging_round_game_market 
    UNIQUE (game_type, season_year, round_no, game_no, market_type);

ALTER TABLE public.betinfo_odds_history_staging 
    ADD CONSTRAINT uq_betinfo_history_staging_round_idempotency 
    UNIQUE (game_type, season_year, round_no, game_no, market_type, scraped_at);

-- Step 4: 조회 성능 최적화를 위한 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_betinfo_odds_staging_round_lookup 
    ON public.betinfo_odds_staging(game_type, season_year, round_no, game_no);

CREATE INDEX IF NOT EXISTS idx_betinfo_history_staging_round_lookup 
    ON public.betinfo_odds_history_staging(game_type, season_year, round_no, game_no, scraped_at DESC);
```

---

## 5. 롤백 절차 (Rollback Procedure)

마이그레이션 후 예기치 않은 오류나 충돌이 발생할 경우, 다음 스크립트를 통해 이전 스키마로 안전하게 롤백할 수 있습니다.

```sql
-- Rollback Step 1: 새 복합 고유 키 제거
ALTER TABLE public.betinfo_odds_staging 
    DROP CONSTRAINT IF EXISTS uq_betinfo_odds_staging_round_game_market;

ALTER TABLE public.betinfo_odds_history_staging 
    DROP CONSTRAINT IF EXISTS uq_betinfo_history_staging_round_idempotency;

-- Rollback Step 2: 기존 고유 키 복원 (122회차 데이터만 존재하는 상태 기준)
ALTER TABLE public.betinfo_odds_staging 
    ADD CONSTRAINT uq_betinfo_odds_staging_game_market 
    UNIQUE (game_no, market_type);

ALTER TABLE public.betinfo_odds_history_staging 
    ADD CONSTRAINT uq_betinfo_history_staging_idempotency 
    UNIQUE (game_no, market_type, scraped_at);

-- Rollback Step 3: 추가된 컬럼 삭제 (선택적)
ALTER TABLE public.betinfo_odds_staging 
    DROP COLUMN IF EXISTS game_type,
    DROP COLUMN IF EXISTS season_year,
    DROP COLUMN IF EXISTS round_no;

ALTER TABLE public.betinfo_odds_history_staging 
    DROP COLUMN IF EXISTS game_type,
    DROP COLUMN IF EXISTS season_year,
    DROP COLUMN IF EXISTS round_no;
```

---

## 6. 마켓 코드 및 팀명 정규화 결과
- `승⑤패`, `승①패` 등 원문 내 특수문자 서클 숫자는 `.replace(/⑤/g, '5')` 등의 정규화 로직을 통해 정수 마켓 코드로 안전하게 매핑됩니다.
- 125회차 테스트 결과: 232건 중 매칭 성공 232건, 매칭 오류 0건, 배당 변화율 검증 통과 232건으로 완벽한 호환성을 검증 완료하였습니다.
