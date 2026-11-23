import React, { useEffect, useRef, useState } from 'react';
import {
  Flashlight,
  FlashlightOff,
  Pause,
  Volume2,
  VolumeX,
  LogOut,
  Hand,
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

  // Imperative action triggers from HUD buttons into the Canvas simulation
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

    // Locate spawn S, target T, exit E
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

    // Core simulation mutable state (zero React reconciliation per frame!)
    const sim = {
      px: startX,
      py: startY,
      facing: 0, // facing right (open corridor)
      flashlightOn: false, // starts OFF so player safely survives idle seconds even near windows!
      hasDevice: false,
      openedTiles: new Set<string>(),
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
        kind: 'L' | 'C' | 'V' | 'T';
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

    // Zero-GC pooled particle ring buffer (48 particles)
    const POOL_SIZE = 48;
    const partActive = new Uint8Array(POOL_SIZE);
    const partX = new Float32Array(POOL_SIZE);
    const partY = new Float32Array(POOL_SIZE);
    const partVx = new Float32Array(POOL_SIZE);
    const partVy = new Float32Array(POOL_SIZE);
    const partLife = new Float32Array(POOL_SIZE);
    const partHue = new Uint8Array(POOL_SIZE); // 0=amber, 1=green, 2=red
    let partCursor = 0;

    const spawnParticles = (wx: number, wy: number, count: number, hueCode: number) => {
      for (let i = 0; i < count; i++) {
        const idx = partCursor;
        partCursor = (partCursor + 1) % POOL_SIZE;
        const ang = Math.random() * Math.PI * 2;
        const spd = 0.8 + Math.random() * 2.2;
        partActive[idx] = 1;
        partX[idx] = wx;
        partY[idx] = wy;
        partVx[idx] = Math.cos(ang) * spd;
        partVy[idx] = Math.sin(ang) * spd;
        partLife[idx] = 0.3 + Math.random() * 0.25;
        partHue[idx] = hueCode;
      }
    };

    const emitNoise = (x: number, y: number, radius: number, color = '#eab308') => {
      rings.push({ x, y, radius: 0.2, maxRadius: radius, alpha: 0.85, color });
      // Alert nearby investigators
      for (const g of guards) {
        if (g.archetype === 'camera') continue;
        const d = Math.hypot(g.x - x, g.y - y);
        const hearMult = g.archetype === 'investigator' ? 1.4 : 0.9;
        if (d <= radius * hearMult) {
          g.state = 'investigate';
          g.investigateX = x;
          g.investigateY = y;
          g.investigateTimer = 4.2;
          g.alertCueTimer = 1.2;
        }
      }
    };

    // Unified Input Hub (held + edge triggers, cleared on blur/visibilitychange)
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

    // Canvas resize via ResizeObserver
    let viewW = 1280;
    let viewH = 720;
    let tileSize = 48;
    let originX = 0;
    let originY = 0;

    const updateLayout = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      viewW = Math.max(320, rect.width);
      viewH = Math.max(320, rect.height);
      canvas.width = Math.floor(viewW * dpr);
      canvas.height = Math.floor(viewH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Fit entire facility blueprint with breathing room for perimeter HUD
      const usableW = viewW - 48;
      const usableH = viewH - 148;
      tileSize = Math.floor(Math.min(usableW / cols, usableH / rows));
      tileSize = Math.max(22, Math.min(tileSize, 66));
      originX = Math.floor((viewW - cols * tileSize) / 2);
      originY = Math.floor((viewH - rows * tileSize) / 2 + 12);
    };

    updateLayout();
    const ro = new ResizeObserver(updateLayout);
    ro.observe(canvas);

    const isSolidTile = (gx: number, gy: number): boolean => {
      if (gy < 0 || gy >= rows || gx < 0 || gx >= cols) return true;
      const ch = grid[gy][gx];
      if (ch === '#' || ch === 'W') return true;
      if ((ch === 'L' || ch === 'C' || ch === 'V') && !sim.openedTiles.has(`${gx},${gy}`)) {
        return true;
      }
      return false;
    };

    const tryMove = (nx: number, ny: number, radius = 0.28): { x: number; y: number } => {
      let rx = sim.px;
      let ry = sim.py;

      // X axis slide
      const checkX =
        !isSolidTile(Math.floor(nx - radius), Math.floor(ry - radius)) &&
        !isSolidTile(Math.floor(nx + radius), Math.floor(ry - radius)) &&
        !isSolidTile(Math.floor(nx - radius), Math.floor(ry + radius)) &&
        !isSolidTile(Math.floor(nx + radius), Math.floor(ry + radius));
      if (checkX) rx = nx;

      // Y axis slide
      const checkY =
        !isSolidTile(Math.floor(rx - radius), Math.floor(ny - radius)) &&
        !isSolidTile(Math.floor(rx + radius), Math.floor(ny - radius)) &&
        !isSolidTile(Math.floor(rx - radius), Math.floor(ny + radius)) &&
        !isSolidTile(Math.floor(rx + radius), Math.floor(ny + radius));
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

      // Process imperative HUD button triggers
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
        // Decay shake & hitstop in real time
        sim.shakeTrauma = Math.max(0, sim.shakeTrauma - rawDt * 2.2);
        sim.alertSoundCooldown = Math.max(0, sim.alertSoundCooldown - rawDt);

        if (sim.hitstop > 0) {
          sim.hitstop = Math.max(0, sim.hitstop - rawDt);
        } else {
          const dt = rawDt;
          sim.elapsed += dt;
          sim.timeLeft = Math.max(0, sim.timeLeft - dt);
          if (sim.beerTimer > 0) sim.beerTimer = Math.max(0, sim.beerTimer - dt);

          const mods = computePlayerModifiers(saveRef.current, sim.beerTimer > 0);

          if (sim.timeLeft <= 0) {
            triggerBusted(
              'Смена охраны на проходной закончилась — объект перекрыли со всех сторон.'
            );
          }

          // Crisis countdown if alert reached 100%
          if (sim.crisisActive) {
            sim.crisisCountdown -= dt;
            if (sim.crisisCountdown <= 0) {
              triggerBusted(
                sim.crisisReason ||
                  'Охрана ЧОП перекрыла выход и скрутила тебя на месте. Снаряжение и касса изъяты.'
              );
            }
          }

          // Player movement vector
          let mx = 0;
          let my = 0;
          if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
          if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
          if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
          if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;

          const moving = mx !== 0 || my !== 0;
          const sprinting = moving && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
          const baseSpeed = sim.hasDevice ? 2.15 * mods.haulSpeedMultiplier : 2.85;
          const speed = sprinting ? baseSpeed * 1.48 : baseSpeed;

          if (moving) {
            const len = Math.hypot(mx, my);
            mx /= len;
            my /= len;
            // Subtle comic wobble when beer is active
            const beerWobble =
              sim.beerTimer > 0 ? Math.sin(sim.elapsed * 7) * 0.12 : 0;
            const moved = tryMove(
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

            // Footstep cadence synced to distance traveled
            const stepInterval = sprinting ? 0.58 : 0.82;
            if (sim.stepDistAccum >= stepInterval) {
              sim.stepDistAccum = 0;
              const tile = grid[Math.floor(sim.py)]?.[Math.floor(sim.px)];
              const onGlass = tile === 'G';
              soundEngine.playFootstep(onGlass);

              const baseNoise = onGlass
                ? 4.4
                : sprinting
                  ? 3.4
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

          // Update flashlight facing toward cursor if cursor moved inside canvas
          if (sim.mouseWorldActive) {
            const rect = canvas.getBoundingClientRect();
            const worldMouseX = (sim.mouseClientX - rect.left - originX) / tileSize;
            const worldMouseY = (sim.mouseClientY - rect.top - originY) / tileSize;
            sim.facing = Math.atan2(worldMouseY - sim.py, worldMouseX - sim.px);
          }

          // Check nearby interactables (L, C, V, T)
          sim.interactTarget = null;
          const ptx = Math.floor(sim.px);
          const pty = Math.floor(sim.py);

          // Target device check
          if (!sim.hasDevice && Math.hypot(sim.px - targetX, sim.py - targetY) < 1.25) {
            sim.interactTarget = {
              tx: Math.floor(targetX),
              ty: Math.floor(targetY),
              kind: 'T',
              label: `Упаковать ${device.code} [E]`,
              duration: facility.extractionTimeSec / mods.haulSpeedMultiplier,
            };
          } else {
            // Check adjacent locked doors / chains / vents
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
              if (
                (ch === 'L' || ch === 'C' || ch === 'V') &&
                !sim.openedTiles.has(`${nx},${ny}`)
              ) {
                const dist = Math.hypot(nx + 0.5 - sim.px, ny + 0.5 - sim.py);
                if (dist < 1.38) {
                  if (ch === 'L') {
                    sim.interactTarget = {
                      tx: nx,
                      ty: ny,
                      kind: 'L',
                      label: mods.hasInstantKeys
                        ? 'Открыть ключом [E]'
                        : 'Взломать замок [E]',
                      duration: 2.2 / mods.lockpickSpeedMultiplier,
                    };
                  } else if (ch === 'C') {
                    sim.interactTarget = {
                      tx: nx,
                      ty: ny,
                      kind: 'C',
                      label: mods.canCutChainFast
                        ? 'Перекусить цепь болторезом [E]'
                        : 'Спилить цепь вручную (шумно!) [E]',
                      duration: 2.6 / mods.boltCutterSpeedMultiplier,
                    };
                  } else if (ch === 'V') {
                    sim.interactTarget = {
                      tx: nx,
                      ty: ny,
                      kind: 'V',
                      label: mods.canBypassVent
                        ? 'Открутить техлюк разводником [E]'
                        : 'Техлюк закручен (нужен разводник)',
                      duration: 1.0,
                      blockedMsg: mods.canBypassVent
                        ? undefined
                        : 'Купи «Разводник» на барахолке, чтобы открывать техлюки!',
                    };
                  }
                  break;
                }
              }
            }
          }

          // Handle holding E or Interact button
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
              // Cutting chains without boltcutter emits loud noise
              if (sim.interactTarget.kind === 'C' && !mods.canCutChainFast) {
                emitNoise(sim.px, sim.py, 4.8 * mods.noiseMultiplier, '#ef4444');
              }
            }
            if (sim.interactProgress >= 1) {
              if (sim.interactTarget.kind === 'T') {
                sim.hasDevice = true;
                soundEngine.playCashPayout();
                sim.hitstop = 0.05;
                spawnParticles(targetX, targetY, 16, 1);
              } else {
                sim.openedTiles.add(`${sim.interactTarget.tx},${sim.interactTarget.ty}`);
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
            sim.interactProgress = Math.max(0, sim.interactProgress - dt * 1.6);
          }

          // Check extraction win at Exit E while carrying device
          if (sim.hasDevice && Math.hypot(sim.px - exitX, sim.py - exitY) < 0.95) {
            sim.ended = true;
            soundEngine.playCashPayout();
            callbacksRef.current.onExtracted();
          }

          // Window Flashlight Запал Check!
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

          // Update 3 Guard/Camera Archetypes
          let spottedByGuard = false;
          for (const g of guards) {
            g.alertCueTimer = Math.max(0, g.alertCueTimer - dt);

            if (g.archetype === 'camera') {
              const arc = g.sweepArc ?? 1.0;
              const spd = g.sweepSpeed ?? 0.9;
              g.angle = g.baseAngle + Math.sin(sim.elapsed * spd) * arc;
            } else {
              // Patrol or Investigate target
              let tx = g.x;
              let ty = g.y;
              if (g.state === 'investigate') {
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
                if (Math.hypot(tx - g.x, ty - g.y) < 0.25) {
                  g.waypointIdx = (g.waypointIdx + 1) % g.waypoints.length;
                }
              }

              const dx = tx - g.x;
              const dy = ty - g.y;
              const d = Math.hypot(dx, dy);
              if (d > 0.08) {
                const moveSpd = g.state === 'investigate' ? g.speed * 1.15 : g.speed;
                const nx = g.x + (dx / d) * moveSpd * dt;
                const ny = g.y + (dy / d) * moveSpd * dt;
                if (!isSolidTile(Math.floor(nx), Math.floor(ny))) {
                  g.x = nx;
                  g.y = ny;
                } else if (g.state === 'investigate') {
                  g.state = 'patrol';
                }
                const targetAngle = Math.atan2(dy, dx);
                let diff = targetAngle - g.angle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                g.angle += diff * Math.min(1, dt * 6);
              }
            }

            // Vision cone check
            const effectiveRange = sim.flashlightOn ? g.visionRange * 1.18 : g.visionRange;
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
              g.alertCueTimer = 0.6;
              alertGainPerSec += g.archetype === 'camera' ? 42 : 52;
              activeWarning =
                g.archetype === 'camera'
                  ? 'ПОПАЛ В ДАТЧИК ОБЪЁМА!'
                  : 'ТЕБЯ ВИДИТ ОХРАНА!';

              if (g.archetype !== 'camera') {
                g.state = 'investigate';
                g.investigateX = sim.px;
                g.investigateY = sim.py;
                g.investigateTimer = 4.5;
              }

              // Direct physical grab by guard!
              if (g.archetype !== 'camera' && Math.hypot(g.x - sim.px, g.y - sim.py) < 0.72) {
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
            // Cool down запал smoothly when hidden & quiet
            sim.alert = Math.max(0, sim.alert - 11 * dt);
          }

          sim.warningText =
            activeWarning ||
            sim.interactTarget?.blockedMsg ||
            (sim.hasDevice ? 'Прибор у тебя! Тащи его к зелёному выходу (ЛАЗ)!' : '');

          // Trigger Crisis at 100% запал!
          if (sim.alert >= 100 && !sim.crisisActive && !sim.ended) {
            sim.crisisActive = true;
            sim.crisisCountdown = 4.5;
            sim.crisisReason = spottedByGuard
              ? 'Охрана подняла тревогу и окружила объект!'
              : 'Кто-то с улицы заметил свет в окнах и вызвал ЧОП!';
            sim.shakeTrauma = 0.9;
            soundEngine.playBustedSiren();
          }

          // Update noise rings
          for (let i = rings.length - 1; i >= 0; i--) {
            const r = rings[i];
            r.radius += dt * 5.2;
            r.alpha = Math.max(0, 1 - r.radius / r.maxRadius);
            if (r.radius >= r.maxRadius) rings.splice(i, 1);
          }

          // Update pooled particles in-place
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

          // Update alert bar width directly via ref (no 60Hz React re-renders!)
          if (alertBarRef.current) {
            alertBarRef.current.style.transform = `scaleX(${Math.max(0, Math.min(1, sim.alert / 100))})`;
          }

          // Throttled HUD sync (~8 Hz)
          sim.hudSyncAccum += dt;
          if (sim.hudSyncAccum >= 0.12) {
            sim.hudSyncAccum = 0;
            setHud({
              alert: Math.round(sim.alert),
              timeLeft: Math.ceil(sim.timeLeft),
              flashlightOn: sim.flashlightOn,
              hasDevice: sim.hasDevice,
              beerTimer: sim.beerTimer,
              warningText: sim.warningText,
              interactLabel: sim.interactTarget?.label ?? null,
              interactProgress: sim.interactProgress,
              crisisActive: sim.crisisActive,
              crisisCountdown: Math.max(0, sim.crisisCountdown),
              crisisReason: sim.crisisReason,
            });
          }
        }
      }

      // === RENDER CANVAS 2D SCENE ===
      ctx.save();
      ctx.fillStyle = '#0b0e0d';
      ctx.fillRect(0, 0, viewW, viewH);

      // Camera trauma shake
      if (sim.shakeTrauma > 0) {
        const mag = sim.shakeTrauma * sim.shakeTrauma * 9;
        ctx.translate((Math.random() * 2 - 1) * mag, (Math.random() * 2 - 1) * mag);
      }

      // Draw facility tiles
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const ch = grid[y][x];
          const px = originX + x * tileSize;
          const py = originY + y * tileSize;
          const opened = sim.openedTiles.has(`${x},${y}`);

          // Base concrete floor
          ctx.fillStyle = (x + y) % 2 === 0 ? '#151a18' : '#131816';
          ctx.fillRect(px, py, tileSize, tileSize);

          if (ch === '#') {
            ctx.fillStyle = '#262e2a';
            ctx.fillRect(px, py, tileSize, tileSize);
            ctx.strokeStyle = '#343f3a';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 0.5, py + 0.5, tileSize - 1, tileSize - 1);
          } else if (ch === 'W') {
            // Exterior Soviet window frame!
            const glaring =
              sim.windowGlareTile &&
              sim.windowGlareTile.x === x &&
              sim.windowGlareTile.y === y;
            ctx.fillStyle = glaring ? '#ef4444' : '#1e3a4c';
            ctx.fillRect(px, py, tileSize, tileSize);
            ctx.strokeStyle = glaring ? '#fecaca' : '#38bdf8';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
            // Cross muntin bars
            ctx.beginPath();
            ctx.moveTo(px + tileSize / 2, py + 2);
            ctx.lineTo(px + tileSize / 2, py + tileSize - 2);
            ctx.stroke();
          } else if (ch === 'G') {
            // Broken glass shards on concrete floor
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(px + 8, py + 12);
            ctx.lineTo(px + 18, py + 9);
            ctx.lineTo(px + 14, py + 20);
            ctx.closePath();
            ctx.moveTo(px + tileSize - 14, py + tileSize - 16);
            ctx.lineTo(px + tileSize - 6, py + tileSize - 10);
            ctx.lineTo(px + tileSize - 18, py + tileSize - 6);
            ctx.closePath();
            ctx.stroke();
          } else if (ch === 'L' && !opened) {
            ctx.fillStyle = '#5c4813';
            ctx.fillRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
            ctx.strokeStyle = '#eab308';
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 3, py + 3, tileSize - 6, tileSize - 6);
            ctx.fillStyle = '#eab308';
            ctx.font = `700 ${Math.max(10, Math.floor(tileSize * 0.28))}px JetBrains Mono, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('ЗАМ', px + tileSize / 2, py + tileSize / 2);
          } else if (ch === 'C' && !opened) {
            ctx.fillStyle = '#572811';
            ctx.fillRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(px + 4, py + 4);
            ctx.lineTo(px + tileSize - 4, py + tileSize - 4);
            ctx.moveTo(px + tileSize - 4, py + 4);
            ctx.lineTo(px + 4, py + tileSize - 4);
            ctx.stroke();
          } else if (ch === 'V' && !opened) {
            ctx.fillStyle = '#2d2347';
            ctx.fillRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
            ctx.strokeStyle = '#a78bfa';
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 4, py + 4, tileSize - 8, tileSize - 8);
            ctx.fillStyle = '#c4b5fd';
            ctx.font = `700 ${Math.max(9, Math.floor(tileSize * 0.26))}px JetBrains Mono, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('ЛЮК', px + tileSize / 2, py + tileSize / 2);
          } else if (ch === 'E') {
            // Extraction hatch
            const pulse = sim.hasDevice ? 0.55 + Math.sin(sim.elapsed * 6) * 0.25 : 0.3;
            ctx.fillStyle = `rgba(34, 197, 94, ${pulse})`;
            ctx.fillRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
            ctx.strokeStyle = '#4ade80';
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 3, py + 3, tileSize - 6, tileSize - 6);
            ctx.fillStyle = '#ecfdf5';
            ctx.font = `700 ${Math.max(10, Math.floor(tileSize * 0.28))}px JetBrains Mono, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('ЛАЗ', px + tileSize / 2, py + tileSize / 2);
          }
        }
      }

      // Draw Target Soviet Instrument (if not yet picked up)
      if (!sim.hasDevice) {
        const tx = originX + targetX * tileSize;
        const ty = originY + targetY * tileSize;
        const pulseR = tileSize * (0.44 + Math.sin(sim.elapsed * 4.5) * 0.06);

        ctx.strokeStyle = 'rgba(74, 222, 128, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tx, ty, pulseR, 0, Math.PI * 2);
        ctx.stroke();

        // Soviet Oscilloscope green chassis icon
        const boxW = tileSize * 0.68;
        const boxH = tileSize * 0.48;
        ctx.fillStyle = '#334139';
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.fillRect(tx - boxW / 2, ty - boxH / 2, boxW, boxH);
        ctx.strokeRect(tx - boxW / 2, ty - boxH / 2, boxW, boxH);
        // Phosphor CRT screen
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(tx - boxW * 0.34, ty - boxH * 0.28, boxW * 0.36, boxH * 0.56);
      }

      // Helper: raycast wall-occluded visibility cone polygon so beams never bleed through walls
      const drawOccludedCone = (
        srcX: number,
        srcY: number,
        centerAngle: number,
        halfAngle: number,
        maxDist: number,
        fillStyle: string | CanvasGradient
      ) => {
        const rays = 24;
        const stepSize = 0.14;
        ctx.fillStyle = fillStyle;
        ctx.beginPath();
        ctx.moveTo(originX + srcX * tileSize, originY + srcY * tileSize);
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
            originX + (srcX + cosA * hitDist) * tileSize,
            originY + (srcY + sinA * hitDist) * tileSize
          );
        }
        ctx.closePath();
        ctx.fill();
      };

      // Draw Guard / Camera Vision Cones (wall-occluded!)
      for (const g of guards) {
        const gx = originX + g.x * tileSize;
        const gy = originY + g.y * tileSize;

        const coneColor =
          g.alertCueTimer > 0
            ? 'rgba(239, 68, 68, 0.34)'
            : g.archetype === 'camera'
              ? 'rgba(249, 115, 22, 0.24)'
              : 'rgba(250, 204, 21, 0.22)';

        drawOccludedCone(g.x, g.y, g.angle, g.visionHalfAngle, g.visionRange, coneColor);

        // Guard / Camera Actor Sprite
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(g.angle);
        if (g.archetype === 'camera') {
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 2;
          ctx.fillRect(-9, -7, 18, 14);
          ctx.strokeRect(-9, -7, 18, 14);
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(8, 0, 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Guard shoulders & Soviet security cap
          ctx.fillStyle = g.archetype === 'investigator' ? '#7f1d1d' : '#1e3a5f';
          ctx.strokeStyle = '#090b0a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, tileSize * 0.28, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Visor facing direction
          ctx.fillStyle = '#eab308';
          ctx.fillRect(tileSize * 0.14, -4, 6, 8);
        }
        ctx.restore();

        // Alert Telegraph (! / ?)
        if (g.alertCueTimer > 0 || g.state === 'investigate') {
          ctx.fillStyle = g.alertCueTimer > 0 ? '#ef4444' : '#facc15';
          ctx.font = '800 16px Unbounded, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(g.alertCueTimer > 0 ? '!' : '?', gx, gy - tileSize * 0.45);
        }
      }

      // Draw Player Flashlight Cone (wall-occluded!)
      const pScreenX = originX + sim.px * tileSize;
      const pScreenY = originY + sim.py * tileSize;
      if (sim.flashlightOn) {
        const hasRedFilter = getToolCount(saveRef.current, 'red_filter') > 0;
        const beamR = tileSize * 4.5;
        const grad = ctx.createRadialGradient(pScreenX, pScreenY, 6, pScreenX, pScreenY, beamR);
        if (hasRedFilter) {
          grad.addColorStop(0, 'rgba(239, 68, 68, 0.34)');
          grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
        } else {
          grad.addColorStop(0, 'rgba(254, 249, 195, 0.44)');
          grad.addColorStop(1, 'rgba(254, 249, 195, 0)');
        }
        drawOccludedCone(sim.px, sim.py, sim.facing, 0.32, 4.5, grad);
      }

      // Draw Expanding Noise Rings
      for (const r of rings) {
        ctx.strokeStyle = r.color;
        ctx.globalAlpha = r.alpha * 0.75;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(originX + r.x * tileSize, originY + r.y * tileSize, r.radius * tileSize, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Draw Player Climber (Кавес / Окись / Урбаникс)
      ctx.save();
      ctx.translate(pScreenX, pScreenY);
      ctx.rotate(sim.facing);
      // Heavy stolen Soviet device strapped to back if carrying!
      if (sim.hasDevice) {
        ctx.fillStyle = '#15803d';
        ctx.strokeStyle = '#86efac';
        ctx.lineWidth = 1.8;
        ctx.fillRect(-tileSize * 0.38, -tileSize * 0.24, tileSize * 0.26, tileSize * 0.48);
        ctx.strokeRect(-tileSize * 0.38, -tileSize * 0.24, tileSize * 0.26, tileSize * 0.48);
      }
      // Hooded climber silhouette
      ctx.fillStyle = '#eceae1';
      ctx.strokeStyle = '#0f1210';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, tileSize * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Headlamp/direction dot
      ctx.fillStyle = sim.flashlightOn ? '#facc15' : '#4ade80';
      ctx.beginPath();
      ctx.arc(tileSize * 0.18, 0, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Diegetic interaction progress ring around target tile
      if (sim.interactTarget && sim.interactProgress > 0) {
        const ix = originX + (sim.interactTarget.tx + 0.5) * tileSize;
        const iy = originY + (sim.interactTarget.ty + 0.5) * tileSize;
        ctx.strokeStyle = '#0a0d0c';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(ix, iy, tileSize * 0.55, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(
          ix,
          iy,
          tileSize * 0.55,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * sim.interactProgress
        );
        ctx.stroke();
      }

      // Draw Pooled Particles
      for (let i = 0; i < POOL_SIZE; i++) {
        if (!partActive[i]) continue;
        ctx.fillStyle =
          partHue[i] === 1 ? '#4ade80' : partHue[i] === 2 ? '#ef4444' : '#facc15';
        ctx.globalAlpha = Math.min(1, partLife[i] * 2.5);
        ctx.fillRect(
          originX + partX[i] * tileSize - 2,
          originY + partY[i] * tileSize - 2,
          4,
          4
        );
      }
      ctx.globalAlpha = 1;

      // Subtle critical peripheral red vignette when alert > 60%
      if (sim.alert > 60) {
        const vigAlpha = ((sim.alert - 60) / 40) * 0.35;
        const vig = ctx.createRadialGradient(
          viewW / 2,
          viewH / 2,
          viewW * 0.25,
          viewW / 2,
          viewH / 2,
          viewW * 0.65
        );
        vig.addColorStop(0, 'rgba(239,68,68,0)');
        vig.addColorStop(1, `rgba(239,68,68,${vigAlpha})`);
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, viewW, viewH);
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
    <div className="relative w-full h-screen overflow-hidden bg-[#0b0e0d] select-none">
      {/* Isolated Full-Bleed Canvas 2D Surface */}
      <canvas
        ref={canvasRef}
        data-testid="stealth-raid-canvas"
        className="w-full h-full block"
      />

      {/* Pointer-pass-through Perimeter HUD (NO backdrop-filter over canvas!) */}
      <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
        {/* Top Row: Left Alert/Objective Cluster · Right Timer & Utility Buttons */}
        <div className="flex items-start justify-between gap-4">
          {/* Left HUD Cluster: Запал Meter & Objective */}
          <div className="pointer-events-auto bg-[#111513]/92 border border-[#2c3530] rounded-xl px-4 py-2.5 shadow-xl min-w-[240px] sm:min-w-[290px]">
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
            <div className="mt-1.5 text-xs font-mono text-[#cfd5d0] flex items-center justify-between gap-2">
              <span>
                {hud.hasDevice
                  ? `Несёшь ${device.code} -> к ЛАЗу`
                  : `Цель: вынести ${device.code}`}
              </span>
              {hud.beerTimer > 0 && (
                <span className="text-[#eab308]">Пиво {Math.ceil(hud.beerTimer)}с</span>
              )}
            </div>
          </div>

          {/* Center Top Safe Warning Banner (keeps central playfield 100% unobstructed!) */}
          <div className="hidden md:flex flex-1 justify-center px-2">
            {hud.warningText && !hud.crisisActive && (
              <div className="px-4 py-2 rounded-lg bg-[#1c1010]/95 border border-[#ef4444]/85 text-xs sm:text-sm font-mono font-bold text-[#fca5a5] shadow-lg text-center">
                {hud.warningText}
              </div>
            )}
          </div>

          {/* Right HUD Cluster: Timer + Square Utility Icons */}
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

        {/* Mobile-only top-edge warning banner */}
        <div className="md:hidden flex justify-center -mt-auto">
          {hud.warningText && !hud.crisisActive && (
            <div className="px-3 py-1 rounded-lg bg-[#1c1010]/95 border border-[#ef4444]/85 text-[11px] font-mono font-bold text-[#fca5a5]">
              {hud.warningText}
            </div>
          )}
        </div>

        {/* Bottom Perimeter Controls Strip */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          {/* Interactive tool & action buttons */}
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

          {/* Escape Empty-Handed Panic Button */}
          <div className="pointer-events-auto flex items-center gap-3">
            <span className="hidden md:inline text-xs font-mono text-[#88918a]">
              WASD Ходьба · Shift Бег · Не свети в синие окна!
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

      {/* ЗАПАЛ 100% CRISIS OVERLAY: Last chance to drop loot & run before getting BUSTED! */}
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
