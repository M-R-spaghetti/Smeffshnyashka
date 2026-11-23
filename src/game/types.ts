export type BodyGameState = 'title' | 'playing' | 'paused' | 'gameover';

export type PlayPhase = 'hub' | 'raid' | 'disassemble' | 'clip' | 'payout';

export type CrewId = 'caves' | 'okisi' | 'urbanix';

export interface CrewProfile {
  id: CrewId;
  name: string;
  motto: string;
  perkSummary: string;
  noiseMultiplier: number;
  lockSpeedMultiplier: number;
  windowAlertMultiplier: number;
  shareRate: number; // Base player cut (e.g. 0.65 = 65%)
  accentColor: string;
}

export type ToolId =
  | 'lockpicks'
  | 'boltcutter'
  | 'wrench'
  | 'spare_keys'
  | 'screwdriver'
  | 'beer'
  | 'quiet_boots'
  | 'titanium_cutters'
  | 'red_filter';

export interface ToolItem {
  id: ToolId;
  name: string;
  shortRole: string;
  description: string;
  price: number;
  consumable?: boolean;
  maxStack?: number;
  hotkey?: string;
}

export type MetalType = 'au' | 'ag' | 'pd' | 'pt';

export type SovietPartKind =
  | 'km_green'
  | 'km_orange'
  | 'ppml'
  | 'ic_133'
  | 'kt_gold'
  | 'res_9'
  | 'res_22'
  | 'tube_gmi'
  | 'coil_ag'
  | 'junk_mlt'
  | 'junk_k50';

export interface SovietPartDef {
  kind: SovietPartKind;
  code: string;
  name: string;
  era: string;
  isPrecious: boolean;
  metalsMg: Record<MetalType, number>; // milligrams of Au, Ag, Pd, Pt
  baseValueRub: number;
  width: number;
  height: number;
  tip: string;
}

export interface PcbPlacedPart {
  uid: string;
  kind: SovietPartKind;
  x: number; // percentage 8..92
  y: number; // percentage 12..88
  rotation: number; // 0 or 90
  snipped: boolean;
}

export interface SovietDeviceDef {
  id: string;
  code: string;
  name: string;
  subtitle: string;
  weightKg: number;
  screwCount: number;
  cableCount: number;
  boardCount: number;
  chassisColor: string;
  accentColor: string;
  partPool: SovietPartKind[];
}

export type GuardArchetype = 'patroller' | 'investigator' | 'camera';

export interface Waypoint {
  x: number; // tile x
  y: number; // tile y
}

export interface GuardSpec {
  id: string;
  archetype: GuardArchetype;
  x: number;
  y: number;
  angle: number;
  visionRange: number;
  visionHalfAngle: number;
  speed: number;
  waypoints: Waypoint[];
  sweepArc?: number; // for camera
  sweepSpeed?: number;
}

export type TileChar =
  | '#' // solid concrete wall
  | '.' // open floor
  | 'W' // exterior window (dangerous if flashlight points near!)
  | 'G' // broken glass / noisy debris
  | 'L' // locked door (needs lockpick / spare_keys)
  | 'C' // chained gate (needs boltcutter)
  | 'V' // vent / technical hatch (shortcut via wrench / разводник)
  | 'S' // player spawn
  | 'E' // extraction exit
  | 'T'; // target Soviet device

export interface FacilityDef {
  id: string;
  name: string;
  category: string;
  difficulty: 1 | 2 | 3 | 4;
  difficultyLabel: string;
  unlockRaidsRequired: number;
  description: string;
  deviceId: string;
  extractionTimeSec: number;
  timeLimitSec: number;
  mapRows: string[];
  guards: GuardSpec[];
  expectedHaulRange: string;
}

export interface SnippedHarvest {
  counts: Partial<Record<SovietPartKind, number>>;
  metalsMg: Record<MetalType, number>;
  junkSnipped: number;
  totalPreciousAvailable: number;
  preciousSnipped: number;
  comboMax: number;
}

export interface PayoutBreakdown {
  facilityName: string;
  deviceCode: string;
  deviceName: string;
  metalsMg: Record<MetalType, number>;
  metalValuesRub: Record<MetalType, number>;
  grossRub: number;
  purityBonusRub: number;
  sharePercent: number;
  crewCutRub: number;
  playerShareRub: number;
  partsSummary: { kind: SovietPartKind; code: string; count: number; valueRub: number }[];
}

export interface RaidOutcomeSnapshot {
  outcome: 'busted' | 'escaped_empty';
  facilityName: string;
  reason: string;
  lostCashRub: number;
  lostToolsCount: number;
  timeSurvivedSec: number;
  alertPeak: number;
}

export interface PlayerSaveState {
  crewId: CrewId;
  moneyRub: number;
  ownedTools: Partial<Record<ToolId, number>>;
  raidsCompleted: number;
  raidsBusted: number;
  raidsEscapedEmpty: number;
  totalEarnedRub: number;
  totalPartsSnipped: number;
  bestHaulRub: number;
  muted: boolean;
}
