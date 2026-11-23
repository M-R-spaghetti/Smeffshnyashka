import React from 'react';
import { ArrowRight } from 'lucide-react';
import { METAL_INFO } from '../game/data';
import { PayoutBreakdown } from '../game/types';
import { soundEngine } from '../game/audio';
import { SovietPartSvg } from './SovietPartsSvg';

interface PayoutModalProps {
  payout: PayoutBreakdown;
  newBalanceRub: number;
  onFinishToHub: () => void;
}

export const PayoutModal: React.FC<PayoutModalProps> = ({
  payout,
  newBalanceRub,
  onFinishToHub,
}) => {
  return (
    <div className="min-h-screen w-full bg-[#0f1210] industrial-grid text-[#eceae1] flex items-center justify-center p-4 sm:p-8">
      <main className="w-full max-w-2xl rounded-2xl bg-[#151917] border border-[#303a34] p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#272f2a] pb-4">
          <div>
            <div className="text-xs font-mono text-[#4ade80]">
              РАДИОРЫНОК · КВИТАНЦИЯ СКУПКИ ДРАГМЕТАЛЛОВ
            </div>
            <h1 className="mt-1 font-display text-2xl sm:text-3xl font-extrabold text-[#eceae1]">
              Сдано: {payout.deviceCode}
            </h1>
            <div className="text-xs text-[#9ca59e] mt-0.5">
              Объект: {payout.facilityName} · {payout.deviceName}
            </div>
          </div>
          <div className="text-right font-mono-num">
            <div className="text-[11px] text-[#8d948e]">НОВЫЙ БАЛАНС</div>
            <div className="text-xl font-bold text-[#eab308]">
              {newBalanceRub.toLocaleString('ru-RU')} ₽
            </div>
          </div>
        </div>

        {/* Metals weight summary */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['au', 'pd', 'pt', 'ag'] as const).map((m) => (
            <div
              key={m}
              className="p-3 rounded-lg bg-[#101412] border border-[#242c27]"
            >
              <div className="text-xs font-mono" style={{ color: METAL_INFO[m].color }}>
                {METAL_INFO[m].symbol} · {METAL_INFO[m].name}
              </div>
              <div className="mt-1 font-mono-num text-base font-bold text-[#eceae1]">
                {(payout.metalsMg[m] / 1000).toFixed(3)} г
              </div>
            </div>
          ))}
        </div>

        {/* Itemized Soviet parts list */}
        <div className="mt-5">
          <div className="text-xs font-mono text-[#8d948e] mb-2">
            Скусанные радиодетали СССР
          </div>
          {payout.partsSummary.length === 0 ? (
            <div className="p-4 rounded-lg bg-[#101412] border border-[#242c27] text-sm text-[#9ca59e]">
              Ценных деталей не сдано — скупщик развёл руками.
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto divide-y divide-[#222925] rounded-lg bg-[#101412] border border-[#242c27] px-3">
              {payout.partsSummary.map((row) => (
                <div
                  key={row.kind}
                  className="py-2.5 flex items-center justify-between gap-3 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <SovietPartSvg kind={row.kind} className="w-10 h-7 shrink-0" />
                    <span className="font-mono text-xs sm:text-sm text-[#eceae1] truncate">
                      {row.code}
                    </span>
                    <span className="font-mono-num text-xs text-[#8d948e]">
                      ×{row.count}
                    </span>
                  </div>
                  <span className="font-mono-num font-semibold text-[#4ade80] shrink-0">
                    +{row.valueRub.toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Financial breakdown & Crew Share ("Твоя доля") */}
        <div className="mt-5 pt-4 border-t border-[#272f2a] flex flex-col gap-2 text-sm font-mono-num">
          <div className="flex justify-between text-[#b5beb8]">
            <span>Валовая стоимость драгметаллов</span>
            <span>{payout.grossRub.toLocaleString('ru-RU')} ₽</span>
          </div>
          {payout.purityBonusRub > 0 && (
            <div className="flex justify-between text-[#4ade80]">
              <span>Бонус за чистую сортировку (без мусора)</span>
              <span>+{payout.purityBonusRub.toLocaleString('ru-RU')} ₽</span>
            </div>
          )}
          <div className="flex justify-between text-[#9ca59e]">
            <span>Доля бригады и скупщика ({100 - payout.sharePercent}%)</span>
            <span>−{payout.crewCutRub.toLocaleString('ru-RU')} ₽</span>
          </div>
          <div className="mt-2 pt-3 border-t border-[#2f3a34] flex items-baseline justify-between">
            <span className="font-display text-base font-bold text-[#eceae1]">
              ТВОЯ ДОЛЯ ({payout.sharePercent}%)
            </span>
            <span
              data-testid="payout-player-share"
              className="font-display text-2xl sm:text-3xl font-extrabold text-[#eab308]"
            >
              +{payout.playerShareRub.toLocaleString('ru-RU')} ₽
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            soundEngine.playClick();
            onFinishToHub();
          }}
          className="mt-6 w-full py-3.5 px-6 rounded-lg bg-[#eab308] hover:bg-[#facc15] active:scale-[0.99] text-[#0f1110] font-display font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all"
        >
          <span>Забрать долю и вернуться на базу</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </main>
    </div>
  );
};
