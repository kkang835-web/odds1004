# PROTO REAL HISTORICAL WALK-FORWARD V1 BASELINE REPORT

**Document Version:** `1.0.0-real-proto-walk-forward-v1`  
**Execution Date:** 2026-09-29  
**System:** SportsQuant Pro Quantitative Research Division  
**Dataset Reference:** `data/realProtoHistoricalDataset.json`  
**Output Storage:** `data/protoRealWalkForwardV1.json`  
**Integrity Standard:** Zero Synthetic, Zero Fallback, Zero Look-Ahead, Real Domestic Odds Only  

---

## 1. Executive Summary & Scope

This report presents the empirical baseline measurement from executing **Sequential Expanding-Window Walk-Forward Validation** across **8 official WiseToto historical rounds (2025~2026)**.

### A. Dataset Scope
| Category | Metric | Ratio | Description |
|---|---|---|---|
| **Total Records in Dataset** | **4,877** | 100.0% | Official WiseToto DOM Parsed Matches |
| **VALID Records** | **4,315** | 88.48% | Verified Domestic Odds ($>1.0$), Real Teams & Results |
| **Used in Walk-Forward (Standard)**| **1,802** | 36.95% | Standard 1X2 / ML Market Fixtures |
| **Settled Standard Matches** | **1,413** | 28.97% | Verified Post-Match Confirmed Outcomes |
| **Pending / Unconfirmed Matches** | **389** | 7.98% | Scheduled Future / Unsettled Matches in R115 |
| **Unsupported Market Categories** | **2,513** | 51.53% | Handicap (691), Under/Over (911), SUM (911) |
| **Excluded (Invalid Odds)** | **562** | 11.52% | Unquoted / Postponed lines |

---

## 2. Sport & Market Coverage

### A. Sport Coverage (Standard 1X2 / ML Settled)
| Sport | Total Standard | Settled Matches | Pending | Model Hit Rate | No-Vig Hit Rate | Fixed ROI (Model) |
|---|---|---|---|---|---|---|
| **Soccer (sc)** | 735 | 660 | 75 | **55.15%** | 54.85% | **-11.14%** |
| **Baseball (bs)** | 884 | 634 | 250 | **59.62%** | 58.36% | **+5.10%** |
| **Basketball (bk)**| 116 | 83 | 33 | **67.47%** | 67.47% | **-3.36%** |
| **Volleyball (vl)**| 67 | 36 | 31 | **94.44%** | 94.44% | **+17.64%** |
| **Total** | **1,802** | **1,413** | **389** | **58.88%** | **58.17%** | **-2.67%** |

### B. Market Breakdown (Entire Dataset)
* **Standard 1X2 / ML:** 1,802 (Tested in V1 Baseline)
* **Handicap (Spread):** 691 (Classified as `Handicap` — Reserved for V2 Spread Model)
* **Under/Over (Totals):** 911 (Classified as `UnderOver` — Reserved for V2 Totals Model)
* **SUM (Points/Goals Sum):** 911 (Classified as `SUM` — Reserved for V2 Poisson-Sum Model)

---

## 3. Prediction Accuracy & Loss Metrics

| Metric | Production Model | No-Vig Benchmark | Delta (Model - No-Vig) | Interpretation |
|---|---|---|---|---|
| **Accuracy / Hit Rate** | **58.88%** (832 / 1,413) | **58.17%** (822 / 1,413) | **+0.71%p** | Marginal accuracy gain over raw market favorite |
| **Brier Score** | **0.5331** | **0.5302** | **+0.0029** | Slight overconfidence penalty vs homoskedastic Shin |
| **Log Loss** | **0.8687** | **0.8620** | **+0.0067** | Closely aligned with Shin No-Vig boundary |

---

## 4. Betting Strategy Simulation (1-Unit Fixed Stake)

All strategies are executed strictly using **pre-match fixed rules** without look-ahead or post-hoc threshold tuning.

| Strategy Rule | Total Bets | Wins | Losses | Push | Hit Rate | Total Staked | Total Return | Net Profit | ROI / Yield | Avg Odds | Avg EV |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Strategy A: Model Max Prob** | 1,413 | 832 | 581 | 0 | **58.88%** | 1,413.0 | 1,375.33 | -37.67 | **-2.67%** | 1.718 | -15.21% |
| **Strategy B: EV > 0%** | 454 | 86 | 368 | 0 | **18.94%** | 454.0 | 347.61 | -106.39 | **-23.43%** | 5.733 | +25.03% |
| **Strategy C: EV >= 2%** | 382 | 66 | 316 | 0 | **17.28%** | 382.0 | 284.99 | -97.01 | **-25.40%** | 6.169 | +29.57% |
| **Strategy D: EV >= 5%** | 311 | 46 | 265 | 0 | **14.79%** | 311.0 | 215.56 | -95.44 | **-30.69%** | 6.738 | +35.50% |
| **No-Vig Benchmark (Max Prob)** | 1,413 | 822 | 591 | 0 | **58.17%** | 1,413.0 | 1,345.20 | -67.80 | **-4.80%** | 1.710 | -15.82% |

*Key Quantitative Finding:* In regulated fixed-odds markets with a $12\% \sim 16\%$ margin overround, chasing extreme uncalibrated positive EV selections on high odds ($Avg Odds \approx 5.73 \sim 6.74$) without shrinkage creates negative realized yield due to longshot bias in public bookmaker pricing.

---

## 5. Fixed EV Bucket Performance

| EV Bucket | Sample Count | Winning Bets | Losing Bets | Hit Rate | Average EV | Total Staked | Net Profit | Realized ROI |
|---|---|---|---|---|---|---|---|---|
| **EV < 0% (Favorites / Standard)** | 959 | 399 | 560 | **41.61%** | -7.52% | 959.0 | -34.82 | **-3.63%** |
| **EV 0% ~ 2%** | 72 | 20 | 52 | **27.78%** | +0.96% | 72.0 | -9.38 | **-13.03%** |
| **EV 2% ~ 5%** | 71 | 20 | 51 | **28.17%** | +3.58% | 71.0 | -1.57 | **-2.21%** |
| **EV 5% ~ 10%** | 69 | 17 | 52 | **24.64%** | +7.34% | 69.0 | -2.49 | **-3.61%** |
| **EV 10%+ (Extreme Underdogs)** | 242 | 29 | 213 | **11.98%** | +43.53% | 242.0 | -92.95 | **-38.41%** |

---

## 6. Round-by-Round Chronological Progression

| Year | Round | MasterSeq | Standard Matches | Settled | Model Hits | Model Hit Rate | No-Vig Hits | Brier Score | Log Loss | Fixed ROI | Avg EV |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **2025** | R150 | 30049 | 156 | 141 | 82 | **58.16%** | 82 | 0.5558 | 0.9036 | **-5.11%** | -17.66% |
| **2025** | R151 | 30080 | 60 | 50 | 37 | **74.00%** | 37 | 0.4521 | 0.7262 | **+8.98%** | -17.83% |
| **2026** | R110 | 31512 | 252 | 202 | 122 | **60.40%** | 117 | 0.5435 | 0.8890 | **+0.92%** | -16.18% |
| **2026** | R111 | 31523 | 476 | 390 | 239 | **61.28%** | 228 | 0.5391 | 0.8883 | **+4.97%** | -14.79% |
| **2026** | R112 | 31568 | 137 | 100 | 59 | **59.00%** | 58 | 0.5061 | 0.8046 | **-4.80%** | -14.06% |
| **2026** | R113 | 31569 | 206 | 161 | 91 | **56.52%** | 96 | 0.5211 | 0.8371 | **-6.43%** | -13.95% |
| **2026** | R114 | 31583 | 366 | 287 | 156 | **54.36%** | 158 | 0.5377 | 0.8718 | **-10.43%** | -14.44% |
| **2026** | R115 | 31605 | 149 | 82 | 46 | **56.10%** | 46 | 0.5289 | 0.8817 | **-13.54%** | -15.51% |

---

## 7. Zero Look-Ahead & Leakage Audit

Automated validation verified 100% compliance across all 1,802 Walk-Forward records:
* **Future Data Leakage:** **0** (Zero future matches referenced)
* **Future Result Leakage:** **0** (Outcome and scores applied strictly post-inference)
* **Future Odds Leakage:** **0** (Pre-match domestic odds frozen at inference time)
* **Timestamp Violation Count:** **0** (`predictionCreatedAt` $\le$ `settledAt`)
* **Audit Verdict:** **PASS (100% LEAKAGE-FREE)**

---

## 8. Explicit Status of Specialized Modules

* **CLV (Closing Line Value):** **DISABLED** (No multi-timestamp odds feed available in pilot dataset)
* **William Benter Two-Step MNL:** **DISABLED** (Requires multi-year fundamental regression before live deployment)

---

## 9. Conclusion & Baseline Finding

1. **Baseline Measurement Accomplished:** The PROTO Real Historical Walk-Forward engine is now fully functional, zero-leakage verified, and grounded in 100% real WiseToto official domestic odds and results.
2. **Model Behavior:** Production model achieves **58.88% hit rate** vs **58.17% No-Vig benchmark** on Standard 1X2 / ML fixtures, outperforming simple fixed betting (-2.67% ROI vs -4.80% No-Vig benchmark ROI).
3. **Sample Size Notice:** While 1,413 settled matches provide high precision for single-market testing, 8 rounds remain insufficient for multi-year stationarity claims. Future expansion to 100+ rounds is recommended for production calibration.
