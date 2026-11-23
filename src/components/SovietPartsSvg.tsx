import React from 'react';
import { SovietPartKind, ToolId } from '../game/types';

interface PartSvgProps {
  kind: SovietPartKind;
  className?: string;
}

/**
 * Hand-crafted authentic replicas of Soviet radio components containing precious metals
 * (КМ-5 зелёные, КМ-6 рыжие, ППМЛ-М, 133 серия с золотом, КТ904, РЭС-9, РЭС-22, лампы ГМИ, катушки Ag)
 */
export const SovietPartSvg: React.FC<PartSvgProps> = ({ kind, className = 'w-16 h-12' }) => {
  switch (kind) {
    case 'km_green':
      return (
        <svg viewBox="0 0 80 56" className={className} aria-hidden="true">
          {/* Tinned leads */}
          <path d="M24 40 L24 54 M56 40 L56 54" stroke="#cbd5e1" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M24 40 L24 54 M56 40 L56 54" stroke="#64748b" strokeWidth="1" />
          {/* Iconic Soviet green monolithic epoxy cushion body */}
          <rect x="11" y="6" width="58" height="36" rx="7" fill="#15803d" stroke="#052e16" strokeWidth="2.5" />
          <rect x="15" y="10" width="50" height="28" rx="4" fill="#22c55e" fillOpacity="0.32" />
          {/* Specular ceramic highlight */}
          <path d="M18 11 L60 11" stroke="#bbf7d0" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
          {/* Authentic black GOST stamp */}
          <text x="40" y="23" textAnchor="middle" fill="#052e16" fontSize="9.5" fontWeight="700" fontFamily="JetBrains Mono, monospace">
            5V H30
          </text>
          <text x="40" y="34" textAnchor="middle" fill="#052e16" fontSize="8" fontWeight="700" fontFamily="JetBrains Mono, monospace">
            1M0 82
          </text>
        </svg>
      );

    case 'km_orange':
      return (
        <svg viewBox="0 0 80 56" className={className} aria-hidden="true">
          <path d="M26 40 L26 54 M54 40 L54 54" stroke="#cbd5e1" strokeWidth="3.5" strokeLinecap="round" />
          {/* Iconic Soviet orange-red KM-6 pillow */}
          <rect x="13" y="6" width="54" height="36" rx="6" fill="#c2410c" stroke="#431407" strokeWidth="2.5" />
          <rect x="17" y="10" width="46" height="28" rx="4" fill="#f97316" fillOpacity="0.4" />
          <path d="M20 11 L58 11" stroke="#fed7aa" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
          <text x="40" y="23" textAnchor="middle" fill="#270a02" fontSize="9.5" fontWeight="700" fontFamily="JetBrains Mono, monospace">
            6 H90
          </text>
          <text x="40" y="34" textAnchor="middle" fill="#270a02" fontSize="8" fontWeight="700" fontFamily="JetBrains Mono, monospace">
            2M2 86
          </text>
        </svg>
      );

    case 'ppml':
      return (
        <svg viewBox="0 0 88 72" className={className} aria-hidden="true">
          {/* 3 silver-plated terminal lugs */}
          <rect x="20" y="54" width="6" height="14" rx="1.5" fill="#e2e8f0" stroke="#1e293b" strokeWidth="1.5" />
          <rect x="41" y="54" width="6" height="14" rx="1.5" fill="#eab308" stroke="#1e293b" strokeWidth="1.5" />
          <rect x="62" y="54" width="6" height="14" rx="1.5" fill="#e2e8f0" stroke="#1e293b" strokeWidth="1.5" />
          {/* Black bakelite / anodized cylindrical housing of ППМЛ-М */}
          <circle cx="44" cy="34" r="26" fill="#26292b" stroke="#0a0c0b" strokeWidth="2.5" />
          <circle cx="44" cy="34" r="21" fill="#373c3f" stroke="#52525b" strokeWidth="1.5" />
          {/* Mounting collar & brass shaft */}
          <circle cx="44" cy="34" r="10" fill="#a1a1aa" stroke="#18181b" strokeWidth="1.5" />
          <circle cx="44" cy="34" r="5" fill="#eab308" stroke="#422006" strokeWidth="1.2" />
          <line x1="40" y1="34" x2="48" y2="34" stroke="#422006" strokeWidth="1.8" />
          {/* GOST white stencil */}
          <text x="44" y="19" textAnchor="middle" fill="#f8fafc" fontSize="7.5" fontWeight="700" fontFamily="JetBrains Mono, monospace">
            ППМЛ-М
          </text>
          <text x="44" y="53" textAnchor="middle" fill="#4ade80" fontSize="7" fontWeight="700" fontFamily="JetBrains Mono, monospace">
            10кОм
          </text>
        </svg>
      );

    case 'ic_133':
      return (
        <svg viewBox="0 0 88 56" className={className} aria-hidden="true">
          {/* 14 iconic Soviet gold-plated planar legs */}
          {[14, 24, 34, 44, 54, 64, 74].map((x) => (
            <g key={x}>
              <rect x={x - 2} y="3" width="4" height="11" fill="#facc15" stroke="#713f12" strokeWidth="1" />
              <rect x={x - 2} y="42" width="4" height="11" fill="#facc15" stroke="#713f12" strokeWidth="1" />
            </g>
          ))}
          {/* Gold lid flange + pink/cream Soviet ceramic body */}
          <rect x="8" y="13" width="72" height="30" rx="3" fill="#ca8a04" stroke="#422006" strokeWidth="2" />
          <rect x="13" y="17" width="62" height="22" rx="2" fill="#d6c5b3" stroke="#78350f" strokeWidth="1.2" />
          {/* Pin 1 key dot */}
          <circle cx="18" cy="28" r="2.2" fill="#422006" />
          <text x="46" y="27" textAnchor="middle" fill="#1c1917" fontSize="8.5" fontWeight="700" fontFamily="JetBrains Mono, monospace">
            133ЛА3
          </text>
          <text x="46" y="36" textAnchor="middle" fill="#78350f" fontSize="6.5" fontWeight="700" fontFamily="JetBrains Mono, monospace">
            ★ 8407
          </text>
        </svg>
      );

    case 'kt_gold':
      return (
        <svg viewBox="0 0 76 64" className={className} aria-hidden="true">
          {/* Iconic Soviet "Вертолёт" KT904 gold flange & cross leads */}
          <path d="M8 32 L68 32 M38 6 L38 58" stroke="#facc15" strokeWidth="7" strokeLinecap="round" />
          <path d="M8 32 L68 32 M38 6 L38 58" stroke="#854d0e" strokeWidth="1.2" />
          {/* Gold circular base */}
          <circle cx="38" cy="32" r="18" fill="#eab308" stroke="#422006" strokeWidth="2.2" />
          {/* White ceramic cap */}
          <circle cx="38" cy="32" r="12" fill="#f1f5f9" stroke="#475569" strokeWidth="1.5" />
          <text x="38" y="34.5" textAnchor="middle" fill="#0f172a" fontSize="7" fontWeight="700" fontFamily="JetBrains Mono, monospace">
            904А
          </text>
        </svg>
      );

    case 'res_9':
      return (
        <svg viewBox="0 0 82 60" className={className} aria-hidden="true">
          {/* Relay pins */}
          {[22, 34, 46, 58].map((x) => (
            <rect key={x} x={x} y="44" width="3.5" height="12" fill="#eab308" stroke="#422006" strokeWidth="1" />
          ))}
          {/* Anodized aluminum housing of РЭС-9 */}
          <rect x="12" y="8" width="58" height="37" rx="3" fill="#94a3b8" stroke="#1e293b" strokeWidth="2.5" />
          <rect x="16" y="12" width="50" height="12" fill="#cbd5e1" opacity="0.45" />
          {/* Base seam */}
          <line x1="12" y1="39" x2="70" y2="39" stroke="#334155" strokeWidth="2" />
          <text x="41" y="24" textAnchor="middle" fill="#0f172a" fontSize="9.5" fontWeight="700" fontFamily="JetBrains Mono, monospace">
            РЭС-9
          </text>
          <text x="41" y="34" textAnchor="middle" fill="#1e293b" fontSize="7" fontWeight="700" fontFamily="JetBrains Mono, monospace">
            РС4.524.201
          </text>
        </svg>
      );

    case 'res_22':
      return (
        <svg viewBox="0 0 86 58" className={className} aria-hidden="true">
          {[20, 32, 44, 56, 66].map((x) => (
            <rect key={x} x={x} y="44" width="3.5" height="11" fill="#e2e8f0" stroke="#334155" strokeWidth="1" />
          ))}
          <rect x="10" y="7" width="66" height="38" rx="4" fill="#64748b" stroke="#0f172a" strokeWidth="2.5" />
          <rect x="14" y="11" width="58" height="10" fill="#cbd5e1" opacity="0.3" />
          <text x="43" y="25" textAnchor="middle" fill="#f8fafc" fontSize="9.5" fontWeight="700" fontFamily="JetBrains Mono, monospace">
            РЭС-22
          </text>
          <text x="43" y="36" textAnchor="middle" fill="#e2e8f0" fontSize="7" fontWeight="600" fontFamily="JetBrains Mono, monospace">
            РФ4.500 · Ag
          </text>
        </svg>
      );

    case 'tube_gmi':
      return (
        <svg viewBox="0 0 64 82" className={className} aria-hidden="true">
          {/* Silvered bottom pins */}
          {[18, 25, 32, 39, 46].map((x) => (
            <rect key={x} x={x - 1.5} y="65" width="3" height="13" fill="#e2e8f0" stroke="#334155" strokeWidth="0.9" />
          ))}
          {/* Glass vacuum envelope */}
          <path
            d="M16 64 L16 24 C16 11 24 6 32 6 C40 6 48 11 48 24 L48 64 Z"
            fill="#1e293b"
            fillOpacity="0.72"
            stroke="#cbd5e1"
            strokeWidth="2.2"
          />
          {/* Top getter silvering */}
          <path d="M21 15 C25 9 39 9 43 15" stroke="#94a3b8" strokeWidth="5" strokeLinecap="round" opacity="0.65" />
          {/* Internal anode & golden grid */}
          <rect x="23" y="24" width="18" height="28" rx="2" fill="#475569" stroke="#0f172a" strokeWidth="1.4" />
          <path d="M25 30 H39 M25 35 H39 M25 40 H39 M25 45 H39" stroke="#facc15" strokeWidth="1.6" />
          {/* Warm filament glow */}
          <circle cx="32" cy="52" r="4" fill="#f97316" opacity="0.85" />
          {/* Glass glare */}
          <path d="M20 24 L20 56" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
        </svg>
      );

    case 'coil_ag':
      return (
        <svg viewBox="0 0 84 48" className={className} aria-hidden="true">
          {/* Leads */}
          <path d="M6 24 L16 24 M68 24 L78 24" stroke="#e2e8f0" strokeWidth="3.5" strokeLinecap="round" />
          {/* Ceramic bobbin */}
          <rect x="16" y="13" width="52" height="22" rx="3" fill="#d6c5b3" stroke="#57534e" strokeWidth="2" />
          {/* Thick silvered RF windings */}
          {[22, 28, 34, 40, 46, 52, 58, 63].map((x) => (
            <path
              key={x}
              d={`M${x} 9 C${x + 3} 14 ${x + 3} 34 ${x} 39`}
              fill="none"
              stroke="#f1f5f9"
              strokeWidth="3.4"
              strokeLinecap="round"
            />
          ))}
          {[22, 28, 34, 40, 46, 52, 58, 63].map((x) => (
            <path
              key={`s${x}`}
              d={`M${x} 9 C${x + 3} 14 ${x + 3} 34 ${x} 39`}
              fill="none"
              stroke="#475569"
              strokeWidth="0.9"
              strokeLinecap="round"
            />
          ))}
        </svg>
      );

    case 'junk_mlt':
      return (
        <svg viewBox="0 0 80 36" className={className} aria-hidden="true">
          <path d="M4 18 L18 18 M62 18 L76 18" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
          {/* Classic Soviet red-brown MLT resistor */}
          <rect x="17" y="9" width="46" height="18" rx="4" fill="#991b1b" stroke="#450a0a" strokeWidth="2" />
          <rect x="17" y="9" width="9" height="18" rx="2" fill="#b91c1c" />
          <rect x="54" y="9" width="9" height="18" rx="2" fill="#b91c1c" />
          <text x="40" y="21" textAnchor="middle" fill="#fecaca" fontSize="7.5" fontWeight="700" fontFamily="JetBrains Mono, monospace">
            МЛТ 4.7к
          </text>
        </svg>
      );

    case 'junk_k50':
    default:
      return (
        <svg viewBox="0 0 80 48" className={className} aria-hidden="true">
          <path d="M4 24 L16 24 M64 24 L76 24" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
          {/* Aluminum Soviet electrolytic K50-6 */}
          <rect x="16" y="8" width="48" height="32" rx="4" fill="#71717a" stroke="#27272a" strokeWidth="2.2" />
          <rect x="18" y="11" width="44" height="7" fill="#d4d4d8" opacity="0.45" />
          <line x1="23" y1="8" x2="23" y2="40" stroke="#27272a" strokeWidth="2" />
          <text x="43" y="25" textAnchor="middle" fill="#18181b" fontSize="8" fontWeight="700" fontFamily="JetBrains Mono, monospace">
            К50-6
          </text>
          <text x="43" y="34" textAnchor="middle" fill="#27272a" fontSize="6.5" fontWeight="700" fontFamily="JetBrains Mono, monospace">
            200мкФ
          </text>
        </svg>
      );
  }
};

export const ToolIconSvg: React.FC<{ id: ToolId; className?: string }> = ({
  id,
  className = 'w-7 h-7',
}) => {
  switch (id) {
    case 'beer':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <path d="M13 4 H19 V9 L22 14 V27 C22 28.5 21 29 19 29 H13 C11 29 10 28.5 10 27 V14 L13 9 Z" fill="#15803d" stroke="#052e16" strokeWidth="2" />
          <rect x="12.5" y="3" width="7" height="2.5" rx="1" fill="#eab308" />
          <rect x="11" y="16" width="10" height="8" rx="1" fill="#fef08a" stroke="#854d0e" strokeWidth="1" />
          <path d="M13 20 H19" stroke="#b45309" strokeWidth="1.6" />
        </svg>
      );
    case 'lockpicks':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <path d="M7 25 L19 13 L23 13 L25 10" fill="none" stroke="#eab308" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 26 L24 14 L24 9" fill="none" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="5" y="21" width="6" height="6" rx="1.5" fill="#475569" stroke="#0f172a" strokeWidth="1.5" />
        </svg>
      );
    case 'boltcutter':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <path d="M9 28 L15 16 M23 28 L17 16" stroke="#dc2626" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M13 15 L11 6 L16 11 L21 6 L19 15 Z" fill="#94a3b8" stroke="#0f172a" strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="16" cy="14" r="2" fill="#eab308" />
        </svg>
      );
    case 'wrench':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <path d="M8 24 L20 12" stroke="#cbd5e1" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M18 8 C21 5 26 6 27 10 L23 12 L20 9 Z" fill="#94a3b8" stroke="#0f172a" strokeWidth="1.8" />
          <circle cx="9" cy="23" r="3" fill="#475569" stroke="#cbd5e1" strokeWidth="1.5" />
        </svg>
      );
    case 'spare_keys':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <circle cx="11" cy="11" r="5" fill="none" stroke="#eab308" strokeWidth="2.4" />
          <path d="M15 15 L26 26 M22 22 L25 19 M19 25 L22 22" stroke="#eab308" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="11" cy="11" r="1.5" fill="#eab308" />
        </svg>
      );
    case 'screwdriver':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <path d="M6 26 L13 19" stroke="#ea580c" strokeWidth="5.5" strokeLinecap="round" />
          <path d="M14 18 L24 8" stroke="#e2e8f0" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M23 6 L27 9 L25 11 L22 8 Z" fill="#94a3b8" />
        </svg>
      );
    case 'quiet_boots':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <path d="M9 8 H17 V18 L25 21 V25 H8 V8 Z" fill="#3f3f46" stroke="#09090b" strokeWidth="2" strokeLinejoin="round" />
          <rect x="7" y="24" width="19" height="3.5" rx="1" fill="#4ade80" />
        </svg>
      );
    case 'titanium_cutters':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <path d="M10 27 L15 16 M22 27 L17 16" stroke="#eab308" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M13 16 L16 6 L19 16 Z" fill="#e2e8f0" stroke="#0f172a" strokeWidth="1.6" />
          <circle cx="16" cy="15" r="2" fill="#0f172a" />
        </svg>
      );
    case 'red_filter':
    default:
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <circle cx="16" cy="16" r="10" fill="#dc2626" stroke="#450a0a" strokeWidth="2.5" />
          <circle cx="16" cy="16" r="6" fill="#f87171" fillOpacity="0.45" />
          <path d="M12 12 L15 10" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        </svg>
      );
  }
};

export const TitleEmblemSvg: React.FC<{ className?: string }> = ({ className = 'w-full max-w-[460px]' }) => (
  <svg viewBox="0 0 460 132" className={className} role="img" aria-label="ЗАЛАЗ: ДРАГМЕТАЛЛ">
    <defs>
      <pattern id="hazardStripes" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="12" fill="#eab308" />
        <rect x="6" width="6" height="12" fill="#181a19" />
      </pattern>
    </defs>
    {/* Stamped Soviet GOST industrial plaque frame */}
    <rect x="4" y="6" width="452" height="120" rx="6" fill="#151816" stroke="#eab308" strokeWidth="2.5" />
    <rect x="10" y="12" width="440" height="8" fill="url(#hazardStripes)" opacity="0.9" />
    {/* Corner rivets */}
    {[18, 442].map((cx) =>
      [114].map((cy) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.5" fill="#475569" stroke="#0a0c0b" strokeWidth="1.5" />
      ))
    )}
    {/* Mini green KM capacitor emblem on the left */}
    <g transform="translate(22, 34) scale(0.82)">
      <path d="M24 40 L24 54 M56 40 L56 54" stroke="#eab308" strokeWidth="3.5" strokeLinecap="round" />
      <rect x="11" y="6" width="58" height="36" rx="7" fill="#15803d" stroke="#052e16" strokeWidth="2.5" />
      <text x="40" y="23" textAnchor="middle" fill="#dcfce7" fontSize="9.5" fontWeight="700" fontFamily="JetBrains Mono, monospace">
        КМ-5
      </text>
      <text x="40" y="34" textAnchor="middle" fill="#86efac" fontSize="8" fontWeight="700" fontFamily="JetBrains Mono, monospace">
        Au·Pd
      </text>
    </g>
    {/* Primary Cyrillic Stencil Title */}
    <text
      x="104"
      y="71"
      fill="#eceae1"
      fontSize="44"
      fontWeight="800"
      fontFamily="Unbounded, system-ui, sans-serif"
      letterSpacing="2"
    >
      ЗАЛАЗ
    </text>
    <text
      x="106"
      y="102"
      fill="#eab308"
      fontSize="21"
      fontWeight="700"
      fontFamily="Unbounded, system-ui, sans-serif"
      letterSpacing="3.5"
    >
      ДРАГМЕТАЛЛ
    </text>
    {/* GOST stamp mark */}
    <rect x="346" y="40" width="90" height="28" rx="3" fill="#232825" stroke="#4ade80" strokeWidth="1.5" />
    <text
      x="391"
      y="58"
      textAnchor="middle"
      fill="#4ade80"
      fontSize="11"
      fontWeight="700"
      fontFamily="JetBrains Mono, monospace"
    >
      ГОСТ 1984
    </text>
  </svg>
);
