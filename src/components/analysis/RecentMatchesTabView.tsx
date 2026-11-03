import React, { useState } from 'react';

interface RecentMatchesTabViewProps {
  h2hData: any;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
}

export function RecentMatchesTabView({ h2hData, homeTeam, awayTeam, sport, league }: RecentMatchesTabViewProps) {
  const [activeFormTab, setActiveFormTab] = useState<'both' | 'home' | 'away'>('home');
  const isNoDrawSport = sport === 'baseball' || sport === 'basketball' || sport === 'volleyball';
  const periodLabel = sport === 'baseball' ? '5회' : (sport === 'basketball' ? '전반' : (sport === 'volleyball' ? '1세트' : '전반'));

  const homeRecent = h2hData?.homeRecentForm || {};
  const awayRecent = h2hData?.awayRecentForm || {};

  const homeMatches: any[] = Array.isArray(homeRecent.recentMatches) ? homeRecent.recentMatches : [];
  const awayMatches: any[] = Array.isArray(awayRecent.recentMatches) ? awayRecent.recentMatches : [];

  // Helper to safely compute summary from matches if summary fields are missing or NaN
  const computeSafeSummary = (summary: any, matches: any[]) => {
    const hasMatches = Array.isArray(matches) && matches.length > 0;
    const played = hasMatches ? matches.length : (Number(summary?.played || summary?.total) || 0);
    const hasData = played > 0;
    
    let scored = 0;
    let conceded = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;

    if (hasMatches) {
      matches.forEach((m: any) => {
        const sf = Number(m.scoreFor ?? (m.scored ?? (m.score ? parseInt(m.score.split(':')[0]) : 0))) || 0;
        const sa = Number(m.scoreAgainst ?? (m.conceded ?? (m.score ? parseInt(m.score.split(':')[1]) : 0))) || 0;
        scored += sf;
        conceded += sa;
        if (m.result === 'W' || m.result === '승' || sf > sa) wins++;
        else if (!isNoDrawSport && (m.result === 'D' || m.result === '무' || sf === sa)) draws++;
        else losses++;
      });
    } else if (hasData) {
      scored = Number(summary?.scored) || 0;
      conceded = Number(summary?.conceded) || 0;
      wins = Number(summary?.win) || 0;
      draws = isNoDrawSport ? 0 : (Number(summary?.draw) || 0);
      losses = Number(summary?.lose) || 0;
    }

    const avgScored = hasData ? (scored / played).toFixed(1) : '-';
    const avgConceded = hasData ? (conceded / played).toFixed(1) : '-';
    const diff = scored - conceded;
    const diffStr = hasData ? (diff >= 0 ? `+${diff}` : `${diff}`) : '-';

    return {
      hasData,
      played,
      win: hasData ? wins : '-',
      draw: hasData ? draws : '-',
      lose: hasData ? losses : '-',
      scored: hasData ? `${scored}점` : '-',
      conceded: hasData ? `${conceded}점` : '-',
      avgScored,
      avgConceded,
      diff,
      diffStr,
      streak: hasData ? (summary?.streak && summary.streak !== '-' ? summary.streak : (wins >= losses ? `${wins}연승` : `${losses}연패`)) : '-'
    };
  };

  const homeSum = computeSafeSummary(homeRecent.summary, homeMatches);
  const awaySum = computeSafeSummary(awayRecent.summary, awayMatches);

  const renderTeamRecentTable = (teamName: string, matches: any[], summary: any, isHome: boolean) => {
    const total = summary.hasData ? summary.played : 0;
    const wins = summary.win;
    const draws = isNoDrawSport ? 0 : summary.draw;
    const losses = summary.lose;
    const winRate = summary.hasData && typeof wins === 'number' && total > 0 ? Math.round((wins / total) * 100) : '-';

    return (
      <div className="bg-[#0f1d2c] border border-[#1b344d] rounded-2xl p-4 space-y-3 shadow-md">
        {/* Team Summary Header */}
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${isHome ? 'bg-blue-400' : 'bg-rose-400'}`}></span>
            <h3 className="font-black text-sm sm:text-base text-white">
              {teamName} <span className="text-xs text-slate-400 font-normal">최근 5경기 폼</span>
            </h3>
            <span className="text-xs font-mono font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-amber-300">
              {summary.streak}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-blue-300 font-bold">{typeof wins === 'number' ? `${wins}승` : '-'}</span>
            {!isNoDrawSport && <span className="text-amber-300 font-bold">{typeof draws === 'number' ? `${draws}무` : '-'}</span>}
            <span className="text-rose-300 font-bold">{typeof losses === 'number' ? `${losses}패` : '-'}</span>
            <span className="text-slate-400 font-sans">({winRate !== '-' ? `${winRate}%` : '기록 미수집'})</span>
          </div>
        </div>

        {/* Stats Grid - Fixed NaN guards */}
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="bg-[#09131f] p-2 rounded-lg border border-slate-800/80">
            <div className="text-[10px] text-slate-400">총 득점</div>
            <div className="font-bold text-emerald-300 font-mono mt-0.5">{summary.scored}</div>
          </div>
          <div className="bg-[#09131f] p-2 rounded-lg border border-slate-800/80">
            <div className="text-[10px] text-slate-400">총 실점</div>
            <div className="font-bold text-rose-300 font-mono mt-0.5">{summary.conceded}</div>
          </div>
          <div className="bg-[#09131f] p-2 rounded-lg border border-slate-800/80">
            <div className="text-[10px] text-slate-400">평균 득점</div>
            <div className="font-bold text-cyan-300 font-mono mt-0.5">{summary.avgScored}</div>
          </div>
          <div className="bg-[#09131f] p-2 rounded-lg border border-slate-800/80">
            <div className="text-[10px] text-slate-400">득실 마진</div>
            <div className={`font-bold font-mono mt-0.5 ${typeof summary.diff === 'number' && summary.diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {summary.diffStr}
            </div>
          </div>
        </div>

        {/* 📱 MOBILE VIEW: Horizontal Swipeable Form Cards */}
        <div className="block md:hidden">
          {matches.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-xs bg-slate-900/40 rounded-xl">
              최근 경기 기록 없음 (데이터 없음)
            </div>
          ) : (
            <div className="flex overflow-x-auto gap-3.5 pb-4 scroll-smooth no-scrollbar snap-x snap-mandatory">
              {matches.map((m: any, idx: number) => {
                const sf = Number(m.scoreFor ?? (m.scored ?? 0));
                const sa = Number(m.scoreAgainst ?? (m.conceded ?? 0));
                const isWin = m.result === '승' || m.result === 'W' || (sf > sa);
                const isDraw = !isNoDrawSport && (m.result === '무' || m.result === 'D' || (sf === sa));
                const scoreStr = m.score || `${sf} : ${sa}`;

                const matchupText = m.opponent 
                  ? (m.isHome ? `${teamName} vs ${m.opponent}` : `${m.opponent} vs ${teamName}`) 
                  : (m.matchup || `${teamName} 경기`);

                const parts = matchupText.split('vs').map((s: string) => s.trim());
                const hName = parts[0] || teamName;
                const aName = parts[1] || '상대팀';

                return (
                  <div 
                    key={`form_mobile_card_${idx}`}
                    className="w-[260px] min-w-[260px] shrink-0 snap-start bg-[#0d1726] border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between space-y-2.5 shadow-sm"
                  >
                    {/* Top Row: Date & League */}
                    <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-400">
                      <span>{m.date || '2026.09.15'}</span>
                      <span className="bg-slate-800 px-1.5 py-0.2 rounded text-[9px] text-slate-300 border border-slate-700">
                        {m.league || league}
                      </span>
                    </div>

                    {/* Matchup & Score */}
                    <div className="flex items-center justify-between gap-1.5 py-1">
                      <span className={`text-xs font-black truncate text-right flex-1 ${hName === teamName ? (isHome ? 'text-blue-400 font-extrabold' : 'text-slate-200') : 'text-slate-400'}`}>
                        {hName}
                      </span>
                      <div className="px-2.5 py-0.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs font-black text-white shrink-0">
                        {scoreStr}
                      </div>
                      <span className={`text-xs font-black truncate text-left flex-1 ${aName === teamName ? (!isHome ? 'text-blue-400 font-extrabold' : 'text-slate-200') : 'text-slate-400'}`}>
                        {aName}
                      </span>
                    </div>

                    {/* Period Score & Venue Indicator */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                      <span>장소: {m.isHome ? '🏠 홈' : '✈️ 원정'}</span>
                      {(m.periodScore || m.firstHalfScore) && (
                        <span>{periodLabel}: {m.periodScore || m.firstHalfScore}</span>
                      )}
                    </div>

                    {/* Result Badge */}
                    <div className="text-center pt-1.5 border-t border-slate-800/50">
                      <span className={`inline-block w-full py-1 rounded-xl text-xs font-bold ${
                        isWin 
                          ? 'bg-blue-950 text-blue-300 border border-blue-700/50' 
                          : isDraw 
                          ? 'bg-amber-950 text-amber-300 border border-amber-700/50' 
                          : 'bg-rose-950 text-rose-300 border border-rose-700/50'
                      }`}>
                        {isWin ? '승리 ✅' : isDraw ? '무승부' : '패배 ❌'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 🖥️ DESKTOP VIEW: High-Density Table (>= 768px) */}
        <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-[#111e30] text-slate-300 border-b border-slate-800 font-semibold text-[11px]">
                <th className="py-2.5 px-2.5 whitespace-nowrap">일시</th>
                <th className="py-2.5 px-2 text-center whitespace-nowrap">대회</th>
                <th className="py-2.5 px-2.5">매치업 (홈 vs 원정)</th>
                <th className="py-2.5 px-2 text-center whitespace-nowrap">{periodLabel}</th>
                <th className="py-2.5 px-2.5 text-center whitespace-nowrap">스코어</th>
                <th className="py-2.5 px-2.5 text-center whitespace-nowrap">결과</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {matches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400 font-sans">
                    최근 경기 기록 없음 (데이터 없음)
                  </td>
                </tr>
              ) : (
                matches.map((m: any, idx: number) => {
                  const sf = Number(m.scoreFor ?? (m.scored ?? 0));
                  const sa = Number(m.scoreAgainst ?? (m.conceded ?? 0));
                  const isWin = m.result === '승' || m.result === 'W' || (sf > sa);
                  const isDraw = !isNoDrawSport && (m.result === '무' || m.result === 'D' || (sf === sa));
                  const scoreStr = m.score || `${sf} : ${sa}`;

                  return (
                    <tr key={idx} className="hover:bg-[#132238] transition-colors">
                      <td className="py-2.5 px-2.5 text-slate-400 whitespace-nowrap text-[11px]">{m.date || '2026.09.15'}</td>
                      <td className="py-2.5 px-2 text-center font-sans whitespace-nowrap">
                        <span className="bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px] text-slate-300 border border-slate-700/50">
                          {m.league || league}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 font-sans text-slate-200">
                        <span className={m.isHome ? 'text-amber-300 font-bold' : 'text-slate-300'}>
                          {m.opponent ? (m.isHome ? `${teamName} vs ${m.opponent}` : `${m.opponent} vs ${teamName}`) : (m.matchup || `${teamName} 경기`)}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center text-slate-400 text-[11px] whitespace-nowrap">
                        {m.periodScore || m.firstHalfScore || '-'}
                      </td>
                      <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                        <span className="font-bold text-white bg-slate-900 px-2.5 py-0.5 rounded border border-slate-700 inline-block tracking-wider">
                          {scoreStr}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold ${
                          isWin 
                            ? 'bg-blue-950 text-blue-300 border border-blue-700/60' 
                            : isDraw 
                            ? 'bg-amber-950 text-amber-300 border border-amber-700/60' 
                            : 'bg-rose-950 text-rose-300 border border-rose-700/60'
                        }`}>
                          {isWin ? '승리' : isDraw ? '무승부' : '패배'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. Comparison Header Banner */}
      <div className="bg-[#0c1624] border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-black text-amber-300">🔥 최근 5경기 폼 & 득실점 대조</span>
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
              양 팀 공식 경기 최근 5전
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            공식 리그 및 컵 대회 최근 경기 결과로부터 연승/연패 스트릭 및 공수 득실 마진을 집계했습니다.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs bg-[#09131f] p-2.5 rounded-xl border border-slate-800 self-start md:self-auto">
          <div className="text-center">
            <div className="text-[10px] text-slate-400">{homeTeam} 득실차</div>
            <div className={`font-mono font-bold ${homeSum.diff >= 0 ? 'text-blue-400' : 'text-slate-400'}`}>
              {homeSum.diffStr}
            </div>
          </div>
          <div className="text-slate-600 font-bold">vs</div>
          <div className="text-center">
            <div className="text-[10px] text-slate-400">{awayTeam} 득실차</div>
            <div className={`font-mono font-bold ${awaySum.diff >= 0 ? 'text-rose-400' : 'text-slate-400'}`}>
              {awaySum.diffStr}
            </div>
          </div>
        </div>
      </div>

      {/* 📱 Mobile Team Form Horizontal Segmented Selector */}
      <div className="block lg:hidden w-full p-1 bg-[#060e17] rounded-xl border border-slate-800 shadow-inner">
        <div className="flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => setActiveFormTab('home')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeFormTab === 'home'
                ? 'bg-blue-600 text-white shadow font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🏠</span>
            <span className="truncate">{homeTeam} 최근폼</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFormTab('away')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeFormTab === 'away'
                ? 'bg-rose-600 text-white shadow font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>✈️</span>
            <span className="truncate">{awayTeam} 최근폼</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFormTab('both')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeFormTab === 'both'
                ? 'bg-slate-800 text-white shadow font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>📊</span>
            <span>양 팀 대조</span>
          </button>
        </div>
      </div>

      {/* 🖥️ DESKTOP VIEW: Side-by-Side Team Form Cards (>= 1024px) */}
      <div className="hidden lg:grid grid-cols-2 gap-4">
        {renderTeamRecentTable(homeTeam, homeMatches, homeSum, true)}
        {renderTeamRecentTable(awayTeam, awayMatches, awaySum, false)}
      </div>

      {/* 📱 MOBILE VIEW: Tabbed clean display without vertical stacking */}
      <div className="block lg:hidden space-y-4">
        {activeFormTab === 'home' && renderTeamRecentTable(homeTeam, homeMatches, homeSum, true)}
        {activeFormTab === 'away' && renderTeamRecentTable(awayTeam, awayMatches, awaySum, false)}
        {activeFormTab === 'both' && (
          <div className="space-y-4">
            {renderTeamRecentTable(homeTeam, homeMatches, homeSum, true)}
            {renderTeamRecentTable(awayTeam, awayMatches, awaySum, false)}
          </div>
        )}
      </div>
    </div>
  );
}
