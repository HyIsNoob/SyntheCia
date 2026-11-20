import React from 'react';

interface BrandIconProps {
  className?: string;
  size?: number;
}

/**
 * SyntheCia Studio Bespoke Optical Grand Emblem:
 * Sculpted obsidian acoustic housing, descending luminous light-bars,
 * crimson-gold keybed horizon, and precision ivory/ebony piano keys.
 */
export const BrandIcon: React.FC<BrandIconProps> = ({ className = '', size = 32 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="sc-shell" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#141927" />
        <stop offset="52%" stopColor="#090c14" />
        <stop offset="100%" stopColor="#05070c" />
      </linearGradient>
      <linearGradient id="sc-rim" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.6" />
        <stop offset="50%" stopColor="#ffffff" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.55" />
      </linearGradient>
      <linearGradient id="sc-beam-c" x1="17" y1="10" x2="17" y2="36" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.12" />
        <stop offset="100%" stopColor="#38bdf8" />
      </linearGradient>
      <linearGradient id="sc-beam-m" x1="32" y1="8" x2="32" y2="36" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.2" />
        <stop offset="55%" stopColor="#7dd3fc" />
        <stop offset="100%" stopColor="#ffffff" />
      </linearGradient>
      <linearGradient id="sc-beam-a" x1="47" y1="14" x2="47" y2="36" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.14" />
        <stop offset="100%" stopColor="#fbbf24" />
      </linearGradient>
      <linearGradient id="sc-horizon" x1="8" y1="36" x2="56" y2="36" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="50%" stopColor="#f8fafc" />
        <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
      <linearGradient id="sc-key-lit" x1="32" y1="38" x2="32" y2="54" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#7dd3fc" />
        <stop offset="100%" stopColor="#0284c7" />
      </linearGradient>
    </defs>

    {/* Sculpted Obsidian Squircle Shell */}
    <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#sc-shell)" />
    <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="14.25" stroke="url(#sc-rim)" strokeWidth="1.5" />

    {/* Subtle upper acoustic radial sheen */}
    <ellipse cx="32" cy="35" rx="22" ry="11" fill="#38bdf8" fillOpacity="0.1" />

    {/* 3 Precision Falling Light Notes */}
    <rect x="13" y="13" width="8" height="21" rx="3" fill="url(#sc-beam-c)" />
    <rect x="28" y="9" width="8" height="25" rx="3" fill="url(#sc-beam-m)" />
    <rect x="43" y="16" width="8" height="18" rx="3" fill="url(#sc-beam-a)" />

    {/* Crisp Strike Horizon Line */}
    <rect x="9" y="34.5" width="46" height="2.4" rx="1.2" fill="url(#sc-horizon)" />

    {/* Precision 5-Key Grand Keyboard Bed */}
    <g>
      <rect x="9" y="38.5" width="8.2" height="15.5" rx="2" fill="#cbd5e1" />
      <rect x="18.4" y="38.5" width="8.2" height="15.5" rx="2" fill="#e2e8f0" />
      <rect x="27.9" y="38.5" width="8.2" height="15.5" rx="2" fill="url(#sc-key-lit)" />
      <rect x="37.4" y="38.5" width="8.2" height="15.5" rx="2" fill="#e2e8f0" />
      <rect x="46.8" y="38.5" width="8.2" height="15.5" rx="2" fill="#fbbf24" />
      {/* Ebony Accidentals */}
      <rect x="15.1" y="38.5" width="5.2" height="9.4" rx="1.2" fill="#06080f" />
      <rect x="24.6" y="38.5" width="5.2" height="9.4" rx="1.2" fill="#06080f" />
      <rect x="43.6" y="38.5" width="5.2" height="9.4" rx="1.2" fill="#06080f" />
    </g>
  </svg>
);
