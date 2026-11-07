import React, { useEffect, useState, useCallback, useRef } from 'react';
import { TabType, GameType, MatchItem, TotoType } from './types';
import { Header } from './components/Header';
import { MatchTable } from './components/MatchTable';
import { QuantModal } from './components/QuantModal';
import { TotoTable } from './components/TotoTable';
import { BacktestLab } from './components/BacktestLab';
import { WisetotoImportModal } from './components/WisetotoImportModal';
import { AdSenseComplianceFooter, ModalType } from './components/AdSenseComplianceFooter';
import { MobileBottomNav } from './components/MobileBottomNav';
import { MobileMoreTab } from './components/MobileMoreTab';
import { TotoRoundLimits } from './types';
import { resolveRoundByDate } from './utils/calendarRoundResolver';

const initialCalendar = resolveRoundByDate();

export default function App() {
  const [currentTab, setCurrentTab] = useState<TabType>('proto');
  const [gameType, setGameType] = useState<GameType>('pt1');
  const [totoType, setTotoType] = useState<TotoType>('sc');
  const [selectedYear, setSelectedYear] = useState<number>(initialCalendar.year);
  const [selectedRound, setSelectedRound] = useState<number>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlRound = urlParams.get('round');
    if (urlRound && Number(urlRound) > 0) {
      return Number(urlRound);
    }
    return initialCalendar.protoRound;
  });
  const [isVerifiedPreviewMode, setIsVerifiedPreviewMode] = useState<boolean>(false);
  const hasAutoSyncedProtoRoundRef = useRef<boolean>(false);
  const [showWisetotoImport, setShowWisetotoImport] = useState<boolean>(false);
  const [legalModal, setLegalModal] = useState<ModalType>(null);
  const [, setActiveRounds] = useState<{ pt1: number; sc: number; bs: number; bk: number; year?: number; today?: string }>({
    pt1: initialCalendar.protoRound,
    sc: initialCalendar.totoSoccerRound,
    bs: initialCalendar.totoBaseballRound,
    bk: initialCalendar.totoBasketballRound,
    year: initialCalendar.year,
    today: initialCalendar.dateStr
  });

  const [protoRoundLimits, setProtoRoundLimits] = useState<Record<number, number>>({
    2009: 104, 2010: 104, 2011: 107, 2012: 111, 2013: 103, 2014: 104,
    2015: 102, 2016: 105, 2017: 95, 2018: 100, 2019: 103, 2020: 92,
    2021: 103, 2022: 108, 2023: 153, 2024: 157, 2025: 154, 2026: 155
  });

  const [, setTotoRoundLimits] = useState<TotoRoundLimits>({
    sc: {},
    bs: {},
    bk: {}
  });

  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<MatchItem | null>(null);
  const [roundMetadata, setRoundMetadata] = useState<{
    roundPeriod?: string;
    totalGames?: number;
    status?: string;
    domesticRefundRate?: string;
    foreignRefundRate?: string;
    fetchedAt?: string;
    isVerifiedForeignPreview?: boolean;
    verifiedPreviewRound?: number | null;
    foreignSourceOrigin?: string | null;
  }>({});
  const [loadingMatches, setLoadingMatches] = useState<boolean>(true);

  // Client memory cache with 30s TTL to eliminate redundant network calls
  const matchClientCache = useRef<Map<string, { matches: MatchItem[]; metadata: any; timestamp: number }>>(new Map());
  const fetchRequestIdRef = useRef<number>(0);
  const matchesCountRef = useRef<number>(0);

  const [selectedMatchForQuant, setSelectedMatchForQuant] = useState<MatchItem | null>(null);
  const [modalInitialTab, setModalInitialTab] = useState<'overview' | 'h2h' | 'quant' | 'backtest' | 'ai'>('overview');

  // Auto-recognize Proto & Toto active rounds and dates on program startup
  useEffect(() => {
    async function initActiveRounds() {
      try {
        const cal = resolveRoundByDate();
        const [activeRes, totoLimitsRes] = await Promise.all([
          fetch('/api/active-rounds'),
          fetch('/api/toto/limits')
        ]);
        if (activeRes.ok) {
          const data = await activeRes.json();
          if (data && typeof data === 'object') {
            setActiveRounds(data);
            const liveYear = data.year || cal.year;
            if (currentTab === 'proto') {
              const urlParams = new URLSearchParams(window.location.search);
              const hasExplicitUrlRound = Boolean(urlParams.get('round'));
              if (!hasAutoSyncedProtoRoundRef.current && !hasExplicitUrlRound) {
                hasAutoSyncedProtoRoundRef.current = true;
                setSelectedYear(liveYear);
                setSelectedRound(data.pt1 || cal.protoRound);
              }
            } else if (currentTab === 'toto') {
              setSelectedYear(liveYear);
              const defaultTotoRound = totoType === 'sc' ? cal.totoSoccerRound : (totoType === 'bs' ? cal.totoBaseballRound : cal.totoBasketballRound);
              setSelectedRound(data[totoType] || defaultTotoRound);
            }
            if (data.pt1) {
              setProtoRoundLimits(prev => ({ ...prev, [liveYear]: Math.max(prev[liveYear] || 0, data.pt1) }));
            }
          }
        }
        if (totoLimitsRes.ok) {
          const limits = await totoLimitsRes.json();
          if (limits && typeof limits === 'object') setTotoRoundLimits(limits);
        }
      } catch (err) {
        console.warn('Active rounds fetch skipped:', err);
      }
    }
    initActiveRounds();
  }, [currentTab, totoType]);

  // Safe tab switching
  const handleTabSelect = (tab: TabType) => {
    setCurrentTab(tab);
    if (tab === 'proto') {
      setGameType('pt1');
    }
  };

  const handleSelectTotoType = (type: TotoType) => {
    setTotoType(type);
    setCurrentTab('toto');
  };

  const fetchMatches = useCallback(async (force = false) => {
    const cacheKey = `${gameType}_${selectedYear}_${selectedRound}`;
    const cached = matchClientCache.current.get(cacheKey);
    const now = Date.now();
    const isCacheValid = cached && (now - cached.timestamp < 30_000); // 30s Client TTL

    if (!force && isCacheValid) {
      setMatches(cached.matches);
      matchesCountRef.current = cached.matches.length;
      setRoundMetadata(cached.metadata);
      setLoadingMatches(false);
      return;
    }

    const reqId = ++fetchRequestIdRef.current;

    // Avoid screen flash during background auto-refresh
    if (matchesCountRef.current === 0 || !force) {
      setLoadingMatches(true);
    }

    try {
      const url = `/api/matches?gameType=${gameType}&year=${selectedYear}&round=${selectedRound}${force ? '&force=true&refresh=true' : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch matches: ${res.status}`);
      const data = await res.json();
      if (!data || typeof data !== 'object') {
        return;
      }

      // Ignore stale response if a newer round request was started
      if (reqId !== fetchRequestIdRef.current) {
        return;
      }
      
      const list = data.matches || [];
      setMatches(list);
      matchesCountRef.current = list.length;
      
      if (data.maxRounds && selectedYear) {
        setProtoRoundLimits(prev => ({
          ...prev,
          [selectedYear]: data.maxRounds
        }));
      }

      const meta = {
        roundPeriod: data.roundPeriod,
        totalGames: data.totalGames,
        status: data.status,
        domesticRefundRate: data.domesticRefundRate,
        foreignRefundRate: data.foreignRefundRate,
        fetchedAt: data.fetchedAt,
        isVerifiedForeignPreview: false,
        verifiedPreviewRound: null,
        foreignSourceOrigin: data.foreignSourceOrigin || null
      };
      setRoundMetadata(meta);

      matchClientCache.current.set(cacheKey, { matches: list, metadata: meta, timestamp: Date.now() });
    } catch (err) {
      console.warn('[fetchMatches]', err);
    } finally {
      if (reqId === fetchRequestIdRef.current) {
        setLoadingMatches(false);
      }
    }
  }, [gameType, selectedYear, selectedRound]);

  useEffect(() => {
    fetchMatches(false);
  }, [fetchMatches]);

  // Automated 60-second periodic background polling & visibilitychange revalidation
  useEffect(() => {
    if (currentTab !== 'proto') return;

    const intervalTimer = setInterval(() => {
      // Pause polling if browser tab is hidden to conserve resources
      if (document.hidden) return;

      // Auto-poll if round is in progress, scheduled, or pending result updates
      const isPendingOrActive = roundMetadata.status === '진행중' || roundMetadata.status === '경기전' || !roundMetadata.status;
      if (isPendingOrActive) {
        fetchMatches(true);
      }
    }, 60_000); // 60s cycle

    // Revalidate on tab visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const cacheKey = `${gameType}_${selectedYear}_${selectedRound}`;
        const cached = matchClientCache.current.get(cacheKey);
        const isStale = !cached || (Date.now() - cached.timestamp >= 30_000);
        if (isStale) {
          fetchMatches(true);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentTab, fetchMatches, roundMetadata.status, gameType, selectedYear, selectedRound]);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-gray-800 pb-16 md:pb-0">
      {/* 1. Clean Fixed Header Navigation */}
      <Header 
        currentTab={currentTab} 
        onTabChange={handleTabSelect} 
        onOpenImportModal={() => setShowWisetotoImport(true)}
        onOpenLegal={(page) => setLegalModal(page as ModalType)}
      />

      {/* Main Container */}
      <div id="content" className="max-w-[1720px] mx-auto w-full px-2 sm:px-6 py-3 sm:py-5 grow">
        <div className="w-full">
          {currentTab === 'more' ? (
            /* 4. 모바일 더보기 화면 */
            <MobileMoreTab 
              onOpenImportModal={() => setShowWisetotoImport(true)}
              onOpenLegalModal={(page) => setLegalModal(page)}
            />
          ) : currentTab === 'backtest' ? (
            /* 3. 실측 검증 연구소 화면 (백테스트 및 최적화) */
            <BacktestLab />
          ) : currentTab === 'toto' ? (
            /* 2. 토토 14경기 화면 (축구승무패 / 야구승1패 / 농구승5패) */
            <TotoTable 
              selectedTotoType={totoType}
              selectedYear={selectedYear}
              selectedRound={selectedRound}
              onSelectTotoType={handleSelectTotoType}
              onYearChange={setSelectedYear}
              onRoundChange={setSelectedRound}
              onOpenQuantModal={(m) => {
                setSelectedMatchForQuant(m);
                setModalInitialTab('overview');
              }}
            />
          ) : (
            /* 1. 프로토 승부식 화면 (전수 가상화 테이블 & 회차/리그 필터) */
            <div className="space-y-4 w-full">
              {/* Matches Table Header Information */}
              <div id="matches-table-container" className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                    <span>⚽</span>
                    <span>프로토 승부식 경기 목록 ({selectedYear}년도 {selectedRound}회차)</span>
                  </h3>
                  {roundMetadata?.status && (
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {roundMetadata.status}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                    총 {matches.length}경기 편성 (실시간 연산)
                  </span>
                </div>
              </div>

              {loadingMatches ? (
                <div className="py-24 text-center space-y-3 bg-white rounded-2xl border border-slate-200 shadow-xs">
                  <div className="w-9 h-9 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-xs font-bold text-slate-600">프로토 경기 데이터를 불러오는 중입니다...</p>
                </div>
              ) : (
                <MatchTable 
                  matches={matches}
                  selectedYear={selectedYear}
                  selectedRound={selectedRound}
                  protoRoundLimits={protoRoundLimits}
                  selectedMatch={selectedMatch}
                  roundMetadata={roundMetadata}
                  isLoading={loadingMatches}
                  isVerifiedPreviewMode={isVerifiedPreviewMode && selectedYear === 2026 && (selectedRound === 122 || selectedRound === 125)}
                  onToggleVerifiedPreviewMode={() => {
                    const isCurrentlyVerified = isVerifiedPreviewMode && selectedYear === 2026 && (selectedRound === 122 || selectedRound === 125);
                    if (isCurrentlyVerified) {
                      setIsVerifiedPreviewMode(false);
                      setSelectedYear(2026);
                      setSelectedRound(126);
                    } else {
                      setIsVerifiedPreviewMode(true);
                      setSelectedYear(2026);
                      if (selectedRound !== 122 && selectedRound !== 125) {
                        setSelectedRound(125);
                      }
                    }
                  }}
                  onActivateVerifiedPreview={(targetRound = 125) => {
                    setSelectedYear(2026);
                    setSelectedRound(targetRound);
                    setIsVerifiedPreviewMode(true);
                  }}
                  onYearChange={setSelectedYear}
                  onRoundChange={(r) => {
                    setSelectedRound(r);
                    if (selectedYear === 2026 && (r === 122 || r === 125)) {
                      setIsVerifiedPreviewMode(true);
                    } else {
                      setIsVerifiedPreviewMode(false);
                    }
                  }}
                  onRefresh={(force) => fetchMatches(force ?? true)}
                  onSelectMatchForQuant={(m, tab = 'overview') => {
                    setSelectedMatch(m);
                    setSelectedMatchForQuant(m);
                    setModalInitialTab(tab || 'overview');
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <MobileBottomNav 
        currentTab={currentTab} 
        onTabChange={handleTabSelect} 
      />

      {/* Quant Modal */}
      {selectedMatchForQuant && (
        <QuantModal 
          match={selectedMatchForQuant} 
          initialTab={modalInitialTab}
          onClose={() => setSelectedMatchForQuant(null)} 
        />
      )}

      {/* Wisetoto 5-Tab Import & Synchronization Modal */}
      {showWisetotoImport && (
        <WisetotoImportModal
          isOpen={showWisetotoImport}
          onClose={() => setShowWisetotoImport(false)}
          onImportSuccess={() => {
            fetchMatches(true);
          }}
        />
      )}

      {/* Footer with Legal Links & Modals */}
      <AdSenseComplianceFooter 
        externalModal={legalModal}
        onCloseExternalModal={() => setLegalModal(null)}
      />
    </div>
  );
}
