import React, { useMemo } from 'react';
import { MatchItem } from '../../types';
import { Sparkles, Activity, ShieldCheck, TrendingUp, ChevronRight, Zap, Target, Layers, ArrowUpRight } from 'lucide-react';
import { computeQuantModel } from '../../utils/quantModel';

interface QuantLiveSideTerminalProps {
  selectedMatch: MatchItem | null;
  allMatches: MatchItem[];
  onOpenQuantModal: (match: MatchItem, tab?: string) => void;
  onSelectMatch: (match: MatchItem) => void;
  onOpenCalc?: (calc: string) => void;
}

export function QuantLiveSideTerminal({
  selectedMatch,
  allMatches,
  onOpenQuantModal,
  onSelectMatch,
  onOpenCalc
}: QuantLiveSideTerminalProps) {
  // 1. Calculate live quant metrics for selected match
  const quantData = useMemo(() => {
    if (!selectedMatch) return null;
    const m = selectedMatch;
    const sport = m.sport || 'soccer';
    const isBaseball = sport === 'baseball';
    const marketBase = sport === 'soccer' ? 2.65 : sport === 'baseball' ? 8.8 : sport === 'basketball' ? 162.0 : 182.0;

    const domWin = typeof m.domestic?.win === 'number' ? m.domestic.win : 1.85;
    const domDraw = typeof m.domestic?.draw === 'number' ? m.domestic.draw : null;
    const domLose = typeof m.domestic?.lose === 'number' ? m.domestic.lose : 3.40;

    const model = computeQuantModel({
      league: m.league,
      sport,
      type: '1X2',
      domesticOdds: { win: domWin, draw: domDraw, lose: domLose },
      foreignOdds: m.foreign ? { win: m.foreign.win, draw: m.foreign.draw, lose: m.foreign.lose } : undefined,
      homeStats: { elo: 1540, attack: 1.18, defense: 0.92, era: 3.45, pace: 101.2 },
      awayStats: { elo: 1512, attack: 0.96, defense: 1.08, era: 4.15, pace: 99.4 },
      isBaseball,
      marketBase
    });

    const hProb = model?.homeProb ?? 55;
    const dProb = model?.drawProb ?? (domDraw ? 22 : 0);
    const aProb = model?.awayProb ?? 23;

    // Determine target pick & EV
    let pick = `${m.homeTeam} 승`;
    let pickOdds = domWin;
    let pickProb = hProb;
    let ev = ((hProb / 100) * domWin - 1) * 100;

    if (aProb > hProb && aProb >= dProb) {
      pick = `${m.awayTeam} 승`;
      pickOdds = domLose;
      pickProb = aProb;
      ev = ((aProb / 100) * domLose - 1) * 100;
    } else if (domDraw && dProb > hProb && dProb > aProb) {
      pick = `무승부`;
      pickOdds = domDraw;
      pickProb = dProb;
      ev = ((dProb / 100) * domDraw - 1) * 100;
    }

    // 1/4 Kelly
    const p = pickProb / 100;
    const b = pickOdds - 1;
    const q = 1 - p;
    const fullKelly = b > 0 ? Math.max(0, (b * p - q) / b) : 0;
    const quarterKelly = +(fullKelly * 25).toFixed(1);

    // Shannon entropy uncertainty
    const probs = domDraw ? [hProb / 100, dProb / 100, aProb / 100] : [hProb / 100, aProb / 100];
    const entropy = -probs.reduce((acc, val) => (val > 0 ? acc + val * Math.log2(val) : acc), 0);
    const maxEntropy = domDraw ? Math.log2(3) : 1.0;
    const uncertaintyPct = Math.round((entropy / maxEntropy) * 100);

    return {
      model,
      hProb,
      dProb,
      aProb,
      pick,
      pickOdds,
      pickProb,
      ev: +ev.toFixed(1),
      quarterKelly,
      uncertaintyPct,
      entropy: entropy.toFixed(2)
    };
  }, [selectedMatch]);

  // 2. Discover Top 3 Golden Edge Picks from all matches
  const topPicks = useMemo(() => {
    if (!allMatches || allMatches.length === 0) return [];
    
    const candidates = allMatches
      .filter(m => m.categoryLabel === '일반' || m.categoryType === '일반')
      .slice(0, 30)
      .map(m => {
        const domWin = m.domestic?.win || 1.85;
        const domDraw = m.domestic?.draw;
        const domLose = m.domestic?.lose || 1.85;
        const sumInv = (1 / domWin) + (domDraw ? 1 / domDraw : 0) + (1 / domLose);
        const fairWin = (1 / domWin) / sumInv;
        const fairLose = (1 / domLose) / sumInv;
        
        let bestPick = `${m.homeTeam} 승`;
        let odds = domWin;
        let edge = fairWin * domWin - 0.96;
        if (fairLose > fairWin) {
          bestPick = `${m.awayTeam} 승`;
          odds = domLose;
          edge = fairLose * domLose - 0.96;
        }

        return {
          match: m,
          bestPick,
          odds,
          edgePercent: +(edge * 100).toFixed(1)
        };
      })
      .sort((a, b) => b.edgePercent - a.edgePercent)
      .slice(0, 3);

    return candidates;
  }, [allMatches]);

  return (
    <aside className="w-full xl:w-80 2xl:w-96 shrink-0 space-y-4">
      {/* ======================================================== */}
      {/* 1. Selected Match Live Quant Terminal                     */}
      {/* ======================================================== */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-white rounded-2xl border border-slate-800 p-4 sm:p-5 shadow-xl space-y-4 relative overflow-hidden">
        {/* Subtle Ambient Accent */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-1.5">
            <span className="p-1 rounded-md bg-blue-600/30 text-cyan-300">
              <Zap className="w-4 h-4" />
            </span>
            <h3 className="text-xs font-black tracking-wider text-slate-200 uppercase font-mono">
              LIVE QUANT TERMINAL
            </h3>
          </div>
          {selectedMatch?.dataSource === 'simulation' || selectedMatch?.isSimulated ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-600/40">
              SIMULATION
            </span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-600/40 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              REAL DATA
            </span>
          )}
        </div>

        {selectedMatch ? (
          <div className="space-y-3.5">
            {/* Match Header */}
            <div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
                <span>{selectedMatch.sport === 'soccer' ? '⚽' : selectedMatch.sport === 'baseball' ? '⚾' : selectedMatch.sport === 'basketball' ? '🏀' : '🏐'}</span>
                <span>{selectedMatch.league}</span>
                <span>•</span>
                <span className="font-mono">No.{selectedMatch.gameNo}</span>
              </div>
              <div className="text-base font-black text-white pt-0.5 tracking-tight flex items-center justify-between">
                <span className="text-blue-300 truncate">{selectedMatch.homeTeam}</span>
                <span className="text-slate-500 font-mono text-xs mx-1">VS</span>
                <span className="text-slate-200 truncate">{selectedMatch.awayTeam}</span>
              </div>
            </div>

            {/* Target Prediction & EV Edge Box */}
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                  <Target className="w-3.5 h-3.5" />
                  <span>모델 추천 포지션</span>
                </span>
                <span className="text-xs font-mono font-black text-amber-300">
                  {quantData?.pick} ({quantData?.pickOdds}배)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">기대수익률 (+EV)</span>
                  <span className={`text-sm font-black font-mono ${(quantData?.ev || 0) >= 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {(quantData?.ev || 0) > 0 ? `+${quantData?.ev}%` : `${quantData?.ev || 0}%`}
                  </span>
                </div>
                <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">1/4 켈리 배분율</span>
                  <span className="text-sm font-black font-mono text-cyan-300">
                    {quantData?.quarterKelly}%
                  </span>
                </div>
              </div>
            </div>

            {/* Proportional Fair Probability Distribution */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold text-slate-300">
                <span>비례 역수(Proportional) 보정 공정 승률</span>
                <span className="font-mono text-indigo-300 font-black">No-Vig 100%</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-xs">
                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">홈 승</span>
                  <strong className="text-blue-400 font-black">{quantData?.hProb}%</strong>
                </div>
                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">무승부</span>
                  <strong className="text-slate-300 font-black">{quantData?.dProb || 0}%</strong>
                </div>
                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">원정 승</span>
                  <strong className="text-rose-400 font-black">{quantData?.aProb}%</strong>
                </div>
              </div>
            </div>

            {/* Shannon Entropy Metric */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                <span>섀넌 엔트로피 불확실성</span>
                <span className="font-mono text-slate-300">{quantData?.uncertaintyPct}% ({quantData?.entropy} bits)</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    (quantData?.uncertaintyPct || 0) < 60 ? 'bg-emerald-500' :
                    (quantData?.uncertaintyPct || 0) < 80 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${quantData?.uncertaintyPct || 50}%` }}
                />
              </div>
            </div>

            {/* Launch Detailed Modal Button */}
            <button
              onClick={() => onOpenQuantModal(selectedMatch, 'overview')}
              className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <span>전체 퀀트 분석 모달 열기</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="py-8 text-center text-slate-400 text-xs">
            경기 목록에서 분석할 경기를 선택해주세요.
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 2. Today's Golden EV Combinations & Edge Picks            */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
          <div className="flex items-center gap-1.5">
            <span className="text-amber-500 font-black text-sm">⚡</span>
            <h4 className="text-xs font-black text-slate-900">
              회차 퀀트 최고 기대값(+EV) TOP 픽
            </h4>
          </div>
          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
            실시간 포착
          </span>
        </div>

        <div className="space-y-2">
          {topPicks.map((item, idx) => (
            <div
              key={`top_pick_${item.match.gameNo}_${idx}`}
              onClick={() => {
                onSelectMatch(item.match);
              }}
              className="p-2.5 rounded-xl border border-slate-100 hover:border-blue-300 bg-slate-50/60 hover:bg-blue-50/50 transition-all cursor-pointer group space-y-1"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-slate-700 group-hover:text-blue-900">
                  No.{item.match.gameNo} {item.match.homeTeam} vs {item.match.awayTeam}
                </span>
                <span className="font-mono font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 text-[10px]">
                  +{item.edgePercent}% EV
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span className="font-bold text-indigo-700">추천: {item.bestPick}</span>
                <span>배당 {item.odds}배</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. Quick Calculators & Models Access                      */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-2.5">
        <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
          <span>🧮</span>
          <span>수리 퀀트 전용 분석기</span>
        </h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            onClick={() => onOpenCalc?.('shin')}
            className="p-2 rounded-xl bg-slate-50 hover:bg-blue-50 text-slate-800 hover:text-blue-700 border border-slate-200 text-left font-bold transition-all cursor-pointer text-[11px]"
          >
            신스 No-Vig 계산기 →
          </button>
          <button
            onClick={() => onOpenCalc?.('portfolio')}
            className="p-2 rounded-xl bg-slate-50 hover:bg-blue-50 text-slate-800 hover:text-blue-700 border border-slate-200 text-left font-bold transition-all cursor-pointer text-[11px]"
          >
            토토 포트폴리오 →
          </button>
          <button
            onClick={() => onOpenCalc?.('baseball_skellam')}
            className="p-2 rounded-xl bg-slate-50 hover:bg-blue-50 text-slate-800 hover:text-blue-700 border border-slate-200 text-left font-bold transition-all cursor-pointer text-[11px]"
          >
            야구 스켈람 모델 →
          </button>
          <button
            onClick={() => onOpenCalc?.('basketball_gaussian')}
            className="p-2 rounded-xl bg-slate-50 hover:bg-blue-50 text-slate-800 hover:text-blue-700 border border-slate-200 text-left font-bold transition-all cursor-pointer text-[11px]"
          >
            농구 가우시안 모델 →
          </button>
        </div>
      </div>
    </aside>
  );
}
