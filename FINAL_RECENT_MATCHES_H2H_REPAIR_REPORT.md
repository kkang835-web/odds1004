# SPORTSQUANT PRO — FINAL RECENT MATCHES & H2H REPAIR REPORT

**Audit & Fix Completion Date**: 2026-10-01  
**Target Platform**: Recent 5 Matches (`RecentMatchesTabView.tsx`), H2H (`H2HTabView.tsx`), Server History Extractor (`server/realMatchHistoryExtractor.ts`)  
**Status**: REPAIR_VERIFIED_AND_PASSED  

---

## 1. 개요 및 핵심 원칙 준수

1. **실제 데이터 원칙 (`missing != 0`)**:
   - 경기 기록이 없는 경우 `0승 0무 0패`나 `0.0득점 / 0.0실점`으로 표시하던 왜곡을 전면 수정하였습니다.
   - 데이터 미수집 상태는 `'-'` 또는 `UNKNOWN (수집 대기)` 상태로 렌더링됩니다.
2. **실제 경기 목록 렌더링**:
   - 단순 aggregate 요약 숫자만 출력하는 대신, 실제 개별 경기 목록(경기 일자, 상대팀명, 홈/원정 여부, 실제 스코어, 승무패 결과, 대회명, 출처)을 모바일 스와이프 카드 및 PC 고밀도 테이블로 표시합니다.
3. **Aggregate 지표의 재계산**:
   - 총 득점, 총 실점, 평균 득점, 평균 실점, 득실 마진, 승률, 연승/연패 스트릭은 하드코딩되지 않고 실제 경기 레코드 배열에서 즉시 동적 재계산됩니다.
4. **Recent Form과 H2H의 완전 분리**:
   - Recent Form(각 팀의 최근 5경기)과 H2H(양 팀 간의 최근 맞대결)가 서로의 데이터를 오염시키거나 재사용하지 않도록 독립 분리하였습니다.
5. **날짜 필터 및 중복 차단**:
   - 대상 경기 시작 시점 이전(`gameDate < targetDate`)의 종료 경기만 필터링하여 포함합니다.

---

## 2. 세부 구현 내역

### 2.1. Backend 실데이터 검색 엔진 (`server/realMatchHistoryExtractor.ts`)
- `data/realProtoHistoricalDataset.json` (4,877경기) 및 `data/protoRealWalkForwardV1.json` (1,802경기)의 실전 검증 완료 데이터셋을 인덱싱.
- 팀명 정규화(`normalizeTeam`) 및 접두어 매칭(`matchTeamName`)을 통해 팀 표기 차이(예: "LG" ↔ "LG트윈스", "토론토" ↔ "토론블루")를 해결.
- 시드 기반 가짜 스코어 생성기(`generateConsistentH2HAndStandings`)를 대체하여, 실데이터가 존재할 때만 실제 경기 객체를 추출하고 없는 경우 `hasData = false`, `dataSource = 'unavailable'`을 반환.

### 2.2. `RecentMatchesTabView.tsx` 수정
- `computeSafeSummary` 함수에서 `played === 0`일 때 `avgScored`, `avgConceded`, `diffStr`, `streak`를 `'-'`로 처리.
- `matches.length === 0`인 경우 `최근 경기 기록 없음 (데이터 수집 대기)` 안내 배너를 출력.
- `matches.length > 0`일 때 실제 스코어(`scoreFor`, `scoreAgainst`), 상대팀, 홈/원정, 대회명을 렌더링.

### 2.3. `H2HTabView.tsx` 수정
- `totalMatches === 0`일 때 `homeAvgScored`, `awayAvgScored`, `homeWinRate`를 `'-'`로 처리.
- 실제 맞대결 목록이 존재할 때만 승/무/패 및 평균 득실을 재계산하여 표시.

### 2.4. `LineupTabView.tsx` 선발 / 불펜 / 부상자 UNKNOWN 처리
- 선발 투수명이 미정이거나 발표 전인 경우, `ERA 3.65`, `IP 5.2`, `K 6` 등의 고정 가짜 숫자를 출력하지 않고 `공식 선발 투수 발표 전 (UNKNOWN)`으로 표시하고 세부 지표를 `'-'`로 출력.
- 부상자 정보 부재 시 "주요 결장자 없음"으로 단정하지 않고 `UNKNOWN` 상태를 명시.

---

## 3. 검증 결과 요약

| 검증 항목 | 이전 상태 | 수정 후 상태 | 판정 |
|---|---|---|---|
| 최근 5경기 누락 시 표시 | `0승 0무 0패`, `평균 0.0득점` | `기록 미수집`, `평균 -` | **PASS** |
| 최근 5경기 실제 경기 목록 | aggregate 요약만 표시 | 실제 날짜/상대/스코어/결과 카드 및 테이블 표시 | **PASS** |
| H2H 누락 시 표시 | `0승 0무 0패`, `평균 0.0점` | `맞대결 기록 미수집`, `평균 -` | **PASS** |
| H2H 실제 경기 목록 | aggregate 요약만 표시 | 실제 맞대결 날짜/스코어/승리팀 목록 표시 | **PASS** |
| 선발 미발표 시 통계 | 고정 ERA 3.65, IP 5.2 | `공식 선발 발표 전 (UNKNOWN)`, ERA/IP '-' | **PASS** |
| MLB 경기 문구 | "KBO/K리그/연맹 오피셜 명단" | "공식 경기 시작 전 최종 MLB 오피셜 명단" | **PASS** |
| 합성 데이터(Synthetic) | 시드 기반 난수 스코어 페어 | 완전 차단 (0건) | **PASS** |

**최종 판정**: **PASS**
