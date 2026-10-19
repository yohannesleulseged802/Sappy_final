import React from 'react';

interface SappyBrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'emblem-only' | 'full';
  color?: string; // default brand green or white
  showTagline?: boolean;
}

export const SappyBrandLogo: React.FC<SappyBrandLogoProps> = ({
  className = '',
  size = 'md',
  variant = 'emblem-only',
  color,
  showTagline = true,
}) => {
  // Dimension maps
  const dimensionMap = {
    sm: { box: 28, stroke: 24, text: 'text-sm' },
    md: { box: 36, stroke: 26, text: 'text-base' },
    lg: { box: 48, stroke: 26, text: 'text-xl' },
    xl: { box: 80, stroke: 28, text: 'text-3xl' },
  };

  const { box, stroke } = dimensionMap[size];

  // Circular emblem SVG
  const emblem = (
    <svg
      viewBox="0 0 512 512"
      width={box}
      height={box}
      className={`shrink-0 transition-transform ${className}`}
      style={{ color: color || 'currentColor' }}
    >
      <g
        stroke="currentColor"
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Outer Circular Seal */}
        <circle cx="256" cy="256" r="194" />

        {/* Converging Pen Nib / V Geometry */}
        <path d="M 188 90 L 256 450 L 324 90" />

        {/* Upper Center Ink Droplet Dot */}
        <circle cx="256" cy="164" r="18" fill="currentColor" stroke="none" />

        {/* Fluid Horizontal Ribbon 'S' */}
        <path d="M 158 162 C 158 216, 204 246, 256 246 L 316 246 C 362 246, 384 278, 350 344" />

        {/* 'P' Loop */}
        <path d="M 316 246 C 316 294, 286 318, 272 344" />
      </g>
    </svg>
  );

  if (variant === 'emblem-only') {
    return emblem;
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="p-1 rounded-2xl bg-[#fbf9f4] text-[#244834] shadow-xs shrink-0 flex items-center justify-center">
        {emblem}
      </div>
      <div>
        <div className="font-extrabold tracking-widest leading-none text-[#244834] dark:text-[#6ee7b7] text-lg sm:text-xl font-sans">
          SAPPY
        </div>
        {showTagline && (
          <div className="text-[11px] font-serif tracking-wider text-[#244834]/85 dark:text-[#6ee7b7]/80 italic mt-0.5">
            stationery &amp; printing.
          </div>
        )}
      </div>
    </div>
  );
};
