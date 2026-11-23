import React, { useEffect, useRef } from 'react';
import { CREW_PROFILES } from '../game/data';
import { CrewId } from '../game/types';
import { soundEngine } from '../game/audio';
import { TitleEmblemSvg } from './SovietPartsSvg';

interface TitleScreenProps {
  selectedCrew: CrewId;
  hasExistingProgress: boolean;
  savedRubles: number;
  savedRaids: number;
  onSelectCrew: (crewId: CrewId) => void;
  onStart: () => void;
  onResetSave?: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  selectedCrew,
  hasExistingProgress,
  savedRubles,
  savedRaids,
  onSelectCrew,
  onStart,
  onResetSave,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Live animated industrial Soviet night backdrop (sweeping searchlight, lit НИИ windows, drifting rain/ash)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let width = 1280;
    let height = 720;

    // Pooled rain / dust motes (zero GC inside rAF)
    const PARTICLE_COUNT = 65;
    const px = new Float32Array(PARTICLE_COUNT);
    const py = new Float32Array(PARTICLE_COUNT);
    const pv = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      px[i] = Math.random();
      py[i] = Math.random();
      pv[i] = 0.08 + Math.random() * 0.14;
    }

    let cachedSky: CanvasGradient | null = null;
    let cachedHaze: CanvasGradient | null = null;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(320, rect.width);
      height = Math.max(320, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      cachedSky = ctx.createLinearGradient(0, 0, width, height);
      cachedSky.addColorStop(0, '#0a0d0c');
      cachedSky.addColorStop(0.55, '#131d1a');
      cachedSky.addColorStop(1, '#182621');

      cachedHaze = ctx.createRadialGradient(
        width * 0.72,
        height * 0.42,
        30,
        width * 0.72,
        height * 0.42,
        width * 0.42
      );
      cachedHaze.addColorStop(0, 'rgba(74, 222, 128, 0.11)');
      cachedHaze.addColorStop(0.55, 'rgba(234, 179, 8, 0.05)');
      cachedHaze.addColorStop(1, 'rgba(10, 13, 12, 0)');
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let lastTime = performance.now();
    let elapsed = 0;

    const render = (now: number) => {
      const rawDiff = now - lastTime;
      if (rawDiff < 30) {
        rafId = requestAnimationFrame(render);
        return;
      }
      const dt = Math.min(rawDiff / 1000, 0.05);
      lastTime = now;
      elapsed += dt;

      // Deep night Soviet moonlight sky gradient
      ctx.fillStyle = cachedSky ?? '#0d100f';
      ctx.fillRect(0, 0, width, height);

      if (cachedHaze) {
        ctx.fillStyle = cachedHaze;
        ctx.fillRect(0, 0, width, height);
      }

      // Distant industrial skyline & cooling chimneys on the right 55% (keeping left negative space calm!)
      const horizonY = height * 0.78;
      const bldgLeft = width * 0.44;
      const bldgW = width * 0.52;

      // Industrial chimneys silhouette
      ctx.fillStyle = '#1b2420';
      ctx.strokeStyle = '#2d3b34';
      ctx.lineWidth = 1.5;
      ctx.fillRect(bldgLeft + bldgW * 0.72, horizonY - 300, 28, 300);
      ctx.strokeRect(bldgLeft + bldgW * 0.72, horizonY - 300, 28, 300);
      ctx.fillRect(bldgLeft + bldgW * 0.84, horizonY - 240, 22, 240);
      ctx.strokeRect(bldgLeft + bldgW * 0.84, horizonY - 240, 22, 240);
      // Aviation warning red lights on chimneys
      const blink = Math.sin(elapsed * 2.8) > 0.1 ? 1 : 0.3;
      ctx.fillStyle = `rgba(239, 68, 68, ${blink})`;
      ctx.beginPath();
      ctx.arc(bldgLeft + bldgW * 0.72 + 14, horizonY - 304, 4.5, 0, Math.PI * 2);
      ctx.arc(bldgLeft + bldgW * 0.84 + 11, horizonY - 244, 4, 0, Math.PI * 2);
      ctx.fill();

      // Main Soviet НИИ concrete block with distinct brutalist roof sign
      const niiX = bldgLeft + bldgW * 0.07;
      const niiY = horizonY - 224;
      const niiW = bldgW * 0.72;
      const niiH = 224;
      ctx.fillStyle = '#1f2824';
      ctx.fillRect(niiX, niiY, niiW, niiH);
      ctx.strokeStyle = '#36463e';
      ctx.lineWidth = 2;
      ctx.strokeRect(niiX, niiY, niiW, niiH);

      // Concrete parapet & rooftop radio mast
      ctx.fillStyle = '#28342e';
      ctx.fillRect(niiX - 4, niiY - 10, niiW + 8, 10);
      ctx.strokeStyle = '#4e6358';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(niiX + niiW * 0.22, niiY - 10);
      ctx.lineTo(niiX + niiW * 0.22, niiY - 76);
      ctx.moveTo(niiX + niiW * 0.16, niiY - 56);
      ctx.lineTo(niiX + niiW * 0.28, niiY - 56);
      ctx.moveTo(niiX + niiW * 0.18, niiY - 38);
      ctx.lineTo(niiX + niiW * 0.26, niiY - 38);
      ctx.stroke();

      // Grid of Soviet НИИ windows (phosphor green labs & amber guard rooms)
      const cols = 9;
      const rows = 4;
      const padX = 18;
      const padY = 22;
      const cellW = (niiW - padX * 2) / cols;
      const cellH = (niiH - padY * 2) / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wx = niiX + padX + c * cellW + 4;
          const wy = niiY + padY + r * cellH + 5;
          const ww = Math.max(10, cellW - 10);
          const wh = Math.max(12, cellH - 14);
          const seed = (r * 13 + c * 7) % 11;
          if (seed === 2 || seed === 7) {
            ctx.fillStyle = 'rgba(74, 222, 128, 0.36)';
          } else if (seed === 4) {
            const flicker = 0.42 + Math.sin(elapsed * 5 + c) * 0.05;
            ctx.fillStyle = `rgba(234, 179, 8, ${flicker})`;
          } else {
            ctx.fillStyle = '#111714';
          }
          ctx.fillRect(wx, wy, ww, wh);
          ctx.strokeStyle = '#2d3a33';
          ctx.lineWidth = 1;
          ctx.strokeRect(wx, wy, ww, wh);
        }
      }

      // Guard watchtower silhouette on right edge
      const towerX = width * 0.92;
      const towerY = horizonY - 132;
      ctx.fillStyle = '#1d2622';
      ctx.strokeStyle = '#3b4a42';
      ctx.lineWidth = 1.8;
      ctx.fillRect(towerX - 18, towerY - 12, 36, 26);
      ctx.strokeRect(towerX - 18, towerY - 12, 36, 26);
      ctx.beginPath();
      ctx.moveTo(towerX - 14, towerY + 14);
      ctx.lineTo(towerX - 24, horizonY);
      ctx.moveTo(towerX + 14, towerY + 14);
      ctx.lineTo(towerX + 24, horizonY);
      ctx.stroke();

      // Sweeping guard searchlight beam from watchtower
      const sweepAngle = Math.PI + 0.18 + Math.sin(elapsed * 0.7) * 0.32;
      const beamLen = width * 0.58;
      const beamSpread = 0.16;

      const beamGrad = ctx.createRadialGradient(towerX, towerY, 8, towerX, towerY, beamLen);
      beamGrad.addColorStop(0, 'rgba(250, 204, 21, 0.44)');
      beamGrad.addColorStop(0.55, 'rgba(250, 204, 21, 0.14)');
      beamGrad.addColorStop(1, 'rgba(250, 204, 21, 0)');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(towerX, towerY);
      ctx.lineTo(
        towerX + Math.cos(sweepAngle - beamSpread) * beamLen,
        towerY + Math.sin(sweepAngle - beamSpread) * beamLen
      );
      ctx.lineTo(
        towerX + Math.cos(sweepAngle + beamSpread) * beamLen,
        towerY + Math.sin(sweepAngle + beamSpread) * beamLen
      );
      ctx.closePath();
      ctx.fill();

      // Perimeter concrete fence ("ПО-2" diamond Soviet concrete slabs!)
      ctx.fillStyle = '#151b18';
      ctx.fillRect(0, horizonY, width, height - horizonY);
      ctx.strokeStyle = '#303c36';
      ctx.lineWidth = 1.5;
      for (let x = 0; x < width; x += 48) {
        ctx.strokeRect(x, horizonY - 28, 48, 28);
        ctx.beginPath();
        ctx.moveTo(x, horizonY - 28);
        ctx.lineTo(x - 5, horizonY - 40);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, horizonY - 38);
      ctx.lineTo(width, horizonY - 38);
      ctx.stroke();

      // Drifting rain / industrial dust motes
      ctx.strokeStyle = 'rgba(236, 234, 225, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        py[i] += pv[i] * dt;
        px[i] -= pv[i] * 0.12 * dt;
        if (py[i] > 1) {
          py[i] = 0;
          px[i] = Math.random();
        }
        if (px[i] < 0) px[i] = 1;
        const rx = px[i] * width;
        const ry = py[i] * height;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 3, ry + 11);
      }
      ctx.stroke();

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  // Enter / Space starts immediately from title screen
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'BUTTON' && e.key === ' ') return;
        e.preventDefault();
        soundEngine.playClick();
        onStart();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onStart]);

  return (
    <main className="relative w-full h-screen overflow-hidden select-none bg-[#0d100f]">
      <canvas
        ref={canvasRef}
        data-testid="title-backdrop-canvas"
        className="absolute inset-0 w-full h-full block"
      />

      {/* Calm left scrim ensuring > 7:1 contrast for typography without hiding right-side НИИ scene */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(95deg, rgba(11,13,12,0.94) 0%, rgba(11,13,12,0.82) 48%, rgba(11,13,12,0.22) 100%)',
        }}
      />

      <div className="relative z-10 h-full max-w-[1360px] mx-auto px-6 sm:px-10 py-8 flex flex-col justify-between">
        {/* Top quiet spacer */}
        <div className="flex items-center justify-between text-xs font-mono-num text-[#8d948e]">
          <span>СССР · ЗАБРОШЕННЫЕ НИИ, ЗАВОДЫ И ЦЕХИ</span>
          {hasExistingProgress && (
            <span className="text-[#eab308]">
              Сейф: {savedRubles.toLocaleString('ru-RU')} ₽ · Залазов: {savedRaids}
            </span>
          )}
        </div>

        {/* Left-third negative-space hero column */}
        <div className="max-w-[540px] flex flex-col gap-6 my-auto">
          <TitleEmblemSvg className="w-full max-w-[440px]" />

          <p className="text-base sm:text-[17px] text-[#c8cec9] leading-relaxed max-w-[48ch]">
            Проникай в советские НИИ, цехи и лаборатории, выноси приборы, раскручивай корпуса и
            скусывай КМ-ки, ППМЛ и позолоту. Не свети по окнам и не шуми — иначе запал.
          </p>

          {/* Selectable climber crew (Кавесы / Окиси / Урбаниксы) */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-mono text-[#8d948e] tracking-wider">
              Выбери бригаду лазателей
            </span>
            <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Выбор бригады">
              {CREW_PROFILES.map((crew) => {
                const active = selectedCrew === crew.id;
                return (
                  <button
                    key={crew.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      soundEngine.playClick();
                      onSelectCrew(crew.id);
                    }}
                    className={`text-left p-3 rounded-lg border transition-transform duration-150 active:scale-[0.98] ${
                      active
                        ? 'bg-[#1c221e] border-[#eab308] text-[#eceae1]'
                        : 'bg-[#131715] border-[#29302b] text-[#9aa39c] hover:border-[#4b564e] hover:text-[#eceae1]'
                    }`}
                  >
                    <div className="font-display text-sm font-bold flex items-center justify-between gap-1">
                      <span>{crew.name}</span>
                    </div>
                    <div className="mt-1 text-[11px] leading-snug text-[#9aa39c]">
                      Доля {Math.round(crew.shareRate * 100)}%
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Selected crew perk description */}
            <div className="text-xs text-[#d6d3c9] font-mono-num min-h-[20px]">
              {CREW_PROFILES.find((c) => c.id === selectedCrew)?.perkSummary}
            </div>
          </div>

          {/* Primary CTA (<= 2 actions total) */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              data-start="true"
              onClick={(e) => {
                e.currentTarget.blur();
                soundEngine.playClick();
                onStart();
              }}
              className="px-7 py-3.5 rounded-lg bg-[#eab308] hover:bg-[#facc15] active:scale-[0.98] text-[#0f1110] font-display font-bold text-sm sm:text-base tracking-wide transition-all whitespace-nowrap shrink-0"
            >
              {hasExistingProgress ? 'Продолжить залаз' : 'Начать залаз'}
            </button>

            {hasExistingProgress && onResetSave && (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  onResetSave();
                }}
                className="px-4 py-3.5 rounded-lg bg-[#181c1a] hover:bg-[#232926] border border-[#313934] text-[#b4bcb6] hover:text-[#eceae1] text-sm font-medium transition-colors whitespace-nowrap shrink-0"
              >
                Новая игра
              </button>
            )}
          </div>
        </div>

        {/* Single flat, borderless control hint line in safe bottom margin */}
        <div className="text-xs sm:text-[13px] font-mono-num text-[#858d87] tracking-tight">
          WASD Движение · Shift Бег · F Фонарик · E Взломать / Вынести · Q Пиво · Esc Пауза
        </div>
      </div>
    </main>
  );
};
