import React from 'react';

interface QuantValueTabViewProps {
  topPick: string;
  entropyRisk: string;
  entropyBitsNum: number;
  entropy: string;
  roi: string;
  primaryPick: any;
  kellyStake: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  domWin: number | null;
  domDraw: number | null;
  domLose: number | null;
  homeTrueProb: number;
  drawTrueProb: number;
  awayTrueProb: number;
  mktHomeProb: number;
  mktDrawProb: number;
  mktAwayProb: number;
  matchCand: any;
  w1lCand?: any;
  hdpCand: any;
  uoCand: any;
  handicapLine: any;
  uoLine: any;
  comprehensiveProto?: any;
  h2hData?: any;
}

export function QuantValueTabView({
  topPick,
  entropyRisk,
  entropy,
  roi,
  primaryPick,
  kellyStake,
  homeTeam,
  awayTeam,
  sport,
  domWin,
  domDraw,
  domLose,
  homeTrueProb,
  drawTrueProb,
  awayTrueProb,
  mktHomeProb,
  mktDrawProb,
  mktAwayProb,
  matchCand,
  hdpCand,
  uoCand,
  handicapLine,
  uoLine,
  comprehensiveProto
}: QuantValueTabViewProps) {
  const isNoDrawSport = sport === 'baseball' || sport === 'basketball' || sport === 'volleyball';

  // 1. Candidates from primaryPick
  const winCand = primaryPick?.candidates?.find((c: any) => c.marketLabel === '일반(승)');
  const drawCand = primaryPick?.candidates?.find((c: any) => c.marketLabel === '일반(무)');
  const loseCand = primaryPick?.candidates?.find((c: any) => c.marketLabel === '일반(패)');

  const minusHdpCand = primaryPick?.candidates?.find((c: any) => c.marketLabel === '마핸(-)');
  const plusHdpCand = primaryPick?.candidates?.find((c: any) => c.marketLabel === '플핸(+)');

  const underCand = primaryPick?.candidates?.find((c: any) => c.marketLabel === '언더(U)');
  const overCand = primaryPick?.candidates?.find((c: any) => c.marketLabel === '오버(O)');

  // 승1패 Candidates (Baseball Only)
  const w1lWinCand = primaryPick?.candidates?.find((c: any) => c.marketLabel === '승1패(승)');
  const w1l1Cand = primaryPick?.candidates?.find((c: any) => c.marketLabel === '승1패(1)');
  const w1lLoseCand = primaryPick?.candidates?.find((c: any) => c.marketLabel === '승1패(패)');

  // 1X2 Probabilities & EV
  const hTrueProb = winCand?.prob ?? homeTrueProb;
  const dTrueProb = !isNoDrawSport ? (drawCand?.prob ?? drawTrueProb) : 0;
  const aTrueProb = loseCand?.prob ?? awayTrueProb;

  // 1X2 Selection
  const isSoccer = sport === 'soccer' || sport === 'sc' || sport === 'sc1';
  const is1X2Valid = Boolean(
    domWin && typeof domWin === 'number' && domWin > 1.0 &&
    domLose && typeof domLose === 'number' && domLose > 1.0 &&
    (!isSoccer || (domDraw && typeof domDraw === 'number' && domDraw > 1.0))
  );

  const evWin = winCand?.expectedRoi ?? (is1X2Valid && domWin ? Math.round(((domWin * (hTrueProb / 100)) - 1) * 1000) / 10 : 0);
  const evDraw = domDraw && is1X2Valid ? (drawCand?.expectedRoi ?? Math.round(((domDraw * (dTrueProb / 100)) - 1) * 1000) / 10) : -99;
  const evLose = loseCand?.expectedRoi ?? (is1X2Valid && domLose ? Math.round(((domLose * (aTrueProb / 100)) - 1) * 1000) / 10 : 0);

  const matchCandidates = [winCand, !isNoDrawSport ? drawCand : null, loseCand].filter(Boolean);
  const bestMatchCand = is1X2Valid && matchCandidates.length > 0
    ? [...matchCandidates].sort((a, b) => (b?.score ?? -999) - (a?.score ?? -999))[0]
    : null;

  const is1X2HomeSelected = is1X2Valid && bestMatchCand === winCand;
  const is1X2DrawSelected = is1X2Valid && !isNoDrawSport && bestMatchCand === drawCand;
  const is1X2AwaySelected = is1X2Valid && bestMatchCand === loseCand;

  // Handicap calculations
  const rawHdpNum = typeof handicapLine === 'number' 
    ? handicapLine 
    : (parseFloat(String(handicapLine || '')) || (sport === 'soccer' ? -1 : sport === 'baseball' ? -1.5 : -4.5));
  const homeHdpNum = rawHdpNum;
  const awayHdpNum = -rawHdpNum;

  const homeHdpSign = homeHdpNum > 0 ? `+${homeHdpNum}` : `${homeHdpNum}`;
  const awayHdpSign = awayHdpNum > 0 ? `+${awayHdpNum}` : `${awayHdpNum}`;
  const displayHdpLine = homeHdpSign;

  const isHomeMinus = homeHdpNum < 0;
  const homeHdpCand = isHomeMinus ? minusHdpCand : plusHdpCand;
  const awayHdpCand = isHomeMinus ? plusHdpCand : minusHdpCand;

  const isHdpValid = Boolean(homeHdpCand && awayHdpCand && homeHdpCand.odds > 1.0 && awayHdpCand.odds > 1.0);
  const hdpCandidates = [homeHdpCand, awayHdpCand].filter(Boolean);

  const primaryHdpMatch = isHdpValid && (primaryPick?.marketLabel?.includes('마핸') || primaryPick?.marketLabel?.includes('플핸'))
    ? hdpCandidates.find(c => c && primaryPick.recommendedPick.includes(c.pick))
    : null;

  const bestHdpCand = isHdpValid && hdpCandidates.length > 0
    ? (primaryHdpMatch || [...hdpCandidates].sort((a, b) => (b?.score ?? -999) - (a?.score ?? -999))[0])
    : null;

  const isHdpPickHome = isHdpValid && (bestHdpCand === homeHdpCand);

  const hdpHomeProb = isHdpValid ? (homeHdpCand?.prob ?? 50.0) : 0;
  const hdpAwayProb = isHdpValid ? (awayHdpCand?.prob ?? 50.0) : 0;
  const hdpHomeMktProb = isHdpValid ? (homeHdpCand?.mktProb ?? 50.0) : 0;
  const hdpAwayMktProb = isHdpValid ? (awayHdpCand?.mktProb ?? 50.0) : 0;

  const hdpOddsHome = isHdpValid ? homeHdpCand?.odds : null;
  const hdpOddsAway = isHdpValid ? awayHdpCand?.odds : null;

  const evHdpHome = isHdpValid ? (homeHdpCand?.expectedRoi ?? (hdpOddsHome ? Math.round(((hdpOddsHome * (hdpHomeProb / 100)) - 1) * 1000) / 10 : 0)) : 0;
  const evHdpAway = isHdpValid ? (awayHdpCand?.expectedRoi ?? (hdpOddsAway ? Math.round(((hdpOddsAway * (hdpAwayProb / 100)) - 1) * 1000) / 10 : 0)) : 0;

  // Under/Over calculations
  const rawUoNum = typeof uoLine === 'number' 
    ? uoLine 
    : (parseFloat(String(uoLine || '')) || (sport === 'soccer' ? 2.5 : sport === 'baseball' ? 8.5 : 165.5));
  const displayUoLine = rawUoNum;

  const isUoValid = Boolean(underCand && overCand && underCand.odds > 1.0 && overCand.odds > 1.0);
  const uoCandidates = [underCand, overCand].filter(Boolean);

  const primaryUoMatch = isUoValid && (primaryPick?.marketLabel?.includes('언더') || primaryPick?.marketLabel?.includes('오버'))
    ? uoCandidates.find(c => c && primaryPick.recommendedPick.includes(c.pick))
    : null;

  const bestUoCand = isUoValid && uoCandidates.length > 0
    ? (primaryUoMatch || [...uoCandidates].sort((a, b) => (b?.score ?? -999) - (a?.score ?? -999))[0])
    : null;

  const isUoPickUnder = isUoValid && (bestUoCand === underCand);

  const uoUnderProb = isUoValid ? (underCand?.prob ?? 50.0) : 0;
  const uoOverProb = isUoValid ? (overCand?.prob ?? 50.0) : 0;
  const uoUnderMkt = isUoValid ? (underCand?.mktProb ?? 50.0) : 0;
  const uoOverMkt = isUoValid ? (overCand?.mktProb ?? 50.0) : 0;

  const uoUnderOdds = isUoValid ? underCand?.odds : null;
  const uoOverOdds = isUoValid ? overCand?.odds : null;

  const evUnder = isUoValid ? (underCand?.expectedRoi ?? (uoUnderOdds ? Math.round(((uoUnderOdds * (uoUnderProb / 100)) - 1) * 1000) / 10 : 0)) : 0;
  const evOver = isUoValid ? (overCand?.expectedRoi ?? (uoOverOdds ? Math.round(((uoOverOdds * (uoOverProb / 100)) - 1) * 1000) / 10 : 0)) : 0;

  // Baseball W1L Calculations
  const isBaseball = sport === 'baseball';
  const isW1LAvailable = isBaseball && Boolean(
    w1lWinCand && w1l1Cand && w1lLoseCand &&
    w1lWinCand.odds > 1.0 && w1l1Cand.odds > 1.0 && w1lLoseCand.odds > 1.0
  );

  const w1lProbWin = w1lWinCand?.prob ?? 0;
  const w1lProb1 = w1l1Cand?.prob ?? 0;
  const w1lProbLose = w1lLoseCand?.prob ?? 0;

  const w1lOddsWin = w1lWinCand?.odds ?? null;
  const w1lOdds1 = w1l1Cand?.odds ?? null;
  const w1lOddsLose = w1lLoseCand?.odds ?? null;

  const evW1LWin = w1lWinCand?.expectedRoi ?? (w1lOddsWin && w1lProbWin > 0 ? Math.round(((w1lOddsWin * (w1lProbWin / 100) - 1) * 100) * 10) / 10 : 0);
  const evW1L1 = w1l1Cand?.expectedRoi ?? (w1lOdds1 && w1lProb1 > 0 ? Math.round(((w1lOdds1 * (w1lProb1 / 100) - 1) * 100) * 10) / 10 : 0);
  const evW1LLose = w1lLoseCand?.expectedRoi ?? (w1lOddsLose && w1lProbLose > 0 ? Math.round(((w1lOddsLose * (w1lProbLose / 100) - 1) * 100) * 10) / 10 : 0);

  const w1lCandidates = [w1lWinCand, w1l1Cand, w1lLoseCand].filter(Boolean);
  const bestW1LCand = isW1LAvailable ? (primaryPick?.bestW1LPick || (w1lCandidates.length > 0 
    ? [...w1lCandidates].sort((a, b) => (b?.score ?? -999) - (a?.score ?? -999))[0]
    : null)) : null;

  const isW1LWinSelected = Boolean(bestW1LCand && bestW1LCand === w1lWinCand);
  const isW1L1Selected = Boolean(bestW1LCand && bestW1LCand === w1l1Cand);
  const isW1LLoseSelected = Boolean(bestW1LCand && bestW1LCand === w1lLoseCand);

  const topCandidate = primaryPick?.candidates?.find((c: any) => c && primaryPick.recommendedPick?.includes(c.pick))
    || primaryPick?.candidates?.[0];

  return (
    <div className="space-y-4">
      {/* ========================================================================= */}
      {/* 🏆 1순위 핵심 모델 예상 결과                                               */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-br from-[#121c2c] via-[#0d1624] to-[#0a111c] border-2 border-blue-500/70 rounded-2xl p-4 sm:p-5 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            {/* Header badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-blue-300 text-xs sm:text-sm font-black px-2.5 py-0.5 rounded-full bg-blue-950/80 border border-blue-500/40 flex items-center gap-1.5">
                <span>🎯</span>
                <span>수리 모델 1순위 추천 결과</span>
              </span>
              <span className={`text-xs font-black px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                entropyRisk?.includes('저위험')
                  ? 'bg-emerald-950/90 border border-emerald-600/60 text-emerald-300' 
                  : (entropyRisk?.includes('중위험') ? 'bg-amber-950/90 border border-amber-600/60 text-amber-300' : 'bg-rose-950/90 border border-rose-600/60 text-rose-300')
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                <span>{entropyRisk || '안정형 구간'}</span>
              </span>
              {primaryPick?.marketLabel && (
                <span className="text-[11px] font-mono text-cyan-300 bg-cyan-950/80 border border-cyan-800/40 px-2 py-0.5 rounded">
                  {primaryPick.marketLabel} 마켓
                </span>
              )}
            </div>

            {/* Main Top Pick Title */}
            <div className="flex items-baseline gap-2 flex-wrap pt-0.5">
              <span className="text-sm font-bold text-slate-300">핵심 모델 예상:</span>
              <span className="text-xl sm:text-2xl font-black text-blue-300 tracking-tight">
                {topPick}
              </span>
            </div>

            {/* 1-Line Key Reason */}
            <div className="text-xs sm:text-[13px] text-slate-300 flex items-center gap-1.5 pt-0.5">
              <span className="text-emerald-400 font-bold">💡</span>
              <span>
                <strong className="text-emerald-300">분석 근거:</strong> {primaryPick?.reason || '상대전적 및 공수 효율 모델 우위'}. 엔트로피 <strong className="text-amber-300">{entropy}</strong>
              </span>
            </div>
          </div>

          {/* Key Quantitative Badges: EV, Odds, Kelly */}
          <div className="bg-[#070d17] border border-slate-700/80 rounded-xl p-3 flex items-center gap-3 sm:gap-4 shrink-0 justify-around md:justify-end shadow-inner">
            <div className="text-center px-1">
              <div className="text-[10px] text-slate-400 font-semibold">공시 기대값</div>
              <div className="text-base sm:text-lg font-black text-cyan-300 font-mono mt-0.5">
                {topCandidate?.odds ? `${topCandidate.odds}` : (primaryPick?.recommendedOdds ? `${primaryPick.recommendedOdds}` : '-')}
              </div>
            </div>
            <div className="w-[1px] h-8 bg-slate-800"></div>
            <div className="text-center px-1">
              <div className="text-[10px] text-slate-400 font-semibold">기대 가치 (EV)</div>
              <div className="text-base sm:text-lg font-black text-emerald-400 font-mono mt-0.5">
                {roi}
              </div>
            </div>
            <div className="w-[1px] h-8 bg-slate-800"></div>
            <div className="text-center px-1">
              <div className="text-[10px] text-slate-400 font-semibold">1/4 켈리 가중치</div>
              <div className="text-base sm:text-lg font-black text-amber-300 font-mono mt-0.5">
                {kellyStake}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📊 마켓별 공정/시장확률 & 기대 가치 (EV)                                     */}
      {/* ========================================================================= */}
      <div className="bg-[#0b131f] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800/80">
          <div className="text-sm font-black text-white flex items-center gap-2">
            <span className="text-blue-400">📊</span>
            <span>마켓별 퀀트 가치 분석 (공시 기대값 · 공정/시장확률 · 기대 가치)</span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Dixon-Coles & Proportional No-Vig
          </span>
        </div>

        {/* ------------------------------------------------------------------------- */}
        {/* ① 일반 승패 예상 기대값 (1X2)                                              */}
        {/* ------------------------------------------------------------------------- */}
        <div className="space-y-2 bg-[#070d17] p-3.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-black text-blue-300 flex items-center gap-1.5">
              <span>① 일반 승패 예상 기대값 (1X2)</span>
              <span className="text-[10px] text-slate-400 font-normal">
                | 기대값 [{is1X2Valid ? `${domWin} / ${domDraw ? `${domDraw} / ` : ''}${domLose}` : '미발매'}]
              </span>
            </span>
            {bestMatchCand && is1X2Valid && (
              <span className="text-[11px] font-mono text-blue-300 bg-blue-950/70 px-2 py-0.5 rounded border border-blue-800/50">
                1위: <strong>{bestMatchCand.pick}</strong> (EV {bestMatchCand.expectedRoi >= 0 ? `+${bestMatchCand.expectedRoi}%` : `${bestMatchCand.expectedRoi}%`})
              </span>
            )}
          </div>

          <div className={`grid gap-2.5 ${!isNoDrawSport ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {/* Home Win */}
            <div className={`p-3 rounded-xl border text-xs space-y-1.5 transition-all ${
              is1X2HomeSelected 
                ? 'bg-[#0e2236] border-blue-500/80 shadow-md ring-1 ring-blue-500/40' 
                : 'bg-[#09121d] border-slate-800 hover:border-slate-700'
            }`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-100 flex items-center gap-1.5">
                  <span>{homeTeam} 승</span>
                  {is1X2HomeSelected && (
                    <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded font-bold">모델 추천</span>
                  )}
                </span>
                <span className="font-mono text-cyan-300 font-bold">{is1X2Valid ? `${domWin}` : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="text-slate-400">공정 / 시장확률</span>
                <span className="font-mono font-bold text-blue-300">{is1X2Valid ? `${hTrueProb}% / ${mktHomeProb}%` : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800">
                <span className="text-slate-400">기대 가치 (EV)</span>
                <span className={`font-mono font-bold ${is1X2Valid && evWin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {is1X2Valid ? (evWin >= 0 ? `+${evWin}%` : `${evWin}%`) : '-'}
                </span>
              </div>
            </div>

            {/* Draw (Soccer Only) */}
            {!isNoDrawSport && (
              <div className={`p-3 rounded-xl border text-xs space-y-1.5 transition-all ${
                is1X2DrawSelected 
                  ? 'bg-[#261f12] border-amber-500/80 shadow-md ring-1 ring-amber-500/40' 
                  : 'bg-[#09121d] border-slate-800 hover:border-slate-700'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-100 flex items-center gap-1.5">
                    <span>무승부 (D)</span>
                    {is1X2DrawSelected && (
                      <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-bold">모델 추천</span>
                    )}
                  </span>
                  <span className="font-mono text-amber-300 font-bold">{is1X2Valid && domDraw ? `${domDraw}` : '-'}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span className="text-slate-400">공정 / 시장확률</span>
                  <span className="font-mono font-bold text-amber-300">{is1X2Valid && domDraw ? `${dTrueProb}% / ${mktDrawProb}%` : '-'}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800">
                  <span className="text-slate-400">기대 가치 (EV)</span>
                  <span className={`font-mono font-bold ${is1X2Valid && evDraw >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {is1X2Valid && domDraw ? (evDraw >= 0 ? `+${evDraw}%` : `${evDraw}%`) : '-'}
                  </span>
                </div>
              </div>
            )}

            {/* Away Win */}
            <div className={`p-3 rounded-xl border text-xs space-y-1.5 transition-all ${
              is1X2AwaySelected 
                ? 'bg-[#29131a] border-rose-500/80 shadow-md ring-1 ring-rose-500/40' 
                : 'bg-[#09121d] border-slate-800 hover:border-slate-700'
            }`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-100 flex items-center gap-1.5">
                  <span>{awayTeam} 승</span>
                  {is1X2AwaySelected && (
                    <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded font-bold">모델 추천</span>
                  )}
                </span>
                <span className="font-mono text-rose-300 font-bold">{is1X2Valid ? `${domLose}` : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="text-slate-400">공정 / 시장확률</span>
                <span className="font-mono font-bold text-rose-300">{is1X2Valid ? `${aTrueProb}% / ${mktAwayProb}%` : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800">
                <span className="text-slate-400">기대 가치 (EV)</span>
                <span className={`font-mono font-bold ${is1X2Valid && evLose >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {is1X2Valid ? (evLose >= 0 ? `+${evLose}%` : `${evLose}%`) : '-'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------------- */}
        {/* ③ 핸디캡 (Handicap)                                                         */}
        {/* ------------------------------------------------------------------------- */}
        <div className="space-y-2 bg-[#070d17] p-3.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-black text-purple-300 flex items-center gap-1.5">
              <span>③ 핸디캡 ({displayHdpLine})</span>
              <span className="text-[10px] text-slate-400 font-normal">
                | 기대값 [{isHdpValid ? `${hdpOddsHome} / ${hdpOddsAway}` : '미발매'}]
              </span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${isHdpPickHome && isHdpValid ? 'bg-[#18112e] border-purple-500' : 'bg-[#09121d] border-slate-800'}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-100">{homeTeam} ({homeHdpSign})</span>
                <span className="font-mono text-cyan-300 font-bold">{isHdpValid ? `${hdpOddsHome}` : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="text-slate-400">공정 / 시장확률</span>
                <span className="font-mono font-bold text-purple-300">{isHdpValid ? `${hdpHomeProb}% / ${hdpHomeMktProb}%` : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800">
                <span className="text-slate-400">기대 가치 (EV)</span>
                <span className={`font-mono font-bold ${isHdpValid && evHdpHome >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isHdpValid ? (evHdpHome >= 0 ? `+${evHdpHome}%` : `${evHdpHome}%`) : '-'}
                </span>
              </div>
            </div>

            <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${!isHdpPickHome && isHdpValid ? 'bg-[#18112e] border-purple-500' : 'bg-[#09121d] border-slate-800'}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-100">{awayTeam} ({awayHdpSign})</span>
                <span className="font-mono text-cyan-300 font-bold">{isHdpValid ? `${hdpOddsAway}` : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="text-slate-400">공정 / 시장확률</span>
                <span className="font-mono font-bold text-purple-300">{isHdpValid ? `${hdpAwayProb}% / ${hdpAwayMktProb}%` : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800">
                <span className="text-slate-400">기대 가치 (EV)</span>
                <span className={`font-mono font-bold ${isHdpValid && evHdpAway >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isHdpValid ? (evHdpAway >= 0 ? `+${evHdpAway}%` : `${evHdpAway}%`) : '-'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------------- */}
        {/* ④ 언더/오버 (Under/Over)                                                    */}
        {/* ------------------------------------------------------------------------- */}
        <div className="space-y-2 bg-[#070d17] p-3.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
              <span>④ 언더 / 오버 (기준점 {displayUoLine})</span>
              <span className="text-[10px] text-slate-400 font-normal">
                | 기대값 [{isUoValid ? `${uoUnderOdds} / ${uoOverOdds}` : '미발매'}]
              </span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${isUoPickUnder && isUoValid ? 'bg-[#0a2318] border-emerald-500' : 'bg-[#09121d] border-slate-800'}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-100">언더 (Under {displayUoLine})</span>
                <span className="font-mono text-emerald-300 font-bold">{isUoValid ? `${uoUnderOdds}` : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="text-slate-400">공정 / 시장확률</span>
                <span className="font-mono font-bold text-emerald-300">{isUoValid ? `${uoUnderProb}% / ${uoUnderMkt}%` : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800">
                <span className="text-slate-400">기대 가치 (EV)</span>
                <span className={`font-mono font-bold ${isUoValid && evUnder >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isUoValid ? (evUnder >= 0 ? `+${evUnder}%` : `${evUnder}%`) : '-'}
                </span>
              </div>
            </div>

            <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${!isUoPickUnder && isUoValid ? 'bg-[#0a2318] border-emerald-500' : 'bg-[#09121d] border-slate-800'}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-100">오버 (Over {displayUoLine})</span>
                <span className="font-mono text-emerald-300 font-bold">{isUoValid ? `${uoOverOdds}` : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="text-slate-400">공정 / 시장확률</span>
                <span className="font-mono font-bold text-emerald-300">{isUoValid ? `${uoOverProb}% / ${uoOverMkt}%` : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800">
                <span className="text-slate-400">기대 가치 (EV)</span>
                <span className={`font-mono font-bold ${isUoValid && evOver >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isUoValid ? (evOver >= 0 ? `+${evOver}%` : `${evOver}%`) : '-'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🔬 종합 프로토 퀀트 분석 (배당 경제학 · 6대 컨텍스트 · 득실점 분포)         */}
      {/* ========================================================================= */}
      {comprehensiveProto ? (
        <div className="space-y-4">
          {/* 1. 배당 경제학 (국내 vs 해외 샤프 환급률·절삭률·마진·에지) */}
          <div className="bg-[#0b131f] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800/80">
              <div className="text-sm font-black text-white flex items-center gap-2">
                <span className="text-cyan-400">⚖️</span>
                <span>배당 경제학 (환급률 · 절삭률 · 마진 · 에지)</span>
              </div>
              <span className="text-[11px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded">
                {comprehensiveProto.oddsEconomics?.hasRealForeignOdds ? '해외 샤프 실데이터 연동' : '국내 공시 기준 (해외 배당 미제공)'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-[#070d17] border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <div className="text-[11px] text-slate-400 font-semibold">국내 배당 (베트맨 프로토)</div>
                <div className="flex items-baseline justify-between">
                  <span className="text-slate-300">환급률</span>
                  <span className="font-mono font-black text-cyan-300 text-base">{comprehensiveProto.oddsEconomics?.domesticPayoutRatePct}%</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">절삭률 / 북메이커 마진</span>
                  <span className="font-mono text-rose-300 font-bold">
                    {comprehensiveProto.oddsEconomics?.domesticCutRatePct}% / +{comprehensiveProto.oddsEconomics?.domesticMarginPct}%
                  </span>
                </div>
              </div>

              <div className="bg-[#070d17] border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <div className="text-[11px] text-slate-400 font-semibold">해외 샤프 북메이커 평균</div>
                <div className="flex items-baseline justify-between">
                  <span className="text-slate-300">환급률</span>
                  <span className="font-mono font-black text-emerald-300 text-base">
                    {comprehensiveProto.oddsEconomics?.hasRealForeignOdds
                      ? `${comprehensiveProto.oddsEconomics.foreignPayoutRatePct}%`
                      : '미제공'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">절삭률 / 마진</span>
                  <span className="font-mono text-slate-300 font-bold">
                    {comprehensiveProto.oddsEconomics?.hasRealForeignOdds
                      ? `${comprehensiveProto.oddsEconomics.foreignCutRatePct}% / +${comprehensiveProto.oddsEconomics.foreignMarginPct}%`
                      : '-'}
                  </span>
                </div>
              </div>

              <div className="bg-[#070d17] border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <div className="text-[11px] text-slate-400 font-semibold">가격 에지 (모델 기대수익 vs 국내 배당)</div>
                <div className="grid grid-cols-3 gap-1 pt-0.5 text-center font-mono">
                  <div className="bg-slate-900/80 rounded p-1.5 border border-slate-800">
                    <div className="text-[10px] text-slate-400">홈 승</div>
                    <div className={`font-black ${(comprehensiveProto.oddsEconomics?.priceEdgePct?.win ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {(comprehensiveProto.oddsEconomics?.priceEdgePct?.win ?? 0) >= 0
                        ? `+${comprehensiveProto.oddsEconomics?.priceEdgePct?.win}%`
                        : `${comprehensiveProto.oddsEconomics?.priceEdgePct?.win}%`}
                    </div>
                  </div>
                  <div className="bg-slate-900/80 rounded p-1.5 border border-slate-800">
                    <div className="text-[10px] text-slate-400">무승부</div>
                    <div className={`font-black ${(comprehensiveProto.oddsEconomics?.priceEdgePct?.draw ?? -1) >= 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {comprehensiveProto.oddsEconomics?.priceEdgePct?.draw !== null && comprehensiveProto.oddsEconomics?.priceEdgePct?.draw !== undefined
                        ? `${comprehensiveProto.oddsEconomics.priceEdgePct.draw >= 0 ? '+' : ''}${comprehensiveProto.oddsEconomics.priceEdgePct.draw}%`
                        : '-'}
                    </div>
                  </div>
                  <div className="bg-slate-900/80 rounded p-1.5 border border-slate-800">
                    <div className="text-[10px] text-slate-400">원정 승</div>
                    <div className={`font-black ${(comprehensiveProto.oddsEconomics?.priceEdgePct?.lose ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {(comprehensiveProto.oddsEconomics?.priceEdgePct?.lose ?? 0) >= 0
                        ? `+${comprehensiveProto.oddsEconomics?.priceEdgePct?.lose}%`
                        : `${comprehensiveProto.oddsEconomics?.priceEdgePct?.lose}%`}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2. 6대 컨텍스트 · 일정 피로도 · 동기부여 매트릭스 */}
          <div className="bg-[#0b131f] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800/80">
              <div className="text-sm font-black text-white flex items-center gap-2">
                <span className="text-amber-400">🧭</span>
                <span>6대 컨텍스트 · 일정 · 동기부여 종합 매트릭스</span>
              </div>
              <div className="text-[11px] font-mono text-slate-300">
                총 보정: 홈 <strong className={comprehensiveProto.totalHomeAdjustmentPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{comprehensiveProto.totalHomeAdjustmentPct >= 0 ? '+' : ''}{comprehensiveProto.totalHomeAdjustmentPct}%p</strong> / 원정 <strong className={comprehensiveProto.totalAwayAdjustmentPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{comprehensiveProto.totalAwayAdjustmentPct >= 0 ? '+' : ''}{comprehensiveProto.totalAwayAdjustmentPct}%p</strong>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {(comprehensiveProto.contextFactors || []).map((cf: any) => (
                <div key={cf.key} className="bg-[#070d17] border border-slate-800/90 rounded-xl p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-slate-100">{cf.label}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                      cf.status === 'REAL_DATA'
                        ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60'
                        : 'bg-slate-900 text-slate-400 border-slate-700'
                    }`}>
                      {cf.status === 'REAL_DATA' ? '실데이터' : '중립'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-slate-900/70 rounded px-2 py-1 border border-slate-800/80">
                      <span className="text-slate-400 mr-1">홈:</span>
                      <span className="text-amber-200 font-semibold">{cf.homeSignal}</span>
                    </div>
                    <div className="bg-slate-900/70 rounded px-2 py-1 border border-slate-800/80">
                      <span className="text-slate-400 mr-1">원정:</span>
                      <span className="text-sky-200 font-semibold">{cf.awaySignal}</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400">{cf.summary}</div>
                </div>
              ))}
            </div>

            {comprehensiveProto.motivationSummary && (
              <div className="bg-slate-900/70 border border-slate-800 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-300">
                  🏆 동기부여 구도: <strong className="text-amber-300">{comprehensiveProto.motivationSummary.homeZone}</strong> vs <strong className="text-sky-300">{comprehensiveProto.motivationSummary.awayZone}</strong>
                </span>
                <span className="font-bold text-emerald-300 font-mono">{comprehensiveProto.motivationSummary.netMotivationEdge}</span>
              </div>
            )}
          </div>

          {/* 3. 정교한 핸디캡 & 언더/오버 기대 스코어 분포 */}
          <div className="bg-[#0b131f] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800/80">
              <div className="text-sm font-black text-white flex items-center gap-2">
                <span className="text-purple-400">📐</span>
                <span>핸디캡 &amp; 언더/오버 기대 스코어 분포 정밀 분석</span>
              </div>
              <span className="text-xs font-mono font-bold text-amber-300">
                기대 스코어 {homeTeam} {comprehensiveProto.underOverRefined?.expectedHomeScore} : {comprehensiveProto.underOverRefined?.expectedAwayScore} {awayTeam} (합계 {comprehensiveProto.underOverRefined?.expectedTotalScore})
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-[#070d17] border border-purple-900/50 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-purple-300">핸디캡 ({comprehensiveProto.handicapRefined?.line > 0 ? `+${comprehensiveProto.handicapRefined?.line}` : comprehensiveProto.handicapRefined?.line}) 정밀 산출</span>
                  <span className="font-mono text-[11px] text-slate-300">예상 마진 {comprehensiveProto.handicapRefined?.expectedMargin >= 0 ? `+${comprehensiveProto.handicapRefined?.expectedMargin}` : comprehensiveProto.handicapRefined?.expectedMargin}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
                  <div className="bg-slate-900/80 rounded p-2 border border-slate-800">
                    <div className="text-[10px] text-slate-400">홈 커버</div>
                    <div className="font-black text-purple-300">{comprehensiveProto.handicapRefined?.homeCoverProb}%</div>
                    <div className="text-[10px] text-slate-500">공정 {comprehensiveProto.handicapRefined?.homeFairOdds}</div>
                  </div>
                  <div className="bg-slate-900/80 rounded p-2 border border-slate-800">
                    <div className="text-[10px] text-slate-400">적특(Push)</div>
                    <div className="font-black text-slate-300">{comprehensiveProto.handicapRefined?.pushProb}%</div>
                    <div className="text-[10px] text-slate-500">환불구간</div>
                  </div>
                  <div className="bg-slate-900/80 rounded p-2 border border-slate-800">
                    <div className="text-[10px] text-slate-400">원정 커버</div>
                    <div className="font-black text-cyan-300">{comprehensiveProto.handicapRefined?.awayCoverProb}%</div>
                    <div className="text-[10px] text-slate-500">공정 {comprehensiveProto.handicapRefined?.awayFairOdds}</div>
                  </div>
                </div>
                <div className="text-[11px] text-purple-200 font-semibold">{comprehensiveProto.handicapRefined?.rationale}</div>
              </div>

              <div className="bg-[#070d17] border border-emerald-900/50 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-emerald-300">언더/오버 (기준 {comprehensiveProto.underOverRefined?.line}) 정밀 산출</span>
                  <span className="font-mono text-[11px] text-emerald-300">{comprehensiveProto.underOverRefined?.recommendedLabel}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
                  <div className="bg-slate-900/80 rounded p-2 border border-slate-800">
                    <div className="text-[10px] text-slate-400">언더 (U)</div>
                    <div className="font-black text-emerald-300">{comprehensiveProto.underOverRefined?.underProb}%</div>
                    <div className="text-[10px] text-slate-500">공정 {comprehensiveProto.underOverRefined?.underFairOdds}</div>
                  </div>
                  <div className="bg-slate-900/80 rounded p-2 border border-slate-800">
                    <div className="text-[10px] text-slate-400">적특(Push)</div>
                    <div className="font-black text-slate-300">{comprehensiveProto.underOverRefined?.pushProb}%</div>
                    <div className="text-[10px] text-slate-500">동점구간</div>
                  </div>
                  <div className="bg-slate-900/80 rounded p-2 border border-slate-800">
                    <div className="text-[10px] text-slate-400">오버 (O)</div>
                    <div className="font-black text-amber-300">{comprehensiveProto.underOverRefined?.overProb}%</div>
                    <div className="text-[10px] text-slate-500">공정 {comprehensiveProto.underOverRefined?.overFairOdds}</div>
                  </div>
                </div>
                {Array.isArray(comprehensiveProto.underOverRefined?.topExactScores) && comprehensiveProto.underOverRefined.topExactScores.length > 0 && (
                  <div className="flex items-center justify-between flex-wrap gap-1.5 text-[11px] pt-0.5">
                    <span className="text-slate-400">Top-3 예상 스코어:</span>
                    <div className="flex items-center gap-1.5 font-mono">
                      {comprehensiveProto.underOverRefined.topExactScores.map((s: any, idx: number) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-300 font-bold">
                          {s.score} ({s.probPct}%)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#070d17] border border-slate-800/80 rounded-2xl p-4 text-xs text-slate-400 flex items-center justify-between">
          <span>🔄 해외 배당 경제학 · 주중 일정 · 리그 동기부여 · 기대 스코어 종합 리포트를 연동 중입니다...</span>
          <span className="font-mono text-slate-500">H2H/ESPN 동기화</span>
        </div>
      )}
    </div>
  );
}
