import React from 'react';
import { TabType } from '../types';
import { Table, Trophy, GitCompare, RefreshCw } from 'lucide-react';

import { OddsAlgoLogo } from './OddsAlgoLogo';

interface HeaderProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  onOpenImportModal?: () => void;
  onOpenLegal?: (page: 'about' | 'privacy' | 'contact' | 'disclaimer') => void;
}

export function Header({ currentTab, onTabChange, onOpenImportModal }: HeaderProps) {
  return (
    <header className="bg-slate-900 text-white shadow-md border-b border-slate-800 sticky top-0 z-30">
      <div className="max-w-[1720px] mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Zone 1: Logo and Brand Title */}
        <div className="flex items-center gap-2 shrink-0">
          <button 
            type="button"
            onClick={() => onTabChange('proto')}
            className="flex items-center hover:opacity-95 transition-opacity cursor-pointer group"
            title="ODDSALGO (오즈알고) 홈으로 이동"
          >
            <OddsAlgoLogo size="md" variant="dark" showKorean={true} />
          </button>
        </div>

        {/* Zone 2: Desktop Top Navigation Links (Hidden on mobile as mobile uses Bottom Navigation) */}
        <nav className="hidden md:flex items-center gap-2 py-1">
          {/* 1. 프로토 승부식 */}
          <button
            type="button"
            onClick={() => onTabChange('proto')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              currentTab === 'proto'
                ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-400/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Table className="w-4 h-4 text-blue-300" />
            <span>⚽ 프로토 승부식</span>
          </button>

          {/* 2. 토토 14경기 */}
          <button
            type="button"
            onClick={() => onTabChange('toto')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              currentTab === 'toto'
                ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-400/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Trophy className="w-4 h-4 text-amber-300" />
            <span>🎯 토토 14경기</span>
          </button>

          {/* 3. 실측 검증 연구소 */}
          <button
            type="button"
            onClick={() => onTabChange('backtest')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              currentTab === 'backtest'
                ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-400/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <GitCompare className="w-4 h-4 text-emerald-300" />
            <span>🔬 실측 검증 연구소</span>
          </button>
        </nav>

        {/* Zone 3: Quick Action Button (Desktop & Mobile Sync Trigger) */}
        <div className="flex items-center gap-2">
          {onOpenImportModal && (
            <button
              type="button"
              onClick={onOpenImportModal}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95 shrink-0"
              title="와이즈토토 실시간 데이터 수동 패치"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">와이즈토토 동기화</span>
              <span className="sm:hidden text-[11px]">동기화</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
