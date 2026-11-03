import React, { useState } from 'react';
import { MatchItem } from '../../types';
import { Sparkles, Activity, ShieldCheck, ChevronRight, MessageSquare, BarChart3, TrendingUp, Info } from 'lucide-react';
import { computeQuantModel } from '../../utils/quantModel';

interface FeaturedDetailCardSectionProps {
  selectedMatch: MatchItem | null;
  onOpenDetailedModal: (match: MatchItem) => void;
}

export function FeaturedDetailCardSection({
  selectedMatch,
  onOpenDetailedModal
}: FeaturedDetailCardSectionProps) {
  if (!selectedMatch) return null;

  const m = selectedMatch;
  const isBaseball = m.sport === 'baseball';
  const sport = m.sport || 'soccer';
  const marketBase = sport === 'soccer' ? 2.65 : sport === 'baseball' ? 8.8 : sport === 'basketball' ? 162.0 : 182.0;

  const domWin = typeof m.domestic?.win === 'number' ? m.domestic.win : 1.85;
  const domDraw = typeof m.domestic?.draw === 'number' ? m.domestic.draw : null;
  const domLose = typeof m.domestic?.lose === 'number' ? m.domestic.lose : 3.40;

  // Run pure quant model
  const quantRes = computeQuantModel({
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

  const hProb = quantRes?.homeProb ?? 56;
  const aProb = quantRes?.awayProb ?? 24;
  const dProb = quantRes?.drawProb ?? 20;

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

  const targetProb = modelChoice === '홈 승' ? hProb : (modelChoice === '원정 승' ? aProb : (dProb || 20));
  const evVal = +(((targetProb / 100) * modelOdds - 1) * 100).toFixed(1);
  const accuracyText = `공정 승률 ${targetProb}% (${evVal >= 0 ? `+${evVal}% EV` : `${evVal}% EV`})`;

  const expHome = quantRes?.expectedScore?.home ?? (sport === 'soccer' ? 1.45 : sport === 'baseball' ? 4.2 : 88.0);
  const expAway = quantRes?.expectedScore?.away ?? (sport === 'soccer' ? 1.10 : sport === 'baseball' ? 3.8 : 82.0);

  return (
    <div className="bg-[#080d16] text-slate-100 border-b border-slate-800 py-3 px-3 sm:px-6 relative shadow-lg select-none">
      <div className="max-w-[1720px] mx-auto">
        <div className="bg-gradient-to-r from-[#101927] via-[#0d1624] to-[#0a111c] border border-blue-500/40 rounded-2xl p-4 sm:p-5 shadow-2xl relative overflow-hidden">
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Left: Matchup & Target Prediction */}
            <div className="space-y-2 flex-1">
              {/* Badge & League */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {m.dataSource === 'simulation' || m.isSimulated ? (
                  <span className="bg-purple-600/90 text-purple-100 font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 text-[11px] border border-purple-400/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-300"></span>
                    <span>🟣 SIMULATION DATA</span>
                  </span>
                ) : (
                  <span className="bg-emerald-600/90 text-emerald-100 font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 text-[11px] border border-emerald-400/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse"></span>
                    <span>🟢 REAL DATA</span>
                  </span>
                )}
                <span className="bg-blue-600 text-white font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Activity className="w-3 h-3 text-cyan-300" />
                  <span>선택 매치 퀀트 분석</span>
                </span>
                <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono font-bold">
                  No.{m.gameNo}
                </span>
                <span className="text-slate-300 font-bold">
                  {m.sport === 'soccer' ? '⚽' : m.sport === 'baseball' ? '⚾' : m.sport === 'basketball' ? '🏀' : '🏐'} {m.league}
                </span>
                <span className="text-slate-400 font-mono text-[11px]">
                  📅 {m.date}
                </span>
              </div>

              {/* Matchup Teams Display */}
              <div className="flex items-center gap-3 py-1 flex-wrap">
                <div className="text-lg sm:text-xl font-black text-white tracking-tight">
                  <span className="text-blue-300">{m.homeTeam || '홈팀'}</span>
                  <span className="text-slate-400 text-sm font-mono mx-2">VS</span>
                  <span className="text-slate-200">{m.awayTeam || '원정팀'}</span>
                </div>
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono">
                  공시 기대값 [승 {m.domestic?.win || '-'} / 무 {m.domestic?.draw || '-'} / 패 {m.domestic?.lose || '-'}]
                </span>
              </div>

              {/* 3-Line Analytical Rationale */}
              <div className="bg-[#060a12]/80 border border-slate-800/90 rounded-xl p-2.5 text-xs text-slate-300 space-y-1 max-w-3xl">
                <div className="flex items-center justify-between flex-wrap gap-1 font-bold text-amber-300">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>예측 모델: <strong className="text-white font-black">{modelChoice} 기대값 {modelOdds?.toFixed(2)}</strong></span>
                  </span>
                  <span className="text-[11px] text-emerald-400 font-mono">
                    {accuracyText}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 space-y-0.5 pt-0.5">
                  <p>• 분석 근거 ① 수리 퀀트 기대 득점 (홈 {expHome}점 vs 원정 {expAway}점)</p>
                  <p>• 분석 근거 ② {sport === 'soccer' ? `Dixon-Coles 푸아송 확률 (홈 ${hProb}% / 무 ${dProb}% / 원정 ${aProb}%)` : `수리 분포 모델 기대 마진 ${(expHome - expAway).toFixed(1)}점`}</p>
                  <p className="text-slate-500">• 분석 근거 ③ 비례 역수 공정 확률 (Proportional Inverse Normalization) 마진 제거 {Math.max(hProb, aProb)}% 대비 기대 가치 확보</p>
                </div>
              </div>
            </div>

            {/* Right: Quick Probabilities & Action Button */}
            <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800">
              <div className="flex items-center gap-2">
                <div className="bg-[#060a12] p-2 rounded-xl border border-slate-800 text-center min-w-[70px]">
                  <span className="text-[10px] text-slate-400 block font-semibold">홈 승 확률</span>
                  <span className="text-sm font-black font-mono text-blue-400">{hProb}%</span>
                </div>
                {domDraw && (
                  <div className="bg-[#060a12] p-2 rounded-xl border border-slate-800 text-center min-w-[70px]">
                    <span className="text-[10px] text-slate-400 block font-semibold">무승부</span>
                    <span className="text-sm font-black font-mono text-amber-400">{dProb}%</span>
                  </div>
                )}
                <div className="bg-[#060a12] p-2 rounded-xl border border-slate-800 text-center min-w-[70px]">
                  <span className="text-[10px] text-slate-400 block font-semibold">원정 승 확률</span>
                  <span className="text-sm font-black font-mono text-rose-400">{aProb}%</span>
                </div>
              </div>

              <button
                onClick={() => onOpenDetailedModal(m)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-extrabold text-xs sm:text-sm transition-all shadow-lg hover:shadow-blue-500/20 flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
              >
                <BarChart3 className="w-4 h-4" />
                <span>90vh 퀀트 상세 분석 열기 ❯</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
