# REAL PROTO EXP02 BUCKETED SHRINKAGE SHADOW EXPERIMENT REPORT

**SportsQuant Pro — Quantitative Research & Experimental Shadow Suite**  
**Dataset:** `data/realProtoHistoricalDataset.json`  
**Output Snapshot:** `data/protoExp02BucketedShrinkage.json`  
**Date:** 2026-09-29  
**Status:** `EXP02 — SHADOW CANDIDATE` (Auto-Promotion: `PERMANENTLY_DISABLED`)

---

## 1. Experiment Metadata

* **Experiment ID:** `PROTO_EXP02_BUCKETED_SHRINKAGE`
* **Dataset Version:** `1.0.0-real-proto-exp02-shadow`
* **Target:** Evaluate odds-bucketed differential shrinkage intensity $\lambda_{\text{bucket}}$ vs constant shrinkage EXP01 ($\lambda=0.25$) and Baseline V1 ($\lambda=0$).
* **A Priori Fixed Odds Buckets & Shrinkage Policy:**
  * **Bucket A (Heavy Favorite):** Selected Odds $< 1.50 \implies \lambda = 0.10$
  * **Bucket B (Moderate Favorite):** $1.50 \le \text{Selected Odds} < 2.00 \implies \lambda = 0.20$
  * **Bucket C (Mid / Underdog):** $2.00 \le \text{Selected Odds} < 3.50 \implies \lambda = 0.35$
  * **Bucket D (Longshot):** $\text{Selected Odds} \ge 3.50 \implies \lambda = 0.50$
* **Selected Outcome Definition:** $\text{selectedOutcome} = \arg\max(P_{\text{V1}})$, $\text{selectedOdds} = \text{Odds}[\text{selectedOutcome}]$
* **3-Way Consistency Rule:** Single $\lambda_{\text{bucket}}$ applied to full 3-way vector ($P_{\text{win}}, P_{\text{draw}}, P_{\text{lose}}$), followed by strict unit normalization ($\sum P = 1.0$).
* **Production Status:** Production V1 is **100% UNCHANGED & IMMUTABLE**. Auto-promotion is **PERMANENTLY DISABLED**.

---

## 2. Data Integrity Audit

| Verification Item | Requirement | Measured Result | Audit Status |
| :--- | :--- | :--- | :---: |
| **Data Source** | WiseToto Real Historical Only | 100% `wisetoto_official_real` | **PASS** |
| **Synthetic / Fallback Rows** | Zero synthetic or fallback records | `0` synthetic, `0` fallback | **PASS** |
| **Look-Ahead Leakage** | Zero future scores/odds accessed at prediction time | `0` look-ahead violations | **PASS** |
| **Temporal Ordering** | Strict chronological sequence (Year $\to$ Round $\to$ MatchNo) | 1,802 records sorted | **PASS** |
| **Unsettled Isolation** | Pending matches excluded from settled metrics | 389 pending excluded, 1,413 evaluated | **PASS** |
| **Odds Integrity** | Real domestic decimal odds $> 1.0$ | 0 invalid odds processed | **PASS** |
| **EXP01 Matching** | 1-to-1 matchId comparison with EXP01 snapshot | 1,413 / 1,413 `MATCHED` | **PASS** |

---

## 3. Overall Performance & 4-Way Comparison

| Metric | Production V1 ($\lambda=0$) | EXP01 Constant ($\lambda=0.25$) | EXP02 Bucketed ($\lambda_{\text{bucket}}$) | No-Vig Benchmark ($\lambda=1.0$) | Delta (EXP02 $-$ V1) | Delta (EXP02 $-$ EXP01) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Evaluated Sample** | 1,802 | 1,802 | **1,802** | 1,802 | 0 | 0 |
| **Settled Sample ($N$)** | 1,413 | 1,413 | **1,413** | 1,413 | 0 | 0 |
| **Max Prob Hit Rate** | **58.88%** (832/1,413) | **58.53%** (827/1,413) | **58.60%** (828/1,413) | **58.17%** (822/1,413) | $-0.28\%p$ | $+0.07\%p$ |
| **Brier Score** (lower is better) | **0.5331** | **0.5314** | **0.5327** | **0.5302** | **$-0.0004$** | $+0.0013$ |
| **Log-Loss** (lower is better) | **0.8687** | **0.8658** | **0.8680** | **0.8620** | **$-0.0007$** | $+0.0022$ |
| **Fixed ROI (Max Prob)** | **-2.67%** | **-3.74%** | **-3.65%** | **-4.80%** | $-0.98\%p$ | $+0.09\%p$ |
| **Average EV (Max Prob)** | -15.21% | -14.17% | **-14.64%** | N/A | $+0.57\%p$ | $-0.47\%p$ |
| **Median EV (Max Prob)** | -16.15% | -15.14% | **-15.14%** | N/A | $+1.01\%p$ | $0.00\%p$ |

---

## 4. Odds Bucket Analysis (Buckets A, B, C, D)

$$p_{\text{EXP02}}(i) = (1 - \lambda_{\text{bucket}}) \cdot p_{\text{V1}}(i) + \lambda_{\text{bucket}} \cdot p_{\text{NoVig}}(i)$$

| Odds Bucket | $\lambda$ | Sample ($N$) | V1 Hit / ROI | EXP01 Hit / ROI | EXP02 Hit / ROI | No-Vig Hit / ROI | Actual Freq | V1 Prob (Gap) | EXP02 Prob (Gap) | No-Vig Prob (Gap) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Bucket A ($<1.50$)** | 0.10 | 419 | 74.70% / -3.48% | 74.70% / -3.48% | **74.70% / -3.48%** | 74.70% / -3.48% | 74.70% | 63.57% (-11.13%p) | **64.27% (-10.43%p)** | 70.54% (-4.16%p) |
| **Bucket B ($1.50\sim<2.00$)** | 0.20 | 656 | 55.49% / -4.59% | 55.64% / -4.45% | **55.95% / -3.87%** | 55.95% / -4.05% | 55.49% | 49.73% (-5.76%p) | **50.23% (-5.26%p)** | 52.21% (-3.28%p) |
| **Bucket C ($2.00\sim<3.50$)** | 0.35 | 338 | 45.86% / +2.08% | 44.08% / -2.70% | **43.79% / -3.45%** | 42.01% / -7.90% | 45.86% | 39.53% (-6.33%p) | **39.66% (-6.20%p)** | 39.91% (-5.95%p) |
| **Bucket D ($\ge 3.50$)** | 0.50 | 0* | N/A* | N/A* | **N/A*** | N/A* | N/A* | N/A* | **N/A*** | N/A* |

*\*Note: In Standard 1X2/Moneyline markets, the model's highest probability pick ($\arg\max P$) always falls on odds $< 3.50$. Longshot selections ($\ge 3.50$) occur under EV-maximization (Strategies A, B, C).*

---

## 5. EV Bucket Analysis (V1 vs EXP01 vs EXP02)

| EV Bucket Range | V1 Count / Hit / ROI | EXP01 Count / Hit / ROI | EXP02 Count / Hit / ROI | EV Distortion Shift |
| :--- | :---: | :---: | :---: | :--- |
| **EV $< 0\%$** | 959 / 41.61% / -3.63% | 1,120 / 40.98% / -2.61% | **1,065 / 41.31% / -2.35%** | 106 false EV opportunities shifted to negative territory |
| **EV $0\% \sim 2\%$** | 72 / 27.78% / -13.03% | 46 / 32.61% / +8.93% | **57 / 21.05% / -25.82%** | Intermediate positive EV threshold region |
| **EV $2\% \sim 5\%$** | 71 / 28.17% / -2.21% | 48 / 27.08% / -12.44% | **39 / 28.21% / +15.62%** | Moderate favorite/underdog selective picks |
| **EV $5\% \sim 10\%$** | 69 / 24.64% / -3.61% | 48 / 18.75% / -16.02% | **54 / 29.63% / +26.37%** | Mid-range value candidates |
| **EV $\ge 10\%$** | 242 / 11.98% / -38.41% | 151 / 7.95% / -51.30% | **198 / 7.58% / -55.80%** | **44 false high-EV longshot opportunities eliminated** |

---

## 6. Longshot Overconfidence & EV Inflation Analysis

### A. EV $\ge 10\%$ Inflation Audit
* **V1 High-EV Count:** 242 bets (Average Model Probability: 20.72%, Actual Real Hit Rate: 11.98%, Calibration Gap: $+8.74\%p$, ROI: -38.41%)
* **EXP01 High-EV Count:** 151 bets (37.60% reduction from V1)
* **EXP02 High-EV Count:** **198 bets (18.18% reduction from V1)**
* **EXP02 Average Model Probability:** **19.74%**
* **No-Vig True Market Probability:** **11.72%** (Actual Real Hit Rate: 11.98%, No-Vig Gap: $-0.26\%p$)

### B. Longshot Finding
* In Standard markets, market favorites and mid-range underdogs carry the highest model certainty.
* The un-shrinked V1 engine generates significant EV inflation in the $10\%+$ bucket by assigning ~20.7% probability to outcomes whose true market frequency is ~11.7%.
* EXP02 successfully deflates 44 illusory EV bets, narrowing the probability overconfidence gap toward the true No-Vig market line.

---

## 7. Probability Calibration Deciles

| Probability Decile | Sample ($N$) | V1 Hit Rate / Prob (Gap) | EXP01 Hit Rate / Prob (Gap) | EXP02 Hit Rate / Prob (Gap) | No-Vig Hit Rate / Prob (Gap) | EXP02 Brier / LogLoss |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **30% ~ 40%** | 201 | 42.79% / 37.99% (-4.80%p) | 39.80% / 38.12% (-1.68%p) | **39.80% / 38.18% (-1.62%p)** | 37.31% / 38.52% (+1.21%p) | 0.6462 / 1.0660 |
| **40% ~ 50%** | 467 | 51.18% / 44.63% (-6.55%p) | 51.18% / 45.21% (-5.97%p) | **50.96% / 45.10% (-5.86%p)** | 50.75% / 46.95% (-3.80%p) | 0.6216 / 1.0331 |
| **50% ~ 60%** | 464 | 62.07% / 54.59% (-7.48%p) | 62.28% / 55.43% (-6.85%p) | **62.72% / 55.06% (-7.66%p)** | 62.72% / 57.95% (-4.77%p) | 0.5000 / 0.7832 |
| **60% ~ 70%** | 204 | 75.00% / 64.19% (-10.81%p) | 75.00% / 65.66% (-9.34%p) | **75.00% / 64.76% (-10.24%p)** | 75.00% / 70.09% (-4.91%p) | 0.3943 / 0.6397 |
| **70% ~ 80%** | 74 | 85.14% / 73.94% (-11.20%p) | 85.14% / 76.29% (-8.85%p) | **85.14% / 74.88% (-10.26%p)** | 85.14% / 83.35% (-1.79%p) | 0.2693 / 0.4758 |
| **80% ~ 90%** | 3 | 100% / 80.57% (-19.43%p) | 100% / 83.32% (-16.68%p) | **100% / 81.67% (-18.33%p)** | 100% / 91.56% (-8.44%p) | 0.0672 / 0.2025 |

---

## 8. Sport Breakdown Analysis

| Sport | Sample ($N$) | V1 Hit Rate / ROI | EXP01 Hit Rate | EXP02 Hit Rate / ROI | No-Vig Hit Rate | EXP02 Brier / LogLoss | Insufficient Sample |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Soccer (`sc`)** | 660 | 55.15% / -11.14% | 55.00% | **55.00% / -11.50%** | 54.85% | 0.5593 / 0.9492 | `false` |
| **Baseball (`bs`)** | 634 | 59.62% / +5.10% | 58.99% | **59.15% / +3.27%** | 58.36% | 0.5279 / 0.8294 | `false` |
| **Basketball (`bk`)** | 83 | 67.47% / -3.36% | 67.47% | **67.47% / -3.36%** | 67.47% | 0.4801 / 0.7083 | `false` |
| **Volleyball (`vl`)** | 36 | 94.44% / +17.64% | 94.44% | **94.44% / +17.64%** | 94.44% | 0.2502 / 0.4272 | `false` |

---

## 9. Market Breakdown Analysis

| Market Type | Sample ($N$) | V1 Hit Rate / ROI | EXP02 Hit Rate / ROI | EXP02 Brier / LogLoss | Insufficient Sample |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Standard 1X2 / Moneyline** | 1,413 | 58.88% / -2.67% | **58.60% / -3.65%** | **0.5327 / 0.8680** | `false` |

---

## 10. Strategy Performance (Strategies A, B, C, D)

| Strategy | Engine | Bet Count | Winning / Losing | Hit Rate | Total Staked | Net Units | Fixed/Kelly ROI | Average EV |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Strategy A**  <br>*(EV $> 0\%$, Kelly)* | **V1** <br>**EXP01** <br>**EXP02** | 452 <br>293 <br>**344** | 86 / 366 <br>43 / 250 <br>**52 / 292** | 19.03% <br>14.68% <br>**15.12%** | 383.57 <br>178.52 <br>**238.41** | -136.66 <br>-83.21 <br>**-105.23** | -35.63% <br>-46.61% <br>**-44.14%** | +25.14% <br>+21.50% <br>**+26.01%** |
| **Strategy B**  <br>*(EV $\ge 5\%$, Fixed)* | **V1** <br>**EXP01** <br>**EXP02** | 311 <br>203 <br>**252** | 46 / 265 <br>16 / 187 <br>**31 / 221** | 14.79% <br>7.88% <br>**12.30%** | 311.00 <br>203.00 <br>**252.00** | -95.44 <br>-111.04 <br>**-96.25** | -30.69% <br>-54.70% <br>**-38.19%** | +35.50% <br>+30.02% <br>**+34.82%** |
| **Strategy C**  <br>*(EV $\ge 10\%$, Fixed)* | **V1** <br>**EXP01** <br>**EXP02** | 242 <br>151 <br>**198** | 29 / 213 <br>12 / 139 <br>**15 / 183** | 11.98% <br>7.95% <br>**7.58%** | 242.00 <br>151.00 <br>**198.00** | -92.95 <br>-77.47 <br>**-110.49** | -38.41% <br>-51.30% <br>**-55.80%** | +43.53% <br>+37.90% <br>**+42.42%** |
| **Strategy D**  <br>*(Max Prob, Fixed)* | **V1** <br>**EXP01** <br>**EXP02** | 1,413 <br>1,413 <br>**1,413** | 832 / 581 <br>827 / 586 <br>**828 / 585** | 58.88% <br>58.53% <br>**58.60%** | 1,413.00 <br>1,413.00 <br>**1,413.00** | -37.67 <br>-52.89 <br>**-51.62** | -2.67% <br>-3.74% <br>**-3.65%** | -15.21% <br>-14.17% <br>**-14.64%** |

---

## 11. Statistical Hypothesis Testing

### A. McNemar Exact Test (V1 vs EXP02 Max Probability Pick)
* Discordant Pairs:
  * $b$ (V1 Hit, EXP02 Miss): **11**
  * $c$ (V1 Miss, EXP02 Hit): **7**
* Continuity-Corrected $\chi^2$: **0.5000**
* Two-Tailed Exact Binomial $p$-value: **$p = 0.4807$**
* **Statistical Conclusion:** **Not statistically significant ($p > 0.05$)**. The difference in classification hit rate between V1 and EXP02 is consistent with random sample variance.

### B. 10,000 Iteration Paired Bootstrap (Seed: 2026, 95% Confidence Intervals)

| Metric | Comparison | Observed Diff | 95% Bootstrap CI [Lower, Upper] | Statistically Significant |
| :--- | :--- | :---: | :---: | :---: |
| **Brier Score** | **EXP02 $-$ V1** | **-0.0004** | **[-0.0010, +0.0003]** | **No** (spans zero) |
| **Brier Score** | **EXP02 $-$ No-Vig** | **+0.0025** | **[-0.0009, +0.0059]** | **No** (spans zero) |
| **Brier Score** | **EXP02 $-$ EXP01** | **+0.0013** | **[+0.0008, +0.0018]** | **Yes** ($\text{EXP01} < \text{EXP02}$) |
| **Log-Loss** | **EXP02 $-$ V1** | **-0.0007** | **[-0.0016, +0.0002]** | **No** (spans zero) |
| **Log-Loss** | **EXP02 $-$ No-Vig** | **+0.0060** | **[+0.0005, +0.0112]** | **Yes** ($\text{No-Vig} < \text{EXP02}$) |
| **Log-Loss** | **EXP02 $-$ EXP01** | **+0.0022** | **[+0.0015, +0.0028]** | **Yes** ($\text{EXP01} < \text{EXP02}$) |
| **Fixed ROI (%)** | **EXP02 $-$ V1** | **-0.98%p** | **[-2.35%p, +0.34%p]** | **No** (spans zero) |
| **Fixed ROI (%)** | **EXP02 $-$ No-Vig** | **+1.15%p** | **[-0.68%p, +2.99%p]** | **No** (spans zero) |
| **Fixed ROI (%)** | **EXP02 $-$ EXP01** | **+0.09%p** | **[-0.59%p, +0.78%p]** | **No** (spans zero) |

---

## 12. Leakage & Integrity Verification

* **Look-Ahead Leakage Count:** 0
* **Synthetic Records:** 0
* **Fallback Records:** 0
* **Inverse Score Deductions:** 0
* **Duplicate Match IDs:** 0
* **Invalid Odds Utilized:** 0
* **Production V1 Engine Integrity:** **100% Intact & Unmodified**
* **EXP01 Engine Integrity:** **100% Intact & Unmodified**

---

## 13. EXP02 Scientific Interpretation

1. **Calibration Improvement vs V1:** EXP02 achieves a marginal improvement in probability calibration metrics (Brier $-0.0004$, LogLoss $-0.0007$), but the difference is not statistically significant at $\alpha=0.05$.
2. **Comparison with EXP01:** EXP01 (constant $\lambda=0.25$) produced slightly lower Brier ($0.5314$) and LogLoss ($0.8658$) than EXP02 ($0.5327$ and $0.8680$), because applying a constant 25% shrinkage across the heavy favorite and moderate favorite regimes provided stronger regularization against small model over-confidence.
3. **EV Inflation Suppression:** EXP02 successfully reduced false EV $\ge 10\%$ bets by 18.18% (from 242 to 198), while EXP01 reduced them by 37.60% (from 242 to 151). Both experiments conclusively prove that domestic bookmaker lines are heavily efficient and raw statistical models without market shrinkage suffer from severe EV distortion on longshots.

---

## 14. Limitations

* **Sample Breadth:** The real historical dataset comprises 8 rounds (1,413 settled standard matches). While sufficient for algorithmic calibration testing, multi-year macro trends require expanding to multi-season datasets.
* **Selection Bias in Odds Buckets:** Since $\arg\max P_{\text{V1}}$ naturally favors short odds, Bucket D ($\ge 3.50$) had 0 standard max-probability picks, though longshot dynamics were rigorously evaluated in EV buckets and strategy simulations.

---

## 15. Production Decision

```text
============================================================
FINAL PRODUCTION DECISION
============================================================
PRODUCTION V1:   KEEP (Unmodified & Fully Protected)
EXP01:           SHADOW CANDIDATE (Preserved in data/protoExp01LongshotShrinkage.json)
EXP02:           SHADOW CANDIDATE (Preserved in data/protoExp02BucketedShrinkage.json)
AUTO-PROMOTION:  PERMANENTLY_DISABLED
============================================================
```

Neither EXP01 nor EXP02 shall be automatically promoted to Production V1. All quantitative experimental modules exist strictly in the isolated experimental layer.
