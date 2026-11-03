import React, { useState } from 'react';
import { RefreshCw, Calculator, Activity, BookOpen, ShieldCheck, FileText, ChevronRight, HelpCircle } from 'lucide-react';
import { ModalType } from './AdSenseComplianceFooter';
import { CalculatorsModal } from './CalculatorsModal';
import { AdvancedRoadmapModelsEngine } from './AdvancedRoadmapModelsEngine';
import { ProtoForwardShadowView } from './ProtoForwardShadowView';

interface MobileMoreTabProps {
  onOpenImportModal: () => void;
  onOpenLegalModal: (type: ModalType) => void;
}

export function MobileMoreTab({ onOpenImportModal, onOpenLegalModal }: MobileMoreTabProps) {
  const [showCalculators, setShowCalculators] = useState(false);
  const [showRoadmap, setShowRoadmap] = useState(false);
  const [showForwardShadow, setShowForwardShadow] = useState(false);

  return (
    <div className="space-y-4 pb-20 max-w-2xl mx-auto px-1">
      {/* Page Header */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-sm border border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black flex items-center gap-2">
            <span>💡</span>
            <span>ODDSALGO (오즈알고) 더보기</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            수리모형 도구, 데이터 동기화 및 이용 안내
          </p>
        </div>
        <span className="bg-blue-600 text-white text-[10px] font-black px-2.5 py-1 rounded-full">
          v1.0 Pro
        </span>
      </div>

      {/* Primary Tool Actions */}
      <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-xs space-y-2">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider px-2 pt-1">
          주요 수리 도구 & 데이터 동기화
        </h3>

        {/* 1. 와이즈토토 데이터 동기화 */}
        <button
          type="button"
          onClick={onOpenImportModal}
          className="w-full min-h-[48px] p-3 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 flex items-center justify-between transition-colors cursor-pointer text-left active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-black text-slate-900">와이즈토토 데이터 수동 동기화</div>
              <div className="text-xs text-slate-500">공시 배당, 투표율 및 경기 결과 실시간 패치</div>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
        </button>

        {/* 2. 수리모형 계산기 */}
        <button
          type="button"
          onClick={() => setShowCalculators(true)}
          className="w-full min-h-[48px] p-3 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 flex items-center justify-between transition-colors cursor-pointer text-left active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-black text-slate-900">수리모형 & 배당 계산기</div>
              <div className="text-xs text-slate-500">Shin's No-Vig, Kelly 켈리 파산확률 및 잭팟 산출</div>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
        </button>

        {/* 3. Forward Shadow 진단 */}
        <button
          type="button"
          onClick={() => setShowForwardShadow(true)}
          className="w-full min-h-[48px] p-3 rounded-xl bg-slate-50 hover:bg-amber-50 border border-slate-200 flex items-center justify-between transition-colors cursor-pointer text-left active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-black text-slate-900">PROTO Forward Shadow 실시간 진단</div>
              <div className="text-xs text-slate-500">실시간 순방향 추적 오디트 KPI 및 모델 비교</div>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
        </button>

        {/* 4. 모델 로드맵 & 가이드 */}
        <button
          type="button"
          onClick={() => setShowRoadmap(true)}
          className="w-full min-h-[48px] p-3 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-200 flex items-center justify-between transition-colors cursor-pointer text-left active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-black text-slate-900">수리엔진 로드맵 & 모델 백서</div>
              <div className="text-xs text-slate-500">V1 Production, EXP01, EXP02 수리 알고리즘 설명</div>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
        </button>
      </div>

      {/* Legal & Policy Center */}
      <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-xs space-y-2">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider px-2 pt-1">
          법적 고지 및 이용 약관
        </h3>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onOpenLegalModal('privacy')}
            className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left flex items-center justify-between min-h-[44px] cursor-pointer"
          >
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-slate-600" />
              <span>개인정보 처리방침</span>
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>

          <button
            type="button"
            onClick={() => onOpenLegalModal('about')}
            className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left flex items-center justify-between min-h-[44px] cursor-pointer"
          >
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-slate-600" />
              <span>서비스 소개</span>
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>

          <button
            type="button"
            onClick={() => onOpenLegalModal('disclaimer')}
            className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left flex items-center justify-between min-h-[44px] cursor-pointer"
          >
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-slate-600" />
              <span>면책 조항</span>
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>

          <button
            type="button"
            onClick={() => onOpenLegalModal('contact')}
            className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left flex items-center justify-between min-h-[44px] cursor-pointer"
          >
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-slate-600" />
              <span>문의 및 지원</span>
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Sub Modals */}
      {showCalculators && (
        <CalculatorsModal calcType="shin" onClose={() => setShowCalculators(false)} />
      )}

      {showRoadmap && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-4 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-black text-slate-900">ODDSALGO (오즈알고) 수리엔진 로드맵</h3>
              <button
                type="button"
                onClick={() => setShowRoadmap(false)}
                className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg cursor-pointer"
              >
                닫기 ✕
              </button>
            </div>
            <AdvancedRoadmapModelsEngine />
          </div>
        </div>
      )}

      {showForwardShadow && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto p-4 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-black text-slate-900">PROTO Forward Shadow 실시간 진단</h3>
              <button
                type="button"
                onClick={() => setShowForwardShadow(false)}
                className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg cursor-pointer"
              >
                닫기 ✕
              </button>
            </div>
            <ProtoForwardShadowView />
          </div>
        </div>
      )}
    </div>
  );
}

export default MobileMoreTab;
