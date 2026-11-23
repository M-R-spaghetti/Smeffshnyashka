import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_SAVE_STATE, FACILITIES, SOVIET_PARTS } from './data';
import {
  applyBustedPenalty,
  applyEscapedEmpty,
  buyTool,
  calculatePayout,
  canBuyTool,
  computePlayerModifiers,
  computeWindowFlashlightAlertRate,
  consumeBeer,
  generatePcbBoards,
  isPointInVisionCone,
} from './rules';
import { PlayerSaveState } from './types';

test('tool purchase deducts money, blocks duplicates, and allows stacking beer up to 5', () => {
  let state: PlayerSaveState = {
    ...INITIAL_SAVE_STATE,
    moneyRub: 5000,
    ownedTools: {},
  };

  assert.equal(canBuyTool(state, 'lockpicks').ok, true);
  state = buyTool(state, 'lockpicks');
  assert.equal(state.ownedTools.lockpicks, 1);
  assert.equal(state.moneyRub, 5000 - 1400);

  // Cannot buy permanent tool twice
  assert.equal(canBuyTool(state, 'lockpicks').ok, false);

  // Beer is consumable and stacks
  state = buyTool(state, 'beer');
  state = buyTool(state, 'beer');
  assert.equal(state.ownedTools.beer, 2);

  const drank = consumeBeer(state);
  assert.equal(drank.consumed, true);
  assert.equal(drank.nextState.ownedTools.beer, 1);
});

test('busted penalty completely wipes cash and all tools', () => {
  const richState: PlayerSaveState = {
    ...INITIAL_SAVE_STATE,
    moneyRub: 9200,
    ownedTools: {
      lockpicks: 1,
      boltcutter: 1,
      beer: 3,
      screwdriver: 1,
    },
  };

  const { nextState, lostCashRub, lostToolsCount } = applyBustedPenalty(richState);
  assert.equal(lostCashRub, 9200);
  assert.equal(lostToolsCount, 6);
  assert.equal(nextState.moneyRub, 0);
  assert.deepEqual(nextState.ownedTools, {});
  assert.equal(nextState.raidsBusted, 1);
});

test('escaped empty-handed preserves cash and tools', () => {
  const state: PlayerSaveState = {
    ...INITIAL_SAVE_STATE,
    moneyRub: 3100,
    ownedTools: { lockpicks: 1, beer: 1 },
  };
  const next = applyEscapedEmpty(state);
  assert.equal(next.moneyRub, 3100);
  assert.equal(next.ownedTools.lockpicks, 1);
  assert.equal(next.raidsEscapedEmpty, 1);
});

test('shining flashlight at exterior window triggers запал alert and red filter reduces it', () => {
  const grid = [
    '##WWWW##',
    '#......#',
    '#..S...#',
    '########',
  ];

  // Pointing straight up (-PI/2) at windows row 0
  const raw = computeWindowFlashlightAlertRate(grid, 3.5, 2.2, -Math.PI / 2, true, 1.0);
  assert.ok(raw.alertPerSec > 20, 'flashlight into window must generate high alert');
  assert.ok(raw.windowTile !== null);

  // Turning flashlight off eliminates window alert
  const off = computeWindowFlashlightAlertRate(grid, 3.5, 2.2, -Math.PI / 2, false, 1.0);
  assert.equal(off.alertPerSec, 0);

  // Red filter cuts window alert substantially
  const withFilter = computePlayerModifiers(
    { ...INITIAL_SAVE_STATE, crewId: 'okisi', ownedTools: { red_filter: 1 } },
    false
  );
  const filtered = computeWindowFlashlightAlertRate(
    grid,
    3.5,
    2.2,
    -Math.PI / 2,
    true,
    withFilter.windowAlertMultiplier
  );
  assert.ok(filtered.alertPerSec < raw.alertPerSec * 0.45);
});

test('vision cone respects wall occlusion and angle bounds', () => {
  const grid = [
    '######',
    '#....#',
    '#.##.#',
    '#....#',
    '######',
  ];
  const opened = new Set<string>();

  // Clear corridor sight
  assert.equal(
    isPointInVisionCone(1.5, 1.5, 0, 4, 0.5, 4.2, 1.5, grid, opened),
    true
  );
  // Wall in row 2 blocks sight from (2.5, 1.5) to (2.5, 3.5)
  assert.equal(
    isPointInVisionCone(2.5, 1.5, Math.PI / 2, 4, 0.5, 2.5, 3.5, grid, opened),
    false
  );
});

test('PCB generator creates valid boards with precious Soviet parts and payout applies crew share', () => {
  const boards = generatePcbBoards('s1_99', 12345);
  assert.equal(boards.length, 3);
  for (const board of boards) {
    const preciousCount = board.filter((p) => SOVIET_PARTS[p.kind].isPrecious).length;
    assert.ok(preciousCount >= 6, 'each board must contain at least 6 precious Soviet parts');
  }

  const okisiState: PlayerSaveState = {
    ...INITIAL_SAVE_STATE,
    crewId: 'okisi', // 75% share
    ownedTools: { titanium_cutters: 1 }, // +20% yield
  };

  const payout = calculatePayout(
    FACILITIES[0].name,
    's1_65',
    {
      counts: { km_green: 3, ppml: 1 },
      metalsMg: { au: 18, ag: 256, pd: 775, pt: 94 },
      junkSnipped: 0,
      totalPreciousAvailable: 8,
      preciousSnipped: 4,
      comboMax: 4,
    },
    okisiState
  );

  assert.equal(payout.sharePercent, 75);
  assert.ok(payout.purityBonusRub > 0, '0 junk snipped grants purity bonus');
  assert.equal(
    payout.playerShareRub + payout.crewCutRub,
    payout.grossRub + payout.purityBonusRub
  );
  assert.ok(payout.playerShareRub > 2500);
});
