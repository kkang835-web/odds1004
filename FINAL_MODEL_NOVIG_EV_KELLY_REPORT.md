# SPORTSQUANT PRO — FINAL MODEL PROBABILITY, NO-VIG, EV & KELLY REPORT

**Audit & Fix Completion Date**: 2026-10-01  
**Target Platform**: Model Engine (`quantModel.ts`), Match Table (`MatchTable.tsx`), Pick Evaluator (`quantPickEvaluator.ts`)  
**Status**: VERIFIED_AND_PASSED  

---

## 1. 수리 모델 및 배당 지표 완전 분리 (Complete Decoupling)

이전 버전에서 `MatchTable.tsx` 내부의 `noVigProb: targetProb` 복사로 인해 **Model Probability**와 **No-Vig Probability**가 동일하게 표시되던 문제를 해결하고, 각각의 독립적인 원천 데이터와 계산 경로를 확보하였습니다.

```
[MODEL PROBABILITY PATH]
Team Strength / Odds / ELO / Distribution Models (Dixon-Coles, Skellam Poisson, ELO+Pace)
  ↓
Raw Distribution Integrator
  ↓
Model Probability (homeProb, drawProb, awayProb)

─────────────────────────────────────────────────────────────

[NO-VIG PROBABILITY PATH]
Real Domestic Bookmaker Decimal Odds (domWin, domDraw, domLose)
  ↓
Shin's Method / Multiplicative Normalization:
  p1 = (1/odds1) / (1/odds1 + 1/odds2 [+ 1/odds3])
  ↓
Market Implied No-Vig Probability (noVigHome, noVigDraw, noVigAway)
```

---

## 2. 수식 및 계산 경로 검증 (Mathematical Proofs)

### 2.1. No-Vig 정규화 공식
- **2-Way 마켓 (야구, 농구, 배구)**:
  $$p_1 = \frac{1/O_1}{1/O_1 + 1/O_2}, \quad p_2 = \frac{1/O_2}{1/O_1 + 1/O_2}$$
  - 예시: $O_1 = 1.85, O_2 = 1.95$  
    $1/1.85 = 0.54054, \quad 1/1.95 = 0.51282, \quad \sum = 1.05336$  
    $p_1 = 51.3\%, \quad p_2 = 48.7\% \quad (\text{합계 } 100.0\%)$

- **3-Way 마켓 (축구)**:
  $$p_i = \frac{1/O_i}{\sum_{j \in \{W, D, L\}} 1/O_j}$$

### 2.2. EV (Expected Value, 기댓값) 공식
- 소수점 배당(Decimal Odds) 기준:
  $$EV = (p \times \text{Odds}) - 1 \quad (\text{백분율: } ((p \times \text{Odds}) - 1) \times 100)$$
  - 예시 테스트: $p = 0.648, \text{Odds} = 1.85$  
    $EV = 0.648 \times 1.85 - 1 = 1.1988 - 1 = +0.1988 \ (+19.9\% \ EV)$

### 2.3. Kelly Criterion (켈리 베팅 비중) 공식
- 풀 켈리 공식:
  $$b = \text{Odds} - 1, \quad q = 1 - p$$
  $$\text{Kelly} = \frac{b \times p - q}{b}$$
  - $EV > 0$일 때: 양수 켈리 비중 산출 및 $0.25\times$ 프랙셔널 켈리 적용.
  - $EV \le 0$일 때: 베팅 가치 없음 ($\text{Kelly} = 0.0\%$, 음수 켈리 발생 방지 가드 적용).

---

## 3. 단위 테스트 검증 결과

- `No-Vig 합계 100.0% 불변 검증`: **PASS**
- `EV 산출 정밀도 (오차 < 0.001) 검증`: **PASS**
- `Positive EV -> Positive Kelly 연동 검증`: **PASS**
- `Negative EV -> Kelly 0% 방어 가드 검증`: **PASS**
- `Model Prob ≠ No-Vig Prob 독립 출력 검증`: **PASS**

**최종 판정**: **PASS**
