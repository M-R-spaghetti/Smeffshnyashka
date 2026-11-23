import React, { useState } from 'react';
import { Volume2, VolumeX, Pause, Lock, Check, ArrowRight } from 'lucide-react';
import {
  CREW_PROFILES,
  FACILITIES,
  METAL_INFO,
  SOVIET_DEVICES,
  SOVIET_PARTS,
  TOOLS_CATALOG,
} from '../game/data';
import {
  canBuyTool,
  getCrewProfile,
  getToolCount,
  isFacilityUnlocked,
} from '../game/rules';
import { CrewId, FacilityDef, PlayerSaveState, SovietPartKind, ToolId } from '../game/types';
import { soundEngine } from '../game/audio';
import { SovietPartSvg, ToolIconSvg } from './SovietPartsSvg';

interface BaseHubProps {
  save: PlayerSaveState;
  onStartRaid: (facilityId: string) => void;
  onBuyTool: (toolId: ToolId) => void;
  onChangeCrew: (crewId: CrewId) => void;
  onToggleMute: () => void;
  onPause: () => void;
}

type HubTab = 'objects' | 'shop' | 'guide';

const MiniBlueprintPreview: React.FC<{ facility: FacilityDef }> = ({ facility }) => {
  const rows = facility.mapRows.length;
  const cols = facility.mapRows[0].length;
  return (
    <div className="w-full h-28 rounded-lg bg-[#0b0f0d] border border-[#242e28] p-2 flex items-center justify-center">
      <svg
        viewBox={`0 0 ${cols * 10} ${rows * 10}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {facility.mapRows.map((row, y) =>
          row.split('').map((ch, x) => {
            let fill = '#171d1a';
            if (ch === '#') fill = '#323d37';
            else if (ch === 'W') fill = '#38bdf8';
            else if (ch === 'P') fill = '#526059';
            else if (ch === 'D') fill = '#0ea5e9';
            else if (ch === 'K') fill = '#facc15';
            else if (ch === 'G') fill = '#64748b';
            else if (ch === 'L') fill = '#eab308';
            else if (ch === 'C') fill = '#f97316';
            else if (ch === 'V') fill = '#a78bfa';
            else if (ch === 'T') fill = '#4ade80';
            else if (ch === 'E') fill = '#22c55e';
            else if (ch === 'S') fill = '#eceae1';
            return (
              <rect
                key={`${x}-${y}`}
                x={x * 10 + 0.7}
                y={y * 10 + 0.7}
                width="8.6"
                height="8.6"
                rx="1.2"
                fill={fill}
                opacity={ch === '.' ? 0.65 : 0.95}
              />
            );
          })
        )}
      </svg>
    </div>
  );
};

export const BaseHub: React.FC<BaseHubProps> = ({
  save,
  onStartRaid,
  onBuyTool,
  onChangeCrew,
  onToggleMute,
  onPause,
}) => {
  const [tab, setTab] = useState<HubTab>('objects');
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>(FACILITIES[0].id);
  const [shopFeedback, setShopFeedback] = useState<string | null>(null);

  const crew = getCrewProfile(save.crewId);
  const selectedFacility =
    FACILITIES.find((f) => f.id === selectedFacilityId) ?? FACILITIES[0];
  const selectedDevice = SOVIET_DEVICES[selectedFacility.deviceId];
  const selectedUnlocked = isFacilityUnlocked(save, selectedFacility);

  const ownedToolsList = TOOLS_CATALOG.filter((t) => getToolCount(save, t.id) > 0);

  const handleBuy = (toolId: ToolId) => {
    const check = canBuyTool(save, toolId);
    if (!check.ok) {
      soundEngine.playSnip(false);
      setShopFeedback(check.reason ?? 'Недоступно');
      return;
    }
    soundEngine.playCashPayout();
    onBuyTool(toolId);
    const bought = TOOLS_CATALOG.find((t) => t.id === toolId);
    setShopFeedback(`Куплено: ${bought?.name}`);
  };

  return (
    <div className="min-h-screen w-full bg-[#0f1210] industrial-grid text-[#eceae1] flex flex-col">
      {/* Compact Game Shell Top Telemetry Bar */}
      <div className="sticky top-0 z-20 bg-[#121614] border-b border-[#272f2a] px-4 sm:px-8 py-3">
        <div className="max-w-[1360px] mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Left: Game title & Crew */}
          <div className="flex items-center gap-5">
            <span className="font-display font-extrabold text-base sm:text-lg tracking-wide text-[#eceae1] whitespace-nowrap">
              ЗАЛАЗ · БАЗА
            </span>
            <div className="hidden sm:flex items-center gap-2 text-xs text-[#9ca69f] font-mono-num">
              <span>Бригада: {crew.name}</span>
              <span aria-hidden="true">·</span>
              <span>Доля {Math.round(crew.shareRate * 100)}%</span>
              <span aria-hidden="true">·</span>
              <span>Залазов: {save.raidsCompleted}</span>
            </div>
          </div>

          {/* Center: Mode Tabs */}
          <div
            className="flex items-center gap-1 p-1 rounded-lg bg-[#0b0e0c] border border-[#252d28]"
            role="tablist"
            aria-label="Разделы базы"
          >
            {(
              [
                { id: 'objects', label: 'Объекты' },
                { id: 'shop', label: 'Барахолка' },
                { id: 'guide', label: 'Справочник ДМ' },
              ] as const
            ).map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    soundEngine.playClick();
                    setTab(item.id);
                    setShopFeedback(null);
                  }}
                  className={`px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#eab308] text-[#0f1110] font-semibold'
                      : 'text-[#a2aba4] hover:text-[#eceae1]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Right: Rubles readout + Utility square icon buttons */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-[10px] font-mono text-[#8d948e] leading-none">
                КАССА (ТВОЯ ДОЛЯ)
              </div>
              <div
                data-testid="hub-money"
                className="font-mono-num text-lg sm:text-xl font-bold text-[#eab308] leading-tight"
              >
                {save.moneyRub.toLocaleString('ru-RU')} ₽
              </div>
            </div>

            <button
              type="button"
              tabIndex={-1}
              aria-label={save.muted ? 'Включить звук' : 'Выключить звук'}
              title="Звук [M]"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="w-10 h-10 rounded-lg bg-[#1a1f1c] hover:bg-[#242b27] border border-[#303934] flex items-center justify-center text-[#cfd5d0]"
            >
              {save.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Пауза"
              title="Пауза [P / Esc]"
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              className="w-10 h-10 rounded-lg bg-[#1a1f1c] hover:bg-[#242b27] border border-[#303934] flex items-center justify-center text-[#cfd5d0]"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-8 py-6">
        {tab === 'objects' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 cols: Facility list */}
            <section className="lg:col-span-7 flex flex-col gap-3" aria-label="Список объектов">
              <div className="flex items-baseline justify-between">
                <h1 className="font-display text-xl sm:text-2xl font-bold text-[#eceae1]">
                  Заброшки и режимные объекты
                </h1>
                <span className="text-xs font-mono-num text-[#8d948e]">
                  Открыто {FACILITIES.filter((f) => isFacilityUnlocked(save, f)).length} / {FACILITIES.length}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {FACILITIES.map((fac) => {
                  const unlocked = isFacilityUnlocked(save, fac);
                  const active = fac.id === selectedFacility.id;
                  const dev = SOVIET_DEVICES[fac.deviceId];
                  return (
                    <button
                      key={fac.id}
                      type="button"
                      onClick={() => {
                        soundEngine.playClick();
                        setSelectedFacilityId(fac.id);
                      }}
                      className={`text-left p-4 rounded-xl border transition-all flex flex-col gap-2.5 ${
                        active
                          ? 'bg-[#1a201d] border-[#eab308]'
                          : 'bg-[#141816] border-[#262e29] hover:border-[#3f4b44]'
                      } ${!unlocked ? 'opacity-75' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs text-[#8d948e] font-mono">
                            {fac.category} · {fac.difficultyLabel}
                          </div>
                          <div className="mt-0.5 font-display text-base font-bold text-[#eceae1]">
                            {fac.name}
                          </div>
                        </div>
                        {!unlocked && (
                          <Lock className="w-4 h-4 text-[#8d948e] shrink-0 mt-1" aria-label="Закрыто" />
                        )}
                      </div>

                      <MiniBlueprintPreview facility={fac} />

                      <div className="flex items-center justify-between text-xs font-mono-num pt-0.5">
                        <span className="text-[#c5cdc7]">Прибор: {dev.code}</span>
                        <span className="text-[#4ade80] font-semibold">
                          {fac.expectedHaulRange}
                        </span>
                      </div>

                      {!unlocked && (
                        <div className="text-[11px] text-[#f59e0b] font-mono-num">
                          Нужно успешных залазов: {fac.unlockRaidsRequired} (сейчас {save.raidsCompleted})
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Right 5 cols: Mission briefing + Active Gear + Crew switch */}
            <aside className="lg:col-span-5 flex flex-col gap-4">
              <div className="p-5 sm:p-6 rounded-xl bg-[#151917] border border-[#2b342f]">
                <div className="text-xs font-mono text-[#eab308]">
                  Разведсводка объекта · Сложность {selectedFacility.difficulty}/4
                </div>
                <h2 className="mt-1 font-display text-xl sm:text-2xl font-bold text-[#eceae1]">
                  {selectedFacility.name}
                </h2>
                <p className="mt-2.5 text-sm text-[#bcc5be] leading-relaxed">
                  {selectedFacility.description}
                </p>

                <div className="mt-4 pt-4 border-t border-[#252d28] grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[11px] font-mono text-[#8d948e]">Цель выноса</div>
                    <div className="mt-0.5 font-semibold text-[#eceae1]">
                      {selectedDevice.name}
                    </div>
                    <div className="text-xs text-[#9ca59e]">{selectedDevice.subtitle}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-mono text-[#8d948e]">Оценка хабара</div>
                    <div className="mt-0.5 font-mono-num font-bold text-[#4ade80] text-base">
                      {selectedFacility.expectedHaulRange}
                    </div>
                    <div className="text-xs text-[#9ca59e] font-mono-num">
                      {selectedFacility.rooms.length} комнат · Охрана: {selectedFacility.guards.length} · {selectedFacility.timeLimitSec} с
                    </div>
                  </div>
                </div>

                {/* Blueprint legend */}
                <div className="mt-4 pt-3 border-t border-[#252d28] text-xs font-mono text-[#9ca59e] flex flex-wrap gap-x-3.5 gap-y-1">
                  <span><strong className="text-[#38bdf8]">■</strong> Окна</span>
                  <span><strong className="text-[#647a6e]">■</strong> Станки</span>
                  <span><strong className="text-[#0ea5e9]">■</strong> Щиток</span>
                  <span><strong className="text-[#facc15]">■</strong> Ключ</span>
                  <span><strong className="text-[#eab308]">■</strong> Замок</span>
                  <span><strong className="text-[#f97316]">■</strong> Цепь</span>
                  <span><strong className="text-[#a78bfa]">■</strong> Люк (2+ ур.)</span>
                  <span><strong className="text-[#4ade80]">■</strong> Прибор</span>
                </div>

                <button
                  type="button"
                  disabled={!selectedUnlocked}
                  onClick={() => {
                    soundEngine.playClick();
                    onStartRaid(selectedFacility.id);
                  }}
                  className={`mt-5 w-full py-3.5 px-5 rounded-lg font-display font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all ${
                    selectedUnlocked
                      ? 'bg-[#eab308] hover:bg-[#facc15] active:scale-[0.99] text-[#0f1110]'
                      : 'bg-[#222825] text-[#6d7670] cursor-not-allowed'
                  }`}
                >
                  {selectedUnlocked ? (
                    <>
                      <span>Выйти на залаз</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  ) : (
                    <span>Объект закрыт (выполни прошлый залаз)</span>
                  )}
                </button>
              </div>

              {/* Active Backpack Gear */}
              <div className="p-5 rounded-xl bg-[#141816] border border-[#262e29]">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-[#eceae1]">
                    Рюкзак лазателя ({ownedToolsList.length}/{TOOLS_CATALOG.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playClick();
                      setTab('shop');
                    }}
                    className="text-xs font-medium text-[#eab308] hover:underline"
                  >
                    Докупить снарягу
                  </button>
                </div>

                {ownedToolsList.length === 0 ? (
                  <p className="mt-2.5 text-xs text-[#8d948e]">
                    Рюкзак пуст — идёшь голыми руками. Зайди на барахолку за отмычками, пивом или
                    болторезом.
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {ownedToolsList.map((tool) => {
                      const qty = getToolCount(save, tool.id);
                      return (
                        <div
                          key={tool.id}
                          className="flex items-center gap-2.5 p-2 rounded-lg bg-[#0f1311] border border-[#242c27]"
                        >
                          <ToolIconSvg id={tool.id} className="w-6 h-6 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-[#eceae1] truncate">
                              {tool.name}
                            </div>
                            <div className="text-[11px] font-mono-num text-[#4ade80]">
                              {tool.consumable ? `${qty} шт.` : 'В наличии'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Quick Crew Switcher */}
                <div className="mt-4 pt-3.5 border-t border-[#242c27]">
                  <div className="text-[11px] font-mono text-[#8d948e] mb-2">
                    Сменить бригаду
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {CREW_PROFILES.map((c) => {
                      const active = c.id === save.crewId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            soundEngine.playClick();
                            onChangeCrew(c.id);
                          }}
                          className={`py-1.5 px-2 rounded-md text-xs font-medium border transition-colors ${
                            active
                              ? 'bg-[#202622] border-[#eab308] text-[#eceae1]'
                              : 'bg-[#101311] border-[#262e29] text-[#8d948e] hover:text-[#eceae1]'
                          }`}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}

        {tab === 'shop' && (
          <section aria-label="Барахолка инструментов">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
              <div>
                <h1 className="font-display text-xl sm:text-2xl font-bold text-[#eceae1]">
                  Барахолка · Инструмент и расходники
                </h1>
                <p className="mt-1 text-sm text-[#9ca59e]">
                  Всё снаряжение реально работает на залазе, разборке и скупке. Осторожно: при
                  запале ЧОП забирает весь инструмент и кассу!
                </p>
              </div>
              {shopFeedback && (
                <div
                  role="status"
                  className="text-xs sm:text-sm font-mono text-[#eab308] bg-[#1b1f1c] border border-[#3a351c] px-3.5 py-2 rounded-lg"
                >
                  {shopFeedback}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {TOOLS_CATALOG.map((tool) => {
                const qty = getToolCount(save, tool.id);
                const check = canBuyTool(save, tool.id);
                const ownedPermanent = !tool.consumable && qty >= 1;
                return (
                  <div
                    key={tool.id}
                    className={`p-5 rounded-xl border flex flex-col justify-between gap-4 ${
                      ownedPermanent
                        ? 'bg-[#141c17] border-[#2e4a38]'
                        : 'bg-[#141816] border-[#272f2a]'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-lg bg-[#0d100f] border border-[#2a322d] flex items-center justify-center shrink-0">
                            <ToolIconSvg id={tool.id} className="w-7 h-7" />
                          </div>
                          <div>
                            <h2 className="font-display text-sm font-bold text-[#eceae1] leading-snug">
                              {tool.name}
                            </h2>
                            <div className="text-xs text-[#4ade80] font-mono mt-0.5">
                              {tool.shortRole}
                            </div>
                          </div>
                        </div>
                      </div>

                      <p className="mt-3 text-xs sm:text-sm text-[#a8b2ab] leading-relaxed">
                        {tool.description}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-[#232b26] flex items-center justify-between gap-3">
                      <div className="font-mono-num">
                        <div className="text-base font-bold text-[#eab308]">
                          {tool.price.toLocaleString('ru-RU')} ₽
                        </div>
                        {tool.consumable && (
                          <div className="text-[11px] text-[#8d948e]">
                            В рюкзаке: {qty} / {tool.maxStack}
                          </div>
                        )}
                      </div>

                      {ownedPermanent ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-[#4ade80]">
                          <Check className="w-4 h-4" /> Куплено
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={!check.ok}
                          onClick={() => handleBuy(tool.id)}
                          className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                            check.ok
                              ? 'bg-[#eab308] hover:bg-[#facc15] text-[#0f1110]'
                              : 'bg-[#202622] text-[#6d7670] cursor-not-allowed'
                          }`}
                        >
                          {check.ok ? 'Купить' : check.reason}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === 'guide' && (
          <section aria-label="Справочник советских радиодеталей">
            <div className="mb-5">
              <h1 className="font-display text-xl sm:text-2xl font-bold text-[#eceae1]">
                Справочник советских радиодеталей (ДМ)
              </h1>
              <p className="mt-1 text-sm text-[#9ca59e]">
                Запоминай корпуса: КМ-5, КМ-6, ППМЛ, 133-я керамика, «вертолёты» КТ904, РЭС-9 и
                лампы дают золото, палладий, платину и серебро. Резисторы МЛТ и бочонки К50-6 —
                пустышки, их не скусывай!
              </p>
            </div>

            {/* Live metal rates bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {(['au', 'pd', 'pt', 'ag'] as const).map((m) => (
                <div
                  key={m}
                  className="p-3.5 rounded-lg bg-[#141816] border border-[#272f2a] flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs text-[#8d948e]">{METAL_INFO[m].name}</div>
                    <div
                      className="font-display text-lg font-bold"
                      style={{ color: METAL_INFO[m].color }}
                    >
                      {METAL_INFO[m].symbol}
                    </div>
                  </div>
                  <div className="text-right font-mono-num">
                    <div className="text-sm font-bold text-[#eceae1]">
                      {METAL_INFO[m].rubPerGram.toLocaleString('ru-RU')} ₽
                    </div>
                    <div className="text-[11px] text-[#8d948e]">за 1 г</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(Object.keys(SOVIET_PARTS) as SovietPartKind[]).map((kind) => {
                const part = SOVIET_PARTS[kind];
                return (
                  <div
                    key={kind}
                    className={`p-4 rounded-xl border flex flex-col gap-3 ${
                      part.isPrecious
                        ? 'bg-[#141816] border-[#28312c]'
                        : 'bg-[#171313] border-[#3d2525]'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-16 rounded-lg bg-[#0d120f] border border-[#242e28] flex items-center justify-center shrink-0 p-1.5">
                        <SovietPartSvg kind={kind} className="w-full h-full" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-mono text-[#8d948e]">
                          {part.code} · {part.era}
                        </div>
                        <div className="font-display text-sm font-bold text-[#eceae1] leading-snug">
                          {part.name}
                        </div>
                        <div
                          className={`mt-1 text-xs font-mono-num font-semibold ${
                            part.isPrecious ? 'text-[#4ade80]' : 'text-[#ef4444]'
                          }`}
                        >
                          {part.isPrecious
                            ? `≈ ${part.baseValueRub} ₽ / шт.`
                            : 'Пустышка · 0 ₽'}
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-[#a8b2ab] leading-relaxed">{part.tip}</p>

                    {part.isPrecious && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono-num text-[#cfd5d0] pt-2 border-t border-[#232b26]">
                        {part.metalsMg.au > 0 && (
                          <span className="text-[#eab308]">Au {part.metalsMg.au} мг</span>
                        )}
                        {part.metalsMg.pd > 0 && (
                          <span className="text-[#4ade80]">Pd {part.metalsMg.pd} мг</span>
                        )}
                        {part.metalsMg.pt > 0 && (
                          <span className="text-[#38bdf8]">Pt {part.metalsMg.pt} мг</span>
                        )}
                        {part.metalsMg.ag > 0 && (
                          <span className="text-[#cbd5e1]">Ag {part.metalsMg.ag} мг</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
