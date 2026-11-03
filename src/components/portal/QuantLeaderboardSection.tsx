import React, { useState } from 'react';
import { Medal, Award, ThumbsUp, Users, Flame, Check } from 'lucide-react';

interface Predictor {
  rank: number;
  name: string;
  badge: string;
  hitCount: number;
  totalPicks: number;
  accuracy: string;
  profitScore: string;
  recentForm: ('W' | 'L')[];
}

export function QuantLeaderboardSection() {
  const [activeSportFilter, setActiveSportFilter] = useState<'all' | 'soccer' | 'baseball' | 'basketball'>('all');
  const [userVote, setUserVote] = useState<'home' | 'draw' | 'away' | null>(null);
  const [voteCounts, setVoteCounts] = useState({ home: 142, draw: 58, away: 86 });

  const predictors: Predictor[] = [
    { rank: 1, name: '반다이크_수비학', badge: '마스터 퀀트', hitCount: 14, totalPicks: 14, accuracy: '100.0%', profitScore: '+142.5%', recentForm: ['W', 'W', 'W', 'W', 'W'] },
    { rank: 2, name: '피를로_딥패스', badge: 'ELO 스페셜리스트', hitCount: 13, totalPicks: 14, accuracy: '92.9%', profitScore: '+118.4%', recentForm: ['W', 'W', 'W', 'L', 'W'] },
    { rank: 3, name: '빌벤터_제자', badge: '다항로짓 분석관', hitCount: 12, totalPicks: 14, accuracy: '85.7%', profitScore: '+94.2%', recentForm: ['W', 'L', 'W', 'W', 'W'] },
    { rank: 4, name: '섀넌_엔트로피', badge: '정보이론 랩', hitCount: 12, totalPicks: 14, accuracy: '85.7%', profitScore: '+88.0%', recentForm: ['L', 'W', 'W', 'W', 'W'] },
    { rank: 5, name: '포아송_마스터', badge: '득점분포 수석', hitCount: 11, totalPicks: 14, accuracy: '78.6%', profitScore: '+76.3%', recentForm: ['W', 'W', 'L', 'W', 'L'] },
  ];

  const handleVote = (choice: 'home' | 'draw' | 'away') => {
    if (userVote === choice) return;
    setUserVote(choice);
    setVoteCounts(prev => ({
      ...prev,
      [choice]: prev[choice] + 1
    }));
  };

  const totalVotes = voteCounts.home + voteCounts.draw + voteCounts.away;
  const homePct = Math.round((voteCounts.home / totalVotes) * 100);
  const drawPct = Math.round((voteCounts.draw / totalVotes) * 100);
  const awayPct = Math.round((voteCounts.away / totalVotes) * 100);

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200 shadow-sm space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Medal className="w-5 h-5 text-amber-500" />
          <h3 className="font-black text-sm sm:text-base text-slate-900">
            실시간 퀀트 분석관 랭킹 & 유저 예측 (Quant Leaderboard)
          </h3>
        </div>
        <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
          실시간 집계 중
        </span>
      </div>

      {/* Top 5 Leaderboard Table */}
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-bold border-b border-gray-200">
              <th className="p-2 text-center w-12">순위</th>
              <th className="p-2">분석관 / 닉네임</th>
              <th className="p-2 text-center">예측 성과</th>
              <th className="p-2 text-center">예측 정확도</th>
              <th className="p-2 text-center hidden sm:table-cell">기대 가치 점수</th>
              <th className="p-2 text-center hidden md:table-cell">최근 흐름</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {predictors.map(p => (
              <tr key={p.rank} className="hover:bg-slate-50 transition-colors">
                <td className="p-2 text-center">
                  {p.rank === 1 ? (
                    <span className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-black inline-flex items-center justify-center text-xs shadow-xs">
                      1
                    </span>
                  ) : p.rank === 2 ? (
                    <span className="w-6 h-6 rounded-full bg-slate-300 text-slate-900 font-black inline-flex items-center justify-center text-xs">
                      2
                    </span>
                  ) : p.rank === 3 ? (
                    <span className="w-6 h-6 rounded-full bg-amber-700 text-white font-black inline-flex items-center justify-center text-xs">
                      3
                    </span>
                  ) : (
                    <span className="font-mono text-gray-500 font-bold">{p.rank}</span>
                  )}
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-slate-900">{p.name}</span>
                    <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded font-bold border border-blue-100">
                      {p.badge}
                    </span>
                  </div>
                </td>
                <td className="p-2 text-center font-mono font-bold text-blue-900">
                  {p.hitCount} / {p.totalPicks} 경기
                </td>
                <td className="p-2 text-center font-mono font-bold text-emerald-600">
                  {p.accuracy}
                </td>
                <td className="p-2 text-center font-mono font-bold text-amber-600 hidden sm:table-cell">
                  {p.profitScore}
                </td>
                <td className="p-2 text-center hidden md:table-cell">
                  <div className="flex items-center justify-center gap-1">
                    {p.recentForm.map((f, i) => (
                      <span
                        key={i}
                        className={`w-4 h-4 rounded-full text-[9px] font-black inline-flex items-center justify-center text-white ${
                          f === 'W' ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Interactive Match Vote Widget */}
      <div className="bg-slate-900 text-slate-100 rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
            <Flame className="w-4 h-4 text-amber-400" />
            <span>오늘의 빅매치 유저 예측 투표</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            총 {totalVotes}명 참여 중
          </span>
        </div>

        <div className="flex items-center justify-between text-xs font-bold text-slate-200">
          <span>전북 현대</span>
          <span className="text-[11px] font-mono text-slate-400">K리그1 18:00</span>
          <span>울산 HD</span>
        </div>

        {/* Voting Buttons */}
        <div className="grid grid-cols-3 gap-2 text-xs font-bold">
          <button
            onClick={() => handleVote('home')}
            className={`py-2 rounded-lg border transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
              userVote === 'home'
                ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <span>전북 승 ({homePct}%)</span>
            <span className="text-[10px] font-mono opacity-80">{voteCounts.home}표</span>
          </button>

          <button
            onClick={() => handleVote('draw')}
            className={`py-2 rounded-lg border transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
              userVote === 'draw'
                ? 'bg-amber-600 border-amber-400 text-white shadow-md'
                : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <span>무승부 ({drawPct}%)</span>
            <span className="text-[10px] font-mono opacity-80">{voteCounts.draw}표</span>
          </button>

          <button
            onClick={() => handleVote('away')}
            className={`py-2 rounded-lg border transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
              userVote === 'away'
                ? 'bg-rose-600 border-rose-400 text-white shadow-md'
                : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <span>울산 승 ({awayPct}%)</span>
            <span className="text-[10px] font-mono opacity-80">{voteCounts.away}표</span>
          </button>
        </div>
      </div>
    </div>
  );
}
