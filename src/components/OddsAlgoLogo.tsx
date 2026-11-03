import React from 'react';

interface OddsAlgoLogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'dark' | 'light' | 'auto';
  showKorean?: boolean;
  className?: string;
}

/**
 * ODDSALGO (오즈알고) Official SVG Logo & Wordmark
 * 
 * Features:
 * - Algorithmic data node & odds delta pulse emblem
 * - High-precision vector paths optimized for crisp rendering on retina/mobile screens
 * - Seamless adaptive styling across dark header and light card backgrounds
 * - Authentic, unique branding symbolizing quantitative odds algorithms
 */
export function OddsAlgoLogo({
  size = 'md',
  variant = 'auto',
  showKorean = true,
  className = '',
}: OddsAlgoLogoProps) {
  const iconSize = size === 'sm' ? 26 : size === 'lg' ? 38 : 32;

  const textColorClass =
    variant === 'light'
      ? 'text-slate-900'
      : variant === 'dark'
      ? 'text-white'
      : 'text-white';

  const subTextColorClass =
    variant === 'light'
      ? 'text-slate-500'
      : 'text-slate-400';

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* ODDSALGO Distinctive Algorithmic Odds Pulse Emblem */}
      <div className="relative shrink-0 flex items-center justify-center">
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="transform transition-transform group-hover:scale-105 duration-200"
          aria-hidden="true"
        >
          <defs>
            {/* Primary Electric Gradient */}
            <linearGradient id="oaGradPrimary" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2563EB" />
              <stop offset="50%" stopColor="#4F46E5" />
              <stop offset="100%" stopColor="#06B6D4" />
            </linearGradient>

            {/* Accent Odds Trend Gradient */}
            <linearGradient id="oaGradTrend" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06B6D4" />
              <stop offset="100%" stopColor="#10B981" />
            </linearGradient>

            {/* Glow Filter */}
            <filter id="oaGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#2563EB" floodOpacity="0.35" />
            </filter>
          </defs>

          {/* Background Rounded Tech Container */}
          <rect
            x="2"
            y="2"
            width="36"
            height="36"
            rx="10"
            fill="url(#oaGradPrimary)"
            filter="url(#oaGlow)"
          />

          {/* Internal Geometric Ring / Algorithmic Circle */}
          <circle
            cx="20"
            cy="20"
            r="13.5"
            stroke="white"
            strokeOpacity="0.2"
            strokeWidth="1.5"
            strokeDasharray="2 3"
          />

          {/* Algorithmic Odds Dynamic Bars & Nodes (Representing Sharp Odds Analysis) */}
          {/* Bar 1 (Left/Home Odds) */}
          <rect x="11" y="21" width="3.5" height="9" rx="1.75" fill="white" fillOpacity="0.9" />

          {/* Bar 2 (Center/Draw Trend) */}
          <rect x="18" y="15" width="3.5" height="15" rx="1.75" fill="white" fillOpacity="0.95" />

          {/* Bar 3 (Right/Away Alpha Node) */}
          <rect x="25" y="10" width="3.5" height="20" rx="1.75" fill="url(#oaGradTrend)" />

          {/* Algorithm Pulse Line Connecting the Odds Peaks */}
          <path
            d="M 12.75 21 L 19.75 15 L 26.75 10"
            stroke="#67E8F9"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Quantitative Golden Ratio / Alpha Vertex Indicator */}
          <circle cx="26.75" cy="10" r="2.5" fill="#FFFFFF" stroke="#06B6D4" strokeWidth="1" />
        </svg>
      </div>

      {/* Wordmark Container */}
      <div className="flex flex-col justify-center leading-none">
        <div className="flex items-center gap-1.5">
          <span
            className={`font-black tracking-tight text-base sm:text-lg lg:text-xl font-sans ${textColorClass}`}
          >
            ODDS<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400">ALGO</span>
          </span>
          {showKorean && (
            <span className="hidden xs:inline-block bg-slate-800/80 text-cyan-300 text-[10px] font-bold px-1.5 py-0.5 rounded border border-cyan-500/30 tracking-tight">
              오즈알고
            </span>
          )}
        </div>
        <span className={`text-[9px] font-semibold tracking-wider uppercase mt-0.5 ${subTextColorClass}`}>
          Sports Quant & Odds Engine
        </span>
      </div>
    </div>
  );
}

/**
 * Compact Icon-only Version for Favicon, small buttons, or mobile tab bars
 */
export function OddsAlgoIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="ODDSALGO"
    >
      <defs>
        <linearGradient id="oaIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="50%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="36" height="36" rx="9" fill="url(#oaIconGrad)" />
      <rect x="11" y="21" width="3.5" height="9" rx="1.75" fill="white" fillOpacity="0.9" />
      <rect x="18" y="15" width="3.5" height="15" rx="1.75" fill="white" fillOpacity="0.95" />
      <rect x="25" y="10" width="3.5" height="20" rx="1.75" fill="#34D399" />
      <path d="M 12.75 21 L 19.75 15 L 26.75 10" stroke="#67E8F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26.75" cy="10" r="2.2" fill="#FFFFFF" />
    </svg>
  );
}
