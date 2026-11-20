import React, { useState } from 'react';

interface ZacmaLogoProps {
  /** 'mark' renders only the Z emblem; 'lockup' renders emblem + ZACMA Technology wordmark */
  variant?: 'mark' | 'lockup';
  /** Surface context: 'light' = white/light background; 'dark' = dark navy background */
  theme?: 'light' | 'dark';
  /** Size preset for the emblem */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Adds a crisp white badge container behind the Z mark (ideal on Dark Navy surfaces) */
  framed?: boolean;
  /** Optional subtitle line under ZACMA TECHNOLOGY in lockup mode */
  subtitle?: string;
  className?: string;
}

const SIZE_MAP = {
  sm: { box: 'w-8 h-8', svg: 'w-5 h-5', title: 'text-xs', sub: 'text-[10px]' },
  md: { box: 'w-9 h-9', svg: 'w-6 h-6', title: 'text-sm', sub: 'text-[11px]' },
  lg: { box: 'w-11 h-11', svg: 'w-7 h-7', title: 'text-base', sub: 'text-xs' },
  xl: { box: 'w-14 h-14', svg: 'w-10 h-10', title: 'text-lg', sub: 'text-xs' },
};

/**
 * Official ZACMA Technology Brand Emblem
 * Preserves the signature Royal Blue (#172DEB) upper Z section and Bold Red (#E51B23) lower Z section.
 * Automatically uses /zacma-logo.png if an official image asset is placed in /public/zacma-logo.png,
 * with a pixel-sharp vector rendition as the immediate zero-broken-image baseline.
 */
export function ZacmaLogo({
  variant = 'mark',
  theme = 'light',
  size = 'md',
  framed = false,
  subtitle = '& Training Institute',
  className = '',
}: ZacmaLogoProps) {
  const [customAssetReady, setCustomAssetReady] = useState(false);
  const [customAssetFailed, setCustomAssetFailed] = useState(false);
  const dims = SIZE_MAP[size];

  const emblem = (
    <div
      className={`${dims.box} rounded-xl flex items-center justify-center shrink-0 select-none ${
        framed
          ? 'bg-white shadow-xs ring-1 ring-slate-900/10 p-1.5'
          : 'bg-transparent'
      }`}
    >
      {!customAssetFailed && (
        <img
          src="/zacma-logo.png"
          alt="ZACMA Technology Logo"
          referrerPolicy="no-referrer"
          onLoad={() => setCustomAssetReady(true)}
          onError={() => setCustomAssetFailed(true)}
          className={`${customAssetReady ? 'block' : 'hidden'} w-full h-full object-contain`}
        />
      )}
      {!customAssetReady && (
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={framed ? 'w-full h-full' : dims.svg}
          role="img"
          aria-label="ZACMA Technology Official Logo"
        >
          {/* Upper Royal Blue Z section (#172DEB) */}
          <path
            d="M8 10H56V16L36.9 35.1L28.9 27.1L35.5 20.5H8V10Z"
            fill="#172DEB"
          />
          {/* Lower Bold Red Z section (#E51B23) */}
          <path
            d="M27.1 28.9L35.1 36.9L28.5 43.5H56V54H8V48L27.1 28.9Z"
            fill="#E51B23"
          />
        </svg>
      )}
    </div>
  );

  if (variant === 'mark') {
    return <span className={`inline-flex items-center shrink-0 ${className}`}>{emblem}</span>;
  }

  return (
    <div className={`inline-flex items-center gap-3 min-w-0 ${className}`}>
      {emblem}
      <div className="min-w-0">
        <p
          className={`font-display font-extrabold tracking-tight leading-none truncate ${dims.title} ${
            theme === 'dark' ? 'text-white' : 'text-[#111827]'
          }`}
        >
          <span>ZACMA</span>{' '}
          <span className={theme === 'dark' ? 'text-[#8FA0FF]' : 'text-[#172DEB]'}>
            TECHNOLOGY
          </span>
        </p>
        {subtitle && (
          <p
            className={`mt-1 leading-none truncate font-medium ${dims.sub} ${
              theme === 'dark' ? 'text-slate-400' : 'text-[#64748B]'
            }`}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
