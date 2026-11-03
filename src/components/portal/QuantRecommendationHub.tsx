import React from 'react';
import { Trophy, TrendingUp, Sparkles, Flame, CheckCircle, ArrowRight } from 'lucide-react';
import { TotoType } from '../../types';
import { OddsAlgoIcon } from '../OddsAlgoLogo';

interface QuantRecommendationHubProps {
  selectedYear: number;
  activeRounds: {
    pt1: number;
    sc: number;
    bs: number;
    bk: number;
  };
  onNavigateToToto: (totoType: TotoType) => void;
  onOpenTopPicks?: () => void;
}

export function QuantRecommendationHub({
  selectedYear,
  activeRounds,
  onNavigateToToto,
  onOpenTopPicks
}: QuantRecommendationHubProps) {
  return (
    <div className="space-y-4">
      {/* Top Banner: ODDSALGO Portal Intro */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 border border-blue-900/60 rounded-2xl p-3 sm:p-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <OddsAlgoIcon size={36} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-sm sm:text-base text-cyan-300">
                ODDSALGO (오즈알고) AI & 퀀트 수리 모델
              </span>
              <span className="bg-blue-500/20 text-blue-300 border border-blue-400/40 text-[10px] font-bold px-2 py-0.2 rounded-full">
                Dixon-Coles & Proportional No-Vig
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              스포츠 승부 예측, 승무패 · 승1패 · 승5패 수학적 공정 확률과 기대 가치(EV)를 분석합니다.
            </p>
          </div>
        </div>

        <button
          onClick={() => onOpenTopPicks?.()}
          className="self-start sm:self-auto px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl font-extrabold text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>오늘의 퀀트 TOP 3 픽 확인 ❯</span>
        </button>
      </div>

      {/* Zentoto Style 3-Column TOTO & Reco-Pick Hub */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm sm:text-base font-black text-slate-900">
              토토 모델 분석 & 추천 조합 (TOTO & Reco-Model)
            </h3>
          </div>
          <span className="text-xs text-slate-500 hidden sm:inline font-mono">
            회차별 최적 14경기 결합 가치
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Card 1: 승무패 (축구) */}
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 hover:border-blue-500/60 rounded-2xl p-4 text-slate-100 shadow-md transition-all flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600/10 rounded-full blur-2xl pointer-events-none"></div>

            <div className="space-y-2.5">
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚽</span>
                  <div>
                    <h4 className="font-extrabold text-sm text-white">승무패 (축구)</h4>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {selectedYear}년 {activeRounds.sc || 55}회차
                    </span>
                  </div>
                </div>
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-600/50 px-2 py-0.5 rounded-full text-[10px] font-bold">
                  분석 완료
                </span>
              </div>

              {/* Quant Metrics summary */}
              <div className="bg-slate-800/60 rounded-xl p-2.5 space-y-1 text-xs border border-slate-700/60">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">최고 기대 가치 (EV)</span>
                  <span className="font-mono font-bold text-emerald-400">+34.2%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Dixon-Coles 황금 에지</span>
                  <span className="font-mono font-bold text-cyan-300">4경기 포착</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">1등 독식(≤5명) 시뮬레이션</span>
                  <span className="font-mono font-bold text-amber-300">99.8% 달성</span>
                </div>
              </div>
            </div>

            {/* Action button */}
            <button
              onClick={() => onNavigateToToto('sc')}
              className="mt-3.5 w-full py-2 bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer border border-slate-700 flex items-center justify-center gap-1.5 group-hover:border-blue-500"
            >
              <span>내 퀀트 추천 모델 확인</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 2: 승1패 (야구) */}
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 hover:border-amber-500/60 rounded-2xl p-4 text-slate-100 shadow-md transition-all flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-600/10 rounded-full blur-2xl pointer-events-none"></div>

            <div className="space-y-2.5">
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚾</span>
                  <div>
                    <h4 className="font-extrabold text-sm text-white">승1패 (야구)</h4>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {selectedYear}년 {activeRounds.bs || 74}회차
                    </span>
                  </div>
                </div>
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-600/50 px-2 py-0.5 rounded-full text-[10px] font-bold">
                  분석 완료
                </span>
              </div>

              {/* Quant Metrics summary */}
              <div className="bg-slate-800/60 rounded-xl p-2.5 space-y-1 text-xs border border-slate-700/60">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">선발 ERA 베이지안 우위</span>
                  <span className="font-mono font-bold text-emerald-400">+28.5%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">5이닝 승1패 정밀 타겟</span>
                  <span className="font-mono font-bold text-amber-300">3경기 포착</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">불펜 과부하 필터</span>
                  <span className="font-mono font-bold text-cyan-300">가중치 적용</span>
                </div>
              </div>
            </div>

            {/* Action button */}
            <button
              onClick={() => onNavigateToToto('bs')}
              className="mt-3.5 w-full py-2 bg-slate-800 hover:bg-amber-600 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer border border-slate-700 flex items-center justify-center gap-1.5 group-hover:border-amber-500"
            >
              <span>내 퀀트 추천 모델 확인</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 3: 승5패 (농구) */}
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 hover:border-purple-500/60 rounded-2xl p-4 text-slate-100 shadow-md transition-all flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-600/10 rounded-full blur-2xl pointer-events-none"></div>

            <div className="space-y-2.5">
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-base">🏀</span>
                  <div>
                    <h4 className="font-extrabold text-sm text-white">승5패 (농구)</h4>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {selectedYear}년 {activeRounds.bk || 27}회차
                    </span>
                  </div>
                </div>
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-600/50 px-2 py-0.5 rounded-full text-[10px] font-bold">
                  분석 완료
                </span>
              </div>

              {/* Quant Metrics summary */}
              <div className="bg-slate-800/60 rounded-xl p-2.5 space-y-1 text-xs border border-slate-700/60">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">ELO + Pace 가중치</span>
                  <span className="font-mono font-bold text-emerald-400">+31.8%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">5점차 클러치 밴드</span>
                  <span className="font-mono font-bold text-purple-300">정규분포 산출</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">백투백 일정 피로도</span>
                  <span className="font-mono font-bold text-cyan-300">감점 보정</span>
                </div>
              </div>
            </div>

            {/* Action button */}
            <button
              onClick={() => onNavigateToToto('bk')}
              className="mt-3.5 w-full py-2 bg-slate-800 hover:bg-purple-600 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer border border-slate-700 flex items-center justify-center gap-1.5 group-hover:border-purple-500"
            >
              <span>내 퀀트 추천 모델 확인</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
