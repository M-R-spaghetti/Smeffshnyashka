import React from 'react';
import { RaidOutcomeSnapshot } from '../game/types';
import { soundEngine } from '../game/audio';

interface PauseModalProps {
  canAbortRaid: boolean;
  onResume: () => void;
  onAbortToHub: () => void;
  onGoTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  canAbortRaid,
  onResume,
  onAbortToHub,
  onGoTitle,
}) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#070908]/88"
    role="dialog"
    aria-modal="true"
    aria-labelledby="pause-title"
  >
    <div className="w-full max-w-md rounded-xl bg-[#151816] border border-[#323a35] p-6 shadow-2xl">
      <h2 id="pause-title" className="font-display text-2xl font-bold text-[#eceae1]">
        Пауза
      </h2>
      <p className="mt-2 text-sm text-[#9ca59e]">
        Таймер и обход охраны остановлены. Можно перевести дух и проверить план объекта.
      </p>

      <div className="mt-6 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => {
            soundEngine.playClick();
            onResume();
          }}
          className="w-full py-3 px-4 rounded-lg bg-[#eab308] hover:bg-[#facc15] text-[#0f1110] font-display font-bold text-sm transition-colors"
        >
          Продолжить
        </button>

        {canAbortRaid && (
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              onAbortToHub();
            }}
            className="w-full py-3 px-4 rounded-lg bg-[#202622] hover:bg-[#2a322d] border border-[#38423c] text-[#eceae1] font-medium text-sm transition-colors"
          >
            Отступить на базу без хабара
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            soundEngine.playClick();
            onGoTitle();
          }}
          className="w-full py-3 px-4 rounded-lg bg-transparent hover:bg-[#1d221f] border border-[#2d3430] text-[#a7b0a9] hover:text-[#eceae1] font-medium text-sm transition-colors"
        >
          В главное меню
        </button>
      </div>
    </div>
  </div>
);

interface OutcomeModalProps {
  snapshot: RaidOutcomeSnapshot;
  onContinueToHub: () => void;
  onRetryRaid: () => void;
}

export const OutcomeModal: React.FC<OutcomeModalProps> = ({
  snapshot,
  onContinueToHub,
  onRetryRaid,
}) => {
  const isBusted = snapshot.outcome === 'busted';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#070908]/92"
      role="dialog"
      aria-modal="true"
      aria-labelledby="outcome-title"
    >
      <div
        className={`w-full max-w-lg rounded-xl bg-[#151816] border p-6 sm:p-7 shadow-2xl ${
          isBusted ? 'border-[#ef4444]' : 'border-[#eab308]'
        }`}
      >
        <div className="text-xs font-mono-num text-[#8d948e]">
          {snapshot.facilityName} · {Math.round(snapshot.timeSurvivedSec)} сек на объекте
        </div>

        <h2
          id="outcome-title"
          className={`mt-1.5 font-display text-2xl sm:text-3xl font-extrabold ${
            isBusted ? 'text-[#ef4444]' : 'text-[#eab308]'
          }`}
        >
          {isBusted ? 'ЗАПАЛ! ТЕБЯ ПРИНЯЛИ' : 'УШЁЛ ПУСТЫМ'}
        </h2>

        <p className="mt-3 text-sm sm:text-base text-[#cfd5d0] leading-relaxed">
          {snapshot.reason}
        </p>

        {/* 3 tabular-nums outcome metrics */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-[#101311] border border-[#282f2b]">
            <div className="text-[11px] font-mono text-[#88918a]">Пик запала</div>
            <div className="mt-1 font-mono-num text-xl font-bold text-[#eceae1]">
              {Math.round(snapshot.alertPeak)}%
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[#101311] border border-[#282f2b]">
            <div className="text-[11px] font-mono text-[#88918a]">
              {isBusted ? 'Изъято денег' : 'Деньги'}
            </div>
            <div
              className={`mt-1 font-mono-num text-xl font-bold ${
                isBusted ? 'text-[#ef4444]' : 'text-[#4ade80]'
              }`}
            >
              {isBusted ? `−${snapshot.lostCashRub.toLocaleString('ru-RU')} ₽` : 'Целы'}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[#101311] border border-[#282f2b]">
            <div className="text-[11px] font-mono text-[#88918a]">
              {isBusted ? 'Изъят инструмент' : 'Снаряга'}
            </div>
            <div
              className={`mt-1 font-mono-num text-xl font-bold ${
                isBusted ? 'text-[#ef4444]' : 'text-[#4ade80]'
              }`}
            >
              {isBusted ? `−${snapshot.lostToolsCount} шт.` : 'Цела'}
            </div>
          </div>
        </div>

        {isBusted && (
          <p className="mt-4 text-xs text-[#fca5a5] leading-relaxed">
            ЧОП и полиция забрали всю снарягу и наличку. Начинай с пустыми карманами с простого
            цеха №4 — накопишь на отмычки и болторез заново!
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            data-start="true"
            onClick={() => {
              soundEngine.playClick();
              onRetryRaid();
            }}
            className="flex-1 py-3 px-5 rounded-lg bg-[#eab308] hover:bg-[#facc15] text-[#0f1110] font-display font-bold text-sm transition-colors whitespace-nowrap"
          >
            Попробовать снова
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              onContinueToHub();
            }}
            className="flex-1 py-3 px-5 rounded-lg bg-[#202622] hover:bg-[#2a322d] border border-[#38423c] text-[#eceae1] font-medium text-sm transition-colors whitespace-nowrap"
          >
            Вернуться на базу
          </button>
        </div>
      </div>
    </div>
  );
};
