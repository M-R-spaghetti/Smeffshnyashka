import React, { useEffect, useRef, useState } from 'react';
import {
  Flashlight,
  FlashlightOff,
  Pause,
  Volume2,
  VolumeX,
  LogOut,
  Hand,
  KeyRound,
  ZapOff,
} from 'lucide-react';
import { SOVIET_DEVICES } from '../game/data';
import {
  computePlayerModifiers,
  computeWindowFlashlightAlertRate,
  getToolCount,
  isPointInVisionCone,
} from '../game/rules';
import {
  FacilityDef,
  GuardSpec,
  PlayerSaveState,
  RaidOutcomeSnapshot,
} from '../game/types';
import { soundEngine } from '../game/audio';
import { ToolIconSvg } from './SovietPartsSvg';

interface StealthRaidProps {
  facility: FacilityDef;
  save: PlayerSaveState;
  paused: boolean;
  onDrinkBeer: () => boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onExtracted: () => void;
  onEscapedEmpty: (snapshot: RaidOutcomeSnapshot) => void;
  onBusted: (snapshot: RaidOutcomeSnapshot) => void;
}

interface GuardRuntime extends GuardSpec {
  baseAngle: number;
  waypointIdx: number;
  state: 'patrol' | 'investigate' | 'chase';
  investigateX: number;
  investigateY: number;
  investigateTimer: number;
  alertCueTimer: number;
}

interface NoiseRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

interface HudSnapshot {
  alert: number;
  timeLeft: number;
  flashlightOn: boolean;
  hasDevice: boolean;
  hasLevelKey: boolean;
  powerOffTimer: number;
  beerTimer: number;
  warningText: string;
  interactLabel: string | null;
  interactProgress: number;
  crisisActive: boolean;
  crisisCountdown: number;
  crisisReason: string;
}

export const StealthRaid: React.FC<StealthRaidProps> = ({
  facility,
  save,
  paused,
  onDrinkBeer,
  onToggleMute,
  onPause,
  onExtracted,
  onEscapedEmpty,
  onBusted,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const alertBarRef = useRef<HTMLDivElement | null>(null);

  // Store latest props/callbacks in refs so canvas loop NEVER tears down on HUD or save updates!
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const saveRef = useRef(save);
  saveRef.current = save;
  const callbacksRef = useRef({
    onDrinkBeer,
    onExtracted,
    onEscapedEmpty,
    onBusted,
  });
  callbacksRef.current = { onDrinkBeer, onExtracted, onEscapedEmpty, onBusted };

  const actionsRef = useRef({
    toggleFlashlight: false,
    triggerBeer: false,
    holdInteractBtn: false,
    escapeEmptyNow: false,
  });

  const [hud, setHud] = useState<HudSnapshot>({
    alert: 0,
    timeLeft: facility.timeLimitSec,
    flashlightOn: false,
    hasDevice: false,
    hasLevelKey: false,
    powerOffTimer: 0,
    beerTimer: 0,
    warningText: '',
    interactLabel: null,
    interactProgress: 0,
    crisisActive: false,
    crisisCountdown: 4.5,
    crisisReason: '',
  });

  const device = SOVIET_DEVICES[facility.deviceId] ?? SOVIET_DEVICES.s1_65;
  const beerCount = getToolCount(save, 'beer');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grid = facility.mapRows;
    const rows = grid.length;
    const cols = grid[0].length;

    let startX = 2.5;
    let startY = 2.5;
    let exitX = 1.5;
    let exitY = 1.5;
    let targetX = cols - 3.5;
    let targetY = rows - 3.5;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ch = grid[y][x];
        if (ch === 'S') {
          startX = x + 0.5;
          startY = y + 0.5;
        } else if (ch === 'E') {
          exitX = x + 0.5;
          exitY = y + 0.5;
        } else if (ch === 'T') {
          targetX = x + 0.5;
          targetY = y + 0.5;
        }
      }
    }

    const sim = {
      px: startX,
      py: startY,
      camX: 0,
      camY: 0,
      facing: 0,
      flashlightOn: false,
      hasDevice: false,
      hasLevelKey: false,
      collectedKeys: new Set<string>(),
      openedTiles: new Set<string>(),
      powerOffTimer: 0,
      alert: 0,
      alertPeak: 0,
      timeLeft: facility.timeLimitSec,
      elapsed: 0,
      beerTimer: 0,
      stepDistAccum: 0,
      hitstop: 0,
      shakeTrauma: 0,
      alertSoundCooldown: 0,
      windowGlareTile: null as { x: number; y: number } | null,
      warningText: '',
      interactTarget: null as {
        tx: number;
        ty: number;
        kind: 'L' | 'C' | 'V' | 'T' | 'D' | 'K';
        label: string;
        duration: number;
        blockedMsg?: string;
      } | null,
      interactProgress: 0,
      crisisActive: false,
      crisisCountdown: 4.5,
      crisisReason: '',
      ended: false,
      mouseWorldActive: false,
      mouseClientX: 0,
      mouseClientY: 0,
      hudSyncAccum: 0,
    };

    const guards: GuardRuntime[] = facility.guards.map((g) => ({
      ...g,
      baseAngle: g.angle,
      waypointIdx: 0,
      state: 'patrol',
      investigateX: g.x,
      investigateY: g.y,
      investigateTimer: 0,
      alertCueTimer: 0,
    }));

    const rings: NoiseRing[] = [];

    // Zero-GC pooled particle ring buffer
    const POOL_SIZE = 56;
    const partActive = new Uint8Array(POOL_SIZE);
    const partX = new Float32Array(POOL_SIZE);
    const partY = new Float32Array(POOL_SIZE);
    const partVx = new Float32Array(POOL_SIZE);
    const partVy = new Float32Array(POOL_SIZE);
    const partLife = new Float32Array(POOL_SIZE);
    const partHue = new Uint8Array(POOL_SIZE); // 0=amber, 1=green, 2=red, 3=cyan
    let partCursor = 0;

    const spawnParticles = (wx: number, wy: number, count: number, hueCode: number) => {
      for (let i = 0; i < count; i++) {
        const idx = partCursor;
        partCursor = (partCursor + 1) % POOL_SIZE;
        const ang = Math.random() * Math.PI * 2;
        const spd = 0.8 + Math.random() * 2.4;
        partActive[idx] = 1;
        partX[idx] = wx;
        partY[idx] = wy;
        partVx[idx] = Math.cos(ang) * spd;
        partVy[idx] = Math.sin(ang) * spd;
        partLife[idx] = 0.28 + Math.random() * 0.28;
        partHue[idx] = hueCode;
      }
    };

    const emitNoise = (x: number, y: number, radius: number, color = '#eab308') => {
      rings.push({ x, y, radius: 0.2, maxRadius: radius, alpha: 0.85, color });
      for (const g of guards) {
        if (g.archetype === 'camera') continue;
        const d = Math.hypot(g.x - x, g.y - y);
        const hearMult = g.archetype === 'investigator' ? 1.45 : 0.95;
        if (d <= radius * hearMult) {
          g.state = 'investigate';
          g.investigateX = x;
          g.investigateY = y;
          g.investigateTimer = 4.6;
          g.alertCueTimer = 1.2;
        }
      }
    };

    // Unified Input Hub
    const keys = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      if (pausedRef.current || sim.ended) return;
      const code = e.code;
      const wasDown = keys.has(code);
      keys.add(code);

      if (
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'Space'
      ) {
        e.preventDefault();
      }

      if (!wasDown) {
        if (code === 'KeyF') {
          sim.flashlightOn = !sim.flashlightOn;
          soundEngine.playFlashlightToggle(sim.flashlightOn);
        } else if (code === 'KeyQ') {
          actionsRef.current.triggerBeer = true;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code);
    };

    const clearInputs = () => {
      keys.clear();
      actionsRef.current.holdInteractBtn = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      sim.mouseClientX = e.clientX;
      sim.mouseClientY = e.clientY;
      sim.mouseWorldActive = true;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInputs);
    document.addEventListener('visibilitychange', clearInputs);
    canvas.addEventListener('mousemove', onMouseMove);

    let viewW = 1280;
    let viewH = 720;
    let tileSize = 54;

    const clampCamera = (cx: number, cy: number) => {
      const worldW = cols * tileSize;
      const worldH = rows * tileSize;
      const marginX = 48;
      const marginTop = 88;
      const marginBottom = 88;

      let outX = cx;
      let outY = cy;

      if (worldW + marginX * 2 <= viewW) {
        outX = -(viewW - worldW) / 2;
      } else {
        outX = Math.max(-marginX, Math.min(worldW - viewW + marginX, cx));
      }

      if (worldH + marginTop + marginBottom <= viewH) {
        outY = -(viewH - worldH) / 2;
      } else {
        outY = Math.max(-marginTop, Math.min(worldH - viewH + marginBottom, cy));
      }

      return { x: outX, y: outY };
    };

    // Cached static architectural minimap canvas (redrawn only on state change)
    const mmCell = Math.min(6, Math.floor(196 / cols));
    const mmW = cols * mmCell;
    const mmH = rows * mmCell;
    const minimapCanvas = document.createElement('canvas');
    minimapCanvas.width = mmW;
    minimapCanvas.height = mmH;
    const minimapCtx = minimapCanvas.getContext('2d');
    let minimapDirty = true;

    // Cached static facility tilemap (floors, walls, P machinery, doors, stenciled room names)
    const worldCanvas = document.createElement('canvas');
    const worldCtx = worldCanvas.getContext('2d');
    let worldDirty = true;
    let lastPowerOffVisual = false;

    const rebuildMinimap = () => {
      if (!minimapCtx) return;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const ch = grid[y][x];
          const open = sim.openedTiles.has(`${x},${y}`);
          if (ch === '#') minimapCtx.fillStyle = '#334039';
          else if (ch === 'W') minimapCtx.fillStyle = '#38bdf8';
          else if (ch === 'P') minimapCtx.fillStyle = '#475569';
          else if (ch === 'D') minimapCtx.fillStyle = '#0ea5e9';
          else if (ch === 'K' && !sim.collectedKeys.has(`${x},${y}`))
            minimapCtx.fillStyle = '#facc15';
          else if (ch === 'L' && !open) minimapCtx.fillStyle = '#eab308';
          else if (ch === 'C' && !open) minimapCtx.fillStyle = '#f97316';
          else if (ch === 'V' && !open) minimapCtx.fillStyle = '#a78bfa';
          else if (ch === 'E') minimapCtx.fillStyle = '#22c55e';
          else if (ch === 'T' && !sim.hasDevice) minimapCtx.fillStyle = '#4ade80';
          else minimapCtx.fillStyle = '#151b18';
          minimapCtx.fillRect(x * mmCell, y * mmCell, mmCell, mmCell);
        }
      }
      minimapDirty = false;
    };

    const rebuildWorld = () => {
      if (!worldCtx) return;
      const wW = cols * tileSize;
      const wH = rows * tileSize;
      if (worldCanvas.width !== wW || worldCanvas.height !== wH) {
        worldCanvas.width = wW;
        worldCanvas.height = wH;
      }
      const offNow = sim.powerOffTimer > 0;
      lastPowerOffVisual = offNow;

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const ch = grid[y][x];
          const px = x * tileSize;
          const py = y * tileSize;
          const opened = sim.openedTiles.has(`${x},${y}`);

          worldCtx.fillStyle = (x + y) % 2 === 0 ? '#141917' : '#121715';
          worldCtx.fillRect(px, py, tileSize, tileSize);

          if (ch === '#') {
            worldCtx.fillStyle = '#252e29';
            worldCtx.fillRect(px, py, tileSize, tileSize);
            worldCtx.strokeStyle = '#334039';
            worldCtx.lineWidth = 1;
            worldCtx.strokeRect(px + 0.5, py + 0.5, tileSize - 1, tileSize - 1);
          } else if (ch === 'W') {
            worldCtx.fillStyle = '#1a3546';
            worldCtx.fillRect(px, py, tileSize, tileSize);
            worldCtx.strokeStyle = '#38bdf8';
            worldCtx.lineWidth = 2.5;
            worldCtx.strokeRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
            worldCtx.beginPath();
            worldCtx.moveTo(px + tileSize / 2, py + 2);
            worldCtx.lineTo(px + tileSize / 2, py + tileSize - 2);
            worldCtx.stroke();
          } else if (ch === 'P') {
            worldCtx.fillStyle = '#2c3631';
            worldCtx.fillRect(px + 3, py + 3, tileSize - 6, tileSize - 6);
            worldCtx.strokeStyle = '#4c5e54';
            worldCtx.lineWidth = 2;
            worldCtx.strokeRect(px + 3, py + 3, tileSize - 6, tileSize - 6);
            worldCtx.fillStyle = '#1b221e';
            worldCtx.fillRect(px + 8, py + 9, tileSize - 16, 6);
            worldCtx.fillRect(px + 8, py + 19, tileSize - 16, 6);
            worldCtx.fillStyle = (x + y) % 2 === 0 ? '#eab308' : '#4ade80';
            worldCtx.fillRect(px + tileSize - 14, py + tileSize - 14, 5, 5);
          } else if (ch === 'G') {
            worldCtx.strokeStyle = '#94a3b8';
            worldCtx.lineWidth = 1.5;
            worldCtx.beginPath();
            worldCtx.moveTo(px + 10, py + 14);
            worldCtx.lineTo(px + 22, py + 10);
            worldCtx.lineTo(px + 17, py + 24);
            worldCtx.closePath();
            worldCtx.moveTo(px + tileSize - 16, py + tileSize - 18);
            worldCtx.lineTo(px + tileSize - 7, py + tileSize - 11);
            worldCtx.lineTo(px + tileSize - 20, py + tileSize - 7);
            worldCtx.closePath();
            worldCtx.stroke();
          } else if (ch === 'D') {
            worldCtx.fillStyle = offNow ? '#1e293b' : '#163340';
            worldCtx.fillRect(px + 5, py + 5, tileSize - 10, tileSize - 10);
            worldCtx.strokeStyle = offNow ? '#64748b' : '#38bdf8';
            worldCtx.lineWidth = 2.2;
            worldCtx.strokeRect(px + 5, py + 5, tileSize - 10, tileSize - 10);
            worldCtx.fillStyle = offNow ? '#94a3b8' : '#38bdf8';
            worldCtx.font = `700 ${Math.max(10, Math.floor(tileSize * 0.24))}px JetBrains Mono, monospace`;
            worldCtx.textAlign = 'center';
            worldCtx.textBaseline = 'middle';
            worldCtx.fillText(offNow ? 'ОТКЛ' : 'ЩИТ', px + tileSize / 2, py + tileSize / 2);
          } else if (ch === 'L' && !opened) {
            worldCtx.fillStyle = '#5c4813';
            worldCtx.fillRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
            worldCtx.strokeStyle = '#eab308';
            worldCtx.lineWidth = 2;
            worldCtx.strokeRect(px + 3, py + 3, tileSize - 6, tileSize - 6);
            worldCtx.fillStyle = '#eab308';
            worldCtx.font = `700 ${Math.max(10, Math.floor(tileSize * 0.25))}px JetBrains Mono, monospace`;
            worldCtx.textAlign = 'center';
            worldCtx.textBaseline = 'middle';
            worldCtx.fillText('ЗАМ', px + tileSize / 2, py + tileSize / 2);
          } else if (ch === 'C' && !opened) {
            worldCtx.fillStyle = '#572811';
            worldCtx.fillRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
            worldCtx.strokeStyle = '#f97316';
            worldCtx.lineWidth = 2.5;
            worldCtx.beginPath();
            worldCtx.moveTo(px + 5, py + 5);
            worldCtx.lineTo(px + tileSize - 5, py + tileSize - 5);
            worldCtx.moveTo(px + tileSize - 5, py + 5);
            worldCtx.lineTo(px + 5, py + tileSize - 5);
            worldCtx.stroke();
          } else if (ch === 'V' && !opened) {
            worldCtx.fillStyle = '#2d2347';
            worldCtx.fillRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
            worldCtx.strokeStyle = '#a78bfa';
            worldCtx.lineWidth = 2;
            worldCtx.strokeRect(px + 4, py + 4, tileSize - 8, tileSize - 8);
            worldCtx.fillStyle = '#c4b5fd';
            worldCtx.font = `700 ${Math.max(9, Math.floor(tileSize * 0.24))}px JetBrains Mono, monospace`;
            worldCtx.textAlign = 'center';
            worldCtx.textBaseline = 'middle';
            worldCtx.fillText('ЛЮК', px + tileSize / 2, py + tileSize / 2);
          }
        }
      }

      // Stenciled Soviet Room Labels baked onto concrete floor
      worldCtx.fillStyle = 'rgba(236, 234, 225, 0.16)';
      worldCtx.font = '700 12px JetBrains Mono, monospace';
      worldCtx.textAlign = 'center';
      worldCtx.textBaseline = 'middle';
      for (const rm of facility.rooms) {
        worldCtx.fillText(rm.label, rm.x * tileSize, rm.y * tileSize);
      }

      worldDirty = false;
    };

    const updateLayout = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      viewW = Math.max(320, rect.width);
      viewH = Math.max(320, rect.height);
      canvas.width = Math.floor(viewW * dpr);
      canvas.height = Math.floor(viewH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Spacious readable tile size for large multi-room exploration with follow camera
      tileSize = viewW < 640 ? 44 : 56;
      worldDirty = true;
      const initialCam = clampCamera(
        sim.px * tileSize - viewW / 2,
        sim.py * tileSize - viewH / 2
      );
      sim.camX = initialCam.x;
      sim.camY = initialCam.y;
    };

    updateLayout();
    const ro = new ResizeObserver(updateLayout);
    ro.observe(canvas);

    const isSolidTile = (gx: number, gy: number): boolean => {
      if (gy < 0 || gy >= rows || gx < 0 || gx >= cols) return true;
      const ch = grid[gy][gx];
      if (ch === '#' || ch === 'W' || ch === 'P') return true;
      if ((ch === 'L' || ch === 'C' || ch === 'V') && !sim.openedTiles.has(`${gx},${gy}`)) {
        return true;
      }
      return false;
    };

    const isSolidForGuard = (gx: number, gy: number): boolean => {
      if (gy < 0 || gy >= rows || gx < 0 || gx >= cols) return true;
      const ch = grid[gy][gx];
      if (ch === '#' || ch === 'W' || ch === 'P') return true;
      if ((ch === 'L' || ch === 'C' || ch === 'V') && !sim.openedTiles.has(`${gx},${gy}`)) {
        return true;
      }
      return false;
    };

    const tryMoveEntity = (
      curX: number,
      curY: number,
      nx: number,
      ny: number,
      radius = 0.28,
      solidFn = isSolidTile
    ): { x: number; y: number } => {
      let rx = curX;
      let ry = curY;

      const checkX =
        !solidFn(Math.floor(nx - radius), Math.floor(ry - radius)) &&
        !solidFn(Math.floor(nx + radius), Math.floor(ry - radius)) &&
        !solidFn(Math.floor(nx - radius), Math.floor(ry + radius)) &&
        !solidFn(Math.floor(nx + radius), Math.floor(ry + radius));
      if (checkX) rx = nx;

      const checkY =
        !solidFn(Math.floor(rx - radius), Math.floor(ny - radius)) &&
        !solidFn(Math.floor(rx + radius), Math.floor(ny - radius)) &&
        !solidFn(Math.floor(rx - radius), Math.floor(ny + radius)) &&
        !solidFn(Math.floor(rx + radius), Math.floor(ny + radius));
      if (checkY) ry = ny;

      return { x: rx, y: ry };
    };

    const triggerBusted = (reason: string) => {
      if (sim.ended) return;
      sim.ended = true;
      soundEngine.playBustedSiren();
      callbacksRef.current.onBusted({
        outcome: 'busted',
        facilityName: facility.name,
        reason,
        lostCashRub: saveRef.current.moneyRub,
        lostToolsCount: Object.values(saveRef.current.ownedTools).reduce(
          (s, n) => s + (n ?? 0),
          0
        ),
        timeSurvivedSec: sim.elapsed,
        alertPeak: Math.max(sim.alertPeak, sim.alert, 100),
      });
    };

    const triggerEscapeEmpty = (reason: string) => {
      if (sim.ended) return;
      sim.ended = true;
      soundEngine.playDoorOpen();
      callbacksRef.current.onEscapedEmpty({
        outcome: 'escaped_empty',
        facilityName: facility.name,
        reason,
        lostCashRub: 0,
        lostToolsCount: 0,
        timeSurvivedSec: sim.elapsed,
        alertPeak: Math.max(sim.alertPeak, sim.alert),
      });
    };

    let lastTime = performance.now();
    let rafId = 0;

    const frame = (now: number) => {
      const rawDt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      if (actionsRef.current.toggleFlashlight) {
        actionsRef.current.toggleFlashlight = false;
        sim.flashlightOn = !sim.flashlightOn;
        soundEngine.playFlashlightToggle(sim.flashlightOn);
      }
      if (actionsRef.current.triggerBeer) {
        actionsRef.current.triggerBeer = false;
        if (!sim.ended && !pausedRef.current) {
          const drank = callbacksRef.current.onDrinkBeer();
          if (drank) {
            sim.beerTimer = 20;
            sim.alert = Math.max(0, sim.alert - 12);
            soundEngine.playBeerGulp();
            spawnParticles(sim.px, sim.py, 10, 0);
          }
        }
      }
      if (actionsRef.current.escapeEmptyNow) {
        actionsRef.current.escapeEmptyNow = false;
        triggerEscapeEmpty(
          'Ты вовремя бросил прибор и выскочил через запасной лаз. Снаряга и касса при тебе!'
        );
      }

      if (!pausedRef.current && !sim.ended) {
        sim.shakeTrauma = Math.max(0, sim.shakeTrauma - rawDt * 2.2);
        sim.alertSoundCooldown = Math.max(0, sim.alertSoundCooldown - rawDt);

        if (sim.hitstop > 0) {
          sim.hitstop = Math.max(0, sim.hitstop - rawDt);
        } else {
          const dt = rawDt;
          sim.elapsed += dt;
          sim.timeLeft = Math.max(0, sim.timeLeft - dt);
          if (sim.beerTimer > 0) sim.beerTimer = Math.max(0, sim.beerTimer - dt);
          if (sim.powerOffTimer > 0) sim.powerOffTimer = Math.max(0, sim.powerOffTimer - dt);

          const mods = computePlayerModifiers(saveRef.current, sim.beerTimer > 0);

          if (sim.timeLeft <= 0) {
            triggerBusted(
              'Смена охраны на проходной закончилась — объект перекрыли со всех сторон.'
            );
          }

          if (sim.crisisActive) {
            sim.crisisCountdown -= dt;
            if (sim.crisisCountdown <= 0) {
              triggerBusted(
                sim.crisisReason ||
                  'Охрана ЧОП перекрыла выход и скрутила тебя на месте. Снаряжение и касса изъяты.'
              );
            }
          }

          // Player movement
          let mx = 0;
          let my = 0;
          if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
          if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
          if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
          if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;

          const moving = mx !== 0 || my !== 0;
          const sprinting = moving && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
          const baseSpeed = sim.hasDevice ? 2.25 * mods.haulSpeedMultiplier : 3.05;
          const speed = sprinting ? baseSpeed * 1.48 : baseSpeed;

          if (moving) {
            const len = Math.hypot(mx, my);
            mx /= len;
            my /= len;
            const beerWobble =
              sim.beerTimer > 0 ? Math.sin(sim.elapsed * 7) * 0.1 : 0;
            const moved = tryMoveEntity(
              sim.px,
              sim.py,
              sim.px + (mx + beerWobble) * speed * dt,
              sim.py + my * speed * dt
            );
            const distMoved = Math.hypot(moved.x - sim.px, moved.y - sim.py);
            sim.px = moved.x;
            sim.py = moved.y;
            sim.stepDistAccum += distMoved;

            if (!sim.mouseWorldActive) {
              sim.facing = Math.atan2(my, mx);
            }

            const stepInterval = sprinting ? 0.56 : 0.84;
            if (sim.stepDistAccum >= stepInterval) {
              sim.stepDistAccum = 0;
              const tile = grid[Math.floor(sim.py)]?.[Math.floor(sim.px)];
              const onGlass = tile === 'G';
              soundEngine.playFootstep(onGlass);

              const baseNoise = onGlass
                ? 4.6
                : sprinting
                  ? 3.6
                  : sim.hasDevice
                    ? 1.9
                    : 1.25;
              const finalRadius = baseNoise * mods.noiseMultiplier;
              if (onGlass || sprinting || finalRadius > 1.35) {
                emitNoise(
                  sim.px,
                  sim.py,
                  finalRadius,
                  onGlass ? '#ef4444' : sprinting ? '#f59e0b' : '#94a3b8'
                );
              }
              if (onGlass) {
                sim.alert = Math.min(100, sim.alert + 11 * mods.noiseMultiplier);
                sim.shakeTrauma = Math.min(1, sim.shakeTrauma + 0.35);
                spawnParticles(sim.px, sim.py, 7, 2);
              }
            }
          }

          // Smooth damped camera tracking player + gentle lookahead
          const lookAheadX = Math.cos(sim.facing) * (tileSize * 0.85);
          const lookAheadY = Math.sin(sim.facing) * (tileSize * 0.85);
          const targetCam = clampCamera(
            sim.px * tileSize - viewW / 2 + lookAheadX,
            sim.py * tileSize - viewH / 2 + lookAheadY
          );
          const damp = 1 - Math.exp(-7.5 * dt);
          sim.camX += (targetCam.x - sim.camX) * damp;
          sim.camY += (targetCam.y - sim.camY) * damp;

          // Update flashlight aim using live world camera coordinates
          if (sim.mouseWorldActive) {
            const rect = canvas.getBoundingClientRect();
            const worldMouseX = (sim.mouseClientX - rect.left + sim.camX) / tileSize;
            const worldMouseY = (sim.mouseClientY - rect.top + sim.camY) / tileSize;
            sim.facing = Math.atan2(worldMouseY - sim.py, worldMouseX - sim.px);
          }

          // Auto-pickup master key K when stepping directly on it
          const ptx = Math.floor(sim.px);
          const pty = Math.floor(sim.py);
          const underTile = grid[pty]?.[ptx];
          if (underTile === 'K' && !sim.collectedKeys.has(`${ptx},${pty}`)) {
            sim.collectedKeys.add(`${ptx},${pty}`);
            sim.hasLevelKey = true;
            minimapDirty = true;
            soundEngine.playCashPayout();
            spawnParticles(ptx + 0.5, pty + 0.5, 14, 0);
          }

          // Check nearby interactables (T, D, K, L, C, V)
          sim.interactTarget = null;
          if (!sim.hasDevice && Math.hypot(sim.px - targetX, sim.py - targetY) < 1.25) {
            sim.interactTarget = {
              tx: Math.floor(targetX),
              ty: Math.floor(targetY),
              kind: 'T',
              label: `Упаковать ${device.code} [E]`,
              duration: facility.extractionTimeSec / mods.haulSpeedMultiplier,
            };
          } else {
            const dirs = [
              [0, 0],
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ];
            for (const [dx, dy] of dirs) {
              const nx = ptx + dx;
              const ny = pty + dy;
              if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) continue;
              const ch = grid[ny][nx];
              const keyStr = `${nx},${ny}`;
              const dist = Math.hypot(nx + 0.5 - sim.px, ny + 0.5 - sim.py);
              if (dist >= 1.4) continue;

              if (ch === 'D' && sim.powerOffTimer <= 1) {
                sim.interactTarget = {
                  tx: nx,
                  ty: ny,
                  kind: 'D',
                  label: 'Вырубить рубильник датчиков [E]',
                  duration: 0.75,
                };
                break;
              }
              if (ch === 'K' && !sim.collectedKeys.has(keyStr)) {
                sim.interactTarget = {
                  tx: nx,
                  ty: ny,
                  kind: 'K',
                  label: 'Взять ключ завхоза [E]',
                  duration: 0.25,
                };
                break;
              }
              if ((ch === 'L' || ch === 'C' || ch === 'V') && !sim.openedTiles.has(keyStr)) {
                if (ch === 'L') {
                  const fastKey = mods.hasInstantKeys || sim.hasLevelKey;
                  sim.interactTarget = {
                    tx: nx,
                    ty: ny,
                    kind: 'L',
                    label: fastKey
                      ? 'Открыть дверь ключом [E]'
                      : 'Взломать замок [E]',
                    duration: fastKey ? 0.42 : 2.3 / mods.lockpickSpeedMultiplier,
                  };
                } else if (ch === 'C') {
                  sim.interactTarget = {
                    tx: nx,
                    ty: ny,
                    kind: 'C',
                    label: mods.canCutChainFast
                      ? 'Перекусить цепь болторезом [E]'
                      : 'Спилить цепь вручную (шумно!) [E]',
                    duration: 2.7 / mods.boltCutterSpeedMultiplier,
                  };
                } else if (ch === 'V') {
                  sim.interactTarget = {
                    tx: nx,
                    ty: ny,
                    kind: 'V',
                    label: mods.canBypassVent
                      ? 'Открутить вентлюк разводником [E]'
                      : 'Техлюк (нужен разводник)',
                    duration: 0.9,
                    blockedMsg: mods.canBypassVent
                      ? undefined
                      : 'Секретный техлюк: купи «Разводник» на барахолке, чтобы резать путь!',
                  };
                }
                break;
              }
            }
          }

          // Process holding E / Space / HUD button
          const holdingInteract =
            keys.has('KeyE') || keys.has('Space') || actionsRef.current.holdInteractBtn;
          if (sim.interactTarget && holdingInteract && !sim.interactTarget.blockedMsg) {
            const prevStep = Math.floor(sim.interactProgress * 4);
            sim.interactProgress += dt / Math.max(0.2, sim.interactTarget.duration);
            const nextStep = Math.floor(sim.interactProgress * 4);
            if (nextStep > prevStep) {
              soundEngine.playLockTick();
              spawnParticles(
                sim.interactTarget.tx + 0.5,
                sim.interactTarget.ty + 0.5,
                4,
                0
              );
              if (sim.interactTarget.kind === 'C' && !mods.canCutChainFast) {
                emitNoise(sim.px, sim.py, 5.0 * mods.noiseMultiplier, '#ef4444');
              }
            }
            if (sim.interactProgress >= 1) {
              const tKind = sim.interactTarget.kind;
              if (tKind === 'T') {
                sim.hasDevice = true;
                minimapDirty = true;
                soundEngine.playCashPayout();
                sim.hitstop = 0.05;
                spawnParticles(targetX, targetY, 18, 1);
              } else if (tKind === 'D') {
                sim.powerOffTimer = 16;
                soundEngine.playDoorOpen();
                sim.hitstop = 0.04;
                sim.shakeTrauma = Math.min(1, sim.shakeTrauma + 0.25);
                spawnParticles(
                  sim.interactTarget.tx + 0.5,
                  sim.interactTarget.ty + 0.5,
                  14,
                  3
                );
                emitNoise(sim.px, sim.py, 3.2 * mods.noiseMultiplier, '#38bdf8');
              } else if (tKind === 'K') {
                sim.collectedKeys.add(
                  `${sim.interactTarget.tx},${sim.interactTarget.ty}`
                );
                sim.hasLevelKey = true;
                minimapDirty = true;
                soundEngine.playCashPayout();
                spawnParticles(
                  sim.interactTarget.tx + 0.5,
                  sim.interactTarget.ty + 0.5,
                  12,
                  0
                );
              } else {
                sim.openedTiles.add(`${sim.interactTarget.tx},${sim.interactTarget.ty}`);
                minimapDirty = true;
                worldDirty = true;
                soundEngine.playDoorOpen();
                sim.hitstop = 0.04;
                spawnParticles(
                  sim.interactTarget.tx + 0.5,
                  sim.interactTarget.ty + 0.5,
                  10,
                  0
                );
              }
              sim.interactProgress = 0;
            }
          } else {
            sim.interactProgress = Math.max(0, sim.interactProgress - dt * 1.8);
          }

          // Extraction win
          if (sim.hasDevice && Math.hypot(sim.px - exitX, sim.py - exitY) < 0.98) {
            sim.ended = true;
            soundEngine.playCashPayout();
            callbacksRef.current.onExtracted();
          }

          // Window Flashlight Запал check
          let alertGainPerSec = 0;
          let activeWarning = '';
          const winCheck = computeWindowFlashlightAlertRate(
            grid,
            sim.px,
            sim.py,
            sim.facing,
            sim.flashlightOn,
            mods.windowAlertMultiplier
          );
          sim.windowGlareTile = winCheck.windowTile;
          if (winCheck.alertPerSec > 0) {
            alertGainPerSec += winCheck.alertPerSec;
            activeWarning = 'СВЕТИШЬ В ОКНО! ВЫКЛЮЧИ ФОНАРЬ [F]!';
          }

          // Update Guards & Cameras
          let spottedByGuard = false;
          const camerasPoweredDown = sim.powerOffTimer > 0;

          for (const g of guards) {
            g.alertCueTimer = Math.max(0, g.alertCueTimer - dt);

            if (g.archetype === 'camera') {
              if (!camerasPoweredDown) {
                const arc = g.sweepArc ?? 1.0;
                const spd = g.sweepSpeed ?? 0.9;
                g.angle = g.baseAngle + Math.sin(sim.elapsed * spd) * arc;
              }
            } else {
              let tx = g.x;
              let ty = g.y;
              if (g.state === 'investigate' || g.state === 'chase') {
                tx = g.investigateX;
                ty = g.investigateY;
                g.investigateTimer -= dt;
                if (g.investigateTimer <= 0 || Math.hypot(tx - g.x, ty - g.y) < 0.35) {
                  g.state = 'patrol';
                }
              } else if (g.waypoints.length > 0) {
                const wp = g.waypoints[g.waypointIdx % g.waypoints.length];
                tx = wp.x;
                ty = wp.y;
                if (Math.hypot(tx - g.x, ty - g.y) < 0.3) {
                  g.waypointIdx = (g.waypointIdx + 1) % g.waypoints.length;
                }
              }

              const dx = tx - g.x;
              const dy = ty - g.y;
              const d = Math.hypot(dx, dy);
              if (d > 0.08) {
                const moveSpd =
                  g.state === 'chase'
                    ? g.speed * 1.25
                    : g.state === 'investigate'
                      ? g.speed * 1.12
                      : g.speed;
                const stepX = g.x + (dx / d) * moveSpd * dt;
                const stepY = g.y + (dy / d) * moveSpd * dt;
                const movedG = tryMoveEntity(
                  g.x,
                  g.y,
                  stepX,
                  stepY,
                  0.24,
                  isSolidForGuard
                );
                const movedDist = Math.hypot(movedG.x - g.x, movedG.y - g.y);
                g.x = movedG.x;
                g.y = movedG.y;
                if (movedDist < 0.002 && g.state !== 'patrol') {
                  g.state = 'patrol';
                }
                const targetAngle = Math.atan2(dy, dx);
                let diff = targetAngle - g.angle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                g.angle += diff * Math.min(1, dt * 6.5);
              }
            }

            if (g.archetype === 'camera' && camerasPoweredDown) continue;

            const effectiveRange = sim.flashlightOn ? g.visionRange * 1.2 : g.visionRange;
            const sees = isPointInVisionCone(
              g.x,
              g.y,
              g.angle,
              effectiveRange,
              g.visionHalfAngle,
              sim.px,
              sim.py,
              grid,
              sim.openedTiles
            );

            if (sees) {
              spottedByGuard = true;
              g.alertCueTimer = 0.7;
              alertGainPerSec += g.archetype === 'camera' ? 44 : 54;
              activeWarning =
                g.archetype === 'camera'
                  ? 'ПОПАЛ В ДАТЧИК ОБЪЁМА! (ВЫРУБИ ЩИТОК)'
                  : 'ТЕБЯ ВИДИТ ОХРАНА! ПРЯЧЬСЯ ЗА СТАНКИ!';

              if (g.archetype !== 'camera') {
                g.state = sim.alert > 45 ? 'chase' : 'investigate';
                g.investigateX = sim.px;
                g.investigateY = sim.py;
                g.investigateTimer = 5.0;
              }

              if (g.archetype !== 'camera' && Math.hypot(g.x - sim.px, g.y - sim.py) < 0.74) {
                triggerBusted(
                  'Сторож ЧОП схватил тебя прямо в коридоре. Весь инструмент и касса изъяты!'
                );
              }
            }
          }

          if (alertGainPerSec > 0) {
            sim.alert = Math.min(100, sim.alert + alertGainPerSec * dt);
            sim.alertPeak = Math.max(sim.alertPeak, sim.alert);
            if (sim.alertSoundCooldown <= 0) {
              soundEngine.playAlertPulse();
              sim.alertSoundCooldown = 0.45;
            }
          } else if (!sim.crisisActive) {
            sim.alert = Math.max(0, sim.alert - 10.5 * dt);
          }

          sim.warningText =
            activeWarning ||
            sim.interactTarget?.blockedMsg ||
            (sim.hasDevice ? 'Прибор у тебя! Тащи его к зелёному выходу (ЛАЗ)!' : '');

          if (sim.alert >= 100 && !sim.crisisActive && !sim.ended) {
            sim.crisisActive = true;
            sim.crisisCountdown = 4.5;
            sim.crisisReason = spottedByGuard
              ? 'Охрана подняла тревогу и окружила объект!'
              : 'Кто-то с улицы заметил свет в окнах и вызвал ЧОП!';
            sim.shakeTrauma = 0.9;
            soundEngine.playBustedSiren();
          }

          for (let i = rings.length - 1; i >= 0; i--) {
            const r = rings[i];
            r.radius += dt * 5.2;
            r.alpha = Math.max(0, 1 - r.radius / r.maxRadius);
            if (r.radius >= r.maxRadius) rings.splice(i, 1);
          }

          for (let i = 0; i < POOL_SIZE; i++) {
            if (!partActive[i]) continue;
            partLife[i] -= dt;
            if (partLife[i] <= 0) {
              partActive[i] = 0;
              continue;
            }
            partX[i] += partVx[i] * dt;
            partY[i] += partVy[i] * dt;
            partVx[i] *= 0.92;
            partVy[i] *= 0.92;
          }

          if (alertBarRef.current) {
            alertBarRef.current.style.transform = `scaleX(${Math.max(0, Math.min(1, sim.alert / 100))})`;
          }

          sim.hudSyncAccum += dt;
          if (sim.hudSyncAccum >= 0.16) {
            sim.hudSyncAccum = 0;
            const nextHud: HudSnapshot = {
              alert: Math.round(sim.alert),
              timeLeft: Math.ceil(sim.timeLeft),
              flashlightOn: sim.flashlightOn,
              hasDevice: sim.hasDevice,
              hasLevelKey: sim.hasLevelKey,
              powerOffTimer: Math.ceil(sim.powerOffTimer),
              beerTimer: Math.ceil(sim.beerTimer),
              warningText: sim.warningText,
              interactLabel: sim.interactTarget?.label ?? null,
              interactProgress: Math.round(sim.interactProgress * 20) / 20,
              crisisActive: sim.crisisActive,
              crisisCountdown: Math.max(0, Math.round(sim.crisisCountdown * 10) / 10),
              crisisReason: sim.crisisReason,
            };
            setHud((prev) =>
              prev.alert === nextHud.alert &&
              prev.timeLeft === nextHud.timeLeft &&
              prev.flashlightOn === nextHud.flashlightOn &&
              prev.hasDevice === nextHud.hasDevice &&
              prev.hasLevelKey === nextHud.hasLevelKey &&
              prev.powerOffTimer === nextHud.powerOffTimer &&
              prev.beerTimer === nextHud.beerTimer &&
              prev.warningText === nextHud.warningText &&
              prev.interactLabel === nextHud.interactLabel &&
              prev.interactProgress === nextHud.interactProgress &&
              prev.crisisActive === nextHud.crisisActive &&
              prev.crisisCountdown === nextHud.crisisCountdown
                ? prev
                : nextHud
            );
          }
        }
      }

      // === RENDER CANVAS 2D SCENE WITH SMOOTH FOLLOW CAMERA ===
      ctx.save();
      ctx.fillStyle = '#090c0b';
      ctx.fillRect(0, 0, viewW, viewH);

      let shakeX = 0;
      let shakeY = 0;
      if (sim.shakeTrauma > 0) {
        const mag = sim.shakeTrauma * sim.shakeTrauma * 9;
        shakeX = (Math.random() * 2 - 1) * mag;
        shakeY = (Math.random() * 2 - 1) * mag;
      }

      const ox = -Math.round(sim.camX) + shakeX;
      const oy = -Math.round(sim.camY) + shakeY;

      if (worldDirty || (sim.powerOffTimer > 0) !== lastPowerOffVisual) {
        rebuildWorld();
      }
      ctx.drawImage(worldCanvas, ox, oy);

      // Dynamic tile overlays only (glaring window, bobbing K key, pulsing E exit)
      if (sim.windowGlareTile) {
        const px = ox + sim.windowGlareTile.x * tileSize;
        const py = oy + sim.windowGlareTile.y * tileSize;
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(px, py, tileSize, tileSize);
        ctx.strokeStyle = '#fecaca';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
      }

      // Draw pulsing exit LАЗ
      {
        const ex = ox + Math.floor(exitX) * tileSize;
        const ey = oy + Math.floor(exitY) * tileSize;
        const pulse = sim.hasDevice ? 0.58 + Math.sin(sim.elapsed * 6) * 0.25 : 0.34;
        ctx.fillStyle = `rgba(34, 197, 94, ${pulse})`;
        ctx.fillRect(ex + 2, ey + 2, tileSize - 4, tileSize - 4);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.strokeRect(ex + 3, ey + 3, tileSize - 6, tileSize - 6);
        ctx.fillStyle = '#ecfdf5';
        ctx.font = `700 ${Math.max(10, Math.floor(tileSize * 0.26))}px JetBrains Mono, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ЛАЗ', ex + tileSize / 2, ey + tileSize / 2);
      }

      // Draw any uncollected K master keys
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (grid[y][x] === 'K' && !sim.collectedKeys.has(`${x},${y}`)) {
            const px = ox + x * tileSize;
            const py = oy + y * tileSize;
            const bob = Math.sin(sim.elapsed * 4) * 2.5;
            ctx.strokeStyle = 'rgba(234, 179, 8, 0.55)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px + tileSize / 2, py + tileSize / 2, tileSize * 0.34, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#facc15';
            ctx.font = `700 ${Math.max(10, Math.floor(tileSize * 0.24))}px JetBrains Mono, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('КЛЧ', px + tileSize / 2, py + tileSize / 2 + bob);
          }
        }
      }

      // Target Soviet Instrument
      if (!sim.hasDevice) {
        const tx = ox + targetX * tileSize;
        const ty = oy + targetY * tileSize;
        const pulseR = tileSize * (0.44 + Math.sin(sim.elapsed * 4.5) * 0.06);

        ctx.strokeStyle = 'rgba(74, 222, 128, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tx, ty, pulseR, 0, Math.PI * 2);
        ctx.stroke();

        const boxW = tileSize * 0.68;
        const boxH = tileSize * 0.48;
        ctx.fillStyle = '#334139';
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.fillRect(tx - boxW / 2, ty - boxH / 2, boxW, boxH);
        ctx.strokeRect(tx - boxW / 2, ty - boxH / 2, boxW, boxH);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(tx - boxW * 0.34, ty - boxH * 0.28, boxW * 0.36, boxH * 0.56);
      }

      // Wall & Machinery-occluded Raycasted Light Cone helper
      const drawOccludedCone = (
        srcX: number,
        srcY: number,
        centerAngle: number,
        halfAngle: number,
        maxDist: number,
        fillStyle: string | CanvasGradient
      ) => {
        const rays = 16;
        const stepSize = 0.18;
        ctx.fillStyle = fillStyle;
        ctx.beginPath();
        ctx.moveTo(ox + srcX * tileSize, oy + srcY * tileSize);
        for (let i = 0; i <= rays; i++) {
          const ang = centerAngle - halfAngle + (i / rays) * (halfAngle * 2);
          const cosA = Math.cos(ang);
          const sinA = Math.sin(ang);
          let hitDist = maxDist;
          for (let d = stepSize; d <= maxDist; d += stepSize) {
            const gx = Math.floor(srcX + cosA * d);
            const gy = Math.floor(srcY + sinA * d);
            if (isSolidTile(gx, gy)) {
              hitDist = d;
              break;
            }
          }
          ctx.lineTo(
            ox + (srcX + cosA * hitDist) * tileSize,
            oy + (srcY + sinA * hitDist) * tileSize
          );
        }
        ctx.closePath();
        ctx.fill();
      };

      const camerasPoweredDown = sim.powerOffTimer > 0;

      // Guard & Camera cones + sprites
      for (const g of guards) {
        const gx = ox + g.x * tileSize;
        const gy = oy + g.y * tileSize;

        if (!(g.archetype === 'camera' && camerasPoweredDown)) {
          const coneColor =
            g.alertCueTimer > 0
              ? 'rgba(239, 68, 68, 0.36)'
              : g.archetype === 'camera'
                ? 'rgba(249, 115, 22, 0.25)'
                : g.archetype === 'investigator'
                  ? 'rgba(248, 113, 113, 0.22)'
                  : 'rgba(250, 204, 21, 0.22)';
          drawOccludedCone(g.x, g.y, g.angle, g.visionHalfAngle, g.visionRange, coneColor);
        }

        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(g.angle);
        if (g.archetype === 'camera') {
          ctx.fillStyle = camerasPoweredDown ? '#0f172a' : '#1e293b';
          ctx.strokeStyle = camerasPoweredDown ? '#475569' : '#f97316';
          ctx.lineWidth = 2;
          ctx.fillRect(-9, -7, 18, 14);
          ctx.strokeRect(-9, -7, 18, 14);
          ctx.fillStyle = camerasPoweredDown ? '#334155' : '#ef4444';
          ctx.beginPath();
          ctx.arc(8, 0, 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = g.archetype === 'investigator' ? '#881c1c' : '#1e3a5f';
          ctx.strokeStyle = '#090b0a';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(0, 0, tileSize * 0.28, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#eab308';
          ctx.fillRect(tileSize * 0.14, -4, 6, 8);
        }
        ctx.restore();

        if (g.alertCueTimer > 0 || g.state === 'investigate' || g.state === 'chase') {
          ctx.fillStyle =
            g.state === 'chase' || g.alertCueTimer > 0 ? '#ef4444' : '#facc15';
          ctx.font = '800 16px Unbounded, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(
            g.state === 'chase' || g.alertCueTimer > 0 ? '!' : '?',
            gx,
            gy - tileSize * 0.48
          );
        }
      }

      // Player Flashlight Cone
      const pScreenX = ox + sim.px * tileSize;
      const pScreenY = oy + sim.py * tileSize;
      if (sim.flashlightOn) {
        const hasRedFilter = getToolCount(saveRef.current, 'red_filter') > 0;
        const beamR = tileSize * 4.8;
        const grad = ctx.createRadialGradient(pScreenX, pScreenY, 6, pScreenX, pScreenY, beamR);
        if (hasRedFilter) {
          grad.addColorStop(0, 'rgba(239, 68, 68, 0.36)');
          grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
        } else {
          grad.addColorStop(0, 'rgba(254, 249, 195, 0.45)');
          grad.addColorStop(1, 'rgba(254, 249, 195, 0)');
        }
        drawOccludedCone(sim.px, sim.py, sim.facing, 0.33, 4.8, grad);
      }

      // Noise Rings
      for (const r of rings) {
        ctx.strokeStyle = r.color;
        ctx.globalAlpha = r.alpha * 0.78;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ox + r.x * tileSize, oy + r.y * tileSize, r.radius * tileSize, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Player Climber Sprite
      ctx.save();
      ctx.translate(pScreenX, pScreenY);
      ctx.rotate(sim.facing);
      if (sim.hasDevice) {
        ctx.fillStyle = '#15803d';
        ctx.strokeStyle = '#86efac';
        ctx.lineWidth = 1.8;
        ctx.fillRect(-tileSize * 0.38, -tileSize * 0.24, tileSize * 0.26, tileSize * 0.48);
        ctx.strokeRect(-tileSize * 0.38, -tileSize * 0.24, tileSize * 0.26, tileSize * 0.48);
      }
      ctx.fillStyle = '#eceae1';
      ctx.strokeStyle = '#0f1210';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, tileSize * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = sim.flashlightOn ? '#facc15' : '#4ade80';
      ctx.beginPath();
      ctx.arc(tileSize * 0.18, 0, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Diegetic interaction progress ring
      if (sim.interactTarget && sim.interactProgress > 0) {
        const ix = ox + (sim.interactTarget.tx + 0.5) * tileSize;
        const iy = oy + (sim.interactTarget.ty + 0.5) * tileSize;
        ctx.strokeStyle = '#0a0d0c';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(ix, iy, tileSize * 0.52, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(
          ix,
          iy,
          tileSize * 0.52,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * sim.interactProgress
        );
        ctx.stroke();
      }

      // Pooled Particles
      for (let i = 0; i < POOL_SIZE; i++) {
        if (!partActive[i]) continue;
        ctx.fillStyle =
          partHue[i] === 1
            ? '#4ade80'
            : partHue[i] === 2
              ? '#ef4444'
              : partHue[i] === 3
                ? '#38bdf8'
                : '#facc15';
        ctx.globalAlpha = Math.min(1, partLife[i] * 2.5);
        ctx.fillRect(ox + partX[i] * tileSize - 2, oy + partY[i] * tileSize - 2, 4, 4);
      }
      ctx.globalAlpha = 1;

      // Critical alert peripheral red border glow
      if (sim.alert > 60) {
        const vigAlpha = ((sim.alert - 60) / 40) * 0.42;
        ctx.strokeStyle = `rgba(239, 68, 68, ${vigAlpha})`;
        ctx.lineWidth = 24;
        ctx.strokeRect(0, 0, viewW, viewH);
      }

      // === ARCHITECTURAL BLUEPRINT MINIMAP (Bottom-Right Corner above bottom bar) ===
      if (viewW >= 720) {
        if (minimapDirty) rebuildMinimap();
        const mmX = viewW - mmW - 22;
        const mmY = viewH - mmH - 76;

        ctx.fillStyle = 'rgba(12, 16, 14, 0.9)';
        ctx.fillRect(mmX - 6, mmY - 6, mmW + 12, mmH + 12);
        ctx.strokeStyle = '#303b35';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mmX - 6, mmY - 6, mmW + 12, mmH + 12);

        ctx.drawImage(minimapCanvas, mmX, mmY);

        // Guard blips on minimap when within 8.5 tiles or alerted
        for (const g of guards) {
          const distToPlayer = Math.hypot(g.x - sim.px, g.y - sim.py);
          if (distToPlayer <= 8.5 || g.state !== 'patrol') {
            ctx.fillStyle = g.archetype === 'camera' ? '#f97316' : '#ef4444';
            ctx.fillRect(
              mmX + g.x * mmCell - 2,
              mmY + g.y * mmCell - 2,
              4,
              4
            );
          }
        }

        // Player dot on minimap
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(mmX + sim.px * mmCell, mmY + sim.py * mmCell, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInputs);
      document.removeEventListener('visibilitychange', clearInputs);
      canvas.removeEventListener('mousemove', onMouseMove);
    };
  }, [facility, device.code]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#090c0b] select-none">
      <canvas
        ref={canvasRef}
        data-testid="stealth-raid-canvas"
        className="w-full h-full block"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_center,transparent_48%,rgba(4,7,6,0.52)_100%)]"
      />

      {/* Pointer-pass-through Perimeter HUD */}
      <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
        {/* Top Row: Left Alert/Objective · Center Safe Warning · Right Timer & Utility */}
        <div className="flex items-start justify-between gap-4">
          <div className="pointer-events-auto bg-[#111513]/92 border border-[#2c3530] rounded-xl px-4 py-2.5 shadow-xl min-w-[245px] sm:min-w-[300px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-mono text-[#9ca59e]">
                ЗАПАЛ · {facility.name}
              </span>
              <span
                data-testid="hud-alert-value"
                className={`font-mono-num text-base font-bold ${
                  hud.alert >= 70
                    ? 'text-[#ef4444]'
                    : hud.alert >= 35
                      ? 'text-[#eab308]'
                      : 'text-[#4ade80]'
                }`}
              >
                {hud.alert}%
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full rounded-full bg-[#1e2521] overflow-hidden">
              <div
                ref={alertBarRef}
                className="h-full w-full origin-left transition-colors duration-150"
                style={{
                  transform: `scaleX(${hud.alert / 100})`,
                  backgroundColor:
                    hud.alert >= 70 ? '#ef4444' : hud.alert >= 35 ? '#eab308' : '#4ade80',
                }}
              />
            </div>
            <div className="mt-1.5 text-xs font-mono text-[#cfd5d0] flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span>
                {hud.hasDevice
                  ? `Несёшь ${device.code} -> к ЛАЗу`
                  : `Цель: вынести ${device.code}`}
              </span>
              {hud.hasLevelKey && (
                <span className="text-[#facc15] inline-flex items-center gap-1">
                  <KeyRound className="w-3 h-3" /> Ключ
                </span>
              )}
              {hud.powerOffTimer > 0 && (
                <span className="text-[#38bdf8] inline-flex items-center gap-1">
                  <ZapOff className="w-3 h-3" /> Датчики {Math.ceil(hud.powerOffTimer)}с
                </span>
              )}
              {hud.beerTimer > 0 && (
                <span className="text-[#eab308]">Пиво {Math.ceil(hud.beerTimer)}с</span>
              )}
            </div>
          </div>

          {/* Center Top Safe Warning Banner */}
          <div className="hidden md:flex flex-1 justify-center px-2">
            {hud.warningText && !hud.crisisActive && (
              <div className="px-4 py-2 rounded-lg bg-[#1c1010]/95 border border-[#ef4444]/85 text-xs sm:text-sm font-mono font-bold text-[#fca5a5] shadow-lg text-center">
                {hud.warningText}
              </div>
            )}
          </div>

          <div className="pointer-events-auto flex items-center gap-2.5">
            <div className="bg-[#111513]/92 border border-[#2c3530] rounded-xl px-3.5 py-2 text-right">
              <div className="text-[10px] font-mono text-[#8d948e] leading-none">
                ДО СМЕНЫ ЧОП
              </div>
              <div className="font-mono-num text-lg font-bold text-[#eceae1] leading-tight">
                {Math.floor(hud.timeLeft / 60)}:
                {String(hud.timeLeft % 60).padStart(2, '0')}
              </div>
            </div>

            <button
              type="button"
              tabIndex={-1}
              aria-label={save.muted ? 'Включить звук' : 'Выключить звук'}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="w-10 h-10 rounded-lg bg-[#141816]/92 hover:bg-[#222925] border border-[#313a35] flex items-center justify-center text-[#eceae1]"
            >
              {save.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Пауза"
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              className="w-10 h-10 rounded-lg bg-[#141816]/92 hover:bg-[#222925] border border-[#313a35] flex items-center justify-center text-[#eceae1]"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile-only top-edge warning */}
        <div className="md:hidden flex justify-center -mt-auto">
          {hud.warningText && !hud.crisisActive && (
            <div className="px-3 py-1 rounded-lg bg-[#1c1010]/95 border border-[#ef4444]/85 text-[11px] font-mono font-bold text-[#fca5a5]">
              {hud.warningText}
            </div>
          )}
        </div>

        {/* Bottom Perimeter Controls Strip */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                actionsRef.current.toggleFlashlight = true;
              }}
              className={`px-3.5 py-2.5 rounded-lg border text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors ${
                hud.flashlightOn
                  ? 'bg-[#eab308] border-[#facc15] text-[#0f1110] font-bold'
                  : 'bg-[#141816]/92 border-[#303a34] text-[#cfd5d0] hover:text-[#eceae1]'
              }`}
            >
              {hud.flashlightOn ? (
                <Flashlight className="w-4 h-4" />
              ) : (
                <FlashlightOff className="w-4 h-4" />
              )}
              <span>Фонарь [F]</span>
            </button>

            {hud.interactLabel && (
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={() => {
                  actionsRef.current.holdInteractBtn = true;
                }}
                onMouseUp={() => {
                  actionsRef.current.holdInteractBtn = false;
                }}
                onMouseLeave={() => {
                  actionsRef.current.holdInteractBtn = false;
                }}
                onTouchStart={() => {
                  actionsRef.current.holdInteractBtn = true;
                }}
                onTouchEnd={() => {
                  actionsRef.current.holdInteractBtn = false;
                }}
                className="px-4 py-2.5 rounded-lg bg-[#4ade80] hover:bg-[#86efac] text-[#0c140e] font-display font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg"
              >
                <Hand className="w-4 h-4" />
                <span>{hud.interactLabel}</span>
              </button>
            )}

            <button
              type="button"
              tabIndex={-1}
              disabled={beerCount <= 0}
              onClick={(e) => {
                e.currentTarget.blur();
                actionsRef.current.triggerBeer = true;
              }}
              className={`px-3.5 py-2.5 rounded-lg border text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors ${
                beerCount > 0
                  ? 'bg-[#141c17]/92 hover:bg-[#1e2a22] border-[#334b3b] text-[#eceae1]'
                  : 'bg-[#121513]/85 border-[#252c28] text-[#616a64] cursor-not-allowed'
              }`}
            >
              <ToolIconSvg id="beer" className="w-4 h-4" />
              <span>Пиво [Q] ({beerCount})</span>
            </button>
          </div>

          <div className="pointer-events-auto flex items-center gap-3">
            <span className="hidden lg:inline text-xs font-mono text-[#88918a]">
              Прячься за станки · ЩИТ гасит датчики · Не свети в синие окна!
            </span>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                actionsRef.current.escapeEmptyNow = true;
              }}
              className="px-3.5 py-2.5 rounded-lg bg-[#1b1414]/92 hover:bg-[#2c1919] border border-[#522929] text-[#fca5a5] text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Свалить пустым</span>
            </button>
          </div>
        </div>
      </div>

      {/* ЗАПАЛ 100% CRISIS OVERLAY */}
      {hud.crisisActive && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#1a0808]/82"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="crisis-heading"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#161010] border-2 border-[#ef4444] animate-alert-border p-6 text-center shadow-2xl">
            <div className="font-mono-num text-xs text-[#fca5a5]">
              ТРЕВОГА · ЧОП НА ПОДХОДЕ · {hud.crisisCountdown.toFixed(1)} С
            </div>
            <h2
              id="crisis-heading"
              className="mt-2 font-display text-2xl font-extrabold text-[#ef4444]"
            >
              ЗАПАЛ!
            </h2>
            <p className="mt-2 text-sm text-[#e2d9d9]">{hud.crisisReason}</p>
            <p className="mt-2 text-xs text-[#fca5a5]">
              Успей бросить прибор и сбежать, иначе тебя примут и обнулят ВСЕ деньги и инструмент!
            </p>
            <button
              type="button"
              onClick={() => {
                actionsRef.current.escapeEmptyNow = true;
              }}
              className="mt-5 w-full py-3.5 px-5 rounded-lg bg-[#eab308] hover:bg-[#facc15] text-[#0f1110] font-display font-bold text-sm transition-colors"
            >
              Бросить хабар и рвать когти!
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
