import { useCallback, useEffect, useState } from 'react';
import { INITIAL_SAVE_STATE } from './game/data';
import {
  applyBustedPenalty,
  applyEscapedEmpty,
  buyTool,
  calculatePayout,
  consumeBeer,
  getFacilityById,
  loadSaveState,
  persistSaveState,
} from './game/rules';
import {
  BodyGameState,
  CrewId,
  PayoutBreakdown,
  PlayPhase,
  PlayerSaveState,
  RaidOutcomeSnapshot,
  SnippedHarvest,
  ToolId,
} from './game/types';
import { soundEngine } from './game/audio';
import { TitleScreen } from './components/TitleScreen';
import { BaseHub } from './components/BaseHub';
import { StealthRaid } from './components/StealthRaid';
import { DisassemblyBench } from './components/DisassemblyBench';
import { PcbClippingBench } from './components/PcbClippingBench';
import { PayoutModal } from './components/PayoutModal';
import { OutcomeModal, PauseModal } from './components/StatusModals';

export default function App() {
  const [save, setSave] = useState<PlayerSaveState>(() => loadSaveState());

  const [gameState, setGameState] = useState<BodyGameState>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return 'playing';
    }
    return 'title';
  });

  const [phase, setPhase] = useState<PlayPhase>('hub');
  const [activeFacilityId, setActiveFacilityId] = useState<string>('ceh_4');
  const [raidSeed, setRaidSeed] = useState<number>(() => Date.now());
  const [raidRunKey, setRaidRunKey] = useState<number>(1);
  const [lastPayout, setLastPayout] = useState<PayoutBreakdown | null>(null);
  const [outcomeSnapshot, setOutcomeSnapshot] = useState<RaidOutcomeSnapshot | null>(null);

  // Sync audio mute + localStorage persistence
  useEffect(() => {
    soundEngine.setMuted(save.muted);
    persistSaveState(save);
  }, [save]);

  // Mirror state machine to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  // Global keyboard shortcuts: Esc / P to toggle pause, M to toggle mute
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM' && !e.metaKey && !e.ctrlKey) {
        setSave((prev) => ({ ...prev, muted: !prev.muted }));
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (gameState === 'playing') {
          e.preventDefault();
          setGameState('paused');
        } else if (gameState === 'paused') {
          e.preventDefault();
          setGameState('playing');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState]);

  const activeFacility = getFacilityById(activeFacilityId);

  const handleStartFromTitle = useCallback(() => {
    document.body.dataset.state = 'playing';
    setGameState('playing');
    setPhase('hub');
    setOutcomeSnapshot(null);
  }, []);

  const handleResetSave = useCallback(() => {
    const fresh: PlayerSaveState = {
      ...INITIAL_SAVE_STATE,
      crewId: save.crewId,
      ownedTools: { ...INITIAL_SAVE_STATE.ownedTools },
    };
    setSave(fresh);
    document.body.dataset.state = 'playing';
    setGameState('playing');
    setPhase('hub');
    setOutcomeSnapshot(null);
  }, [save.crewId]);

  const handleSelectCrew = useCallback((crewId: CrewId) => {
    setSave((prev) => ({ ...prev, crewId }));
  }, []);

  const handleBuyTool = useCallback((toolId: ToolId) => {
    setSave((prev) => buyTool(prev, toolId));
  }, []);

  const handleToggleMute = useCallback(() => {
    setSave((prev) => ({ ...prev, muted: !prev.muted }));
  }, []);

  const handleStartRaid = useCallback((facilityId: string) => {
    setActiveFacilityId(facilityId);
    setRaidSeed(Date.now());
    setRaidRunKey((k) => k + 1);
    setOutcomeSnapshot(null);
    setGameState('playing');
    setPhase('raid');
  }, []);

  const handleDrinkBeerInRaid = useCallback(() => {
    let consumed = false;
    setSave((prev) => {
      const res = consumeBeer(prev);
      consumed = res.consumed;
      return res.nextState;
    });
    return consumed;
  }, []);

  const handleRaidExtracted = useCallback(() => {
    setPhase('disassemble');
  }, []);

  const handleRaidEscapedEmpty = useCallback((snapshot: RaidOutcomeSnapshot) => {
    setSave((prev) => applyEscapedEmpty(prev));
    setOutcomeSnapshot(snapshot);
    setGameState('gameover');
  }, []);

  const handleRaidBusted = useCallback((snapshot: RaidOutcomeSnapshot) => {
    setSave((prev) => {
      const res = applyBustedPenalty(prev);
      setOutcomeSnapshot({
        ...snapshot,
        lostCashRub: res.lostCashRub,
        lostToolsCount: res.lostToolsCount,
      });
      return res.nextState;
    });
    setGameState('gameover');
  }, []);

  const handleDisassemblyDone = useCallback(() => {
    setPhase('clip');
  }, []);

  const handleClippingDone = useCallback(
    (harvest: SnippedHarvest) => {
      const payout = calculatePayout(
        activeFacility.name,
        activeFacility.deviceId,
        harvest,
        save
      );
      setLastPayout(payout);
      setSave((prev) => ({
        ...prev,
        moneyRub: prev.moneyRub + payout.playerShareRub,
        raidsCompleted: prev.raidsCompleted + 1,
        totalEarnedRub: prev.totalEarnedRub + payout.playerShareRub,
        totalPartsSnipped: prev.totalPartsSnipped + harvest.preciousSnipped,
        bestHaulRub: Math.max(prev.bestHaulRub, payout.playerShareRub),
      }));
      setPhase('payout');
    },
    [activeFacility.name, activeFacility.deviceId, save]
  );

  const handleFinishPayout = useCallback(() => {
    setLastPayout(null);
    setPhase('hub');
  }, []);

  const hasExistingProgress =
    save.raidsCompleted > 0 ||
    save.raidsBusted > 0 ||
    save.moneyRub !== INITIAL_SAVE_STATE.moneyRub ||
    Object.keys(save.ownedTools).length > 1;

  if (gameState === 'title') {
    return (
      <TitleScreen
        selectedCrew={save.crewId}
        hasExistingProgress={hasExistingProgress}
        savedRubles={save.moneyRub}
        savedRaids={save.raidsCompleted}
        onSelectCrew={handleSelectCrew}
        onStart={handleStartFromTitle}
        onResetSave={handleResetSave}
      />
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#0f1210]">
      {phase === 'hub' && (
        <BaseHub
          save={save}
          onStartRaid={handleStartRaid}
          onBuyTool={handleBuyTool}
          onChangeCrew={handleSelectCrew}
          onToggleMute={handleToggleMute}
          onPause={() => setGameState('paused')}
        />
      )}

      {phase === 'raid' && (
        <StealthRaid
          key={raidRunKey}
          facility={activeFacility}
          save={save}
          paused={gameState === 'paused'}
          onDrinkBeer={handleDrinkBeerInRaid}
          onToggleMute={handleToggleMute}
          onPause={() => setGameState('paused')}
          onExtracted={handleRaidExtracted}
          onEscapedEmpty={handleRaidEscapedEmpty}
          onBusted={handleRaidBusted}
        />
      )}

      {phase === 'disassemble' && (
        <DisassemblyBench
          deviceId={activeFacility.deviceId}
          facilityName={activeFacility.name}
          save={save}
          onComplete={handleDisassemblyDone}
        />
      )}

      {phase === 'clip' && (
        <PcbClippingBench
          deviceId={activeFacility.deviceId}
          facilityName={activeFacility.name}
          seed={raidSeed}
          save={save}
          onComplete={handleClippingDone}
        />
      )}

      {phase === 'payout' && lastPayout && (
        <PayoutModal
          payout={lastPayout}
          newBalanceRub={save.moneyRub}
          onFinishToHub={handleFinishPayout}
        />
      )}

      {gameState === 'paused' && (
        <PauseModal
          canAbortRaid={phase !== 'hub'}
          onResume={() => setGameState('playing')}
          onAbortToHub={() => {
            setGameState('playing');
            setPhase('hub');
          }}
          onGoTitle={() => {
            setGameState('title');
            setPhase('hub');
          }}
        />
      )}

      {gameState === 'gameover' && outcomeSnapshot && (
        <OutcomeModal
          snapshot={outcomeSnapshot}
          onRetryRaid={() => handleStartRaid(activeFacility.id)}
          onContinueToHub={() => {
            setOutcomeSnapshot(null);
            setGameState('playing');
            setPhase('hub');
          }}
        />
      )}
    </div>
  );
}
