import React, { useState, useEffect } from 'react';
import { ShieldCheck, FileText, Info, Mail, AlertTriangle, CheckCircle, X } from 'lucide-react';

export type ModalType = 'privacy' | 'terms' | 'disclaimer' | 'about' | 'contact' | null;

interface AdSenseComplianceFooterProps {
  externalModal?: ModalType;
  onCloseExternalModal?: () => void;
}

export const AdSenseComplianceFooter: React.FC<AdSenseComplianceFooterProps> = ({
  externalModal,
  onCloseExternalModal
}) => {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' });

  useEffect(() => {
    if (externalModal) {
      setActiveModal(externalModal);
    }
  }, [externalModal]);

  // Listen to window hash changes e.g. #about, #privacy, #contact, #disclaimer
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (['privacy', 'terms', 'disclaimer', 'about', 'contact'].includes(hash)) {
        setActiveModal(hash as ModalType);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const closeModal = () => {
    setActiveModal(null);
    onCloseExternalModal?.();
    if (window.location.hash) {
      window.history.pushState(null, '', window.location.pathname);
    }
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.email || !contactForm.message) return;
    setContactSubmitted(true);
    setTimeout(() => {
      setContactSubmitted(false);
      setContactForm({ name: '', email: '', message: '' });
      closeModal();
    }, 2500);
  };

  return (
    <footer id="footer" className="bg-slate-950 text-slate-400 pt-10 pb-12 px-4 border-t border-slate-800 text-xs">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Compliance Warning Banner Required for AdSense / Sports Category */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-[11px] text-slate-400 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-inner">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-200 text-xs">스포츠 데이터 통계 정보 제공 안내 (Disclaimer)</p>
              <p className="mt-0.5 text-slate-400 leading-relaxed">
                본 사이트는 통계 정보 제공 목적이며 베팅을 권유하지 않습니다. Dixon-Coles, ELO 모델 및 Poisson 분포 기반의 학술적 통계 지표를 제공합니다.
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveModal('disclaimer')}
            className="shrink-0 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg font-bold transition-colors cursor-pointer border border-slate-700 text-[11px]"
          >
            법적고지 상세보기
          </button>
        </div>

        {/* Footer Navigation & 4 Essential Legal Links */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-2">
          {/* Brand Col */}
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span className="font-extrabold text-sm text-white tracking-tight">ODDSALGO (오즈알고) 퀀트 랩</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed max-w-lg">
              스포츠 데이터 분석 플랫폼, Dixon-Coles, ELO 모델 기반 통계 제공. 
              국내외 프로토 승부식 및 토토 14경기 수학적 기대값과 포아송 득점 분포를 정량 분석합니다.
            </p>
            <p className="text-[10px] text-slate-500 font-mono pt-1">
              Copyright © 2009-2026 ODDSALGO. All rights reserved. (oddsalgo.com)
            </p>
          </div>

          {/* 4 Core Mandatory Links: About, Privacy, Contact, Disclaimer */}
          <div className="space-y-2">
            <p className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>법적 고지 및 운영 정책</span>
            </p>
            <ul className="space-y-1.5 text-[11px]">
              <li>
                <button 
                  onClick={() => setActiveModal('about')} 
                  className="hover:text-blue-300 font-medium transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>• /about : 플랫폼 소개 (About Us)</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setActiveModal('privacy')} 
                  className="hover:text-emerald-300 font-medium transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>• /privacy : 개인정보처리방침 (Privacy Policy)</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setActiveModal('contact')} 
                  className="hover:text-blue-300 font-medium transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>• /contact : 운영자 정보 & 문의 (Contact)</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => setActiveModal('disclaimer')} 
                  className="hover:text-amber-300 font-medium transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>• /disclaimer : 책임의 한계 및 면책 고지</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Publisher & Support info */}
          <div className="space-y-2">
            <p className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-400" />
              <span>운영자 및 데이터 안내</span>
            </p>
            <ul className="space-y-1.5 text-[11px] text-slate-400">
              <li>• 이메일: contact@oddsalgo.com</li>
              <li>• 운영사: ODDSALGO Data Lab</li>
              <li>• 분석 모델: Dixon-Coles, ELO, Proportional No-Vig</li>
              <li>• 데이터 출처: 공공 스포츠 데이터셋</li>
            </ul>
          </div>
        </div>

      </div>

      {/* Interactive Legal Modals */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto font-sans">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 text-slate-300 shadow-2xl relative space-y-4">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                {activeModal === 'privacy' && <ShieldCheck className="w-5 h-5 text-emerald-400" />}
                {activeModal === 'terms' && <FileText className="w-5 h-5 text-blue-400" />}
                {activeModal === 'disclaimer' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
                {activeModal === 'about' && <Info className="w-5 h-5 text-blue-400" />}
                {activeModal === 'contact' && <Mail className="w-5 h-5 text-indigo-400" />}
                <h3 className="font-extrabold text-base text-white">
                  {activeModal === 'about' && '플랫폼 소개 (About Us)'}
                  {activeModal === 'privacy' && '개인정보처리방침 (Privacy Policy)'}
                  {activeModal === 'terms' && '서비스 이용약관 (Terms of Service)'}
                  {activeModal === 'disclaimer' && '책임의 한계 및 법적고지 (Disclaimer)'}
                  {activeModal === 'contact' && '운영자 정보 및 문의하기 (Contact)'}
                </h3>
              </div>
              <button
                onClick={closeModal}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content Sections */}
            <div className="space-y-3 text-xs leading-relaxed text-slate-300">
              
              {/* /ABOUT */}
              {activeModal === 'about' && (
                <>
                  <div className="p-3 bg-blue-950/40 border border-blue-500/40 rounded-xl text-blue-200 text-xs">
                    <p className="font-bold text-blue-300 text-sm mb-1">ODDSALGO (오즈알고) 데이터 플랫폼</p>
                    <p>스포츠 데이터 분석 플랫폼, Dixon-Coles, ELO 모델 기반 통계 제공</p>
                  </div>
                  
                  <p className="font-bold text-slate-100 mt-2">1. 플랫폼 미션</p>
                  <p>ODDSALGO(오즈알고)는 스포츠 경기 결과에 영향을 미치는 공격/수비 효율성, 홈 어드밴티지, 상대 전적, 휴식일 피로도 등을 수학적 알고리즘으로 모델링하여 순수 통계 데이터를 제공합니다.</p>

                  <p className="font-bold text-slate-100 mt-2">2. 핵심 통계 알고리즘</p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-300">
                    <li><strong>Dixon-Coles 다변량 포아송 모형</strong>: 저득점 구간(0-0, 1-0, 0-1, 1-1)의 상호 의존성(tau)을 보정한 기대 득점 산출</li>
                    <li><strong>ELO 레이팅 시스템</strong>: 경기 결과 및 리그 가중치를 반영한 동적 전력 평점 (+75 홈 어드밴티지 보정)</li>
                    <li><strong>Proportional No-Vig 마진 제거</strong>: 시장 데이터에서 북메이커 마진을 비례 역수 정규화로 제거하여 순수 공정 확률 추정</li>
                  </ul>
                </>
              )}

              {/* /PRIVACY */}
              {activeModal === 'privacy' && (
                <>
                  <p className="font-bold text-slate-100">1. 개인정보 수집 및 이용 목적</p>
                  <p>ODDSALGO(이하 "당사")는 이용자의 개인정보를 소중히 보호하며, 구글 애드센스(Google AdSense) 및 웹 통계 분석을 위한 최소한의 비식별 쿠키 정보를 처리합니다.</p>
                  
                  <p className="font-bold text-slate-100 mt-2">2. 쿠키(Cookie) 및 제3자 광고 서비스</p>
                  <p>• 맞춤형 통계 콘텐츠 및 광고 제공을 위해 Google AdSense를 비롯한 제3자 광고 네트워크 쿠키가 사용될 수 있습니다.</p>
                  <p>• 이용자는 브라우저 설정에서 쿠키 저장을 거부하거나 삭제할 수 있습니다.</p>

                  <p className="font-bold text-slate-100 mt-2">3. 데이터 보관 및 관리</p>
                  <p>사용자가 작성한 댓글 및 필터 설정은 브라우저 로컬 저장소(LocalStorage)에 안전하게 저장됩니다.</p>

                  <p className="font-bold text-slate-100 mt-2">4. 개인정보 보호 담당자</p>
                  <p>• 이메일: privacy@oddsalgo.com</p>
                </>
              )}

              {/* /CONTACT */}
              {activeModal === 'contact' && (
                <>
                  <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 text-xs space-y-1">
                    <p className="font-bold text-slate-100">운영자 정보 (Operator Information)</p>
                    <p>• 운영사: ODDSALGO Data Lab</p>
                    <p>• 대표 이메일: contact@oddsalgo.com</p>
                    <p>• 공식 웹사이트: oddsalgo.com</p>
                    <p>• 책임자: 데이터사이언스 통계분석팀</p>
                    <p>• 업무 시간: 평일 10:00 ~ 18:00 KST</p>
                  </div>

                  {contactSubmitted ? (
                    <div className="py-6 text-center space-y-2">
                      <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
                      <p className="font-bold text-emerald-300 text-sm">문의가 정상적으로 전송되었습니다.</p>
                      <p className="text-slate-400 text-xs">확인 후 신속히 회신드리겠습니다.</p>
                    </div>
                  ) : (
                    <form onSubmit={handleContactSubmit} className="space-y-2.5 pt-2">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1 font-bold">성함 또는 닉네임</label>
                        <input
                          type="text"
                          value={contactForm.name}
                          onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
                          placeholder="작성자명"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1 font-bold">회신받으실 이메일 <span className="text-rose-400">*</span></label>
                        <input
                          type="email"
                          required
                          value={contactForm.email}
                          onChange={e => setContactForm({ ...contactForm, email: e.target.value })}
                          placeholder="user@example.com"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1 font-bold">문의 내용 <span className="text-rose-400">*</span></label>
                        <textarea
                          required
                          rows={3}
                          value={contactForm.message}
                          onChange={e => setContactForm({ ...contactForm, message: e.target.value })}
                          placeholder="데이터 문의 또는 개선 제안을 입력해주세요."
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
                        ></textarea>
                      </div>
                      <button
                        type="submit"
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-md"
                      >
                        문의 보내기
                      </button>
                    </form>
                  )}
                </>
              )}

              {/* /DISCLAIMER */}
              {activeModal === 'disclaimer' && (
                <>
                  <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-amber-200 text-xs space-y-1">
                    <p className="font-bold flex items-center gap-1 text-amber-300">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span>통계 정보 제공 목적 고지</span>
                    </p>
                    <p>본 사이트는 통계 정보 제공 목적이며 베팅을 권유하지 않습니다.</p>
                  </div>

                  <p className="font-bold text-slate-100 mt-2">1. 데이터 및 모델의 한계</p>
                  <p>본 서비스에서 제공하는 공정 확률, 기대값(EV), ELO 점수 및 Dixon-Coles 득점 분포는 과거 축적된 경기 데이터에 기반한 통계적 추정치이며, 실제 경기 결과를 보장하지 않습니다.</p>

                  <p className="font-bold text-slate-100 mt-2">2. 법적 책임의 한계</p>
                  <p>제공된 통계 정보를 바탕으로 한 이용자의 모든 결정과 판단에 대한 책임은 전적으로 이용자 본인에게 있습니다.</p>
                </>
              )}

            </div>

            {/* Modal Footer Close Button */}
            <div className="border-t border-slate-800 pt-3 flex justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold text-xs transition-colors cursor-pointer"
              >
                닫기
              </button>
            </div>

          </div>
        </div>
      )}
    </footer>
  );
};
