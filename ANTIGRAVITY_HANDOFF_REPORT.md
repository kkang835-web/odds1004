# 🛸 ODDSALGO(오즈알고) 개발 진행상황 및 시스템 핸드오프 리포트 (To: 안티그래비티)

**문서 작성일시**: 2026-11-07  
**대상 시스템**: ODDSALGO (스포츠퀀트 배당 분석 및 프로토 승부식 밸류 벳 시스템)  
**런타임 환경**: Node.js + Express (Port 3000) / React + Vite + Tailwind CSS / TypeScript  
**현재 상태**: ✅ 빌드 성공 (`tsc --noEmit` 0 에러), 개발 서버 정상 가동, 실시간 프로토 승부식 130회차 정상 서빙 중

---

## 1. 📌 핵심 개발 요약 (Executive Summary)

1. **와이즈토토(WiseToto) 실시간 해외 배당 엔진 직결 완료**
   - 기존 제3자(벳인포 Staging/JSON) 의존성을 완전 제거.
   - 와이즈토토 공식 해외 배당 엔진(`/util/gameinfo/get_foreign_rate.htm`)에 경기 고유 시퀀스(`schedule_info_seq`) 및 마켓 코드(`n`: 일반, `h`: 핸디캡, `u`: 언더오버)로 직결 연동.
   - Bet365, UNIBET, Bwin, William Hill 등 글로벌 북메이커 실시간 배당률 및 변동 방향(`ico_up`, `ico_down`) 파싱 성공 (2026년 130회차 기준 235경기 전 마켓 실시간 매칭).

2. **현재 발매 회차 자동 감지 시스템 가동 (`/api/active-rounds`)**
   - 벳맨 공식 API(`inqCacheBuyAbleGameInfoList.do`) 및 와이즈토토 메인 인덱스를 동기화하여 현재 발매 중인 최신 회차를 자동 감출.
   - 브라우저 새로고침 시 수동 회차 선택 없이도 최신 발매 회차(현재 130회차)가 기본 로드됨.

3. **와이즈토토 5대 상세분석 탭 100% 파싱 및 화면 연동**
   - ① 상대전적 (`get_detail_match_record.htm`): 맞대결 써클 차트(승무패), 최근 5~10경기 상세 스코어, 전반/5회 점수, 득실점 요약.
   - ② 최근전적 (`get_detail_latest_record.htm`): 홈/원정팀 최근 5경기 결과, 리그, 상대팀, 스코어, 승무패, 연승/연패 스트릭.
   - ③ 기록통계 (`get_detail_statistics.htm`): 시즌 전체 및 홈/원정 평균 득실점, 클린시트율, 무득점율, 최다 득실점.
   - ④ 라인업 (`get_detail_lineup.htm`): 야구 선발투수 ERA/이닝/탈삼진/WHIP 및 타순, 축구 11인 선발 및 결장(OUT/GTD) 현황.
   - ⑤ 리그순위 (`get_detail_league_rank.htm` / `limit=season`): 공식 리그 순위표, 승점, 득실차, 디비전 분할, 친선/컵대회 오염 방지 가드.

4. **해외 배당 변동 추적 차트 (스팀 무브) 고도화**
   - 상세분석 모달 내 1X2, 핸디캡, 언더오버 3대 마켓별 실시간 배당 궤적(Recharts) 렌더링.
   - 개장 배당 ➔ 24시간 전 ➔ 6시간 전 ➔ 현재 발매 배당까지 시간대별 단계적 변동 곡선 및 -2.0% 이상 급락 시 `🚨 강력한 스마트머니 배당 하락세` 경보 배지 발동.

5. **야구 승1패(W1L) 마켓 제약 및 배당 1.45+ 엄격 필터링 정책 확립**
   - 승1패(W1L) 마켓은 오직 '야구(Baseball)' 종목에만 한정 적용 (축구/농구/배구 수리적 배제).
   - 1.45 미만 극저배당은 실전 가치 부족으로 추천 조합에서 배제하고, 1.45~2.20 황금 스윗스팟 구간 위주로 추천.

---

## 2. 🏗️ 시스템 아키텍처 및 데이터 흐름

```
[데이터 수집원]
 ├─ 벳맨(BetMan) 공식 API   ───▶ 현재 발매 회차, 마감 시간, 공식 국내 배당
 ├─ 와이즈토토(WiseToto) 실시간 ───▶ 해외 북메이커(Bet365 등) 배당, 상세분석 5종
 └─ 18개년 프로토 빅데이터   ───▶ 과거 동일/유사 배당 출현 통계
         │
         ▼
[데이터 정규화 & 검증 엔진]
 ├─ 리그/종목 식별 및 뱃지 표준화 (축구·야구·농구·배구)
 ├─ 친선/컵대회 토너먼트 오염 방지 가드 (비리그 경기 공식순위 차단)
 └─ 팀명 정규화 (WiseToto ↔ 공식 명칭 매칭)
         │
         ▼
[오즈알고 퀀트 분석 엔진 (Quant Engine)]
 ├─ 1) 무마진 공정 확률(No-Vig True Prob) 역산
 ├─ 2) EV (기대수익률) 및 마켓별 가치(Value Bet) 판정
 ├─ 3) 섀넌 엔트로피(Shannon Entropy) 불확실성 리스크 측정
 ├─ 4) 켈리 기준(Kelly Criterion) 최적 자금 배분율 계산
 ├─ 5) 스팀 무브(Steam Move) 해외 스마트머니 급락 감지
 └─ 6) 18개년 역대 실전 배당 패턴 적중률 대조
         │
         ▼
[프런트엔드 시각화]
 ├─ 메인 경기 목록 (MatchTable)
 └─ 상세분석 모달 6대 탭 (DetailedAnalysisModal)
```

---

## 3. 📐 11대 핵심 수리 모델 명세

| 번호 | 수리 모델명 | 적용 대상 | 주요 수식 및 역할 |
| :---: | :--- | :--- | :--- |
| **1** | **Dixon-Coles Bivariate Poisson** | 축구 | $\lambda = \frac{\text{Base}}{2}(\text{Att}_H \text{Def}_A)$, 저득점 상관계수 $\tau(x,y)$ ($\rho=-0.13$) 보정 스코어 매트릭스 |
| **2** | **Bayesian Poisson & Skellam** | 야구 | 선발투수 ERA 차이 보정 $\text{eraFactor} = (\text{ERA}_A - \text{ERA}_H) \times 0.35$, 스켈람 분포 승패 |
| **3** | **Baseball 5-Inning W1L** | 야구 승1패 | $\lambda_{H\_5} = \frac{\text{ERA}_H}{9} \times 5 \times 0.5 + 2.1$, 2점차 이상(승/패) 및 1점차 접전(1) 삼분할 |
| **4** | **Logistic ELO & Pace Rating** | 농구/배구 | $P(\text{Home}) = \frac{1}{1 + 10^{-(\text{Elo}_H + 75 - \text{Elo}_A)/400}}$, Pace 기준점 득점 보정 |
| **5** | **Proportional No-Vig Margin Removal** | 전 종목 | $\text{Overround} = \sum \frac{1}{O_i} - 1$, $P_{\text{No-Vig}} = \frac{1/O_i}{1+\text{Overround}}$, 샤프 북메이커 70% 블렌딩 |
| **6** | **Expected Value (EV) & Edge** | 전 종목 | $\text{EV} = (O \times P_{\text{True}}) - 1$, $\text{Edge} = P_{\text{Model}} - P_{\text{Market}}$, $\text{EV} > 0$ 가치 픽 판정 |
| **7** | **Shannon Information Entropy** | 전 종목 | $H(X) = -\sum P_i \log_2 P_i$, 3-Way 축구 >1.51 bits / 2-Way >0.96 bits 초접전 난전 경보 |
| **8** | **Fractional Kelly Criterion** | 자금 관리 | $f^* = \frac{p \cdot O - 1}{O - 1}$, 자금 보호를 위한 1/2 Half-Kelly 및 최대 5.0% 상한 캡 적용 |
| **9** | **Brier Score Online Loss** | 사후 검증 | $BS = \frac{1}{N}\sum (f_t - o_t)^2$, 목표치 $BS \le 0.180$ 달성 시 `A+ 최적 캘리브레이션` 인증 |
| **10** | **Golden Quant Scoring Kernel** | 픽 선출 | 가우시안 배당 효용 $U(O) = 24 \exp\left(-\frac{(O-1.78)^2}{2\sigma^2}\right)$, 배당 1.65~2.20 스윗스팟 우대 |
| **11** | **Steam Move Velocity** | 배당 변동 | $\text{Velocity} = \frac{O_t - O_0}{O_0} \times 100\%$, 변동률 $\le -2.0\%$ 시 스마트머니 급락 감지 |

---

## 4. 🗂️ 핵심 파일 구조

- `server.ts`: 백엔드 진입점, 와이즈토토/벳맨 스크래퍼 및 세션 쿠키 관리, `/api/matches`, `/api/matches/h2h`, `/api/active-rounds`
- `server/wisetotoH2HParser.ts`: 와이즈토토 맞대결(H2H), 최근 5경기, 공식 리그 순위표 정규화 파서
- `server/wisetotoLineupParser.ts`: 야구/축구 선발 라인업 및 결장자 파서
- `src/utils/quantPickEvaluator.ts`: 4대 마켓 공정확률 산출, EV, 켈리, 섀넌 엔트로피, 2폴더 추천 조합 생성기
- `src/utils/quantModel.ts`: 고속(<10ms) Dixon-Coles, ELO, Bayesian Skellam 수리 모델 및 25분 TTL 캐시
- `src/utils/leagueNormalizer.ts`: 전 세계 4대 스포츠 리그 표준화 및 대회 성격(정규리그 vs 컵대회) 분리 가드
- `src/components/MatchTable.tsx`: 메인 승부식 경기 목록, 국내/해외 배당 비교, 퀀트 시그널 표출
- `src/components/DetailedAnalysisModal.tsx`: 상세분석 모달 (6대 탭 컨테이너)
- `src/components/analysis/OddsPreviewTabView.tsx`: 실시간 배당 변동 궤적 차트 및 18개년 프로토 DB 대조

---

## 5. 🎯 다음 운영 및 고도화 권장 사항 (Next Steps)

1. **실시간 경기 결과 자동 확정 및 수기 정산 자동화**:
   - 와이즈토토 경기 종료 스코어를 감지하여 적중/미적중 상태를 자동 마킹하는 배치 스케줄러 점검.
2. **다폴더 조합 최적화기 (Combinatorial Bet Slip Optimizer)**:
   - 현재 2폴더 앵커-부스터 조합 외에 3~4폴더 상관관계(Correlation) 제거 분산 조합기 추가 지원 가능.
3. **사용자 즐겨찾기 / 알림 기능 연동**:
   - 특정 경기 스마트머니 스팀무브(-3% 이상 급락) 발생 시 푸시/인앱 알림 기능 확장 준비.
