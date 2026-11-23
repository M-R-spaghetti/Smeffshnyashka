import React, { useMemo, useState } from 'react';
import { Scissors, ArrowRight, AlertTriangle } from 'lucide-react';
import { METAL_INFO, SOVIET_DEVICES, SOVIET_PARTS } from '../game/data';
import { computePlayerModifiers, generatePcbBoards } from '../game/rules';
import {
  MetalType,
  PcbPlacedPart,
  PlayerSaveState,
  SnippedHarvest,
  SovietPartKind,
} from '../game/types';
import { soundEngine } from '../game/audio';
import { SovietPartSvg } from './SovietPartsSvg';

interface PcbClippingBenchProps {
  deviceId: string;
  facilityName: string;
  seed: number;
  save: PlayerSaveState;
  onComplete: (harvest: SnippedHarvest) => void;
}

interface FloatingPop {
  id: number;
  x: number;
  y: number;
  text: string;
  good: boolean;
}

export const PcbClippingBench: React.FC<PcbClippingBenchProps> = ({
  deviceId,
  facilityName,
  seed,
  save,
  onComplete,
}) => {
  const device = SOVIET_DEVICES[deviceId] ?? SOVIET_DEVICES.s1_65;
  const mods = computePlayerModifiers(save, false);

  const [boards, setBoards] = useState<PcbPlacedPart[][]>(() =>
    generatePcbBoards(deviceId, seed)
  );
  const [activeBoardIdx, setActiveBoardIdx] = useState(0);
  const [hoveredPart, setHoveredPart] = useState<SovietPartKind | null>(null);
  const [combo, setCombo] = useState(0);
  const [comboMax, setComboMax] = useState(0);
  const [junkSnipped, setJunkSnipped] = useState(0);
  const [pops, setPops] = useState<FloatingPop[]>([]);
  const [boardShake, setBoardShake] = useState(false);

  const currentBoard = boards[activeBoardIdx] ?? [];

  const stats = useMemo(() => {
    const counts: Partial<Record<SovietPartKind, number>> = {};
    const metalsMg: Record<MetalType, number> = { au: 0, ag: 0, pd: 0, pt: 0 };
    let totalPreciousAvailable = 0;
    let preciousSnipped = 0;

    for (const board of boards) {
      for (const p of board) {
        const def = SOVIET_PARTS[p.kind];
        if (def.isPrecious) totalPreciousAvailable += 1;
        if (p.snipped) {
          counts[p.kind] = (counts[p.kind] ?? 0) + 1;
          if (def.isPrecious) {
            preciousSnipped += 1;
            metalsMg.au += def.metalsMg.au;
            metalsMg.ag += def.metalsMg.ag;
            metalsMg.pd += def.metalsMg.pd;
            metalsMg.pt += def.metalsMg.pt;
          }
        }
      }
    }
    return { counts, metalsMg, totalPreciousAvailable, preciousSnipped };
  }, [boards]);

  const handleSnip = (part: PcbPlacedPart) => {
    if (part.snipped) return;
    const def = SOVIET_PARTS[part.kind];

    setBoards((prev) =>
      prev.map((board, bIdx) =>
        bIdx === activeBoardIdx
          ? board.map((item) => (item.uid === part.uid ? { ...item, snipped: true } : item))
          : board
      )
    );

    if (def.isPrecious) {
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      setComboMax((m) => Math.max(m, nextCombo));
      soundEngine.playSnip(true, nextCombo);

      const estRub = Math.round(def.baseValueRub * mods.snipBonusMultiplier);
      const pid = Date.now() + Math.random();
      setPops((prev) => [
        ...prev.slice(-6),
        { id: pid, x: part.x, y: part.y, text: `+${estRub} ₽ (${def.code})`, good: true },
      ]);
      window.setTimeout(() => {
        setPops((prev) => prev.filter((p) => p.id !== pid));
      }, 750);
    } else {
      setCombo(0);
      setJunkSnipped((j) => j + 1);
      soundEngine.playSnip(false);
      setBoardShake(true);
      window.setTimeout(() => setBoardShake(false), 220);

      const pid = Date.now() + Math.random();
      setPops((prev) => [
        ...prev.slice(-6),
        { id: pid, x: part.x, y: part.y, text: 'Пустышка! (0 ₽)', good: false },
      ]);
      window.setTimeout(() => {
        setPops((prev) => prev.filter((p) => p.id !== pid));
      }, 750);
    }
  };

  const handleFinish = () => {
    soundEngine.playCashPayout();
    onComplete({
      counts: stats.counts,
      metalsMg: stats.metalsMg,
      junkSnipped,
      totalPreciousAvailable: stats.totalPreciousAvailable,
      preciousSnipped: stats.preciousSnipped,
      comboMax,
    });
  };

  const hoveredDef = hoveredPart ? SOVIET_PARTS[hoveredPart] : null;
  const boardRemainingPrecious = currentBoard.filter(
    (p) => !p.snipped && SOVIET_PARTS[p.kind].isPrecious
  ).length;

  return (
    <div className="min-h-screen w-full bg-[#0e1210] industrial-grid text-[#eceae1] flex flex-col">
      {/* Top Bar */}
      <div className="bg-[#131815] border-b border-[#26302a] px-4 sm:px-8 py-3">
        <div className="max-w-[1320px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-[#eab308]">
              ЭТАП 3 ИЗ 3 · СКУСЫВАНИЕ ДРАГМЕТАЛЛОВ · {facilityName}
            </div>
            <h1 className="font-display text-lg sm:text-xl font-bold text-[#eceae1]">
              Платы прибора {device.code}
            </h1>
          </div>

          {/* Live metal tray readout */}
          <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm font-mono-num">
            {(['au', 'pd', 'pt', 'ag'] as const).map((m) => (
              <div key={m} className="flex items-baseline gap-1.5">
                <span style={{ color: METAL_INFO[m].color }} className="font-bold">
                  {METAL_INFO[m].symbol}
                </span>
                <span className="text-[#eceae1]">
                  {(stats.metalsMg[m] / 1000).toFixed(3)}г
                </span>
              </div>
            ))}
            <span className="text-[#8d948e]">|</span>
            <span className="text-[#4ade80] font-semibold">
              Скусано: {stats.preciousSnipped}/{stats.totalPreciousAvailable}
            </span>
          </div>
        </div>
      </div>

      {/* Workbench Grid */}
      <main className="flex-1 max-w-[1320px] w-full mx-auto px-4 sm:px-8 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 cols: Interactive Soviet Fiberglass PCB */}
        <section className="lg:col-span-8 flex flex-col gap-3">
          {/* Board Switcher Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#121614] border border-[#262f2a]">
              {boards.map((b, idx) => {
                const rem = b.filter(
                  (p) => !p.snipped && SOVIET_PARTS[p.kind].isPrecious
                ).length;
                const active = idx === activeBoardIdx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      soundEngine.playClick();
                      setActiveBoardIdx(idx);
                    }}
                    className={`px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-mono-num transition-colors ${
                      active
                        ? 'bg-[#4ade80] text-[#0c140e] font-bold'
                        : 'text-[#a2aba4] hover:text-[#eceae1]'
                    }`}
                  >
                    Плата #{idx + 1} ({rem > 0 ? `ост. ${rem}` : 'чисто'})
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 text-xs font-mono-num">
              {combo >= 2 && (
                <span className="text-[#eab308] font-bold">Серия ×{combo}</span>
              )}
              {junkSnipped > 0 && (
                <span className="text-[#ef4444] inline-flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Мусор: {junkSnipped}
                </span>
              )}
            </div>
          </div>

          {/* Authentic Soviet Textolite PCB Surface */}
          <div
            data-testid="pcb-board-surface"
            className={`relative w-full aspect-[16/10] rounded-2xl pcb-pattern border-4 border-[#274c36] shadow-2xl overflow-hidden select-none transition-transform duration-150 ${
              boardShake ? 'translate-x-1' : ''
            }`}
          >
            {/* Copper PCB Traces SVG Backdrop */}
            <svg
              viewBox="0 0 800 500"
              className="absolute inset-0 w-full h-full pointer-events-none opacity-45"
              aria-hidden="true"
            >
              {/* Soviet gold-plated edge connector fingers at bottom */}
              {Array.from({ length: 18 }).map((_, i) => (
                <rect
                  key={i}
                  x={120 + i * 32}
                  y="476"
                  width="18"
                  height="24"
                  rx="2"
                  fill="#eab308"
                  opacity="0.7"
                />
              ))}
              {/* Copper bus lines */}
              <path
                d="M40 80 H320 L360 120 H740 M60 220 H240 L280 260 H680 M90 380 H450 L490 340 H750 M180 40 V460 M420 60 V460 M620 40 V450"
                fill="none"
                stroke="#4ade80"
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.45"
              />
              {/* Mounting holes */}
              {[
                [24, 24],
                [776, 24],
                [24, 476],
                [776, 476],
              ].map(([cx, cy], i) => (
                <g key={i}>
                  <circle cx={cx} cy={cy} r="11" fill="#0c120e" stroke="#eab308" strokeWidth="3" />
                </g>
              ))}
              <text
                x="44"
                y="456"
                fill="#86efac"
                fontSize="13"
                fontFamily="JetBrains Mono, monospace"
                opacity="0.75"
              >
                УЗЕЛ {device.code}-0{activeBoardIdx + 1} · ТЕКСТОЛИТ СССР
              </text>
            </svg>

            {/* Placed Soviet Radio Components */}
            {currentBoard.map((part) => {
              const def = SOVIET_PARTS[part.kind];
              if (part.snipped) {
                // Solder pads remaining after clean snip!
                return (
                  <div
                    key={part.uid}
                    style={{
                      left: `${part.x}%`,
                      top: `${part.y}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    className="absolute pointer-events-none flex items-center gap-4 opacity-55"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-[#cbd5e1] border border-[#0f172a]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#cbd5e1] border border-[#0f172a]" />
                  </div>
                );
              }

              return (
                <button
                  key={part.uid}
                  type="button"
                  aria-label={`Скусить ${def.name} (${def.code})`}
                  onMouseEnter={() => setHoveredPart(part.kind)}
                  onFocus={() => setHoveredPart(part.kind)}
                  onClick={() => handleSnip(part)}
                  style={{
                    left: `${part.x}%`,
                    top: `${part.y}%`,
                    transform: `translate(-50%, -50%) rotate(${part.rotation}deg)`,
                  }}
                  className="absolute p-1.5 rounded-lg hover:scale-110 active:scale-90 transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-[#eab308] group"
                >
                  <SovietPartSvg kind={part.kind} className="w-16 h-12 sm:w-20 sm:h-14 drop-shadow-md" />
                </button>
              );
            })}

            {/* Floating snip score pops */}
            {pops.map((pop) => (
              <div
                key={pop.id}
                style={{ left: `${pop.x}%`, top: `${pop.y}%` }}
                className={`absolute -translate-x-1/2 -translate-y-full pointer-events-none font-mono-num text-xs sm:text-sm font-bold px-2 py-0.5 rounded bg-[#0c100e]/90 border ${
                  pop.good
                    ? 'text-[#eab308] border-[#eab308]/50'
                    : 'text-[#ef4444] border-[#ef4444]/60'
                }`}
              >
                {pop.text}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-[#9ca59e] font-mono">
            <span>
              Кликай бокорезами по ценным деталям (КМ-5, КМ-6, ППМЛ, 133, КТ904, РЭС, лампы,
              катушки).
            </span>
            {boardRemainingPrecious === 0 && activeBoardIdx < boards.length - 1 && (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setActiveBoardIdx(activeBoardIdx + 1);
                }}
                className="text-[#4ade80] font-bold hover:underline shrink-0 ml-3"
              >
                Следующая плата →
              </button>
            )}
          </div>
        </section>

        {/* Right 4 cols: Magnifying Loupe Inspector & Sell Button */}
        <aside className="lg:col-span-4 flex flex-col gap-4">
          <div className="p-5 rounded-xl bg-[#141916] border border-[#28322c]">
            <div className="flex items-center gap-2 text-xs font-mono text-[#eab308]">
              <Scissors className="w-4 h-4" />
              <span>ЛУПА СКУПЩИКА · НАВЕДИ НА ДЕТАЛЬ</span>
            </div>

            {hoveredDef ? (
              <div className="mt-4">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-16 rounded-lg bg-[#0d120f] border border-[#242f28] flex items-center justify-center p-1.5 shrink-0">
                    <SovietPartSvg kind={hoveredDef.kind} className="w-full h-full" />
                  </div>
                  <div>
                    <div className="text-xs font-mono text-[#8d948e]">
                      {hoveredDef.code} · {hoveredDef.era}
                    </div>
                    <div className="font-display text-sm font-bold text-[#eceae1] mt-0.5">
                      {hoveredDef.name}
                    </div>
                    <div
                      className={`mt-1 text-xs font-mono-num font-bold ${
                        hoveredDef.isPrecious ? 'text-[#4ade80]' : 'text-[#ef4444]'
                      }`}
                    >
                      {hoveredDef.isPrecious
                        ? `Ценная деталь · ≈${Math.round(
                            hoveredDef.baseValueRub * mods.snipBonusMultiplier
                          )} ₽`
                        : 'МУСОР · НЕ СКУСЫВАТЬ!'}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-[#b2bbb4] leading-relaxed">{hoveredDef.tip}</p>
              </div>
            ) : (
              <p className="mt-3 text-xs sm:text-sm text-[#9ca59e] leading-relaxed">
                Наведи курсор на любую радиодеталь на плате, чтобы прочитать советскую маркировку и
                проверить наличие золота, палладия, платины или серебра.
              </p>
            )}
          </div>

          {/* Sorting Purity & Bonus Box */}
          <div className="p-5 rounded-xl bg-[#141916] border border-[#28322c] flex flex-col gap-3">
            <div className="text-xs font-mono text-[#8d948e]">СОСТОЯНИЕ ПАРТИИ</div>
            <div className="flex justify-between text-sm font-mono-num">
              <span className="text-[#b5beb8]">Бокорезы</span>
              <span className="text-[#4ade80]">
                {mods.snipBonusMultiplier > 1 ? 'Титановые (+20%)' : 'Обычные'}
              </span>
            </div>
            <div className="flex justify-between text-sm font-mono-num">
              <span className="text-[#b5beb8]">Чистота сортировки</span>
              <span className={junkSnipped === 0 ? 'text-[#4ade80]' : 'text-[#ef4444]'}>
                {junkSnipped === 0 ? 'Идеально (+15% бонус)' : `Засорена (${junkSnipped})`}
              </span>
            </div>
            <div className="flex justify-between text-sm font-mono-num">
              <span className="text-[#b5beb8]">Твоя доля со скупки</span>
              <span className="text-[#eab308] font-bold">
                {Math.round(mods.shareRate * 100)}%
              </span>
            </div>

            <button
              type="button"
              data-testid="finish-clipping-btn"
              onClick={handleFinish}
              className="mt-2 w-full py-3.5 px-5 rounded-lg bg-[#eab308] hover:bg-[#facc15] active:scale-[0.98] text-[#0f1110] font-display font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all"
            >
              <span>Отнести на скупку</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
};
