import React, { useState, useEffect } from 'react';
import { MessageSquare, ThumbsUp, Send, User, Sparkles } from 'lucide-react';

interface CommentItem {
  id: string;
  author: string;
  content: string;
  createdAt: string;
  likes: number;
  liked?: boolean;
}

interface MatchCommentsSectionProps {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
}

export function MatchCommentsSection({ matchId, homeTeam, awayTeam, sport }: MatchCommentsSectionProps) {
  const storageKey = `sq_match_comments_${matchId}`;
  
  // Seed realistic analytical comments if first time viewing this match
  const getInitialComments = (): CommentItem[] => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.warn('Failed to parse saved comments', e);
      }
    }

    const defaultComments: CommentItem[] = [
      {
        id: 'c1',
        author: '통계분석관_K',
        content: `${homeTeam}의 최근 5경기 ELO 평점이 상승세이고, Dixon-Coles 기대 득점 분포상 홈 기대 득점(lambda)이 1.45 이상으로 우세하게 산출되었네요. 통계적 기대값이 매력적인 구간입니다.`,
        createdAt: '10분 전',
        likes: 7,
        liked: false,
      },
      {
        id: 'c2',
        author: '포아송_마스터',
        content: `${awayTeam}의 원정 수비 실점률(1.68)과 공격 효율 저하를 고려할 때 일반 승패 및 기준점 언더/오버 모델 결과가 상당히 정밀해 보입니다.`,
        createdAt: '28분 전',
        likes: 5,
        liked: false,
      },
      {
        id: 'c3',
        author: '데이터사이언티스트',
        content: `해외 No-Vig 공정 확률과 국내 기대값 간의 갭(EV)이 플러스 영역에 형성되어 있어 2021~2026 백테스트 검증 기준 상위 15% 안정 구간에 속합니다.`,
        createdAt: '1시간 전',
        likes: 9,
        liked: false,
      },
    ];

    return defaultComments;
  };

  const [comments, setComments] = useState<CommentItem[]>(getInitialComments);
  const [authorName, setAuthorName] = useState('');
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    setComments(getInitialComments());
  }, [matchId]);

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const newEntry: CommentItem = {
      id: `c_${Date.now()}`,
      author: authorName.trim() || `데이터분석가_${Math.floor(1000 + Math.random() * 9000)}`,
      content: newComment.trim(),
      createdAt: '방금 전',
      likes: 0,
      liked: false,
    };

    const updated = [newEntry, ...comments];
    setComments(updated);
    setNewComment('');
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (err) {
      console.warn('Failed to save comment', err);
    }
  };

  const handleLike = (commentId: string) => {
    const updated = comments.map(c => {
      if (c.id === commentId) {
        const nextLiked = !c.liked;
        return {
          ...c,
          likes: nextLiked ? c.likes + 1 : c.likes - 1,
          liked: nextLiked,
        };
      }
      return c;
    });
    setComments(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (err) {
      console.warn('Failed to save comment likes', err);
    }
  };

  return (
    <div className="bg-[#080e18] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-400" />
          <h4 className="text-xs sm:text-sm font-black text-slate-100">
            실시간 데이터 분석 토론 & 의견 ({comments.length})
          </h4>
        </div>
        <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>스포츠 통계 모델 커뮤니티</span>
        </span>
      </div>

      {/* Write Comment Form */}
      <form onSubmit={handleAddComment} className="space-y-2 bg-[#050911] p-3 rounded-xl border border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#0b131e] px-2.5 py-1 rounded-lg border border-slate-700 w-36 shrink-0">
            <User className="w-3 h-3 text-slate-400" />
            <input
              type="text"
              placeholder="닉네임 (선택)"
              value={authorName}
              onChange={e => setAuthorName(e.target.value)}
              maxLength={12}
              className="bg-transparent text-[11px] text-slate-200 focus:outline-none w-full"
            />
          </div>
          <span className="text-[10px] text-slate-500 hidden sm:inline">
            건전한 통계 및 데이터 기반 의견을 공유해주세요.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <textarea
            rows={2}
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder={`${homeTeam} vs ${awayTeam} 경기의 수리 모델 또는 전력 분석 의견을 남겨보세요...`}
            required
            className="w-full bg-[#0b131e] border border-slate-700 rounded-lg p-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          />
          <button
            type="submit"
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer self-stretch flex items-center justify-center gap-1 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">등록</span>
          </button>
        </div>
      </form>

      {/* Comments List */}
      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
        {comments.map(c => (
          <div
            key={c.id}
            className="bg-[#0b131e] border border-slate-800/80 rounded-xl p-3 text-xs space-y-1.5 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2">
                <span className="font-bold text-blue-300">{c.author}</span>
                <span className="text-[10px] text-slate-500 font-mono">{c.createdAt}</span>
              </div>
              <button
                type="button"
                onClick={() => handleLike(c.id)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                  c.liked
                    ? 'bg-blue-900/60 text-blue-300 border border-blue-600/50'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <ThumbsUp className="w-2.5 h-2.5" />
                <span>{c.likes}</span>
              </button>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">{c.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
