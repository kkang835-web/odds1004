import React from 'react';
import { TabType } from '../types';
import { Table, Trophy, GitCompare, MoreHorizontal } from 'lucide-react';

interface MobileBottomNavProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function MobileBottomNav({ currentTab, onTabChange }: MobileBottomNavProps) {
  return (
    <nav 
      aria-label="Mobile Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 text-slate-300 md:hidden pb-safe shadow-lg"
    >
      <div className="grid grid-cols-4 items-center h-16 px-1 max-w-md mx-auto">
        {/* 1. 프로토 */}
        <button
          type="button"
          onClick={() => onTabChange('proto')}
          className={`flex flex-col items-center justify-center h-12 rounded-xl transition-all cursor-pointer min-h-[44px] ${
            currentTab === 'proto'
              ? 'text-blue-400 bg-blue-950/70 font-black'
              : 'text-slate-400 hover:text-white active:bg-slate-800/60'
          }`}
        >
          <Table className={`w-5 h-5 ${currentTab === 'proto' ? 'text-blue-400 scale-110' : 'text-slate-400'} transition-transform`} />
          <span className="text-[11px] font-bold mt-1 tracking-tight">프로토</span>
        </button>

        {/* 2. 토토 14경기 */}
        <button
          type="button"
          onClick={() => onTabChange('toto')}
          className={`flex flex-col items-center justify-center h-12 rounded-xl transition-all cursor-pointer min-h-[44px] ${
            currentTab === 'toto'
              ? 'text-amber-400 bg-amber-950/70 font-black'
              : 'text-slate-400 hover:text-white active:bg-slate-800/60'
          }`}
        >
          <Trophy className={`w-5 h-5 ${currentTab === 'toto' ? 'text-amber-400 scale-110' : 'text-slate-400'} transition-transform`} />
          <span className="text-[11px] font-bold mt-1 tracking-tight">토토 14경기</span>
        </button>

        {/* 3. 분석/검증 */}
        <button
          type="button"
          onClick={() => onTabChange('backtest')}
          className={`flex flex-col items-center justify-center h-12 rounded-xl transition-all cursor-pointer min-h-[44px] ${
            currentTab === 'backtest'
              ? 'text-emerald-400 bg-emerald-950/70 font-black'
              : 'text-slate-400 hover:text-white active:bg-slate-800/60'
          }`}
        >
          <GitCompare className={`w-5 h-5 ${currentTab === 'backtest' ? 'text-emerald-400 scale-110' : 'text-slate-400'} transition-transform`} />
          <span className="text-[11px] font-bold mt-1 tracking-tight">분석/검증</span>
        </button>

        {/* 4. 더보기 */}
        <button
          type="button"
          onClick={() => onTabChange('more')}
          className={`flex flex-col items-center justify-center h-12 rounded-xl transition-all cursor-pointer min-h-[44px] ${
            currentTab === 'more'
              ? 'text-purple-400 bg-purple-950/70 font-black'
              : 'text-slate-400 hover:text-white active:bg-slate-800/60'
          }`}
        >
          <MoreHorizontal className={`w-5 h-5 ${currentTab === 'more' ? 'text-purple-400 scale-110' : 'text-slate-400'} transition-transform`} />
          <span className="text-[11px] font-bold mt-1 tracking-tight">더보기</span>
        </button>
      </div>
    </nav>
  );
}

export default MobileBottomNav;
