import React, { useState } from 'react';
import { Wrench, ArrowRight } from 'lucide-react';
import { SOVIET_DEVICES } from '../game/data';
import { computePlayerModifiers } from '../game/rules';
import { PlayerSaveState } from '../game/types';
import { soundEngine } from '../game/audio';

interface DisassemblyBenchProps {
  deviceId: string;
  facilityName: string;
  save: PlayerSaveState;
  onComplete: () => void;
}

interface ScrewItem {
  id: number;
  x: number; // %
  y: number; // %
  turnsLeft: number;
  maxTurns: number;
  angle: number;
}

interface CableItem {
  id: number;
  label: string;
  color: string;
  disconnected: boolean;
}

interface Spark {
  id: number;
  x: number;
  y: number;
}

export const DisassemblyBench: React.FC<DisassemblyBenchProps> = ({
  deviceId,
  facilityName,
  save,
  onComplete,
}) => {
  const device = SOVIET_DEVICES[deviceId] ?? SOVIET_DEVICES.s1_65;
  const mods = computePlayerModifiers(save, false);
  const turnsPerScrew = mods.unscrewSpeedMultiplier >= 2.0 ? 1 : 2;

  const [screws, setScrews] = useState<ScrewItem[]>(() => {
    const coords = [
      { x: 9, y: 12 },
      { x: 91, y: 12 },
      { x: 9, y: 88 },
      { x: 91, y: 88 },
      { x: 50, y: 12 },
      { x: 50, y: 88 },
      { x: 9, y: 50 },
      { x: 91, y: 50 },
      { x: 30, y: 12 },
    ];
    return coords.slice(0, device.screwCount).map((pos, idx) => ({
      id: idx,
      x: pos.x,
      y: pos.y,
      turnsLeft: turnsPerScrew,
      maxTurns: turnsPerScrew,
      angle: (idx * 37) % 180,
    }));
  });

  const [lidRemoved, setLidRemoved] = useState(false);

  const [cables, setCables] = useState<CableItem[]>(() => {
    const defs = [
      { label: 'Шлейф питания 220В', color: '#ef4444' },
      { label: 'Коаксиал ВЧ-блока', color: '#eab308' },
      { label: 'Жгут развёртки ЭЛТ', color: '#38bdf8' },
      { label: 'Шина логики 133', color: '#4ade80' },
    ];
    return defs.slice(0, device.cableCount).map((d, i) => ({
      id: i,
      label: d.label,
      color: d.color,
      disconnected: false,
    }));
  });

  const [extractedBoards, setExtractedBoards] = useState<number[]>([]);
  const [sparks, setSparks] = useState<Spark[]>([]);

  const remainingScrews = screws.filter((s) => s.turnsLeft > 0).length;
  const allScrewsDone = remainingScrews === 0;
  const allCablesDone = cables.every((c) => c.disconnected);
  const allBoardsExtracted = extractedBoards.length === device.boardCount;

  const triggerSpark = (x: number, y: number) => {
    const sid = Date.now() + Math.random();
    setSparks((prev) => [...prev.slice(-6), { id: sid, x, y }]);
    window.setTimeout(() => {
      setSparks((prev) => prev.filter((s) => s.id !== sid));
    }, 340);
  };

  const handleScrewClick = (screwId: number) => {
    const target = screws.find((s) => s.id === screwId);
    if (!target || target.turnsLeft <= 0) return;

    soundEngine.playScrewRatchet();
    triggerSpark(target.x, target.y);

    setScrews((prev) =>
      prev.map((s) =>
        s.id === screwId
          ? { ...s, turnsLeft: Math.max(0, s.turnsLeft - 1), angle: s.angle + 135 }
          : s
      )
    );
  };

  const handleRemoveLid = () => {
    if (!allScrewsDone || lidRemoved) return;
    soundEngine.playDoorOpen();
    setLidRemoved(true);
  };

  const handleDisconnectCable = (id: number) => {
    soundEngine.playClick();
    setCables((prev) =>
      prev.map((c) => (c.id === id ? { ...c, disconnected: true } : c))
    );
  };

  const handleExtractBoard = (idx: number) => {
    if (!allCablesDone || extractedBoards.includes(idx)) return;
    soundEngine.playSnip(true, idx + 2);
    setExtractedBoards((prev) => [...prev, idx]);
  };

  const stepNumber = !allScrewsDone
    ? 1
    : !lidRemoved
      ? 2
      : !allCablesDone
        ? 3
        : !allBoardsExtracted
          ? 4
          : 5;

  const stepPrompt =
    stepNumber === 1
      ? `Выкрути советские шлицевые болты корпуса (осталось ${remainingScrews})`
      : stepNumber === 2
        ? 'Все болты сняты! Сдерни верхнюю штампованную крышку корпуса'
        : stepNumber === 3
          ? 'Отсоедини жгуты проводов, чтобы освободить текстолитовые платы'
          : stepNumber === 4
            ? `Вытащи платы с драгметаллами (${extractedBoards.length}/${device.boardCount})`
            : 'Все платы на верстаке — переходим к скусыванию КМ-ок и позолоты!';

  return (
    <div className="min-h-screen w-full bg-[#101311] industrial-grid text-[#eceae1] flex flex-col">
      {/* Compact top bar */}
      <div className="bg-[#141816] border-b border-[#272f2a] px-6 py-3.5">
        <div className="max-w-[1160px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-mono text-[#4ade80]">
              ЭТАП 2 ИЗ 3 · ГАРАЖ-ВЕРСТАК · {facilityName}
            </div>
            <h1 className="font-display text-lg sm:text-xl font-bold text-[#eceae1]">
              Разборка: {device.name}
            </h1>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono-num text-[#a6b0a9]">
            <span className="inline-flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-[#eab308]" />
              {mods.unscrewSpeedMultiplier >= 2
                ? 'Ударная отвёртка (1 клик/болт)'
                : 'Обычная отвёртка (2 клика/болт)'}
            </span>
            <span>Платы: {extractedBoards.length}/{device.boardCount}</span>
          </div>
        </div>
      </div>

      {/* Main Workbench Area */}
      <main className="flex-1 max-w-[1160px] w-full mx-auto px-4 sm:px-6 py-6 flex flex-col items-center justify-center gap-5">
        {/* Live instruction prompt */}
        <div
          role="status"
          className="w-full max-w-[820px] px-4 py-3 rounded-lg bg-[#171c19] border border-[#2f3a34] flex items-center justify-between gap-4"
        >
          <span className="text-sm font-medium text-[#eceae1]">{stepPrompt}</span>
          <span className="text-xs font-mono-num text-[#eab308] shrink-0">
            Шаг {Math.min(stepNumber, 4)} / 4
          </span>
        </div>

        {/* Soviet Instrument Chassis Interactive Surface */}
        <div
          className="relative w-full max-w-[820px] aspect-[16/10] rounded-2xl border-2 border-[#39443e] shadow-2xl overflow-hidden select-none"
          style={{ backgroundColor: device.chassisColor }}
        >
          {/* Interior view underneath the lid */}
          <div className="absolute inset-0 bg-[#181d1a] p-6 sm:p-8 flex flex-col justify-between">
            {/* Internal Soviet power transformer & CRT rear block */}
            <div className="flex items-center justify-between border-b border-[#2b342e] pb-3">
              <div className="font-mono text-xs text-[#8d948e]">
                ШАССИ {device.code} · ЗАВОДСКОЙ № 084192 · ОТК-5
              </div>
              <div className="font-mono text-xs text-[#eab308]">
                ОСТОРОЖНО · ВЫСОКОЕ НАПРЯЖЕНИЕ
              </div>
            </div>

            {/* Internal Cables to disconnect */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 my-3">
              {cables.map((cable) => (
                <button
                  key={cable.id}
                  type="button"
                  disabled={!lidRemoved || cable.disconnected}
                  onClick={() => handleDisconnectCable(cable.id)}
                  className={`px-3.5 py-2.5 rounded-lg border text-left flex items-center justify-between transition-all ${
                    cable.disconnected
                      ? 'bg-[#111513] border-[#252d28] text-[#667069] line-through'
                      : 'bg-[#1f2622] hover:bg-[#28312c] border-[#424f47] text-[#eceae1] active:scale-[0.98]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
                    <span
                      className="w-6 h-1.5 rounded-full inline-block"
                      style={{ backgroundColor: cable.disconnected ? '#3f4742' : cable.color }}
                    />
                    {cable.label}
                  </span>
                  <span className="text-[11px] font-mono text-[#eab308]">
                    {cable.disconnected ? 'СНЯТ' : 'ОТКЛЮЧИТЬ'}
                  </span>
                </button>
              ))}
            </div>

            {/* Green Fiberglass Soviet PCBs waiting to be pulled out */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-auto">
              {Array.from({ length: device.boardCount }).map((_, idx) => {
                const pulled = extractedBoards.includes(idx);
                const ready = lidRemoved && allCablesDone && !pulled;
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={!ready}
                    onClick={() => handleExtractBoard(idx)}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      pulled
                        ? 'bg-[#111513] border-dashed border-[#2b342e] text-[#6d7670]'
                        : ready
                          ? 'pcb-pattern border-[#4ade80] hover:scale-[1.02] active:scale-[0.98] text-[#eceae1]'
                          : 'pcb-pattern border-[#28382e] opacity-60 text-[#9ca59e]'
                    }`}
                  >
                    <div className="text-[11px] font-mono text-[#86efac]">
                      ПЛАТА №{idx + 1} · ГЕТИНАКС
                    </div>
                    <div className="mt-1 font-display text-sm font-bold">
                      {pulled ? 'Вынута на верстак' : ready ? 'Вынуть плату' : 'Мешают провода'}
                    </div>
                    {!pulled && (
                      <div className="mt-2 flex gap-1.5">
                        <span className="w-3.5 h-2.5 rounded-sm bg-[#16a34a]" />
                        <span className="w-3.5 h-2.5 rounded-sm bg-[#eab308]" />
                        <span className="w-3.5 h-2.5 rounded-sm bg-[#f97316]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Removable Stamped Metal Lid overlay */}
          {!lidRemoved && (
            <div
              className="absolute inset-0 transition-opacity duration-200 flex flex-col items-center justify-center p-8"
              style={{
                background:
                  'linear-gradient(145deg, #4b554e 0%, #373f3a 55%, #2b322e 100%)',
              }}
            >
              {/* Ventilation louvers on Soviet metal case */}
              <div className="w-full max-w-md flex flex-col gap-2 opacity-40 pointer-events-none">
                {[0, 1, 2, 3].map((r) => (
                  <div key={r} className="h-2 rounded-full bg-[#151917] shadow-inner" />
                ))}
              </div>

              {/* Stamped nameplate in center of lid */}
              <div className="my-6 px-6 py-4 rounded-lg bg-[#1c211e] border border-[#616e66] text-center shadow-lg">
                <div className="font-mono text-[11px] text-[#9ca59e] tracking-widest">
                  МИНИСТЕРСТВО РАДИОПРОМЫШЛЕННОСТИ СССР
                </div>
                <div className="mt-1 font-display text-2xl sm:text-3xl font-extrabold text-[#eceae1]">
                  {device.code}
                </div>
                <div className="mt-0.5 text-xs text-[#4ade80] font-mono">
                  ПЛОМБА ОТК · СДЕЛАНО В СССР
                </div>
              </div>

              {/* Lift lid CTA once all bolts are removed */}
              {allScrewsDone ? (
                <button
                  type="button"
                  onClick={handleRemoveLid}
                  className="px-6 py-3 rounded-lg bg-[#eab308] hover:bg-[#facc15] active:scale-[0.97] text-[#0f1110] font-display font-bold text-sm shadow-xl transition-transform"
                >
                  Снять крышку корпуса
                </button>
              ) : (
                <div className="text-xs font-mono text-[#d0d7d2]">
                  Кликай по болтам по периметру, чтобы выкрутить ({remainingScrews} ост.)
                </div>
              )}

              {/* Interactive Slotted Soviet Screws */}
              {screws.map((s) => {
                const removed = s.turnsLeft <= 0;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={removed}
                    aria-label={`Выкрутить болт ${s.id + 1}`}
                    onClick={() => handleScrewClick(s.id)}
                    style={{
                      left: `${s.x}%`,
                      top: `${s.y}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    className={`absolute w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                      removed
                        ? 'opacity-30 pointer-events-none'
                        : 'hover:scale-110 active:scale-95'
                    }`}
                  >
                    <span
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shadow-md transition-transform duration-150 ${
                        removed
                          ? 'bg-[#121513] border-[#2c332f]'
                          : 'bg-[#a3aea7] border-[#262d29] ring-2 ring-[#eab308]/50'
                      }`}
                      style={{ transform: `rotate(${s.angle}deg)` }}
                    >
                      {!removed && <span className="w-6 h-1 bg-[#1e2421] rounded-full" />}
                    </span>
                  </button>
                );
              })}

              {/* Metallic sparks */}
              {sparks.map((sp) => (
                <div
                  key={sp.id}
                  style={{ left: `${sp.x}%`, top: `${sp.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                >
                  <div className="w-10 h-10 rounded-full border-2 border-[#facc15] opacity-80 animate-ping" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Proceed to PCB Clipping button */}
        <div className="w-full max-w-[820px] flex justify-end">
          <button
            type="button"
            disabled={!allBoardsExtracted}
            onClick={() => {
              soundEngine.playClick();
              onComplete();
            }}
            className={`px-7 py-3.5 rounded-lg font-display font-bold text-sm sm:text-base flex items-center gap-2 transition-all ${
              allBoardsExtracted
                ? 'bg-[#4ade80] hover:bg-[#86efac] text-[#0b130d] active:scale-[0.98]'
                : 'bg-[#1e2420] text-[#667069] cursor-not-allowed'
            }`}
          >
            <span>Скусывать драгметаллы с плат</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </main>
    </div>
  );
};
