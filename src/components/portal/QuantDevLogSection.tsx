import React from 'react';
import { Terminal, GitCommit, ShieldCheck, Cpu, Code2 } from 'lucide-react';

interface DevLogItem {
  version: string;
  date: string;
  title: string;
  category: '수리모델' | '엔진최적화' | '포탈UI' | '데이터베이스';
  categoryColor: string;
  details: string[];
}

export function QuantDevLogSection() {
  const devLogs: DevLogItem[] = [
    {
      version: 'v4.6.0',
      date: '2026-09-26',
      title: '젠토토 벤치마킹 포탈형 UI & 상단 라이브 티커 구축',
      category: '포탈UI',
      categoryColor: 'bg-blue-500/20 text-blue-300 border-blue-400/40',
      details: [
        '상단 실시간 라이브 & 다음 경기(Live & Next Game) 티커 위젯 탑재',
        '토토 3대 마켓(축구 승무패·야구 승1패·농구 승5패) 퀀트 추천 허브 연동',
        '유저 참여형 실시간 퀀트 분석관 랭킹 시스템 및 매치 투표 도입'
      ]
    },
    {
      version: 'v4.5.2',
      date: '2026-09-24',
      title: 'Dixon-Coles 다변량 포아송 및 저득점 tau 계수 최적화',
      category: '수리모델',
      categoryColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
      details: [
        '0-0, 1-0, 0-1, 1-1 스코어 상호 의존성 계수(tau) 0.13 가중 수렴 보정',
        '리그별 마켓 베이스(marketBase) 동적 주입 및 <10ms 연산 캐시 적용'
      ]
    },
    {
      version: 'v4.4.0',
      date: '2026-09-22',
      title: '야구 5이닝 승1패 Bayesian Poisson 선발 ERA 격차 반영',
      category: '수리모델',
      categoryColor: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
      details: [
        'eraFactor = (awayERA - homeERA) * 0.35 가중치 분기식 구현',
        'W1L 5이닝 전용 lambdaHome_5 = homeERA/9*5*0.5+2.1 정밀 모델링'
      ]
    },
    {
      version: 'v4.3.0',
      date: '2026-09-20',
      title: '2021~2026 300회차 워크포워드 롤링 백테스트 엔진 가동',
      category: '데이터베이스',
      categoryColor: 'bg-purple-500/20 text-purple-300 border-purple-400/40',
      details: [
        '20회차 롤링 학습창(Rolling Train Window) 구축 및 Lookahead bias 0% 차단',
        'SQLite proto_history 테이블 중복 제거(INSERT ON CONFLICT) 및 roundDate 인덱싱'
      ]
    },
    {
      version: 'v4.2.1',
      date: '2026-09-18',
      title: '모바일 60fps 가상 스크롤 & 90vh 바텀 시트 반응형 완성',
      category: '엔진최적화',
      categoryColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40',
      details: [
        '<768px 모바일 뷰 전용 세로형 카드 UI 자동 전환 (가로 스크롤 0px 보장)',
        '인스타그램 스토리 스타일 가로 스크롤 필터 칩 및 TanStack Virtual 통합'
      ]
    }
  ];

  return (
    <div className="bg-[#0b131e] rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-md space-y-4 text-slate-100">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-blue-400" />
          <h3 className="font-black text-sm sm:text-base text-white">
            실시간 개발노트 및 수리 모델 업데이트 (Quant Dev Log)
          </h3>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>공식 기술 피드</span>
        </div>
      </div>

      <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
        {devLogs.map(log => (
          <div
            key={log.version}
            className="bg-[#070d17] border border-slate-800/90 rounded-xl p-3 text-xs space-y-2 hover:border-slate-700 transition-colors"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/40 text-[11px]">
                  {log.version}
                </span>
                <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold border ${log.categoryColor}`}>
                  {log.category}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">{log.date}</span>
            </div>

            {/* Title */}
            <h4 className="font-bold text-slate-200 text-xs sm:text-[13px]">
              {log.title}
            </h4>

            {/* Details List */}
            <ul className="space-y-1 text-[11px] text-slate-400 pl-1">
              {log.details.map((d, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-blue-400 shrink-0 mt-0.5">•</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
