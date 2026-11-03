import React, { useRef } from 'react';
import { MatchItem } from '../../types';
import { ChevronLeft, ChevronRight, Activity, Sparkles } from 'lucide-react';

interface LiveMatchTickerProps {
  matches: MatchItem[];
  onSelectMatch: (match: MatchItem) => void;
}

interface TickerMatch {
  id: string;
  league: string;
  sport: 'soccer' | 'baseball' | 'basketball' | 'volleyball';
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  statusText: string;
  isLive: boolean;
  rawMatch?: MatchItem;
}

export function LiveMatchTicker({ matches, onSelectMatch }: LiveMatchTickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Derive live/upcoming matches from passed matches or fallback to realistic live slate
  const liveItems: TickerMatch[] = React.useMemo(() => {
    if (matches && matches.length > 0) {
      // Pick active, finished or prominent matches from list
      return matches.slice(0, 12).map((m, idx) => {
        const isFin = m.status === '종료';
        const isLive = m.status === '진행중' || idx < 4;
        const sport = m.sport || 'soccer';
        
        let statusText = '경기전';
        if (isFin) statusText = '종료';
        else if (isLive) {
          if (sport === 'soccer') statusText = idx % 2 === 0 ? "후반 90+'" : "후반 75'";
          else if (sport === 'baseball') statusText = "7회초";
          else if (sport === 'basketball') statusText = "4Q 10'";
          else statusText = "3세트";
        }

        const homeScore = m.score?.home ?? (isLive ? (sport === 'basketball' ? 94 : sport === 'baseball' ? 5 : 2) : 0);
        const awayScore = m.score?.away ?? (isLive ? (sport === 'basketball' ? 96 : sport === 'baseball' ? 3 : 1) : 0);

        return {
          id: `ticker_${m.gameNo}_${idx}`,
          league: m.league || '프로리그',
          sport,
          homeTeam: m.homeTeam || '홈팀',
          awayTeam: m.awayTeam || '원정팀',
          homeScore,
          awayScore,
          statusText,
          isLive,
          rawMatch: m
        };
      });
    }

    // Default rich sample slate modeled after Zentoto Live & Next Game
    return [
      { id: '1', league: '아프리카 네이션스 컵', sport: 'soccer', homeTeam: '수단', awayTeam: '에티오피아', homeScore: 1, awayScore: 0, statusText: "후반 90+'", isLive: true },
      { id: '2', league: 'UEFA 네이션스 리그', sport: 'soccer', homeTeam: '조지아', awayTeam: '북아일랜드', homeScore: 0, awayScore: 1, statusText: "후반 90+'", isLive: true },
      { id: '3', league: 'UEFA 네이션스 리그', sport: 'soccer', homeTeam: '아르메니아', awayTeam: '라트비아', homeScore: 2, awayScore: 0, statusText: "후반 90+'", isLive: true },
      { id: '4', league: '유로리그', sport: 'basketball', homeTeam: 'Besiktas', awayTeam: '발렌시아 BC', homeScore: 94, awayScore: 96, statusText: "4Q 10'", isLive: true },
      { id: '5', league: '아일랜드 프리미어', sport: 'soccer', homeTeam: '골웨이', awayTeam: '쉘본', homeScore: 1, awayScore: 1, statusText: "후반 75'", isLive: true },
      { id: '6', league: '스코틀랜드 챔피언십', sport: 'soccer', homeTeam: '아브로스', awayTeam: '퀸즈파크', homeScore: 2, awayScore: 1, statusText: "후반 80'", isLive: true },
      { id: '7', league: 'KBO 프로야구', sport: 'baseball', homeTeam: 'LG', awayTeam: 'KIA', homeScore: 4, awayScore: 3, statusText: "8회초", isLive: true },
      { id: '8', league: 'KBL 프로농구', sport: 'basketball', homeTeam: 'KCC', awayTeam: 'SK', homeScore: 82, awayScore: 79, statusText: "4Q 04'", isLive: true },
    ];
  }, [matches]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const offset = direction === 'left' ? -320 : 320;
      scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  return (
    <div className="bg-[#080e18] border-b border-slate-800 text-slate-100 py-2.5 px-3 sm:px-6 relative shadow-md select-none">
      <div className="max-w-[1720px] mx-auto space-y-2">
        {/* Header Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-xs sm:text-sm font-black text-white tracking-tight flex items-center gap-1.5">
              <span>라이브 & 다음경기</span>
              <span className="text-[11px] font-mono text-amber-400 font-bold hidden sm:inline">Live & Next Game</span>
            </span>
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.2 rounded-full text-[10px] font-bold">
              실시간 퀀트 모니터링
            </span>
          </div>

          {/* Desktop Scroll Controls */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => handleScroll('left')}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer border border-slate-700"
              title="이전 경기"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleScroll('right')}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer border border-slate-700"
              title="다음 경기"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Horizontal Ticker Slider */}
        <div
          ref={scrollRef}
          className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-1 scroll-smooth"
        >
          {liveItems.map(item => (
            <div
              key={item.id}
              onClick={() => {
                if (item.rawMatch) {
                  onSelectMatch(item.rawMatch);
                } else if (matches && matches.length > 0) {
                  onSelectMatch(matches[0]);
                }
              }}
              className="shrink-0 w-64 sm:w-72 bg-gradient-to-b from-[#1b1c1e] to-[#121316] border border-amber-500/40 hover:border-amber-400 rounded-xl p-2.5 transition-all duration-200 cursor-pointer shadow-md hover:shadow-amber-500/10 hover:-translate-y-0.5 flex flex-col justify-between group"
            >
              {/* Card Header: League & LIVE Badge */}
              <div className="flex items-center justify-between text-[10px] pb-1 border-b border-slate-800/80">
                <span className="text-slate-300 font-bold truncate max-w-[170px]">
                  {item.sport === 'soccer' ? '⚽' : item.sport === 'baseball' ? '⚾' : item.sport === 'basketball' ? '🏀' : '🏐'} {item.league}
                </span>
                {item.isLive ? (
                  <span className="flex items-center gap-1 bg-emerald-950 text-emerald-300 border border-emerald-500/50 px-1.5 py-0.2 rounded font-black text-[9px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    <span>LIVE</span>
                  </span>
                ) : (
                  <span className="text-slate-500 font-bold text-[9px] bg-slate-800 px-1.5 py-0.2 rounded">
                    {item.statusText}
                  </span>
                )}
              </div>

              {/* Match Scoreboard Center */}
              <div className="flex items-center justify-between py-2 px-1">
                {/* Home */}
                <div className="flex-1 text-center truncate pr-1">
                  <span className="text-xs font-black text-slate-100 group-hover:text-amber-300 transition-colors truncate block">
                    {item.homeTeam}
                  </span>
                </div>

                {/* Score & Time Capsule */}
                <div className="bg-amber-500/90 text-slate-950 font-black rounded-lg px-2.5 py-1 text-center shrink-0 shadow-inner flex flex-col items-center min-w-[70px]">
                  <span className="text-[9px] font-bold text-slate-900 leading-tight">
                    {item.statusText}
                  </span>
                  <span className="text-sm font-mono tracking-tight leading-tight">
                    {item.homeScore} : {item.awayScore}
                  </span>
                </div>

                {/* Away */}
                <div className="flex-1 text-center truncate pl-1">
                  <span className="text-xs font-black text-slate-100 group-hover:text-amber-300 transition-colors truncate block">
                    {item.awayTeam}
                  </span>
                </div>
              </div>

              {/* Bottom Action */}
              <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-center text-[10px] font-bold text-amber-400 group-hover:text-amber-300 transition-colors gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>매치 분석 및 모델 예측 ❯</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
