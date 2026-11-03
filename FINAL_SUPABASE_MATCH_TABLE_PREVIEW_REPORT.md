# ODDSALGO — Supabase 스테이징 데이터 기반 MatchTable 검증 미리보기 연동 최종 보고서

## 1. 개요 및 연동 요약

실제 Supabase 스테이징 테이블(`public.betinfo_odds_staging`)에 적재된 218건의 해외 평균 배당 데이터를 ODDSALGO의 **검증 미리보기 모드(`?round=122&verifiedPreview=true`)**에서 실시간으로 SELECT하여 MatchTable에 정상 연결 완료하였습니다.

- **원격 DB**: Supabase 개발 프로젝트 `zjqkhihtiiflpqitqdsl.supabase.co`
- **조회 대상 테이블**: `public.betinfo_odds_staging` (최신 배당 스테이징 테이블 단독 조회)
- **보안 격리**: `SUPABASE_SECRET_KEY`는 서버(`server.ts`) 내부에서만 사용되며, 브라우저 번들 및 클라이언트 API 응답에 일절 노출되지 않음
- **운영 격리**: `?round=122&verifiedPreview=true` 요청에서만 적용되며, 일반 `/api/matches` 운영 요청에는 0건 주입 (완전 격리 확인)

---

## 2. API 및 MatchTable 연동 검증 결과

실제 로컬 개발 서버 엔드포인트(`GET /api/matches?gameType=pt1&year=2026&round=122&verifiedPreview=true`) 호출 결과:

| 검증 항목 | 기대치 | 실제 API 응답 결과 | 판정 |
| :--- | :---: | :---: | :---: |
| **데이터 원천(Source)** | Supabase Staging | `supabase_staging` | **PASS** |
| **122회차 전체 경기 수** | 533경기 | 533경기 | **PASS** |
| **스테이징 연동 경기 수** | 218경기 | **218경기** | **PASS** |
| **정상 배당 표시 (`OK`)** | 40경기 | **40경기** | **PASS** |
| **원본 미제공 표시 (`NOT_PROVIDED`)** | 178경기 | **178경기** | **PASS** |
| **파싱 오류 (`PARSE_ERROR`)** | 0경기 | **0경기** | **PASS** |
| **매칭 오류 (`MATCH_ERROR`)** | 0경기 | **0경기** | **PASS** |
| **운영 모드 격리 (Round 106 조회 시)** | 0건 주입 | **0건 주입 (완전 격리)** | **PASS** |

---

## 3. 대표 레코드 화면 렌더링 및 필드 대조

| 경기번호 | 대진 | 마켓 구분 | 원천 | 상태 | 해외 배당 (홈/무/원) | 배당 변동값 | 화면 표시 상태 |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **#8391** | BG빠툼유 vs 애들유나 | 일반 | Supabase | `OK` | 2.32 / 3.70 / 2.63 | +0.49 / +0.23 / -1.27 | 해외 평균 배당 LIVE 표시 |
| **#8392** | BG빠툼유 vs 애들유나 | 핸디캡 (H -1.0) | Supabase | `NOT_PROVIDED` | - / - / - | - / - / - | **- (미제공)** |
| **#8393** | BG빠툼유 vs 애들유나 | 언더오버 (U 2.5) | Supabase | `NOT_PROVIDED` | - / - / - | - / - / - | **- (미제공)** |
| **#8395** | 탬피로버 vs 마치다Z | 일반 | Supabase | `OK` | 7.68 / 5.27 / 1.31 | +1.09 / +0.83 / -0.08 | 해외 평균 배당 LIVE 표시 |
| **#8399** | 쿠칭시티 vs 킷치SC | 일반 | Supabase | `OK` | 1.59 / 4.33 / 4.58 | -0.24 / +0.74 / +0.87 | 해외 평균 배당 LIVE 표시 |
| **#8426** | KAA헨트 vs 오르후스 | 일반 | Supabase | `OK` | 1.61 / 4.03 / 5.08 | +0.03 / -0.22 / -0.23 | 해외 평균 배당 LIVE 표시 |
| **#8413** | 클리가디 vs 탬파레이 | 일반 (MLB 2-Way) | Supabase | `OK` | 1.77 / **null** / 2.09 | +0.01 / **null** / +0.01 | 무승부 제외 2-Way 정상 표시 |

- **미제공 178건 처리**: `foreign: undefined`, `foreignStatus: 'UNAVAILABLE'`, `foreignSourceName: '해외 평균 배당 (원본 미제공)'`으로 설정되어 배당 슬롯에 대시(`-`) 및 미제공 툴팁이 정확히 노출됨.
- **수집 시각 보존**: `scraped_at`은 적재 시각이 아닌 원본 수집 시각(`2026-10-15T19:48:23.279+00:00`)이 일관되게 전달됨.
- **리그 및 핸디캡 기준점 보존**: DB 스키마에 부재한 `league`나 기준점은 기존 경기 데이터의 값을 100% 온전하게 보존.

---

## 4. 안전 조건 준수 확인

- [x] **DML 작업 0건**: INSERT, UPDATE, DELETE 및 DDL 미실행 (순수 SELECT 읽기 전용)
- [x] **외부 API 호출 0건**: 벳인포 재요청 및 The Odds API 신규 호출 차단
- [x] **자동 수집 스케줄러 미실행**: 5분 주기 스케줄러 비활성화 유지
- [x] **운영 데이터 보호**: 운영 테이블, 일반 `/api/matches` 운영 응답 및 EV 엔진 불변
- [x] **Secret Key 보호**: 클라이언트 및 공개 API 응답에 비밀 키 미노출
- [x] **TypeScript 빌드 및 린트**: `compile_applet` 빌드 성공 및 `tsc --noEmit` 린트 통과
