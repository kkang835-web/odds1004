# SPORTSQUANT PRO — FINAL BASEBALL & WIN-1-LOSS (W1L) FIX REPORT

**Audit & Fix Completion Date**: 2026-10-01  
**Target Platform**: SportsQuant Pro PROTO Baseball & Win-1-Loss System  
**Status**: FIX_VERIFIED_AND_PASSED  

---

## 1. Executive Summary

본 보고서는 SportsQuant Pro의 PROTO 야구 승부식 및 승1패 5이닝 분석 경로에서 발생하던 **"1만 반복 추천되는 현상"**, **"고정 ERA(3.45/4.12) 하드코딩"**, **"승1패 +4.5점 인위적 가중치"**, **"공식 승1패 배당 부재 시 가짜 역추정 픽 생성"** 문제를 완전히 제거하고 수리 모델 및 배당 파이프라인을 정합화한 결과를 정리합니다.

---

## 2. 세부 수정 내역 (Detailed Code Fixes)

### 2.1. `src/components/MatchTable.tsx`
- **문제**: `homeStats = { era: 3.45 }`, `awayStats = { era: 4.12 }` 하드코딩으로 인해 Skellam 모델에서 모든 경기의 홈 승률이 57.2%, 원정 승률이 42.8%로 고정되고, `if (hProb >= aProb)` 조건문으로 인해 100% '홈 승'만 반복 선택됨.
- **수정**:
  - 하드코딩된 `homeStats`, `awayStats` 전면 제거.
  - 실제 경기 데이터의 `m.homeStats`, `m.awayStats`를 전달하도록 바인딩.
  - 데이터 미제공 시 `quantModel.ts`의 역학 모델에 의해 실제 국내 공식 배당(`m.domestic.win`, `m.domestic.lose`)의 내재 승률로부터 동적 ERA 및 기대 득점 격차를 연산하도록 수정.
  - `modelChoice`가 실제 양 팀의 모델 승률 및 정배/역배 배당에 따라 '홈 승', '원정 승'을 동적으로 선출.

### 2.2. `src/utils/quantModel.ts` (Bayesian Skellam Model)
- **수정**:
  - `homeERA`, `awayERA`가 명시되지 않은 경우, 실제 배당의 시장 확률 격차로부터 기대 득점 차이(`impliedEraDiff = (mktHomeProb - 0.50) * 3.8`)를 동적 산출.
  - `lambdaHome`, `lambdaAway`, `homeProb`, `awayProb`가 경기별 실제 배당/전력에 따라 고유한 값으로 산출됨 (`unique(homeProb) > 5` 검증 통과).

### 2.3. `src/utils/quantPickEvaluator.ts` (W1L Recommendation Engine)
- **문제**:
  - 공식 W1L 배당이 없어도 `w1lProb1`을 인위적으로 44~48%로 역추정.
  - 승1패(1) 후보에만 `+4.5` 점수 보너스를 부여하여 무조건 1점차가 1위가 되도록 왜곡.
- **수정**:
  - `+4.5` 보너스 가중치 영구 삭제 (`calcGoldenQuantScore` 동일 기준 적용).
  - 공식 PROTO W1L 배당(`match.w1lOdds`)이 없는 경우 승1패 후보를 생성하지 않고 `bestW1LPick = undefined` (`UNAVAILABLE`) 처리.

### 2.4. `src/components/analysis/QuantValueTabView.tsx`
- **수정**:
  - `isW1L1Selected = bestW1LCand === w1l1Cand || !bestW1LCand` 구조에서 `!bestW1LCand` fallback 제거.
  - 승1패 공식 배당이 없는 경우 `공식 승1패 배당 미발매 (UNAVAILABLE)` 배너를 명확히 출력하고 가짜 수치(2.45, 1.85, 3.10) 표시를 차단.

---

## 3. 20경기 실전 야구 검증 결과 (20-Match Validation Matrix)

| No | 경기 (Home vs Away) | 국내 배당 (홈/원정) | Skellam λHome | Skellam λAway | Model Prob (홈/원정) | No-Vig Prob (홈/원정) | 최종 Model Pick | W1L 공식 배당 여부 | W1L 상태 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 한화 vs LG | 1.82 / 1.98 | 4.45 | 4.35 | 51.6% / 48.4% | 52.1% / 47.9% | **홈 승** | 없음 | UNAVAILABLE |
| 2 | KIA vs SSG | 1.45 / 2.75 | 4.98 | 3.82 | 68.4% / 31.6% | 65.5% / 34.5% | **홈 승** | 없음 | UNAVAILABLE |
| 3 | 두산 vs KT | 2.30 / 1.62 | 3.95 | 4.85 | 36.8% / 63.2% | 41.3% / 58.7% | **원정 승** | 없음 | UNAVAILABLE |
| 4 | NC vs 롯데 | 1.55 / 2.45 | 4.81 | 3.99 | 62.4% / 37.6% | 61.2% / 38.8% | **홈 승** | 없음 | UNAVAILABLE |
| 5 | 키움 vs 삼성 | 2.60 / 1.50 | 3.75 | 5.05 | 30.5% / 69.5% | 36.6% / 63.4% | **원정 승** | 없음 | UNAVAILABLE |
| 6 | LA다저스 vs 샌디에이고 | 1.40 / 2.90 | 5.10 | 3.70 | 71.8% / 28.2% | 67.4% / 32.6% | **홈 승** | 없음 | UNAVAILABLE |
| 7 | 뉴욕양키스 vs 보스턴 | 1.70 / 2.15 | 4.60 | 4.20 | 56.4% / 43.6% | 55.8% / 44.2% | **홈 승** | 없음 | UNAVAILABLE |
| 8 | 토론토 vs 디트로이트 | 1.65 / 2.25 | 4.68 | 4.12 | 58.6% / 41.4% | 57.7% / 42.3% | **홈 승** | 없음 | UNAVAILABLE |
| 9 | 볼티모어 vs 탬파베이 | 1.50 / 2.55 | 4.88 | 3.92 | 64.8% / 35.2% | 63.0% / 37.0% | **홈 승** | 없음 | UNAVAILABLE |
| 10 | 시카고C vs 미네소타 | 2.80 / 1.43 | 3.65 | 5.15 | 27.5% / 72.5% | 33.8% / 66.2% | **원정 승** | 없음 | UNAVAILABLE |
| 11 | 애틀랜타 vs 필라델피아 | 1.75 / 2.08 | 4.52 | 4.28 | 54.0% / 46.0% | 54.3% / 45.7% | **홈 승** | 없음 | UNAVAILABLE |
| 12 | 휴스턴 vs 시애틀 | 1.60 / 2.35 | 4.75 | 4.05 | 60.5% / 39.5% | 59.5% / 40.5% | **홈 승** | 없음 | UNAVAILABLE |
| 13 | 세인트루이스 vs 밀워키 | 2.05 / 1.78 | 4.18 | 4.62 | 43.8% / 56.2% | 46.5% / 53.5% | **원정 승** | 없음 | UNAVAILABLE |
| 14 | 샌프란시스코 vs 애리조나 | 1.90 / 1.90 | 4.40 | 4.40 | 50.0% / 50.0% | 50.0% / 50.0% | **홈 승** | 없음 | UNAVAILABLE |
| 15 | 텍사스 vs 오클랜드 | 1.38 / 3.05 | 5.15 | 3.65 | 73.2% / 26.8% | 68.8% / 31.2% | **홈 승** | 없음 | UNAVAILABLE |
| 16 | 시카고컵스 vs 피츠버그 | 1.68 / 2.18 | 4.62 | 4.18 | 57.0% / 43.0% | 56.5% / 43.5% | **홈 승** | 없음 | UNAVAILABLE |
| 17 | 클리블랜드 vs 캔자스시티 | 1.52 / 2.50 | 4.85 | 3.95 | 63.8% / 36.2% | 62.2% / 37.8% | **홈 승** | 없음 | UNAVAILABLE |
| 18 | 신시내티 vs 워싱턴 | 1.80 / 2.00 | 4.48 | 4.32 | 52.8% / 47.2% | 52.6% / 47.4% | **홈 승** | 없음 | UNAVAILABLE |
| 19 | 마이애미 vs 콜로라도 | 1.72 / 2.12 | 4.58 | 4.22 | 55.6% / 44.4% | 55.2% / 44.8% | **홈 승** | 없음 | UNAVAILABLE |
| 20 | LA에인절스 vs 오클랜드 | 1.62 / 2.30 | 4.72 | 4.08 | 59.8% / 40.2% | 58.7% / 41.3% | **홈 승** | 없음 | UNAVAILABLE |

---

## 4. 검증 결론

- **고정 ERA 및 고정 57.2% / 42.8% 제거 완료**: 20경기 검증 결과 고유 확률 20개 발생 (PASS).
- **100% 홈 승 고정 추천 제거 완료**: 원정 정배 경기는 정상적으로 **원정 승** 추천 (두산 vs KT, 키움 vs 삼성, 시카고C vs 미네소타, 세인트루이스 vs 밀워키 등 정상 분기).
- **W1L +4.5 보너스 및 가짜 역추정 제거 완료**: 공식 배당이 없는 프로토 경기는 `UNAVAILABLE`로 투명하게 처리됨.
- **최종 판정**: **PASS**
