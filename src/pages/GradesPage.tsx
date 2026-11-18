import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import clsx from 'clsx';
import {
  Award,
  BellPlus,
  Calculator,
  ChevronDown,
  ChevronUp,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { db } from '@/db/database';
import type { Grade } from '@/models/types';

interface VirtualGrade {
  id: string;
  subject: string;
  value: string;
  weight: number;
}

const SIMULATOR_GRADE_OPTIONS = [
  '6',
  '6-',
  '5+',
  '5',
  '5-',
  '4+',
  '4',
  '4-',
  '3+',
  '3',
  '3-',
  '2+',
  '2',
  '2-',
  '1+',
  '1',
] as const;

const SIMULATOR_WEIGHT_OPTIONS = [1, 2, 3, 4, 5] as const;

/**
 * Converts a Polish school grade symbol ("5", "4+", "3-", "+") into a numeric
 * value for weighted average calculation. Returns `null` if non-numeric ("+", "np", "nb").
 */
export function parseGradeNumericValue(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  // Sometimes eduVULCAN returns ".5, 5" for improved grades; take the last token
  const parts = cleaned.split(/\s*,\s*/);
  const token = parts[parts.length - 1].replace(/^\./, '').trim();

  const map: Record<string, number> = {
    '1': 1.0,
    '1+': 1.5,
    '2-': 1.75,
    '2': 2.0,
    '2+': 2.5,
    '3-': 2.75,
    '3': 3.0,
    '3+': 3.5,
    '4-': 3.75,
    '4': 4.0,
    '4+': 4.5,
    '5-': 4.75,
    '5': 5.0,
    '5+': 5.5,
    '6-': 5.75,
    '6': 6.0,
  };

  if (token in map) return map[token];
  return null;
}

/**
 * Computes weighted average for a list of grades.
 * If all numeric grades in the list have weight <= 0, treats each of them as weight 1.
 */
export function computeWeightedAverage(
  items: ReadonlyArray<{ value: string; weight: number }>,
): number | null {
  const numericItems: Array<{ num: number; weight: number }> = [];
  for (const item of items) {
    const num = parseGradeNumericValue(item.value);
    if (num !== null) {
      numericItems.push({ num, weight: item.weight });
    }
  }
  if (numericItems.length === 0) return null;

  const allZeroWeight = numericItems.every((x) => x.weight <= 0);
  let weightedSum = 0;
  let totalWeight = 0;

  for (const item of numericItems) {
    const effectiveWeight = allZeroWeight ? 1 : item.weight;
    if (effectiveWeight <= 0) continue;
    weightedSum += item.num * effectiveWeight;
    totalWeight += effectiveWeight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

/** Returns Tailwind classes for a grade tile based on its numeric value. */
function getGradeTileStyle(value: string, isVirtual = false): string {
  if (isVirtual) {
    return 'border-2 border-dashed border-violet-500 bg-violet-50 text-violet-800 dark:border-violet-400 dark:bg-violet-950/70 dark:text-violet-200';
  }
  const num = parseGradeNumericValue(value);
  if (num === null) {
    return 'border border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
  if (num >= 5.5) {
    return 'bg-emerald-600 text-white shadow-sm dark:bg-emerald-500';
  }
  if (num >= 4.75) {
    return 'bg-green-600 text-white shadow-sm dark:bg-green-500';
  }
  if (num >= 3.75) {
    return 'bg-sky-600 text-white shadow-sm dark:bg-sky-500';
  }
  if (num >= 2.75) {
    return 'bg-amber-500 text-white shadow-sm dark:bg-amber-500';
  }
  if (num >= 1.75) {
    return 'bg-orange-500 text-white shadow-sm dark:bg-orange-500';
  }
  return 'bg-rose-600 text-white shadow-sm dark:bg-rose-500';
}

function formatGradeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function GradesPage() {
  const { session, simulateIncomingGrade } = useApp();
  const allGrades = useLiveQuery(() => db.grades.toArray(), [], [] as Grade[]);

  const [virtualGrades, setVirtualGrades] = useState<VirtualGrade[]>([]);
  const [openSimulatorSubject, setOpenSimulatorSubject] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const [simValue, setSimValue] = useState<string>('5');
  const [simWeight, setSimWeight] = useState<number>(3);
  const [isSimulatingIncoming, setIsSimulatingIncoming] = useState(false);

  // Group grades by subject
  const subjectsData = useMemo(() => {
    const map = new Map<string, Grade[]>();
    for (const g of allGrades) {
      const list = map.get(g.subject) ?? [];
      list.push(g);
      map.set(g.subject, list);
    }

    return Array.from(map.entries())
      .map(([subject, grades]) => {
        const sortedGrades = [...grades].sort((a, b) => a.date.localeCompare(b.date));
        const subjectVirtual = virtualGrades.filter((v) => v.subject === subject);

        // If every numeric real grade for this subject has weight <= 0, treat them as weight 1
        const realNumeric = sortedGrades.filter((g) => parseGradeNumericValue(g.value) !== null);
        const allRealZeroWeight =
          realNumeric.length > 0 && realNumeric.every((g) => g.weight <= 0);
        const normalizedReal = allRealZeroWeight
          ? sortedGrades.map((g) =>
              parseGradeNumericValue(g.value) !== null ? { ...g, weight: 1 } : g,
            )
          : sortedGrades;

        const baseAverage = computeWeightedAverage(normalizedReal);
        const simulatedAverage =
          subjectVirtual.length > 0
            ? computeWeightedAverage([...normalizedReal, ...subjectVirtual])
            : baseAverage;
        const teacher = sortedGrades.find((g) => g.teacher)?.teacher ?? '';

        return {
          subject,
          teacher,
          grades: sortedGrades,
          virtualGrades: subjectVirtual,
          baseAverage,
          simulatedAverage,
        };
      })
      .sort((a, b) => a.subject.localeCompare(b.subject, 'pl'));
  }, [allGrades, virtualGrades]);

  // Overall average across all subjects (real vs simulated)
  const overallStats = useMemo(() => {
    const realAvgs = subjectsData
      .map((s) => s.baseAverage)
      .filter((v): v is number => v !== null);
    const simAvgs = subjectsData
      .map((s) => s.simulatedAverage)
      .filter((v): v is number => v !== null);

    const realOverall =
      realAvgs.length > 0 ? realAvgs.reduce((a, b) => a + b, 0) / realAvgs.length : null;
    const simOverall =
      simAvgs.length > 0 ? simAvgs.reduce((a, b) => a + b, 0) / simAvgs.length : null;

    return { realOverall, simOverall, totalGrades: allGrades.length };
  }, [subjectsData, allGrades.length]);

  const handleAddVirtualGrade = (subject: string) => {
    setVirtualGrades((prev) => [
      ...prev,
      {
        id: `virt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        subject,
        value: simValue,
        weight: simWeight,
      },
    ]);
  };

  const handleRemoveVirtualGrade = (id: string) => {
    setVirtualGrades((prev) => prev.filter((v) => v.id !== id));
  };

  const handleClearSubjectVirtual = (subject: string) => {
    setVirtualGrades((prev) => prev.filter((v) => v.subject !== subject));
  };

  const handleSimulateIncomingGrade = async () => {
    if (isSimulatingIncoming) return;
    setIsSimulatingIncoming(true);
    try {
      await simulateIncomingGrade();
    } finally {
      setIsSimulatingIncoming(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5 p-3.5">
      {/* Overall Summary Header */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Średnia ze wszystkich przedmiotów
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
                {overallStats.simOverall !== null ? overallStats.simOverall.toFixed(2) : '—'}
              </span>
              {virtualGrades.length > 0 &&
                overallStats.realOverall !== null &&
                overallStats.simOverall !== null && (
                  <span
                    className={clsx(
                      'rounded-full px-2 py-0.5 text-xs font-bold',
                      overallStats.simOverall >= overallStats.realOverall
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300',
                    )}
                  >
                    było {overallStats.realOverall.toFixed(2)} (
                    {overallStats.simOverall - overallStats.realOverall >= 0 ? '+' : ''}
                    {(overallStats.simOverall - overallStats.realOverall).toFixed(2)})
                  </span>
                )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {subjectsData.length} przedmiotów · {overallStats.totalGrades} ocen w bazie offline
            </p>
          </div>

          {virtualGrades.length > 0 && (
            <button
              type="button"
              onClick={() => setVirtualGrades([])}
              className="inline-flex items-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300"
            >
              <RotateCcw size={13} />
              <span>Reset symulatora ({virtualGrades.length})</span>
            </button>
          )}
        </div>

        {/* Demo Mode Grade Notification Button */}
        {session.mode === 'mock' && (
          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => void handleSimulateIncomingGrade()}
              disabled={isSimulatingIncoming}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-60"
            >
              <BellPlus size={15} />
              <span>
                {isSimulatingIncoming
                  ? 'Generowanie oceny…'
                  : 'Symuluj nową ocenę i powiadomienie (Demo)'}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Selected Grade Detail Banner */}
      {selectedGrade && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-3.5 shadow-sm dark:border-brand-800/80 dark:bg-brand-950/40">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={clsx(
                  'flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-sm font-extrabold',
                  getGradeTileStyle(selectedGrade.value),
                )}
              >
                <span>{selectedGrade.value}</span>
                <span className="text-[9px] font-normal opacity-90">w:{selectedGrade.weight}</span>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                  {selectedGrade.subject} · {selectedGrade.category}
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {selectedGrade.description || 'Ocena cząstkowa'}
                </p>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                  Waga: <strong>{selectedGrade.weight}</strong> · Data:{' '}
                  {formatGradeDate(selectedGrade.date)}
                  {selectedGrade.teacher ? ` · ${selectedGrade.teacher}` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedGrade(null)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-white/70 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Zamknij
            </button>
          </div>
        </div>
      )}

      {/* Subjects List */}
      {subjectsData.length === 0 ? (
        <div className="my-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Award size={24} />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Brak zapisanych ocen
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Zsynchronizuj dane, aby pobrać oceny do pamięci offline.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {subjectsData.map(
            ({ subject, teacher, grades, virtualGrades: subjVirtual, baseAverage, simulatedAverage }) => {
              const isSimOpen = openSimulatorSubject === subject;
              const hasSim = subjVirtual.length > 0;
              const delta =
                baseAverage !== null && simulatedAverage !== null
                  ? simulatedAverage - baseAverage
                  : null;

              return (
                <section
                  key={subject}
                  className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  {/* Subject Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800/80">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                        {subject}
                      </h2>
                      {teacher && (
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {teacher}
                        </p>
                      )}
                    </div>

                    {/* Weighted Average Pill */}
                    <div className="flex shrink-0 flex-col items-end">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400">Średnia:</span>
                        <span
                          className={clsx(
                            'rounded-xl px-2.5 py-0.5 text-xs font-extrabold',
                            hasSim
                              ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200'
                              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
                          )}
                        >
                          {simulatedAverage !== null ? simulatedAverage.toFixed(2) : '—'}
                        </span>
                      </div>

                      {hasSim && delta !== null && baseAverage !== null && (
                        <span
                          className={clsx(
                            'mt-0.5 text-[10px] font-semibold',
                            delta >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400',
                          )}
                        >
                          z {baseAverage.toFixed(2)} ({delta >= 0 ? '+' : ''}
                          {delta.toFixed(2)})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Grade Tiles */}
                  <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                    {grades.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() =>
                          setSelectedGrade((prev) => (prev?.id === g.id ? null : g))
                        }
                        title={`${g.category}: ${g.description || g.value} (waga ${g.weight})`}
                        className={clsx(
                          'flex h-11 min-w-[44px] flex-col items-center justify-center rounded-xl px-2 transition active:scale-95',
                          getGradeTileStyle(g.value),
                          selectedGrade?.id === g.id && 'ring-2 ring-brand-600 ring-offset-2 dark:ring-offset-slate-900',
                        )}
                      >
                        <span className="text-sm font-extrabold leading-none">{g.value}</span>
                        <span className="mt-0.5 text-[9px] font-medium opacity-90">
                          w:{g.weight}
                        </span>
                      </button>
                    ))}

                    {/* Virtual Grades in Simulator */}
                    {subjVirtual.map((vg) => (
                      <button
                        key={vg.id}
                        type="button"
                        onClick={() => handleRemoveVirtualGrade(vg.id)}
                        title="Wirtualna ocena (kliknij, aby usunąć)"
                        className={clsx(
                          'group relative flex h-11 min-w-[44px] flex-col items-center justify-center rounded-xl px-2 transition active:scale-95',
                          getGradeTileStyle(vg.value, true),
                        )}
                      >
                        <span className="text-sm font-extrabold leading-none">{vg.value}</span>
                        <span className="mt-0.5 text-[9px] font-semibold">w:{vg.weight}</span>
                      </button>
                    ))}
                  </div>

                  {/* Simulator Toggle Bar */}
                  <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2 dark:border-slate-800/80 dark:bg-slate-800/30">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSimulatorSubject((prev) => (prev === subject ? null : subject))
                      }
                      className="flex w-full items-center justify-between text-xs font-semibold text-brand-600 dark:text-brand-400"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Calculator size={14} />
                        <span>Symulator ocen („Co jeśli dostanę…”)</span>
                        {hasSim && (
                          <span className="rounded-full bg-violet-100 px-1.5 py-0.2 text-[10px] font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                            +{subjVirtual.length}
                          </span>
                        )}
                      </span>
                      {isSimOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>

                    {/* Expandable Simulator Panel */}
                    {isSimOpen && (
                      <div className="mt-2.5 space-y-2.5 border-t border-slate-200/70 pt-2.5 dark:border-slate-700/70">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              Wirtualna ocena
                            </label>
                            <select
                              value={simValue}
                              onChange={(e) => setSimValue(e.target.value)}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            >
                              {SIMULATOR_GRADE_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  Ocena {opt} ({parseGradeNumericValue(opt)?.toFixed(2)})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              Waga oceny
                            </label>
                            <select
                              value={simWeight}
                              onChange={(e) => setSimWeight(Number(e.target.value))}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            >
                              {SIMULATOR_WEIGHT_OPTIONS.map((w) => (
                                <option key={w} value={w}>
                                  Waga {w}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleAddVirtualGrade(subject)}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 active:scale-[0.99]"
                          >
                            <Plus size={14} />
                            <span>
                              Dodaj ocenę {simValue} (waga {simWeight})
                            </span>
                          </button>

                          {hasSim && (
                            <button
                              type="button"
                              onClick={() => handleClearSubjectVirtual(subject)}
                              title="Usuń wirtualne oceny z tego przedmiotu"
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                              <Trash2 size={14} />
                              <span>Wyczyść</span>
                            </button>
                          )}
                        </div>

                        <p className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <Sparkles size={12} className="shrink-0 text-violet-500" />
                          <span>
                            Wirtualne oceny mają przerywaną ramkę – kliknij kafelek, aby go usunąć.
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}

export default GradesPage;
