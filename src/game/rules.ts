import {
  CREW_PROFILES,
  FACILITIES,
  INITIAL_SAVE_STATE,
  METAL_INFO,
  SOVIET_DEVICES,
  SOVIET_PARTS,
  TOOLS_CATALOG,
} from './data';
import {
  CrewId,
  CrewProfile,
  FacilityDef,
  MetalType,
  PcbPlacedPart,
  PayoutBreakdown,
  PlayerSaveState,
  SnippedHarvest,
  SovietPartKind,
  ToolId,
} from './types';

export const SAVE_STORAGE_KEY = 'zalaz_dragmetall_save_v1';

export function getCrewProfile(crewId: CrewId): CrewProfile {
  return CREW_PROFILES.find((c) => c.id === crewId) ?? CREW_PROFILES[0];
}

export function getToolCount(state: PlayerSaveState, toolId: ToolId): number {
  return Math.max(0, state.ownedTools[toolId] ?? 0);
}

export function hasTool(state: PlayerSaveState, toolId: ToolId): boolean {
  return getToolCount(state, toolId) > 0;
}

export interface PlayerModifiers {
  noiseMultiplier: number;
  windowAlertMultiplier: number;
  lockpickSpeedMultiplier: number;
  boltCutterSpeedMultiplier: number;
  canBypassVent: boolean;
  canCutChainFast: boolean;
  hasInstantKeys: boolean;
  unscrewSpeedMultiplier: number;
  snipBonusMultiplier: number;
  shareRate: number;
  haulSpeedMultiplier: number;
}

export function computePlayerModifiers(
  state: PlayerSaveState,
  beerActive: boolean
): PlayerModifiers {
  const crew = getCrewProfile(state.crewId);

  let noiseMultiplier = crew.noiseMultiplier;
  if (hasTool(state, 'quiet_boots')) {
    noiseMultiplier *= 0.55;
  }
  if (beerActive) {
    noiseMultiplier *= 0.85;
  }

  let windowAlertMultiplier = crew.windowAlertMultiplier;
  if (hasTool(state, 'red_filter')) {
    windowAlertMultiplier *= 0.35;
  }
  if (beerActive) {
    windowAlertMultiplier *= 0.72;
  }

  let lockpickSpeedMultiplier = crew.lockSpeedMultiplier;
  if (hasTool(state, 'lockpicks')) {
    lockpickSpeedMultiplier *= 2.2;
  }
  const hasInstantKeys = hasTool(state, 'spare_keys');
  if (hasInstantKeys) {
    lockpickSpeedMultiplier *= 5.0;
  }

  const canCutChainFast = hasTool(state, 'boltcutter');
  const boltCutterSpeedMultiplier = canCutChainFast
    ? 3.2 * crew.lockSpeedMultiplier
    : 0.75;

  const canBypassVent = hasTool(state, 'wrench');
  const unscrewSpeedMultiplier =
    (hasTool(state, 'screwdriver') ? 2.4 : 1.0) * (state.crewId === 'okisi' ? 1.2 : 1.0);

  const snipBonusMultiplier = hasTool(state, 'titanium_cutters') ? 1.2 : 1.0;

  const haulSpeedMultiplier = beerActive ? 1.3 : 1.0;

  return {
    noiseMultiplier,
    windowAlertMultiplier,
    lockpickSpeedMultiplier,
    boltCutterSpeedMultiplier,
    canBypassVent,
    canCutChainFast,
    hasInstantKeys,
    unscrewSpeedMultiplier,
    snipBonusMultiplier,
    shareRate: crew.shareRate,
    haulSpeedMultiplier,
  };
}

export function canBuyTool(
  state: PlayerSaveState,
  toolId: ToolId
): { ok: boolean; reason?: string } {
  const item = TOOLS_CATALOG.find((t) => t.id === toolId);
  if (!item) return { ok: false, reason: 'Неизвестный инструмент' };

  const currentCount = getToolCount(state, toolId);
  if (item.consumable) {
    const maxStack = item.maxStack ?? 5;
    if (currentCount >= maxStack) {
      return { ok: false, reason: `Максимум в рюкзаке (${maxStack} шт.)` };
    }
  } else if (currentCount >= 1) {
    return { ok: false, reason: 'Уже в снаряжении' };
  }

  if (state.moneyRub < item.price) {
    return { ok: false, reason: 'Не хватает рублей' };
  }

  return { ok: true };
}

export function buyTool(state: PlayerSaveState, toolId: ToolId): PlayerSaveState {
  const check = canBuyTool(state, toolId);
  if (!check.ok) return state;

  const item = TOOLS_CATALOG.find((t) => t.id === toolId)!;
  const current = getToolCount(state, toolId);
  return {
    ...state,
    moneyRub: state.moneyRub - item.price,
    ownedTools: {
      ...state.ownedTools,
      [toolId]: current + 1,
    },
  };
}

export function consumeBeer(state: PlayerSaveState): {
  nextState: PlayerSaveState;
  consumed: boolean;
} {
  const count = getToolCount(state, 'beer');
  if (count <= 0) {
    return { nextState: state, consumed: false };
  }
  const nextOwned = { ...state.ownedTools };
  if (count === 1) {
    delete nextOwned.beer;
  } else {
    nextOwned.beer = count - 1;
  }
  return {
    nextState: {
      ...state,
      ownedTools: nextOwned,
    },
    consumed: true,
  };
}

/**
 * When caught ("ПРИНЯЛИ!"), police/security confiscate ALL tools and ALL cash!
 * Exact user requirement: "тебя примут и тогда у тебя обнулится весь инструмент и деньги"
 */
export function applyBustedPenalty(state: PlayerSaveState): {
  nextState: PlayerSaveState;
  lostCashRub: number;
  lostToolsCount: number;
} {
  const lostCashRub = state.moneyRub;
  const lostToolsCount = Object.values(state.ownedTools).reduce(
    (sum, n) => sum + (n ?? 0),
    0
  );
  return {
    nextState: {
      ...state,
      moneyRub: 0,
      ownedTools: {},
      raidsBusted: state.raidsBusted + 1,
    },
    lostCashRub,
    lostToolsCount,
  };
}

/**
 * When escaping empty-handed ("Сбросил хабар и ушёл"): keeps tools and cash,
 * loses only the loot of the aborted raid.
 */
export function applyEscapedEmpty(state: PlayerSaveState): PlayerSaveState {
  return {
    ...state,
    raidsEscapedEmpty: state.raidsEscapedEmpty + 1,
  };
}

export function isFacilityUnlocked(
  state: PlayerSaveState,
  facility: FacilityDef
): boolean {
  return state.raidsCompleted >= facility.unlockRaidsRequired;
}

/**
 * Deterministic PRNG (mulberry32) for clean reproducible PCB component layouts.
 */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates non-overlapping Soviet PCB boards with precious and decoy components.
 */
export function generatePcbBoards(
  deviceId: string,
  seed: number
): PcbPlacedPart[][] {
  const device = SOVIET_DEVICES[deviceId] ?? SOVIET_DEVICES.s1_65;
  const rng = createSeededRng(seed);
  const boards: PcbPlacedPart[][] = [];

  // Structured grid slots (5 columns x 3 rows = 15 candidate positions) with jitter so parts NEVER overlap!
  const cols = [15, 33, 51, 69, 85];
  const rows = [22, 50, 78];

  for (let b = 0; b < device.boardCount; b++) {
    const slots: { x: number; y: number }[] = [];
    for (const r of rows) {
      for (const c of cols) {
        slots.push({
          x: Math.max(11, Math.min(89, c + (rng() - 0.5) * 5)),
          y: Math.max(16, Math.min(84, r + (rng() - 0.5) * 6)),
        });
      }
    }
    // Shuffle slots
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }

    const partCount = Math.min(slots.length, 9 + b);
    const boardParts: PcbPlacedPart[] = [];

    // Guarantee at least 6 precious components per board
    const preciousPool = device.partPool.filter((k) => SOVIET_PARTS[k].isPrecious);
    const junkPool = device.partPool.filter((k) => !SOVIET_PARTS[k].isPrecious);

    for (let i = 0; i < partCount; i++) {
      let kind: SovietPartKind;
      if (i < 6 || junkPool.length === 0) {
        kind = preciousPool[Math.floor(rng() * preciousPool.length)];
      } else {
        const useJunk = rng() < 0.52;
        kind = useJunk
          ? junkPool[Math.floor(rng() * junkPool.length)]
          : preciousPool[Math.floor(rng() * preciousPool.length)];
      }

      boardParts.push({
        uid: `b${b}_p${i}_${kind}`,
        kind,
        x: slots[i].x,
        y: slots[i].y,
        rotation: rng() < 0.25 ? 90 : 0,
        snipped: false,
      });
    }

    boards.push(boardParts);
  }

  return boards;
}

export function calculatePayout(
  facilityName: string,
  deviceId: string,
  harvest: SnippedHarvest,
  state: PlayerSaveState
): PayoutBreakdown {
  const device = SOVIET_DEVICES[deviceId] ?? SOVIET_DEVICES.s1_65;
  const mods = computePlayerModifiers(state, false);

  const metalValuesRub: Record<MetalType, number> = {
    au: Math.round((harvest.metalsMg.au / 1000) * METAL_INFO.au.rubPerGram * mods.snipBonusMultiplier),
    ag: Math.round((harvest.metalsMg.ag / 1000) * METAL_INFO.ag.rubPerGram * mods.snipBonusMultiplier),
    pd: Math.round((harvest.metalsMg.pd / 1000) * METAL_INFO.pd.rubPerGram * mods.snipBonusMultiplier),
    pt: Math.round((harvest.metalsMg.pt / 1000) * METAL_INFO.pt.rubPerGram * mods.snipBonusMultiplier),
  };

  const partsSummary: { kind: SovietPartKind; code: string; count: number; valueRub: number }[] = [];
  let partsGross = 0;

  (Object.keys(harvest.counts) as SovietPartKind[]).forEach((kind) => {
    const count = harvest.counts[kind] ?? 0;
    if (count <= 0) return;
    const def = SOVIET_PARTS[kind];
    if (!def.isPrecious) return;
    const valueRub = Math.round(def.baseValueRub * count * mods.snipBonusMultiplier);
    partsGross += valueRub;
    partsSummary.push({
      kind,
      code: def.code,
      count,
      valueRub,
    });
  });

  // Sort highest value first
  partsSummary.sort((a, b) => b.valueRub - a.valueRub);

  const metalSum =
    metalValuesRub.au + metalValuesRub.ag + metalValuesRub.pd + metalValuesRub.pt;
  // Combine exact metal pricing with soviet collector base value so numbers feel juicy & fair
  const grossRub = Math.max(metalSum, partsGross);

  // Clean sorting bonus: +15% if 0 junk snipped and >= 50% precious harvested
  const isCleanSort =
    harvest.junkSnipped === 0 &&
    harvest.preciousSnipped > 0 &&
    harvest.preciousSnipped >= Math.ceil(harvest.totalPreciousAvailable * 0.5);
  const purityBonusRub = isCleanSort ? Math.round(grossRub * 0.15) : 0;

  const totalBeforeSplit = grossRub + purityBonusRub;
  const sharePercent = Math.round(mods.shareRate * 100);
  const playerShareRub = Math.round(totalBeforeSplit * mods.shareRate);
  const crewCutRub = totalBeforeSplit - playerShareRub;

  return {
    facilityName,
    deviceCode: device.code,
    deviceName: device.name,
    metalsMg: { ...harvest.metalsMg },
    metalValuesRub,
    grossRub,
    purityBonusRub,
    sharePercent,
    crewCutRub,
    playerShareRub,
    partsSummary,
  };
}

/**
 * Stealth helper: checks if line between (x1,y1) and (x2,y2) is unobstructed by walls ('#', 'W', 'P', closed 'L'/'C'/'V')
 */
export function hasLineOfSight(
  grid: string[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  openedTiles: Set<string>
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist * 6));

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const gx = Math.floor(x1 + dx * t);
    const gy = Math.floor(y1 + dy * t);
    if (gy < 0 || gy >= grid.length || gx < 0 || gx >= grid[0].length) {
      return false;
    }
    const ch = grid[gy][gx];
    if (ch === '#' || ch === 'W' || ch === 'P') return false;
    if ((ch === 'L' || ch === 'C' || ch === 'V') && !openedTiles.has(`${gx},${gy}`)) {
      return false;
    }
  }
  return true;
}

/**
 * Checks whether player's active flashlight beam hits or shines right next to an exterior window ('W').
 * Exact user mechanic: "если светить по окнами ... может быть запал"
 */
export function computeWindowFlashlightAlertRate(
  grid: string[],
  playerX: number,
  playerY: number,
  aimAngle: number,
  flashlightOn: boolean,
  windowAlertMultiplier: number
): { alertPerSec: number; windowTile: { x: number; y: number } | null } {
  if (!flashlightOn) {
    return { alertPerSec: 0, windowTile: null };
  }

  const maxBeam = 4.6;
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    const dist = (i / steps) * maxBeam;
    const sx = playerX + Math.cos(aimAngle) * dist;
    const sy = playerY + Math.sin(aimAngle) * dist;
    const gx = Math.floor(sx);
    const gy = Math.floor(sy);
    if (gy < 0 || gy >= grid.length || gx < 0 || gx >= grid[0].length) break;
    const ch = grid[gy][gx];
    if (ch === 'W') {
      const proximityFactor = 1.45 - dist / (maxBeam * 1.4);
      return {
        alertPerSec: Math.max(14, 34 * proximityFactor) * windowAlertMultiplier,
        windowTile: { x: gx, y: gy },
      };
    }
    if (ch === '#' || ch === 'P') break;
  }

  // Also check if player stands right beside a window with flashlight turned ON
  const px = Math.floor(playerX);
  const py = Math.floor(playerY);
  const neighbors = [
    [px, py - 1],
    [px, py + 1],
    [px - 1, py],
    [px + 1, py],
  ];
  for (const [nx, ny] of neighbors) {
    if (ny >= 0 && ny < grid.length && nx >= 0 && nx < grid[0].length) {
      if (grid[ny][nx] === 'W') {
        return {
          alertPerSec: 22 * windowAlertMultiplier,
          windowTile: { x: nx, y: ny },
        };
      }
    }
  }

  return { alertPerSec: 0, windowTile: null };
}

/**
 * Validates that a facility blueprint has uniform row lengths, reachable S -> T -> E
 * without requiring optional wrench vents ('V'), and valid non-wall guard spawns/waypoints.
 */
export function validateFacilityLayout(facility: FacilityDef): string[] {
  const errors: string[] = [];
  const rows = facility.mapRows.length;
  const cols = facility.mapRows[0]?.length ?? 0;

  let spawn: [number, number] | null = null;
  let exit: [number, number] | null = null;
  let target: [number, number] | null = null;

  for (let y = 0; y < rows; y++) {
    if (facility.mapRows[y].length !== cols) {
      errors.push(
        `${facility.id} row ${y} length ${facility.mapRows[y].length} !== ${cols}`
      );
    }
    for (let x = 0; x < facility.mapRows[y].length; x++) {
      const ch = facility.mapRows[y][x];
      if (ch === 'S') spawn = [x, y];
      if (ch === 'E') exit = [x, y];
      if (ch === 'T') target = [x, y];
    }
  }

  if (!spawn) errors.push(`${facility.id} missing spawn S`);
  if (!exit) errors.push(`${facility.id} missing exit E`);
  if (!target) errors.push(`${facility.id} missing target T`);

  // Check guard positions & waypoints aren't inside solid walls/machinery
  const isBlockedForGuard = (gx: number, gy: number) => {
    const x = Math.floor(gx);
    const y = Math.floor(gy);
    if (y < 0 || y >= rows || x < 0 || x >= cols) return true;
    const ch = facility.mapRows[y][x];
    return ch === '#' || ch === 'W' || ch === 'P';
  };

  for (const g of facility.guards) {
    if (isBlockedForGuard(g.x, g.y)) {
      errors.push(`${facility.id} guard ${g.id} spawns inside blocked tile (${g.x},${g.y})`);
    }
    for (const wp of g.waypoints) {
      if (isBlockedForGuard(wp.x, wp.y)) {
        errors.push(`${facility.id} guard ${g.id} waypoint inside blocked tile (${wp.x},${wp.y})`);
      }
    }
  }

  // BFS reachability from S to T and E WITHOUT using wrench-only 'V' vents
  if (spawn && exit && target) {
    const visited = new Set<string>();
    const queue: [number, number][] = [spawn];
    visited.add(`${spawn[0]},${spawn[1]}`);
    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const ny = cy + dy;
        const key = `${nx},${ny}`;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || visited.has(key)) continue;
        const ch = facility.mapRows[ny][nx];
        if (ch === '#' || ch === 'W' || ch === 'P' || ch === 'V') continue;
        visited.add(key);
        queue.push([nx, ny]);
      }
    }
    if (!visited.has(`${target[0]},${target[1]}`)) {
      errors.push(`${facility.id} target T unreachable without wrench V`);
    }
    if (!visited.has(`${exit[0]},${exit[1]}`)) {
      errors.push(`${facility.id} exit E unreachable`);
    }
  }

  return errors;
}

/**
 * Checks if a guard/camera cone sees the player.
 */
export function isPointInVisionCone(
  originX: number,
  originY: number,
  facingAngle: number,
  range: number,
  halfAngle: number,
  targetX: number,
  targetY: number,
  grid: string[],
  openedTiles: Set<string>
): boolean {
  const dx = targetX - originX;
  const dy = targetY - originY;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return false;

  const angleToTarget = Math.atan2(dy, dx);
  let diff = angleToTarget - facingAngle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  if (Math.abs(diff) > halfAngle) return false;
  return hasLineOfSight(grid, originX, originY, targetX, targetY, openedTiles);
}

export function loadSaveState(): PlayerSaveState {
  try {
    const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return { ...INITIAL_SAVE_STATE };
    const parsed = JSON.parse(raw) as Partial<PlayerSaveState>;
    return {
      ...INITIAL_SAVE_STATE,
      ...parsed,
      ownedTools: parsed.ownedTools ? { ...parsed.ownedTools } : {},
    };
  } catch {
    return { ...INITIAL_SAVE_STATE };
  }
}

export function persistSaveState(state: PlayerSaveState): void {
  try {
    window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota failures
  }
}

export function getFacilityById(id: string): FacilityDef {
  return FACILITIES.find((f) => f.id === id) ?? FACILITIES[0];
}
