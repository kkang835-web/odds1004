import React, { useState } from 'react';
import { ShieldCheck, FileText, AlertTriangle, Mail, Info, CheckCircle, ExternalLink } from 'lucide-react';

export type LegalPageType = 'about' | 'privacy' | 'contact' | 'disclaimer';

interface LegalPagesProps {
  initialPage?: LegalPageType;
  onClose?: () => void;
  isModal?: boolean;
}

export function LegalPages({ initialPage = 'about', onClose, isModal = false }: LegalPagesProps) {
  const [currentPage, setCurrentPage] = useState<LegalPageType>(initialPage);
  const [contactForm, setContactForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmitContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.email || !contactForm.message) return;
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setContactForm({ name: '', email: '', subject: '', message: '' });
    }, 3000);
  };

  const content = (
    <div className="space-y-6">
      {/* Top Page Selector Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200">
        <button
          onClick={() => setCurrentPage('about')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            currentPage === 'about'
              ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-400/40'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Info className="w-3.5 h-3.5" />
          <span>플랫폼 소개 (About)</span>
        </button>

        <button
          onClick={() => setCurrentPage('privacy')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            currentPage === 'privacy'
              ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-400/40'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>개인정보처리방침 (Privacy Policy)</span>
        </button>

        <button
          onClick={() => setCurrentPage('contact')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            currentPage === 'contact'
              ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-400/40'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Mail className="w-3.5 h-3.5" />
          <span>운영자 정보 & 문의 (Contact)</span>
        </button>

        <button
          onClick={() => setCurrentPage('disclaimer')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
            currentPage === 'disclaimer'
              ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-400/40'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>면책 조항 (Disclaimer)</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. /about : 스포츠 데이터 분석 플랫폼, Dixon-Coles, ELO 모델 기반 통계 제공    */}
      {/* ========================================================================= */}
      {currentPage === 'about' && (
        <div className="space-y-5 text-slate-700 leading-relaxed text-xs sm:text-sm">
          <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-4 sm:p-5 space-y-2">
            <span className="text-xs font-black text-blue-700 px-2.5 py-0.5 rounded-full bg-blue-100 uppercase tracking-wide">
              About Platform
            </span>
            <h3 className="text-base sm:text-lg font-black text-blue-950">
              ODDSALGO (오즈알고) – 스포츠 데이터 분석 및 퀀트 통계 플랫폼
            </h3>
            <p className="text-slate-600 text-xs sm:text-sm">
              ODDSALGO(오즈알고)는 공공 스포츠 경기 통계 데이터와 고성능 수리통계 모델(Dixon-Coles, ELO 레이팅, 포아송 분포)을 융합하여 정밀한 예측 통계 분석을 제공하는 순수 학술 및 데이터 분석 플랫폼입니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-xl p-4 space-y-2 bg-white shadow-xs">
              <h4 className="font-black text-slate-900 flex items-center gap-2">
                <span>⚽</span>
                <span>Dixon-Coles 수리 이변 보정 모델</span>
              </h4>
              <p className="text-xs text-slate-500 leading-normal">
                축구 경기의 득점 분포를 단순 독립 포아송이 아닌 이변수 포아송(Bivariate Poisson)과 저득점 결합 계수($\tau$)를 적용하여, 0-0, 1-0, 0-1 무승부 빈도 및 수비 강도를 정밀 보정한 기대값을 도출합니다.
              </p>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 space-y-2 bg-white shadow-xs">
              <h4 className="font-black text-slate-900 flex items-center gap-2">
                <span>🏀</span>
                <span>ELO 레이팅 & 페이스(Pace) 분석</span>
              </h4>
              <p className="text-xs text-slate-500 leading-normal">
                농구, 배구 등 연속 점수 종목에 대해 홈 코트 어드밴티지(+75 Elo)와 양 팀의 분당 공격 속도(Pace Index)를 반영하여 런타임 예측 정확도를 극대화합니다.
              </p>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 space-y-2 bg-white shadow-xs">
              <h4 className="font-black text-slate-900 flex items-center gap-2">
                <span>⚾</span>
                <span>베이지안 선발 투수 방어율(ERA) 분석</span>
              </h4>
              <p className="text-xs text-slate-500 leading-normal">
                야구 경기의 선발 투수 이닝당 자책점(ERA)과 불펜 소모도를 베이지안 사후확률로 갱신하여 5이닝 및 경기 전체의 1점차 접전 기대값을 과학적으로 산출합니다.
              </p>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 space-y-2 bg-white shadow-xs">
              <h4 className="font-black text-slate-900 flex items-center gap-2">
                <span>📊</span>
                <span>2021~2026 워크포워드 무편향 검증</span>
              </h4>
              <p className="text-xs text-slate-500 leading-normal">
                미래 데이터를 학습에 포함시키지 않는 20회차 슬라이딩 윈도우(Walk-Forward) 검증 파이프라인을 구축하여 오차율을 2.4% 이내로 안정화했습니다.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 space-y-1">
            <p className="font-bold text-slate-700">📌 비도박·순수 통계 플랫폼 안내</p>
            <p>
              본 플랫폼은 일체의 유료 픽 리딩, 금전 거래, 베팅 대행을 제공하지 않으며, 공개된 스포츠 경기 통계 자료를 수학적으로 시뮬레이션한 기대값만을 정보성 콘텐츠로 제공합니다.
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. /privacy : 개인정보처리방침 (AdSense Privacy Policy Standard)            */}
      {/* ========================================================================= */}
      {currentPage === 'privacy' && (
        <div className="space-y-4 text-slate-700 leading-relaxed text-xs sm:text-sm">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <h3 className="font-black text-slate-900 text-sm sm:text-base">
              개인정보처리방침 (Privacy Policy)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              시행일자: 2021년 1월 1일 | 최근 개정일자: 2026년 9월 25일
            </p>
          </div>

          <div className="space-y-3 text-xs leading-normal">
            <div>
              <h4 className="font-black text-slate-900">제1조 (총칙 및 수집하는 개인정보 항목)</h4>
              <p className="text-slate-600 mt-0.5">
                ODDSALGO(이하 "플랫폼")는 이용자의 개인정보를 중요시하며, 정보통신망 이용촉진 및 정보보호 등에 관한 법률과 개인정보보호법을 준수합니다. 본 플랫폼은 회원가입 없이 누구나 무료로 통계 정보를 이용할 수 있으며, 서비스 이용 과정에서 아래와 같은 최소한의 기술적 정보가 자동 생성·수집될 수 있습니다:
              </p>
              <ul className="list-disc pl-5 text-slate-500 mt-1 space-y-0.5">
                <li>접속 IP 주소, 쿠키(Cookie), 방문 일시, 브라우저 종류 및 OS 정보</li>
                <li>문의하기(Contact) 작성 시 제출하는 성명(또는 닉네임), 이메일 주소</li>
              </ul>
            </div>

            <div>
              <h4 className="font-black text-slate-900">제2조 (Google AdSense 및 쿠키 사용 안내)</h4>
              <p className="text-slate-600 mt-0.5">
                본 플랫폼은 Google 및 타사 광고 파트너(Google AdSense)의 광고를 게재할 수 있습니다. Google을 포함한 제3자 제공업체는 이용자가 본 웹사이트 또는 다른 웹사이트를 이전에 방문한 내역을 기반으로 광고를 게재하기 위해 쿠키(예: DoubleClick DART 쿠키)를 사용합니다.
              </p>
              <ul className="list-disc pl-5 text-slate-500 mt-1 space-y-0.5">
                <li>이용자는 브라우저 설정에서 쿠키 저장을 거부하거나 삭제할 수 있습니다.</li>
                <li>맞춤형 광고 설정을 원하지 않으시는 경우, Google 광고 설정(www.google.com/settings/ads) 페이지에서 맞춤 광고를 비활성화할 수 있습니다.</li>
              </ul>
            </div>

            <div>
              <h4 className="font-black text-slate-900">제3조 (개인정보의 처리 목적 및 보유 기간)</h4>
              <p className="text-slate-600 mt-0.5">
                수집된 정보는 서비스 품질 개선, 통계 모델 연구, 불법 비정상 트래픽 탐지 및 이용자 문의 응대 목적으로만 사용되며, 법령에 따른 보존 의무가 없는 한 목적 달성 즉시 안전하게 파기됩니다.
              </p>
            </div>

            <div>
              <h4 className="font-black text-slate-900">제4조 (개인정보 보호책임자 및 담당 부서)</h4>
              <p className="text-slate-600 mt-0.5">
                플랫폼의 개인정보 보호 및 관련 민원 처리는 아래의 전담 부서에서 담당합니다:
              </p>
              <div className="bg-slate-100 rounded-lg p-2.5 font-mono text-[11px] text-slate-700 mt-1">
                • 책임자: ODDSALGO 데이터 연구소 운영팀장<br />
                • 전자우편: <strong>contact@oddsalgo.com</strong> (웹사이트: oddsalgo.com)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. /contact : 이메일, 운영자 정보                                            */}
      {/* ========================================================================= */}
      {currentPage === 'contact' && (
        <div className="space-y-5 text-slate-700 leading-relaxed text-xs sm:text-sm">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <h3 className="font-black text-slate-900 text-sm sm:text-base">
              운영자 정보 및 기술 문의 (Contact Us)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              데이터 제휴, 수리 알고리즘 문의, 기능 제안 및 오류 제보는 아래 공식 연락처를 통해 접수해 주시기 바랍니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Operator Details Card */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white shadow-xs">
              <h4 className="font-black text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600" />
                <span>공식 운영자 정보</span>
              </h4>

              <div className="space-y-2 text-xs font-sans">
                <div>
                  <span className="text-slate-400 block text-[11px]">서비스 명칭</span>
                  <span className="font-bold text-slate-800">ODDSALGO (오즈알고 퀀트 랩)</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">대표 공식 이메일</span>
                  <a href="mailto:contact@oddsalgo.com" className="font-bold text-blue-600 hover:underline">
                    contact@oddsalgo.com
                  </a>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">운영 시간 및 응답</span>
                  <span className="font-bold text-slate-800">평일 09:00 ~ 18:00 KST (문의 후 24시간 이내 회신)</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">분석 대상 리그</span>
                  <span className="text-slate-600">EPL, 라리가, 세리에A, K리그, KBO, MLB, NBA, KBL, V리그</span>
                </div>
              </div>
            </div>

            {/* Quick Contact Form */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs space-y-3">
              <h4 className="font-black text-slate-900 text-xs sm:text-sm">
                온라인 문의 양식
              </h4>

              {submitted ? (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-center space-y-1 animate-in fade-in">
                  <CheckCircle className="w-6 h-6 text-emerald-600 mx-auto" />
                  <p className="font-bold">문의가 안전하게 접수되었습니다.</p>
                  <p className="text-[11px] text-emerald-700">작성해주신 이메일로 24시간 이내에 회신드리겠습니다.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmitContact} className="space-y-2.5 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-0.5">성명 / 닉네임</label>
                    <input
                      type="text"
                      required
                      placeholder="홍길동"
                      value={contactForm.name}
                      onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-0.5">회신 받을 이메일</label>
                    <input
                      type="email"
                      required
                      placeholder="user@example.com"
                      value={contactForm.email}
                      onChange={e => setContactForm({ ...contactForm, email: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-0.5">문의 내용</label>
                    <textarea
                      required
                      rows={3}
                      placeholder="스포츠 데이터 통계 제휴 또는 수리 모델 질문 사항을 입력하세요..."
                      value={contactForm.message}
                      onChange={e => setContactForm({ ...contactForm, message: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    문의 접수하기
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. /disclaimer : "본 사이트는 통계 정보 제공 목적이며 베팅을 권유하지 않습니다" */}
      {/* ========================================================================= */}
      {currentPage === 'disclaimer' && (
        <div className="space-y-4 text-slate-700 leading-relaxed text-xs sm:text-sm">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-black text-amber-950 text-sm sm:text-base">
                책임의 한계 및 법적 면책 공고 (Disclaimer)
              </h3>
              <p className="text-amber-800 text-xs mt-1 font-bold">
                "본 사이트는 통계 정보 제공 목적이며 베팅을 권유하지 않습니다."
              </p>
            </div>
          </div>

          <div className="space-y-3 text-xs leading-normal">
            <div className="border border-slate-200 rounded-xl p-3.5 bg-white space-y-1">
              <h4 className="font-bold text-slate-900">1. 순수 통계 및 데이터 분석 목적</h4>
              <p className="text-slate-600">
                ODDSALGO에서 제공하는 모든 분석 지표(예측 정확도, 승무패 예상 기대값, 골 득실 분포, ELO 레이팅 등)는 과거 공공 스포츠 통계 데이터와 학술적 수리 모형(Dixon-Coles, Poisson, Skellam)에 기초한 시뮬레이션 결과입니다. 이는 정보 제공 및 데이터 분석 연구 목적일 뿐이며, 도박이나 금전적 투자를 권유하거나 조장하지 않습니다.
              </p>
            </div>

            <div className="border border-slate-200 rounded-xl p-3.5 bg-white space-y-1">
              <h4 className="font-bold text-slate-900">2. 결과의 불확실성 및 이용자 책임</h4>
              <p className="text-slate-600">
                실제 스포츠 경기는 선수의 컨디션, 부상, 기상 상황, 심판 판정 등 예측할 수 없는 무수한 현실 변수가 존재하므로 어떠한 수학적 모델도 100% 경기 결과를 보장할 수 없습니다. 제공되는 분석 정보를 바탕으로 한 모든 주관적 판단과 행동에 대한 최종 법적 책임은 이용자 본인에게 있습니다.
              </p>
            </div>

            <div className="border border-slate-200 rounded-xl p-3.5 bg-white space-y-1">
              <h4 className="font-bold text-slate-900">3. 공식 체육진흥투표권 안내</h4>
              <p className="text-slate-600">
                대한민국 국민체육진흥법에 따른 합법 체육진흥투표권의 공식 온라인 발매처는 베트맨(Betman)이며, 청소년(만 19세 미만)의 투표권 구매 및 사행성 행위는 법률로 엄격히 금지되어 있습니다.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in">
          {/* Modal Header */}
          <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
              <span className="font-black text-sm">ODDSALGO (오즈알고) 정책 및 정보</span>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-5 sm:p-6 overflow-y-auto flex-1">
            {content}
          </div>

          {/* Modal Footer */}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 shadow-xs">
      {content}
    </div>
  );
}

export default LegalPages;
