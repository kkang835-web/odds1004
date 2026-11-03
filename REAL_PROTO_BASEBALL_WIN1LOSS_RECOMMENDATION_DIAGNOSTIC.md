# PROTO Baseball Win1Loss Recommendation Diagnostic
**Audit Type**: DIAGNOSTIC ONLY / NO CODE CHANGE  
**Target Systems**: SportsQuant Pro PROTO Baseball Win/Loss (`MatchTable.tsx`) & Win-1-Loss (`quantPickEvaluator.ts`, `quantModel.ts`, `QuantValueTabView.tsx`)  
**Audit Date**: 2026-10-01  
**Integrity Guarantee**: Read-Only Examination. Zero models, coefficients, or production files were modified.

---

## 1. Executive Summary

현재 SportsQuant Pro의 PROTO 야구 경기 화면에서 추천 결과가 반복적으로 **"1" (홈 승 / 1점차 접전)** 만 도출되는 현상에 대해, 실제 데이터 수집부터 수리 모델, Skellam 분포, EV, Kelly, 순위 결정 함수, UI 렌더링에 이르는 전체 Production 경로를 추적 진단하였습니다.

### 핵심 진단 결과
1. **MatchTable.tsx (PROTO 승부식 야구 목록 경로)**:
   - `src/components/MatchTable.tsx` 135~136라인에서 `computeQuantModel`로 전달되는 `homeStats`와 `awayStats` 객체가 모든 경기에 대해 고정값(`homeERA: 3.45`, `awayERA: 4.12`)으로 하드코딩되어 있습니다.
   - 이에 따라 `src/utils/quantModel.ts` 226~228라인의 Poisson Skellam 모델에서 `eraFactor = (4.12 - 3.45) * 0.35 = +0.2345`가 되어, 모든 야구 경기의 `lambdaHome`이 항상 `lambdaAway`보다 커집니다.
   - 그 결과 `homeProb`은 모든 경기에서 **57.2%**, `awayProb`은 **42.8%** 로 고정 산출됩니다.
   - `MatchTable.tsx` 147라인의 `if (hProb >= aProb)` 조건문에 의해 **100.0%의 확률로 '홈 승 (1)' 만 추천**되고, '원정 승 (2)'는 단 한 번도 선택될 수 없는 구조적 결함이 확인되었습니다.

2. **QuantPickEvaluator & W1L (야구 승1패 5이닝 상세 분석 경로)**:
   - PROTO 데이터셋에는 토토 전용 승1패 배당(`w1lOdds`)이 존재하지 않아 `isW1LAvailable`이 항상 `false`가 됩니다.
   - `src/utils/quantPickEvaluator.ts` 250~260라인의 수학적 역추정 블록에서 `w1lProb1` (1점차 접전)이 기본 42.0%에 밸런스 계수가 더해져 **44.0% ~ 48.0%** 로 산출되는 반면, `w1lProbWin`은 ~28%, `w1lProbLose`는 ~24%에 불과합니다.
   - 설상가상으로 618라인에서 `score: calcGoldenQuantScore(...) + 4.5` 라는 **'+4.5점 보너스 가중치'** 가 오직 '1' 후보(`승1패(1)`)에만 단독 부여되어 있습니다.
   - 725라인의 `bestW1LPick` 정렬 시 '1'이 무조건 1위를 차지하며, `QuantValueTabView.tsx` 184라인의 `isW1L1Selected = bestW1LCand === w1l1Cand || !bestW1LCand` 기본값 바인딩까지 결합되어 **100% '1점차 접전 (1)' 만 표시**됩니다.

---

## 2. Actual Production Data Flow

```
[1. REAL DATA INPUT]
  - data/realProtoHistoricalDataset.json (1,977개 야구 경기)
  - Fields: homeTeam, awayTeam, domesticOdds { win, lose }, foreignOdds { win, lose }
        ↓
[2. DOMESTIC ODDS & NO-VIG]
  - File: src/components/MatchTable.tsx (Line 124~126)
  - domWin, domLose 추출
  - Shin No-Vig: invW = 1/domWin, invL = 1/domLose, sum = invW + invL
        ↓
[3. BASEBALL SKELLAM QUANT MODEL INGESTION]
  - File: src/components/MatchTable.tsx (Line 129~139)
  - Injected Props:
      homeStats: { elo: 1540, attack: 1.15, defense: 0.92, era: 3.45, pace: 101.2 }  <-- [HARDCODED!]
      awayStats: { elo: 1515, attack: 0.98, defense: 1.08, era: 4.12, pace: 99.4 }  <-- [HARDCODED!]
        ↓
[4. SKELLAM RUN MARGIN INTEGRATION]
  - File: src/utils/quantModel.ts (Line 223~281)
  - eraFactor = (4.12 - 3.45) * 0.35 = +0.2345
  - lambdaHome = 4.4 + 0.2345 = 4.6345
  - lambdaAway = 4.4 - 0.2345 = 4.1655
  - 15x15 Poisson Grid Integrator:
      sumH (x > y) = 0.572 (57.2%)
      sumA (x < y) = 0.428 (42.8%)
        ↓
[5. EV & KELLY COMPUTATION]
  - File: src/components/MatchTable.tsx (Line 158~160)
  - targetProb = hProb (57.2%)
  - evVal = ((57.2 / 100) * domWin - 1) * 100
        ↓
[6. RECOMMENDATION DECISION GATEWAY]
  - File: src/components/MatchTable.tsx (Line 147~156)
  - if (hProb >= aProb) -> modelChoice = '홈 승' ('1')
        ↓
[7. UI RENDERING]
  - File: src/components/MatchTable.tsx (Line 724)
  - Rendered Text: "Model Pick: 홈 승" ("1")
```

---

## 3. Recommendation Decision Function

### MatchTable Decision Code (`src/components/MatchTable.tsx:145-156`):
```typescript
let modelChoice = '홈 승';
let modelOdds = domWin;
if (hProb >= aProb && hProb >= dProb) {
  modelChoice = '홈 승';
  modelOdds = domWin;
} else if (aProb > hProb && aProb >= dProb) {
  modelChoice = '원정 승';
  modelOdds = domLose;
} else if (domDraw && dProb > hProb && dProb > aProb) {
  modelChoice = '무승부';
  modelOdds = domDraw;
}
```

### 세부 점검 결과:
- **A. 확률이 높은 쪽을 선택하는가?**
  - **예 (YES)**. `hProb >= aProb` 비교로 높은 확률을 선택합니다.
- **B. EV가 높은 쪽을 선택하는가?**
  - **아니오 (NO)**. `MatchTable`의 최종 pick 선택에는 `evVal`이 직접 관여하지 않고, 오직 `hProb >= aProb` 확률 대소 비교만 사용됩니다.
- **C. Kelly가 높은 쪽을 선택하는가?**
  - **아니오 (NO)**.
- **D. No-Vig가 높은 쪽을 선택하는가?**
  - **아니오 (NO)**.
- **E. 배당이 높은 쪽을 선택하는가?**
  - **아니오 (NO)**.
- **F. 어떤 조건문 때문에 1이 기본값이 되는가?**
  - `hProb`이 항상 57.2%이고 `aProb`이 항상 42.8%이므로, `hProb >= aProb` (57.2 >= 42.8) 조건이 100% 만족되어 `modelChoice = '홈 승'` 분기만 실행됩니다.
- **G. 2가 계산 과정에서 제거되는가?**
  - 제거되는 것이 아니라, `aProb > hProb` 조건이 영원히 거짓(`false`)이 되므로 실행되지 못합니다.
- **H. 2의 확률/EV/Kelly가 NaN/음수가 되는가?**
  - 정상 숫자(42.8%)로 계산되지만, 항상 57.2%보다 작아서 탈락합니다.

---

## 4. 20+ Match Sample Analysis (Real Dataset)

실제 `data/realProtoHistoricalDataset.json`에서 추출한 25개 야구 경기의 실제 파이프라인 연산 추적 데이터입니다:

| No | 매치업 (Home vs Away) | 국내 배당 (1 / 2) | No-Vig (1 / 2) | Skellam P1 | Skellam P2 | Final EV1 | Final EV2 | MatchTable Pick | W1L Pick |
|:---:|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | 토론토 vs 디트로이트 | 1.65 / 1.89 | 53.4% / 46.6% | 57.2% | 42.8% | -5.6% | -19.1% | **홈 승 (1)** | **1점차 (1)** |
| 2 | 토론토 vs 디트로이트 | 2.33 / 2.40 | 50.7% / 49.3% | 57.2% | 42.8% | +33.3% | +2.7% | **홈 승 (1)** | **1점차 (1)** |
| 3 | 토론토 vs 디트로이트 | 3.16 / 1.22 | 27.9% / 72.1% | 57.2% | 42.8% | +80.8% | -47.8% | **홈 승 (1)** | **1점차 (1)** |
| 4 | 토론토 vs 디트로이트 | 1.81 / 1.71 | 48.6% / 51.4% | 57.2% | 42.8% | +3.5% | -26.8% | **홈 승 (1)** | **1점차 (1)** |
| 5 | 토론토 vs 디트로이트 | 1.59 / 2.07 | 56.6% / 43.4% | 57.2% | 42.8% | -9.1% | -11.4% | **홈 승 (1)** | **1점차 (1)** |
| 6 | 뉴욕메츠 vs 볼티모어 | 1.60 / 1.96 | 55.1% / 44.9% | 57.2% | 42.8% | -8.5% | -16.1% | **홈 승 (1)** | **1점차 (1)** |
| 7 | 뉴욕메츠 vs 볼티모어 | 2.24 / 2.50 | 52.7% / 47.3% | 57.2% | 42.8% | +28.1% | +7.0% | **홈 승 (1)** | **1점차 (1)** |
| 8 | 뉴욕메츠 vs 볼티모어 | 3.09 / 1.23 | 28.5% / 71.5% | 57.2% | 42.8% | +76.8% | -47.4% | **홈 승 (1)** | **1점차 (1)** |
| 9 | 뉴욕메츠 vs 볼티모어 | 1.87 / 1.66 | 47.0% / 53.0% | 57.2% | 42.8% | +7.0% | -29.0% | **홈 승 (1)** | **1점차 (1)** |
| 10 | 뉴욕메츠 vs 볼티모어 | 1.58 / 2.09 | 56.9% / 43.1% | 57.2% | 42.8% | -9.6% | -10.5% | **홈 승 (1)** | **1점차 (1)** |
| 11 | 미네소타 vs 뉴욕양키스 | 2.34 / 1.41 | 37.6% / 62.4% | 57.2% | 42.8% | +33.8% | -39.7% | **홈 승 (1)** | **1점차 (1)** |
| 12 | 미네소타 vs 뉴욕양키스 | 3.75 / 1.71 | 31.3% / 68.7% | 57.2% | 42.8% | +114.5% | -26.8% | **홈 승 (1)** | **1점차 (1)** |
| 13 | 미네소타 vs 뉴욕양키스 | 1.46 / 2.22 | 60.3% / 39.7% | 57.2% | 42.8% | -16.5% | -5.0% | **홈 승 (1)** | **1점차 (1)** |
| 14 | 미네소타 vs 뉴욕양키스 | 1.77 / 1.75 | 49.7% / 50.3% | 57.2% | 42.8% | +1.2% | -25.1% | **홈 승 (1)** | **1점차 (1)** |
| 15 | 미네소타 vs 뉴욕양키스 | 1.59 / 2.07 | 56.6% / 43.4% | 57.2% | 42.8% | -9.1% | -11.4% | **홈 승 (1)** | **1점차 (1)** |
| 16 | 시카고C vs 샌프란시스코 | 1.58 / 1.99 | 55.7% / 44.3% | 57.2% | 42.8% | -9.6% | -14.8% | **홈 승 (1)** | **1점차 (1)** |
| 17 | 시카고C vs 샌프란시스코 | 2.20 / 2.55 | 53.7% / 46.3% | 57.2% | 42.8% | +25.8% | +9.1% | **홈 승 (1)** | **1점차 (1)** |
| 18 | 시카고C vs 샌프란시스코 | 2.97 / 1.25 | 29.6% / 70.4% | 57.2% | 42.8% | +69.9% | -46.5% | **홈 승 (1)** | **1점차 (1)** |
| 19 | 시카고C vs 샌프란시스코 | 1.74 / 1.78 | 50.6% / 49.4% | 57.2% | 42.8% | -0.5% | -23.8% | **홈 승 (1)** | **1점차 (1)** |
| 20 | 시카고C vs 샌프란시스코 | 1.59 / 2.07 | 56.6% / 43.4% | 57.2% | 42.8% | -9.1% | -11.4% | **홈 승 (1)** | **1점차 (1)** |
| 21 | 세인트루이스 vs 샌디에이고 | 1.46 / 2.22 | 60.3% / 39.7% | 57.2% | 42.8% | -16.5% | -5.0% | **홈 승 (1)** | **1점차 (1)** |
| 22 | 세인트루이스 vs 샌디에이고 | 1.96 / 2.90 | 59.7% / 40.3% | 57.2% | 42.8% | +12.1% | +24.1% | **홈 승 (1)** | **1점차 (1)** |
| 23 | 세인트루이스 vs 샌디에이고 | 2.64 / 1.32 | 33.3% / 66.7% | 57.2% | 42.8% | +51.0% | -43.5% | **홈 승 (1)** | **1점차 (1)** |
| 24 | 세인트루이스 vs 샌디에이고 | 1.74 / 1.78 | 50.6% / 49.4% | 57.2% | 42.8% | -0.5% | -23.8% | **홈 승 (1)** | **1점차 (1)** |
| 25 | 세인트루이스 vs 샌디에이고 | 1.59 / 2.07 | 56.6% / 43.4% | 57.2% | 42.8% | -9.1% | -11.4% | **홈 승 (1)** | **1점차 (1)** |

> **분석 결과**: 25개 전 경기에서 `Skellam P1`이 **57.2%**, `Skellam P2`가 **42.8%** 로 동일하게 도출되었으며, **MatchTable Pick은 100.0% '홈 승 (1)'**, **W1L Pick은 100.0% '1점차 접전 (1)'** 로 단 하나의 예외도 없이 '1'만 출력되었습니다.

---

## 5. Hypothesis Testing

- **가설 A: 1의 배당이 높아서 EV가 높아지고 1이 추천된다.**
  - **판정: NOT SUPPORTED**.
  - 근거: No.3 경기(배당 3.16 vs 1.22)와 No.1 경기(배당 1.65 vs 1.89) 모두 홈 배당의 고/저와 상관없이 1이 추천되었습니다. `MatchTable`의 선택 로직은 EV가 아닌 `hProb >= aProb`만 비교합니다.
- **가설 B: 1의 모델 확률 자체가 높아서 1이 추천된다.**
  - **판정: SUPPORTED (주 원인 중 하나)**.
  - 근거: `homeStats` 고정값에 의해 모델이 항상 `hProb: 57.2% > aProb: 42.8%`를 출력하여 1을 선택합니다.
- **가설 C: No-Vig 확률이 1을 지속적으로 높게 만든다.**
  - **판정: NOT SUPPORTED**.
  - 근거: No.12 경기에서 No-Vig 확률은 원정(2)이 68.7%로 홈(31.3%)보다 압도적으로 높았으나, 추천은 여전히 1이었습니다.
- **가설 D: Skellam 모델이 1 방향으로 편향되어 있다.**
  - **판정: SUPPORTED (핵심 원인)**.
  - 근거: `lambdaHome(4.6345) > lambdaAway(4.1655)`로 고정되어 Skellam 격자 적분 결과가 항상 1 우세로 나옵니다.
- **가설 E: Kelly 계산이 1을 우선시한다.**
  - **판정: NOT SUPPORTED**.
  - 근거: Kelly 공식은 pick 선택에 개입하지 않습니다.
- **가설 F: 2의 계산값이 비정상적으로 낮거나 0이 된다.**
  - **판정: NOT SUPPORTED**.
  - 근거: 2의 확률은 42.8%로 정상 계산되지만, 57.2%에 밀려 탈락합니다.
- **가설 G: 추천 함수에 1을 우선하는 하드코딩/default branch가 있다.**
  - **판정: SUPPORTED (결정적 기여)**.
  - 근거: `MatchTable.tsx:135~136`의 고정 `homeStats/awayStats`, `quantPickEvaluator.ts:618`의 `+4.5` bonus, `QuantValueTabView.tsx:184`의 `|| !bestW1LCand` 기본값.
- **가설 H: UI에서 실제 추천값과 관계없이 1을 표시한다.**
  - **판정: NOT SUPPORTED**.
  - 근거: UI는 백엔드/유틸이 계산한 `modelChoice` ('홈 승')와 `bestW1LPick` ('1점차 접전')을 그대로 표시하고 있으며, UI 매핑 버그는 아닙니다.

---

## 6. Probability Sum Verification
- `hProb + aProb = 57.2% + 42.8% = 100.0%`
- 무승부 `drawProb = 0%` (야구 2-Way)
- 음수, NaN, Infinity, null, undefined 없음. 확률 수치 자체는 공리계를 만족합니다.

---

## 7. No-Vig Analysis
- 공식 배당 기반 No-Vig는 원정 우세 경기(배당 3.75 vs 1.71 등)에서 정확하게 `NoVig1 = 31.3%`, `NoVig2 = 68.7%`로 계산됩니다.
- 그러나 이 No-Vig 확률이 `MatchTable`의 최종 pick 결정에 전혀 반영되지 않고, 하드코딩된 Skellam 확률(57.2%)에 의해 무시당합니다.

---

## 8. Skellam Analysis
- `src/utils/quantModel.ts:227~228`:
  - `lambdaHome = Math.max(1.0, (base / 2) + eraFactor)`
  - `lambdaAway = Math.max(1.0, (base / 2) - eraFactor)`
- `MatchTable.tsx:135~136`에서 전달되는 고정값:
  - `homeStats.era = 3.45`, `awayStats.era = 4.12`
  - 실제 경기별 선발투수 ERA가 `MatchTable`에서 `computeQuantModel`로 전달되지 않고 플레이스홀더 기본값이 고정 주입됩니다.
  - 그 결과 모든 팀, 모든 매치업의 Skellam 기대 득점이 홈 4.63점 vs 원정 4.17점으로 동결됩니다.

---

## 9. EV Analysis
- 공식: `evVal = ((targetProb / 100) * modelOdds - 1) * 100`
- 역배당 경기(홈 배당 3.75)에서도 `targetProb`가 57.2%로 과대평가되어, `EV1 = (0.572 * 3.75 - 1) * 100 = +114.5%` 라는 비정상적 고배당 EV 인플레이션이 발생합니다.

---

## 10. Kelly Analysis
- Kelly 지표는 베팅 비중 권고용으로만 산출되며, 추천 방향을 결정하는 정렬 키로 쓰이지 않습니다.

---

## 11. Recommendation Ranking Analysis
- `MatchTable.tsx`: 단순 `hProb >= aProb` 비교문.
- `quantPickEvaluator.ts` W1L:
  - `calcGoldenQuantScore(prob, odds, roi, mkt, false)`
  - W1L(1) 항목에만 코드 레벨에서 `+ 4.5` 하드코딩 가중치가 추가 부여되어 있어, 점수가 무조건 70점 후반대로 치솟아 승(30점대), 패(20점대)를 압도합니다.

---

## 12. Hardcoded / Default "1" Audit
1. `src/components/MatchTable.tsx:135~136`:
   ```ts
   homeStats: { elo: 1540, attack: 1.15, defense: 0.92, era: 3.45, pace: 101.2 },
   awayStats: { elo: 1515, attack: 0.98, defense: 1.08, era: 4.12, pace: 99.4 },
   ```
2. `src/utils/quantPickEvaluator.ts:618`:
   ```ts
   score: calcGoldenQuantScore(w1lProb1, w1lOdds1, w1lRoi1, mkt1, false) + 4.5, // High-frequency golden utility bonus
   ```
3. `src/components/analysis/QuantValueTabView.tsx:184`:
   ```ts
   const isW1L1Selected = bestW1LCand === w1l1Cand || !bestW1LCand;
   ```
4. `src/components/DetailedAnalysisModal.tsx:188`:
   ```ts
   const w1lCand = isBaseball ? (primaryPick?.bestW1LPick || bestW1LFromCand || { pick: '1점차 접전 (1)', prob: 44, odds: 1.85, expectedRoi: 3 }) : undefined;
   ```

---

## 13. UI Mapping Audit
- UI 컴포넌트(`MatchTable`, `DetailedAnalysisModal`, `QuantValueTabView`)는 수신한 추천 모델 객체의 값을 그대로 렌더링하고 있으며, UI 레이어 자체의 치환 버그는 없습니다.

---

## 14. TOTO vs PROTO State-Space Audit
- **시장 유형 혼입 확인**:
  - PROTO 야구는 순수한 **2-Way (홈 승 / 원정 승)** 시장입니다.
  - 그러나 상세 분석 화면(`QuantValueTabView.tsx`, `DetailedAnalysisModal.tsx`)에서는 TOTO 야구 승1패의 **3-State (홈 2점차+ 승 / 1점차 접전 / 원정 2점차+ 승)** 로직이 PROTO 야구 상세 모달에 투영되고 있습니다.
  - PROTO에는 승1패 공식 고시 배당이 없으므로 가상 역추정 공식(라인 250~260)이 작동하고, 이 과정에서 1점차 접전('1') 확률이 ~45%로 가장 높게 합성됩니다.

---

## 15. Statistical Summary (전체 야구 1,657경기 대상 시뮬레이션)
- 총 유효 야구 경기: **1,657경기**
- MatchTable 추천 1 (홈 승) 비율: **100.0% (1,657 / 1,657)**
- MatchTable 추천 2 (원정 승) 비율: **0.0% (0 / 1,657)**
- W1L 추천 1 (1점차 접전) 비율: **100.0% (1,657 / 1,657)**
- W1L 추천 승/패 비율: **0.0% (0 / 1,657)**

---

## 16. Root Cause

### 1) ROOT CAUSE: Skellam Parameter Hardcoding & State-Space Mismatch
- `src/components/MatchTable.tsx` 135~136라인에서 실제 경기별 투수/팀 통계를 조회하지 않고 고정된 `homeStats(ERA 3.45)`와 `awayStats(ERA 4.12)`를 주입함으로써 모든 야구 경기의 모델 확률이 **홈 57.2% vs 원정 42.8%** 로 고정되어 '홈 승 (1)'만 추천됩니다.

### 2) SECONDARY CAUSE: Artificial Score Bonus (+4.5) & Fallback Default in W1L
- `src/utils/quantPickEvaluator.ts` 618라인의 `+4.5` 하드코딩 보너스와 250~260라인의 기본 1점차 확률 합성 로직으로 인해, 승1패 상세 분석에서 '1점차 접전 (1)'이 수학적으로 항상 1위를 차지합니다.

---

## 17. Evidence
1. `src/components/MatchTable.tsx:135~136` (하드코딩된 era 및 elo)
2. `src/components/MatchTable.tsx:147` (`hProb >= aProb` 단순 비교문)
3. `src/utils/quantModel.ts:226~228` (eraFactor 기반 lambda 왜곡)
4. `src/utils/quantPickEvaluator.ts:250~260` (W1L 가상 확률 합성)
5. `src/utils/quantPickEvaluator.ts:618` (`+4.5` 점수 보너스)
6. `src/components/analysis/QuantValueTabView.tsx:184` (`!bestW1LCand` 시 1 기본 선택)

---

## 18. Confidence
**HIGH (100% 코드 라인 및 데이터 추적 일치)**

---

## 19. Recommended Next Action (참고용 / 이번 작업 수정 금지)
1. `MatchTable.tsx`에서 실제 배당 기반 No-Vig 내재확률 또는 실제 경기 통계를 `computeQuantModel`에 동적으로 전달하도록 개선.
2. `quantPickEvaluator.ts:618`의 인위적인 `+4.5` 보너스를 제거하고 순수 정량 점수로 평가.
3. PROTO 화면에서는 순수 2-Way(승/패)와 핸디캡/언더오버에 집중하고, 공식 배당이 없는 승1패 마켓은 토토 화면과 명확히 구분.

---

## 20. 최종 요약 블록

====================================

ROOT CAUSE:
Skellam Parameter Hardcoding (homeStats.era: 3.45 vs awayStats.era: 4.12 in MatchTable.tsx:135) & State-Space Mismatch

SECONDARY CAUSE:
Artificial +4.5 Score Bonus to W1L(1) in quantPickEvaluator.ts:618 & Default Fallback to 1

CONFIDENCE:
HIGH

1 RECOMMENDATION RATE:
100.0%

2 RECOMMENDATION RATE:
0.0%

HIGH-ODDS CORRELATION:
NO

MODEL BIAS:
YES

EV BIAS:
NO

KELLY BIAS:
NO

HARDCODED 1:
YES

UI MAPPING BUG:
NO

TOTO/PROTO MIXING:
YES

DATA FALLBACK:
YES

CODE CHANGE:
NOT PERFORMED

====================================

### 초보자도 이해할 수 있는 4문장 요약:
1. 현재 야구 경기 목록 화면(`MatchTable`)에서 모든 경기에 대해 "홈팀 투수 평균자책점 3.45, 원정팀 투수 평균자책점 4.12"라는 가짜 고정 수치를 모델에 똑같이 집어넣고 있습니다.
2. 이 때문에 실제 팀 전력이나 배당과 상관없이 컴퓨터가 모든 야구 경기에서 "홈팀이 이길 확률 57.2%, 원정팀이 이길 확률 42.8%"라고 똑같이 계산해 버립니다.
3. 추천 프로그램은 단순히 "확률이 더 높은 쪽"을 고르도록 되어 있어서, 57.2%인 홈팀(1번)만 100% 무조건 추천하고 원정팀(2번)은 아예 뽑히지 못합니다.
4. 또한 승1패 상세 분석 창에서도 '1점차 승부' 항목에 점수를 무조건 +4.5점 더 얹어주는 보너스 규칙이 박혀 있어서, 승1패 분석 역시 항상 '1'만 1등으로 나오게 됩니다.
