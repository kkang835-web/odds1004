# PROTO REAL WALK-FORWARD V1 DIAGNOSTIC AUDIT

**Document ID:** `PROTO-WF-V1-DIAGNOSTIC`  
**Execution Date:** 2026-09-29  
**System:** SportsQuant Pro — Quantitative Engineering Group  
**Dataset Reference:** `data/realProtoHistoricalDataset.json`  
**Walk-Forward Execution File:** `data/protoRealWalkForwardV1.json`  
**Evaluation Standard:** Read-Only Empirical Audit (Zero Parameter Modification, Zero Look-Ahead, Zero Fake Data)

---

## 1. Dataset & Execution Scope

| Metric | Count / Value | Provenance / Verification Status |
|---|---|---|
| **Total Recorded Matches** | **4,877** | Official WiseToto DOM Parsed Fixtures |
| **VALID Records** | **4,315** | Verified Domestic Odds ($>1.0$), Real Teams & Outcomes |
| **Standard 1X2 / ML Matches (V1 Scope)**| **1,802** | Chronologically Sorted Ingestion |
| **Settled Standard Matches** | **1,413** | Outcome Officially Confirmed in Historical Source |
| **Pending / Unsettled Matches** | **389** | Unsettled Fixtures in R115 (Excluded from Performance) |
| **Unsupported Markets** | **2,513** | Handicap (691), Under/Over (911), SUM (911) |
| **Excluded (Invalid Odds)** | **562** | Unquoted / Special Lines (100% Excluded) |
| **Model Hit Rate (Strategy A)** | **58.88% (832 / 1,413)** | 1-Unit Fixed Stake |
| **No-Vig Benchmark Hit Rate** | **58.17% (822 / 1,413)** | Shin (1993) Model True Favorite |
| **Model Fixed ROI** | **-2.67% (-37.67 units)** | Payouts based on Real Domestic Odds |
| **No-Vig Benchmark Fixed ROI** | **-4.80% (-67.80 units)** | Real Domestic Odds Settlement |
| **CLV Status** | **DISABLED** | Zero Historical Multi-Timestamp Odds Feeds |
| **William Benter Two-Step Status** | **DISABLED** | Multi-Year Fundamental Regression Unfitted |
| **Total Test Suites** | **43 / 43 PASS (100%)** | Zero Look-Ahead Leakage Verified |

---

## 2. EV Calculation Audit

### A. Code Implementation & Execution Flow
In `server/quantEngine.ts` and `server/protoHistory/realProtoWalkForwardRunner.ts`, the mathematical pipeline follows a strictly layered structure:

```
[1. Real Domestic Odds]
  (O_win, O_draw, O_lose)
       │
       ▼
[2. Implied Probabilities]
  π_i = 1 / O_i,   β = Σ π_i  (Overround = β - 1)
       │
       ▼
[3. Shin's Model No-Vig Probability (1993)]
  solveAdaptiveShinZ(invProbArray: number[])
  Newton-Raphson bisection on insider trading coefficient z ∈ [0, 0.45]
  p_NoVig,i = [√(z² + 4(1-z)(π_i²/β) · W_homo,i) - z] / [2(1-z)]
       │
       ▼
[4. Dynamic Expanding-Window Elo Model]
  ExpandingTeamEloTracker.getRating(team)
  p_Elo,win = 1 / [1 + 10^((Elo_away - Elo_home)/400)]
  (Updated strictly AFTER match settlement)
       │
       ▼
[5. Production Model Probability]
  p_model,i = 0.70 · p_NoVig,i + 0.30 · p_Elo,i  (Normalized to Σ p_i = 1.0)
       │
       ▼
[6. Expected Value (EV)]
  EV_i = (p_model,i × O_dom,i) - 1.0
       │
       ▼
[7. Adaptive Fractional Kelly]
  computeAdaptiveKelly(prob, odds, entropyBits)
  f* = max(0, (p·b - q)/b) × Multiplier(ShannonEntropy, Brier)
```

*Audit Confirmation:* No implicit fallback values, randomized seeds, or unverified probability boosts are present in the computation flow.

---

## 3. EV Sanity Check & Bucket Deep Dive

### A. Empirical EV Bucket Table
| EV Bucket Range | Sample Count | Wins | Losses | Hit Rate | Avg Model Prob | Avg No-Vig Prob | Avg Odds | Average EV | Realized ROI |
|---|---|---|---|---|---|---|---|---|---|
| **EV < 0% (Market Favorites)** | 959 | 399 | 560 | **41.61%** | 47.93% | 50.12% | 1.832 | **-7.52%** | **-3.63%** |
| **EV 0% ~ 2%** | 72 | 20 | 52 | **27.78%** | 33.15% | 32.84% | 3.045 | **+0.96%** | **-13.03%** |
| **EV 2% ~ 5%** | 71 | 20 | 51 | **28.17%** | 32.22% | 31.11% | 3.214 | **+3.58%** | **-2.21%** |
| **EV 5% ~ 10%** | 69 | 17 | 52 | **24.64%** | 28.58% | 26.62% | 3.756 | **+7.34%** | **-3.61%** |
| **EV 10%+ (Extreme Longshots)** | 242 | 29 | 213 | **11.98%** | 21.43% | 14.93% | **6.738** | **+43.53%** | **-38.41%** |

### B. Root Cause Analysis: Why EV 10%+ (+43.53% Avg EV) Yields -38.41% ROI
1. **Longshot Multiplier Asymmetry:**
   * On high odds (e.g. $O = 8.00$), a small estimation error in model probability produces an enormous mathematical distortion in EV:
     $$\Delta EV = \Delta p \times O$$
   * For $O = 8.00$, an overconfidence of just $+5.4\%p$ ($p_{model} = 18.0\%$ vs $p_{true} = 12.6\%$) generates $+44\%$ apparent EV.
2. **Empirical Probability Gap:**
   * In the EV 10%+ bucket, the average model probability was **21.43%**, whereas the actual realized hit rate was only **11.98%** (a massive **+9.45%p overconfidence gap**).
   * In contrast, the Shin No-Vig probability for these selections averaged **14.93%**, which is substantially closer to the true empirical hit rate (11.98%).
3. **Absence of Longshot Shrinkage:**
   * The domestic SportsToto margin on underdogs ($> 4.00$) contains heavy public favourite-longshot bias. Chasing positive EV on longshots with flat 1-unit stakes without Bayesian James-Stein shrinkage inevitably yields severe negative returns.

---

## 4. Probability Calibration Audit

To diagnose whether the model probabilities suffer from systematic bias, predictions are binned into deciles against empirical outcome frequency.

| Probability Decile | Model Sample | Model Hits | Model Hit Rate | Model Pred Prob | Calibration Gap (Pred - Act) | No-Vig Sample | No-Vig Hits | No-Vig Hit Rate | No-Vig Pred Prob | No-Vig Gap |
|---|---|---|---|---|---|---|---|---|---|---|
| **0% ~ 10%** | 0 | 0 | - | - | - | 0 | 0 | - | - | - |
| **10% ~ 20%** | 0 | 0 | - | - | - | 0 | 0 | - | - | - |
| **20% ~ 30%** | 0 | 0 | - | - | - | 0 | 0 | - | - | - |
| **30% ~ 40%** | 211 | 91 | **43.13%** | 36.87% | **-6.26%p** (Underconfident) | 161 | 67 | **41.61%** | 38.27% | **-3.35%p** |
| **40% ~ 50%** | 457 | 234 | **51.20%** | 45.41% | **-5.79%p** (Underconfident) | 390 | 194 | **49.74%** | 44.81% | **-4.94%p** |
| **50% ~ 60%** | 464 | 288 | **62.07%** | 54.59% | **-7.47%p** (Underconfident) | 432 | 241 | **55.79%** | 54.81% | **-0.98%p** (Tight) |
| **60% ~ 70%** | 204 | 153 | **75.00%** | 64.19% | **-10.81%p** (Underconfident)| 252 | 176 | **69.84%** | 64.41% | **-5.43%p** |
| **70% ~ 80%** | 74 | 63 | **85.14%** | 73.94% | **-11.19%p** (Underconfident)| 108 | 86 | **79.63%** | 74.35% | **-5.28%p** |
| **80% ~ 90%** | 3 | 3 | **100.0%** | 80.57% | **-19.43%p** | 58 | 49 | **84.48%** | 83.82% | **-0.67%p** (Tight) |
| **90% ~ 100%**| 0 | 0 | - | - | - | 12 | 9 | **75.00%** | 91.60% | **+16.60%p** |

### Calibration Audit Findings:
1. **Favorite Underconfidence:** Across the 50% ~ 80% probability range, both the Model and No-Vig underestimate the true win frequency of heavy favorites by $5\%p \sim 11\%p$.
2. **Shin No-Vig Superiority on Extremes:** In the 50%~60% and 80%~90% bins, the Shin No-Vig model exhibits near-perfect calibration (gaps of $-0.98\%p$ and $-0.67\%p$), outperforming the blended Model.

---

## 5. Sport Diagnostic (Model vs No-Vig Side-by-Side)

| Sport | Settled Sample | Model Hit Rate | No-Vig Hit Rate | Model Brier | No-Vig Brier | Model LogLoss | No-Vig LogLoss | Model ROI | No-Vig ROI | Avg Odds |
|---|---|---|---|---|---|---|---|---|---|---|
| **Soccer (sc)** | 660 | **55.15%** | 54.85% | 0.5605 | 0.5526 | 0.9516 | 0.9323 | **-11.14%** | **-11.85%** | 1.611 |
| **Baseball (bs)** | 634 | **59.62%** | 58.36% | 0.5271 | 0.5303 | 0.8280 | 0.8337 | **+5.10%** | **+1.09%** | 1.763 |
| **Basketball (bk)**| 83 | **67.47%** | 67.47% | 0.4799 | 0.4955 | 0.7077 | 0.7382 | **-3.36%** | **-3.36%** | 1.433 |
| **Volleyball (vl)**| 36 | **94.44%** | 94.44% | 0.2575 | 0.1967 | 0.4361 | 0.3559 | **+17.64%** | **+17.64%** | 1.246 |

*Statistical Note:* Basketball ($N=83$) and Volleyball ($N=36$) sample sizes are too small to infer sport-specific structural edges.

---

## 6. Market Diagnostic

| Sport & Market Subtype | Settled | Model Hits | Model Hit Rate | No-Vig Hits | No-Vig Hit Rate | Model Fixed ROI | No-Vig Fixed ROI |
|---|---|---|---|---|---|---|---|
| **Soccer Standard 1X2 (3-way)** | 660 | 364 | **55.15%** | 362 | 54.85% | **-11.14%** | **-11.85%** |
| **Baseball Moneyline (2-way)** | 634 | 378 | **59.62%** | 370 | 58.36% | **+5.10%** | **+1.09%** |
| **Basketball Moneyline (2-way)**| 83 | 56 | **67.47%** | 56 | 67.47% | **-3.36%** | **-3.36%** |
| **Volleyball Moneyline (2-way)**| 36 | 34 | **94.44%** | 34 | 94.44% | **+17.64%** | **+17.64%** |

---

## 7. Round Drift & Temporal Performance Analysis

| Year | Round | MasterSeq | Settled | Model Hit Rate | Model ROI | No-Vig Hit Rate | Avg EV | Avg Odds | Dominant Sport |
|---|---|---|---|---|---|---|---|---|---|
| **2025** | R150 | 30049 | 141 | **58.16%** | **-5.11%** | 58.16% | -17.66% | 1.631 | Soccer (86) |
| **2025** | R151 | 30080 | 50 | **74.00%** | **+8.98%** | 74.00% | -17.83% | 1.473 | Basketball (34) |
| **2026** | R110 | 31512 | 202 | **60.40%** | **+0.92%** | 57.92% | -16.18% | 1.671 | Baseball (130) |
| **2026** | R111 | 31523 | 390 | **61.28%** | **+4.97%** | 58.46% | -14.79% | 1.714 | Baseball (235) |
| **2026** | R112 | 31568 | 100 | **59.00%** | **-4.80%** | 58.00% | -14.06% | 1.611 | Baseball (56) |
| **2026** | R113 | 31569 | 161 | **56.52%** | **-6.43%** | 59.63% | -13.95% | 1.657 | Baseball (106) |
| **2026** | R114 | 31583 | 287 | **54.36%** | **-10.43%** | 55.05% | -14.44% | 1.649 | Soccer (142) |
| **2026** | R115 | 31605 | 82 | **56.10%** | **-13.54%** | 56.10% | -15.51% | 1.543 | Soccer (82) |

### Investigation of ROI Downturn in R114 & R115:
* **Sport Composition Shift:** In R110~R111 (positive ROI), Baseball accounted for **62.7%** of settled fixtures. In R114~R115, Soccer increased to **60.7%** (and 100% in R115 settled).
* **3-Way Draw Variance:** Soccer exhibits a $26\%\sim 30\%$ draw occurrence rate where binary favorite selections lose full stake, driving down flat-bet ROI across all models.

---

## 8. Favorite vs Underdog Segmentation

Segmentation based on pre-match odds thresholds:

| Segment | Odds Threshold | Sample Count | Hits | Hit Rate | Avg Odds | Avg Model Prob | Avg No-Vig Prob | Avg EV | Realized ROI |
|---|---|---|---|---|---|---|---|---|---|
| **Heavy Favorite** | $O \le 1.50$ | 442 | 330 | **74.66%** | 1.314 | 63.18% | 69.99% | -17.80% | **-2.73%** |
| **Moderate Favorite**| $1.50 < O \le 2.00$ | 638 | 350 | **54.86%** | 1.734 | 49.44% | 51.87% | -14.81% | **-4.96%** |
| **Slight Underdog** | $2.00 < O \le 3.00$ | 333 | 152 | **45.65%** | 2.221 | 39.48% | 39.84% | -12.54% | **+1.81%** |
| **Longshot Underdog**| $O > 3.00$ | 0 | 0 | - | - | - | - | - | - |

*(Note: In Strategy A Model Max Prob, no selection exceeded odds of 3.00 because max probability always favors the market favorite).*

---

## 9. Model vs No-Vig Transition Matrix & Discordant Pairs

| Contingency Cell | Definition | Match Count | Share of Settled |
|---|---|---|---|
| **$N_{11}$** | Both Model Hit & No-Vig Hit | **797** | 56.40% |
| **$N_{10}$** | Model Hit & No-Vig Miss | **35** | 2.48% |
| **$N_{01}$** | Model Miss & No-Vig Hit | **25** | 1.77% |
| **$N_{00}$** | Both Model Miss & No-Vig Miss | **556** | 39.35% |
| **Total Settled** | | **1,413** | 100.0% |

### Analysis of Discordant Pairs ($N_{10} = 35$ vs $N_{01} = 25$):
* **Net Improvement:** $N_{10} - N_{01} = +10$ matches.
* **Characteristics of Model-Only Hits ($N_{10}$):** Concentrated in close-odds Baseball games ($O_{win} \approx 2.30 \sim 2.50$, $O_{lose} \approx 2.20 \sim 2.45$) where Expanding Elo rating successfully identified the slight underdog form advantage over the unadjusted market odds.

---

## 10. Statistical Significance & Hypothesis Testing

To test whether the $+0.71\%p$ accuracy difference between Model (58.88%) and No-Vig (58.17%) is statistically significant:

### A. Exact McNemar Test
* Discordant pair sample: $n = N_{10} + N_{01} = 35 + 25 = 60$
* Test statistic: $k = \min(35, 25) = 25$
* Exact Binomial Two-Tailed $p$-value:
  $$p = 0.2451$$
* **Verdict:** **NOT STATISTICALLY SIGNIFICANT ($p > 0.05$)**. The null hypothesis that Model and No-Vig have identical accuracy cannot be rejected at the 95% confidence level.

### B. 10,000 Paired Bootstrap 95% Confidence Intervals
| Metric Difference ($\Delta = \text{Model} - \text{NoVig}$) | Point Estimate | 95% Bootstrap CI [Lower, Upper] | Crosses Zero? | Significance |
|---|---|---|---|---|
| **$\Delta \text{Hit Rate}$** | **+0.71%p** | **[-0.35%p, +1.84%p]** | **YES** | Not Significant |
| **$\Delta \text{Brier Score}$** | **+0.0029** | **[-0.0012, +0.0068]** | **YES** | Not Significant |
| **$\Delta \text{Log Loss}$** | **+0.0067** | **[+0.0005, +0.0126]** | **NO** | Slight LogLoss Penalty |
| **$\Delta \text{Fixed ROI}$** | **+2.13%p** | **[-0.13%p, +4.45%p]** | **YES** | Not Significant |

---

## 11. ROI Statistical Uncertainty

10,000 Resample Bootstrap Confidence Intervals on 1-Unit Fixed Stakes:

* **Production Model Fixed ROI (Strategy A):**
  * Point Estimate: **-2.67%**
  * 95% Bootstrap CI: **[-7.09%, +1.88%]**
* **No-Vig Benchmark Fixed ROI:**
  * Point Estimate: **-4.80%**
  * 95% Bootstrap CI: **[-9.15%, -0.41%]**

*Conclusion:* Due to the confidence interval spanning from -7.09% to +1.88%, positive expectation is **not proven** on this 8-round sample.

---

## 12. Distribution of Pending 389 Matches

The 389 pending/unsettled matches are distributed as follows:

| Round | Sport | Match Count | Reason |
|---|---|---|---|
| **2026 R115** | Baseball (bs) | 250 | In-progress / scheduled future round games |
| **2026 R115** | Soccer (sc) | 75 | In-progress / scheduled future round games |
| **2026 R115** | Basketball (bk) | 33 | In-progress / scheduled future round games |
| **2026 R115** | Volleyball (vl) | 31 | In-progress / scheduled future round games |
| **Total Pending** | | **389** | **100% Excluded from V1 performance stats** |

---

## 13. Data Integrity & Leakage Audit

* **Synthetic Data Records:** **0**
* **Fallback Invocations:** **0**
* **Future Result Leakage:** **0**
* **Future Odds Leakage:** **0**
* **Score-to-Outcome Inversions:** **0**
* **Duplicate Match Records:** **0**
* **Timestamp Order Violations:** **0**
* **Audit Verdict:** **PASS (100% Clean Provenance)**

---

## 14. Key Findings

1. **Baseline Accuracy Established:** Production Model achieves **58.88% hit rate** vs **58.17% No-Vig benchmark** on 1,413 settled Standard matches.
2. **Statistical Parity:** Exact McNemar test ($p = 0.245$) and Paired Bootstrap CI ($[-0.35\%p, +1.84\%p]$) demonstrate that the performance difference is currently within random variance.
3. **EV Longshot Bias Hazard Identified:** Uncalibrated high-odds EV selections ($EV \ge 10\%$, Avg Odds 6.74) lose -38.41% ROI due to severe probability overestimation on underdogs (+9.45%p gap). Flat-betting high EV on high odds without shrinkage is destructive.
4. **Market-Specific Divergence:** Baseball achieved positive ROI (+5.10%), whereas Soccer suffered negative ROI (-11.14%) due to 3-way draw dilution.

---

## 15. Limitations

1. **Temporal Horizon Constraint:** 8 rounds span only ~4 months. This is sufficient for pipeline verification but insufficient for stationary multi-season validation.
2. **Single Market Scope:** V1 covers only Standard 1X2 / ML (1,802 of 4,315 valid matches). Handicap (691) and Under/Over (911) require dedicated modeling.
3. **Single Odds Snapshot:** Lack of historical opening/closing time-series prohibits True CLV testing.

---

## 16. Next-Step Requirements

1. **Out-of-Sample Expansion:** Collect 50~100 historical rounds to expand settled standard sample size from 1,413 to $10,000+$.
2. **Longshot Shrinkage Calibration:** Implement white-consistent Bayesian shrinkage on low-probability selections before evaluating EV-based betting strategies.
3. **Handicap & Under/Over V2 Model Partitioning:** Build dedicated 2-state Poisson/Spread modeling for the 2,513 currently unmodeled non-standard market fixtures.
