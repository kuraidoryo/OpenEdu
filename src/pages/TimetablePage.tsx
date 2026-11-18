import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import clsx from 'clsx';
import {
  AlertCircle,
  ArrowRightLeft,
  BookOpenCheck,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Loader2,
  MapPin,
  RotateCcw,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { db } from '@/db/database';
import type { DayOfWeek, Exam, Lesson, LessonChangeInfo } from '@/models/types';
import { getProvider } from '@/services/sync.service';

const WEEKDAYS: ReadonlyArray<{ day: DayOfWeek; short: string; full: string }> = [
  { day: 1, short: 'Pon', full: 'Poniedziałek' },
  { day: 2, short: 'Wt', full: 'Wtorek' },
  { day: 3, short: 'Śr', full: 'Środa' },
  { day: 4, short: 'Czw', full: 'Czwartek' },
  { day: 5, short: 'Pt', full: 'Piątek' },
];

/** Returns today's weekday 1..5, or 1 (Monday) on weekends. */
function getInitialWeekday(): DayOfWeek {
  const jsDay = new Date().getDay(); // 0 = Sun, 1 = Mon .. 6 = Sat
  if (jsDay >= 1 && jsDay <= 5) return jsDay as DayOfWeek;
  return 1;
}

function normalizeSubject(subject: string): string {
  return subject.trim().toLowerCase();
}

function formatDayMonth(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface WeekMeta {
  weekStart: Date;
  weekEnd: Date;
  title: string;
  rangeLabel: string;
  dayDates: Record<DayOfWeek, string>;
}

function getWeekMeta(weekOffset: number): WeekMeta {
  const now = new Date();
  const monday = new Date(now);
  const offsetFromMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - offsetFromMonday + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  let title = 'Bieżący tydzień';
  if (weekOffset === 1) title = 'Kolejny tydzień';
  else if (weekOffset === -1) title = 'Poprzedni tydzień';
  else if (weekOffset > 1) title = `+${weekOffset} tyg.`;
  else if (weekOffset < -1) title = `${weekOffset} tyg.`;

  const rangeLabel = `${formatDayMonth(monday)} – ${formatDayMonth(friday)}.${friday.getFullYear()}`;

  const dayDates = {} as Record<DayOfWeek, string>;
  for (let i = 1; i <= 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + (i - 1));
    dayDates[i as DayOfWeek] = formatDayMonth(d);
  }

  return {
    weekStart: monday,
    weekEnd: sunday,
    title,
    rangeLabel,
    dayDates,
  };
}

function getChangeBadgeConfig(change: LessonChangeInfo) {
  switch (change.type) {
    case 'cancelled':
      return {
        label: 'Odwołana',
        icon: XCircle,
        badgeClass:
          'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800',
        cardClass:
          'border-rose-200/80 bg-rose-50/40 dark:border-rose-900/50 dark:bg-rose-950/20',
      };
    case 'substitution':
      return {
        label: 'Zastępstwo',
        icon: ArrowRightLeft,
        badgeClass:
          'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800',
        cardClass:
          'border-amber-200/90 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20',
      };
    case 'room-change':
      return {
        label: 'Zmiana sali',
        icon: MapPin,
        badgeClass:
          'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/80 dark:text-sky-300 dark:border-sky-800',
        cardClass:
          'border-sky-200/90 bg-sky-50/30 dark:border-sky-900/50 dark:bg-sky-950/20',
      };
    default:
      return {
        label: 'Zmiana',
        icon: AlertCircle,
        badgeClass:
          'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/80 dark:text-violet-300 dark:border-violet-800',
        cardClass:
          'border-violet-200/90 bg-violet-50/30 dark:border-violet-900/50 dark:bg-violet-950/20',
      };
  }
}

interface LessonCardProps {
  lesson: Lesson;
  matchingExams: Exam[];
  isExpanded: boolean;
  onToggleExpand: (lessonId: string) => void;
}

function LessonCard({ lesson, matchingExams, isExpanded, onToggleExpand }: LessonCardProps) {
  const changeCfg = lesson.changeInfo ? getChangeBadgeConfig(lesson.changeInfo) : null;
  const isCancelled = lesson.changeInfo?.type === 'cancelled';
  const ChangeIcon = changeCfg?.icon;
  const hasExam = matchingExams.length > 0 && !isCancelled;

  const cardContent = (
    <>
      {/* Left Column: Lesson Number & Bell Hours */}
      <div
        className={clsx(
          'flex w-16 shrink-0 flex-col items-center justify-center rounded-xl px-2 py-2 text-center',
          hasExam
            ? 'bg-fuchsia-100/90 dark:bg-fuchsia-950/70'
            : 'bg-slate-100/80 dark:bg-slate-800/80',
        )}
      >
        <span
          className={clsx(
            'text-xs font-extrabold',
            hasExam
              ? 'text-fuchsia-700 dark:text-fuchsia-300'
              : 'text-brand-600 dark:text-brand-400',
          )}
        >
          #{lesson.lessonNumber}
        </span>
        <span className="mt-1 text-xs font-semibold text-slate-800 dark:text-slate-200">
          {lesson.startTime}
        </span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          {lesson.endTime}
        </span>
      </div>

      {/* Right Column: Subject, Teacher, Room, Change & Exam Info */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-start justify-between gap-2">
          <h2
            className={clsx(
              'text-sm font-bold leading-snug',
              isCancelled
                ? 'text-slate-400 line-through dark:text-slate-500'
                : 'text-slate-900 dark:text-white',
            )}
          >
            {lesson.subject}
          </h2>

          {lesson.room && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <MapPin size={11} />
              {lesson.room}
            </span>
          )}
        </div>

        {lesson.teacher && (
          <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-500 dark:text-slate-400">
            <User size={12} className="shrink-0" />
            <span className="truncate">{lesson.teacher}</span>
          </p>
        )}

        {hasExam && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-100/80 px-2.5 py-1.5 text-xs text-fuchsia-900 dark:border-fuchsia-800 dark:bg-fuchsia-950/70 dark:text-fuchsia-200">
            <div className="flex min-w-0 items-center gap-1.5">
              <BookOpenCheck size={14} className="shrink-0" />
              <span className="font-bold">{matchingExams[0].type}</span>
              <span className="truncate text-[11px] opacity-80">
                · Kliknij, aby zobaczyć opis
              </span>
            </div>
            {isExpanded ? (
              <ChevronUp size={15} className="shrink-0" />
            ) : (
              <ChevronDown size={15} className="shrink-0" />
            )}
          </div>
        )}

        {isExpanded && (
          <div className="mt-2 space-y-2 rounded-xl border border-fuchsia-200/90 bg-white/95 p-3 text-xs text-slate-700 dark:border-fuchsia-800/70 dark:bg-slate-900/90 dark:text-slate-300">
            {matchingExams.map((exam) => (
              <div key={exam.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-fuchsia-800 dark:text-fuchsia-300">
                    {exam.type} – zakres materiału:
                  </span>
                  {exam.teacher && (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {exam.teacher}
                    </span>
                  )}
                </div>
                <p className="leading-relaxed">{exam.description}</p>
              </div>
            ))}
          </div>
        )}

        {lesson.changeInfo && changeCfg && ChangeIcon && (
          <div
            className={clsx(
              'mt-2 flex items-start gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs',
              changeCfg.badgeClass,
            )}
          >
            <ChangeIcon size={14} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="font-bold">{changeCfg.label}: </span>
              <span>{lesson.changeInfo.description}</span>
            </div>
          </div>
        )}
      </div>
    </>
  );

  const cardClasses = clsx(
    'flex w-full items-stretch gap-3 rounded-2xl border p-3 text-left shadow-sm transition',
    hasExam
      ? 'border-fuchsia-300 bg-fuchsia-50/70 hover:bg-fuchsia-50 dark:border-fuchsia-800 dark:bg-fuchsia-950/35 dark:hover:bg-fuchsia-950/50'
      : changeCfg
        ? changeCfg.cardClass
        : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900',
  );

  return (
    <li>
      {hasExam ? (
        <button
          type="button"
          onClick={() => onToggleExpand(lesson.id)}
          aria-expanded={isExpanded}
          className={cardClasses}
        >
          {cardContent}
        </button>
      ) : (
        <div className={cardClasses}>{cardContent}</div>
      )}
    </li>
  );
}

export function TimetablePage() {
  const { session, settings, isOnline } = useApp();
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(getInitialWeekday);
  const [weekOffset, setWeekOffset] = useState(0);
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);

  const [weekLessons, setWeekLessons] = useState<Lesson[] | null>(null);
  const [weekExams, setWeekExams] = useState<Exam[] | null>(null);
  const [isLoadingWeek, setIsLoadingWeek] = useState(false);
  const [weekError, setWeekError] = useState<string | null>(null);

  const dbLessons = useLiveQuery(() => db.lessons.toArray(), [], [] as Lesson[]);
  const dbExams = useLiveQuery(() => db.exams.toArray(), [], [] as Exam[]);

  const weekMeta = useMemo(() => getWeekMeta(weekOffset), [weekOffset]);

  // Fetch remote timetable & exams when browsing other weeks (weekOffset !== 0)
  useEffect(() => {
    if (weekOffset === 0) {
      setWeekLessons(null);
      setWeekExams(null);
      setIsLoadingWeek(false);
      setWeekError(null);
      return;
    }

    if (!session.isAuthenticated) {
      setWeekLessons([]);
      setWeekExams([]);
      setWeekError('Zaloguj się, aby podejrzeć inne tygodnie.');
      return;
    }

    if (!isOnline && session.mode === 'live') {
      setWeekLessons([]);
      setWeekExams([]);
      setWeekError('Brak połączenia z internetem – inne tygodnie wymagają dostępu online.');
      return;
    }

    let cancelled = false;
    setIsLoadingWeek(true);
    setWeekError(null);

    const provider = getProvider(session);
    void Promise.all([
      provider.fetchTimetable(weekMeta.weekStart),
      provider.fetchExams(weekMeta.weekStart).catch(() => [] as Exam[]),
    ])
      .then(([lessonsRes, examsRes]) => {
        if (cancelled) return;
        setWeekLessons(lessonsRes);
        setWeekExams(examsRes);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (session.mode === 'mock') {
          setWeekLessons(dbLessons);
          setWeekExams(dbExams);
        } else {
          setWeekLessons([]);
          setWeekExams([]);
          setWeekError(err instanceof Error ? err.message : 'Nie udało się pobrać planu lekcji.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingWeek(false);
      });

    return () => {
      cancelled = true;
    };
  }, [weekOffset, weekMeta.weekStart, session, isOnline, dbLessons, dbExams]);

  const activeLessons = weekOffset === 0 ? dbLessons : (weekLessons ?? []);
  const rawExams = weekOffset === 0 ? dbExams : (weekExams ?? []);

  // Filter exams relevant to the currently displayed week
  const activeExams = useMemo(() => {
    const startMs = weekMeta.weekStart.getTime();
    const endMs = weekMeta.weekEnd.getTime();
    return rawExams.filter((exam) => {
      if (session.mode === 'mock' && weekOffset === 0) return true;
      const t = Date.parse(exam.date);
      if (Number.isNaN(t)) return true;
      return t >= startMs && t <= endMs;
    });
  }, [rawExams, weekMeta.weekStart, weekMeta.weekEnd, session.mode, weekOffset]);

  // Days that have at least one substitution / cancellation
  const daysWithChanges = useMemo(() => {
    const set = new Set<DayOfWeek>();
    for (const l of activeLessons) {
      if (l.changeInfo) set.add(l.dayOfWeek);
    }
    return set;
  }, [activeLessons]);

  // Days that have at least one scheduled exam/quiz
  const daysWithExams = useMemo(() => {
    const set = new Set<DayOfWeek>();
    for (const e of activeExams) {
      set.add(e.dayOfWeek);
    }
    return set;
  }, [activeExams]);

  // Map "<dayOfWeek>::<normalizedSubject>" -> Exam[]
  const examsByDayAndSubject = useMemo(() => {
    const map = new Map<string, Exam[]>();
    for (const exam of activeExams) {
      const key = `${exam.dayOfWeek}::${normalizeSubject(exam.subject)}`;
      const list = map.get(key) ?? [];
      list.push(exam);
      map.set(key, list);
    }
    return map;
  }, [activeExams]);

  const lessonsByDay = useMemo(() => {
    const map = new Map<DayOfWeek, Lesson[]>();
    for (const wd of WEEKDAYS) {
      map.set(
        wd.day,
        activeLessons
          .filter((l) => l.dayOfWeek === wd.day)
          .sort((a, b) => a.lessonNumber - b.lessonNumber || a.startTime.localeCompare(b.startTime)),
      );
    }
    return map;
  }, [activeLessons]);

  const toggleExpand = (lessonId: string) => {
    setExpandedLessonId((prev) => (prev === lessonId ? null : lessonId));
  };

  const dayLessons = lessonsByDay.get(selectedDay) ?? [];
  const activeDayMeta = WEEKDAYS.find((d) => d.day === selectedDay) ?? WEEKDAYS[0];
  const dayChangesCount = dayLessons.filter((l) => Boolean(l.changeInfo)).length;
  const dayExamsCount = dayLessons.filter((l) =>
    examsByDayAndSubject.has(`${l.dayOfWeek}::${normalizeSubject(l.subject)}`),
  ).length;
  const firstLesson = dayLessons[0];
  const lastLesson = dayLessons[dayLessons.length - 1];

  const selectedWeekLesson = useMemo(
    () => (expandedLessonId ? activeLessons.find((l) => l.id === expandedLessonId) ?? null : null),
    [activeLessons, expandedLessonId],
  );
  const selectedWeekLessonExams = useMemo(() => {
    if (!selectedWeekLesson || selectedWeekLesson.changeInfo?.type === 'cancelled') return [];
    return (
      examsByDayAndSubject.get(
        `${selectedWeekLesson.dayOfWeek}::${normalizeSubject(selectedWeekLesson.subject)}`,
      ) ?? []
    );
  }, [selectedWeekLesson, examsByDayAndSubject]);

  // Unique sorted time slots (rows) across Mon–Fri for the tabular week view
  const weekTimeSlots = useMemo(() => {
    const slotMap = new Map<string, { startTime: string; endTime: string }>();
    for (const lesson of activeLessons) {
      if (lesson.dayOfWeek < 1 || lesson.dayOfWeek > 5 || !lesson.startTime) continue;
      if (!slotMap.has(lesson.startTime)) {
        slotMap.set(lesson.startTime, {
          startTime: lesson.startTime,
          endTime: lesson.endTime,
        });
      }
    }
    return Array.from(slotMap.values())
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((slot, index) => ({
        slotIndex: index + 1,
        startTime: slot.startTime,
        endTime: slot.endTime,
      }));
  }, [activeLessons]);

  return (
    <div className="flex flex-col gap-3.5 p-3.5">
      {/* ───────────── Week Switcher Header (Previous / Next Week) ───────────── */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white px-2.5 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => {
            setWeekOffset((w) => w - 1);
            setExpandedLessonId(null);
          }}
          aria-label="Poprzedni tydzień"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition hover:bg-slate-200 active:scale-95 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="min-w-0 flex-1 text-center">
          <p className="text-xs font-bold text-slate-900 dark:text-white">{weekMeta.title}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{weekMeta.rangeLabel}</p>
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => {
                setWeekOffset(0);
                setExpandedLessonId(null);
              }}
              className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
            >
              <RotateCcw size={10} />
              <span>Wróć do bieżącego tygodnia</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setWeekOffset((w) => w + 1);
            setExpandedLessonId(null);
          }}
          aria-label="Kolejny tydzień"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition hover:bg-slate-200 active:scale-95 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Loading / Error Banner for Remote Weeks */}
      {isLoadingWeek && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-4 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <Loader2 size={16} className="animate-spin text-brand-600" />
          <span>Pobieranie planu lekcji na wybrany tydzień…</span>
        </div>
      )}

      {!isLoadingWeek && weekError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-center text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          {weekError}
        </div>
      )}

      {/* ───────────── DAY VIEW MODE ───────────── */}
      {settings.timetableViewMode === 'day' ? (
        <>
          {/* Weekday Selector Tabs */}
          <div
            role="tablist"
            aria-label="Dni tygodnia"
            className="grid grid-cols-5 gap-1.5 rounded-2xl bg-slate-200/75 p-1.5 dark:bg-slate-800/90"
          >
            {WEEKDAYS.map(({ day, short, full }) => {
              const isSelected = day === selectedDay;
              const hasChange = daysWithChanges.has(day);
              const hasExam = daysWithExams.has(day);
              const count = (lessonsByDay.get(day) ?? []).length;
              return (
                <button
                  key={day}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-label={`${full} ${weekMeta.dayDates[day]}`}
                  onClick={() => {
                    setSelectedDay(day);
                    setExpandedLessonId(null);
                  }}
                  className={clsx(
                    'relative flex flex-col items-center justify-center rounded-xl py-2 transition',
                    isSelected
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-700 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700/50',
                  )}
                >
                  <span className="text-xs font-bold">{short}</span>
                  <span
                    className={clsx(
                      'text-[10px]',
                      isSelected ? 'text-brand-100' : 'text-slate-500 dark:text-slate-400',
                    )}
                  >
                    {weekMeta.dayDates[day]}
                  </span>
                  <span
                    className={clsx(
                      'text-[9px]',
                      isSelected ? 'text-brand-100/90' : 'text-slate-400 dark:text-slate-500',
                    )}
                  >
                    {count} lek.
                  </span>
                  {(hasChange || hasExam) && (
                    <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
                      {hasExam && (
                        <span
                          title="Sprawdzian lub kartkówka w tym dniu"
                          className={clsx(
                            'h-2 w-2 rounded-full',
                            isSelected ? 'bg-fuchsia-300' : 'bg-fuchsia-500',
                          )}
                        />
                      )}
                      {hasChange && (
                        <span
                          title="Zmiana w planie lekcji"
                          className={clsx(
                            'h-2 w-2 rounded-full',
                            isSelected ? 'bg-amber-300' : 'bg-amber-500',
                          )}
                        />
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected Day Header Card */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">
                {activeDayMeta.full}{' '}
                <span className="text-sm font-medium text-slate-400 dark:text-slate-500">
                  ({weekMeta.dayDates[selectedDay]})
                </span>
              </h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Clock size={12} />
                {firstLesson && lastLesson ? (
                  <span>
                    {firstLesson.startTime} – {lastLesson.endTime} · {dayLessons.length} lekcji
                  </span>
                ) : (
                  <span>Brak zaplanowanych zajęć</span>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {dayExamsCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-100 px-2.5 py-1 text-xs font-semibold text-fuchsia-900 dark:bg-fuchsia-950/80 dark:text-fuchsia-300">
                  <BookOpenCheck size={13} />
                  {dayExamsCount === 1 ? '1 sprawdzian' : `${dayExamsCount} sprawdziany`}
                </span>
              )}
              {dayChangesCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950/80 dark:text-amber-300">
                  <AlertCircle size={13} />
                  {dayChangesCount} {dayChangesCount === 1 ? 'zmiana' : 'zmiany'}
                </span>
              )}
            </div>
          </div>

          {/* Lessons List */}
          {!isLoadingWeek && dayLessons.length === 0 ? (
            <div className="my-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                <CalendarDays size={24} />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                Brak lekcji w tym dniu
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Plan lekcji jest przechowywany lokalnie i dostępny również bez internetu.
              </p>
            </div>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {dayLessons.map((lesson) => (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  matchingExams={
                    examsByDayAndSubject.get(
                      `${lesson.dayOfWeek}::${normalizeSubject(lesson.subject)}`,
                    ) ?? []
                  }
                  isExpanded={expandedLessonId === lesson.id}
                  onToggleExpand={toggleExpand}
                />
              ))}
            </ol>
          )}
        </>
      ) : (
        /* ───────────── FULL WEEK VIEW MODE (5 Columns Side-by-Side) ───────────── */
        <div className="flex flex-col gap-3">
          {selectedWeekLesson && (() => {
            const dayMeta = WEEKDAYS.find((d) => d.day === selectedWeekLesson.dayOfWeek);
            const changeCfg = selectedWeekLesson.changeInfo
              ? getChangeBadgeConfig(selectedWeekLesson.changeInfo)
              : null;
            return (
              <div className="rounded-2xl border border-brand-200 bg-white p-3.5 shadow-md dark:border-brand-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                      {dayMeta?.full} ({weekMeta.dayDates[selectedWeekLesson.dayOfWeek]}) · Lekcja #
                      {selectedWeekLesson.lessonNumber}
                    </p>
                    <h2 className="mt-0.5 text-sm font-extrabold text-slate-900 dark:text-white">
                      {selectedWeekLesson.subject}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {selectedWeekLesson.startTime} – {selectedWeekLesson.endTime}
                      {selectedWeekLesson.room ? ` · sala ${selectedWeekLesson.room}` : ''}
                      {selectedWeekLesson.teacher ? ` · ${selectedWeekLesson.teacher}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedLessonId(null)}
                    aria-label="Zamknij szczegóły lekcji"
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                  >
                    <X size={16} />
                  </button>
                </div>

                {selectedWeekLessonExams.length > 0 && (
                  <div className="mt-2.5 space-y-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50/80 p-2.5 text-xs text-fuchsia-950 dark:border-fuchsia-800 dark:bg-fuchsia-950/50 dark:text-fuchsia-200">
                    {selectedWeekLessonExams.map((exam) => (
                      <div key={exam.id} className="space-y-0.5">
                        <p className="font-bold">
                          {exam.type} – zakres materiału:
                        </p>
                        <p className="leading-relaxed">{exam.description}</p>
                        {exam.teacher && (
                          <p className="text-[11px] opacity-80">{exam.teacher}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {selectedWeekLesson.changeInfo && changeCfg && (
                  <div
                    className={clsx(
                      'mt-2.5 rounded-xl border px-2.5 py-1.5 text-xs',
                      changeCfg.badgeClass,
                    )}
                  >
                    <span className="font-bold">{changeCfg.label}: </span>
                    <span>{selectedWeekLesson.changeInfo.description}</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Classic Timetable Grid Table (Hours on Left + 5 Equal Day Columns) */}
          {!isLoadingWeek && weekTimeSlots.length === 0 ? (
            <div className="my-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                <CalendarDays size={24} />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                Brak lekcji w tym tygodniu
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Plan lekcji jest przechowywany lokalnie i dostępny również bez internetu.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full table-fixed border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-800/70">
                    <th className="w-[58px] border-r border-slate-200 px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      Godz.
                    </th>
                    {WEEKDAYS.map(({ day, short }) => {
                      const hasChange = daysWithChanges.has(day);
                      const hasExam = daysWithExams.has(day);
                      return (
                        <th
                          key={day}
                          className="relative border-r border-slate-200 px-0.5 py-1.5 text-center last:border-r-0 dark:border-slate-800"
                        >
                          <p className="text-[11px] font-extrabold text-slate-900 dark:text-white">
                            {short}
                          </p>
                          <p className="text-[9px] font-medium text-slate-500 dark:text-slate-400">
                            {weekMeta.dayDates[day]}
                          </p>
                          {(hasChange || hasExam) && (
                            <span className="absolute right-1 top-1 flex items-center gap-0.5">
                              {hasExam && (
                                <span
                                  title="Sprawdzian lub kartkówka w tym dniu"
                                  className="h-1.5 w-1.5 rounded-full bg-fuchsia-500"
                                />
                              )}
                              {hasChange && (
                                <span
                                  title="Zmiana w planie lekcji"
                                  className="h-1.5 w-1.5 rounded-full bg-amber-500"
                                />
                              )}
                            </span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {weekTimeSlots.map((slot) => (
                    <tr
                      key={slot.startTime}
                      className="border-b border-slate-200/80 last:border-b-0 dark:border-slate-800/80"
                    >
                      {/* Time Interval Column on the Left */}
                      <td className="h-[68px] border-r border-slate-200 bg-slate-50/60 px-1 py-1 text-center align-middle dark:border-slate-800 dark:bg-slate-800/30">
                        <div className="flex flex-col items-center justify-center leading-tight">
                          <span className="text-[9px] font-extrabold text-brand-600 dark:text-brand-400">
                            #{slot.slotIndex}
                          </span>
                          <span className="mt-0.5 text-[9px] font-bold text-slate-700 dark:text-slate-200">
                            {slot.startTime}
                          </span>
                          <span className="text-[8px] text-slate-400 dark:text-slate-500">
                            {slot.endTime}
                          </span>
                        </div>
                      </td>

                      {/* 5 Equal-Width Day Cells */}
                      {WEEKDAYS.map(({ day }) => {
                        const lesson = (lessonsByDay.get(day) ?? []).find(
                          (l) => l.startTime === slot.startTime,
                        );

                        if (!lesson) {
                          return (
                            <td
                              key={day}
                              className="h-[68px] border-r border-slate-100 p-0.5 align-top last:border-r-0 dark:border-slate-800/60"
                            >
                              <div className="h-full w-full" />
                            </td>
                          );
                        }

                        const changeCfg = lesson.changeInfo
                          ? getChangeBadgeConfig(lesson.changeInfo)
                          : null;
                        const isCancelled = lesson.changeInfo?.type === 'cancelled';
                        const matchingExams =
                          examsByDayAndSubject.get(
                            `${lesson.dayOfWeek}::${normalizeSubject(lesson.subject)}`,
                          ) ?? [];
                        const hasExam = matchingExams.length > 0 && !isCancelled;
                        const isSelected = expandedLessonId === lesson.id;

                        return (
                          <td
                            key={day}
                            className="h-[68px] border-r border-slate-100 p-0.5 align-top last:border-r-0 dark:border-slate-800/60"
                          >
                            <button
                              type="button"
                              onClick={() => toggleExpand(lesson.id)}
                              className={clsx(
                                'flex h-full w-full flex-col justify-between overflow-hidden rounded-lg border p-1 text-left transition active:scale-[0.97]',
                                hasExam
                                  ? 'border-fuchsia-300 bg-fuchsia-50/90 dark:border-fuchsia-700 dark:bg-fuchsia-950/50'
                                  : changeCfg
                                    ? changeCfg.cardClass
                                    : 'border-slate-200/70 bg-slate-50/70 hover:bg-slate-100/80 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800',
                                isSelected && 'ring-2 ring-brand-600',
                              )}
                            >
                              <span
                                className={clsx(
                                  'line-clamp-2 break-words text-[10px] font-bold leading-tight',
                                  isCancelled
                                    ? 'text-slate-400 line-through dark:text-slate-500'
                                    : 'text-slate-900 dark:text-white',
                                )}
                              >
                                {lesson.subject}
                              </span>

                              <div className="mt-0.5 flex flex-col gap-0.5">
                                {lesson.room && (
                                  <span className="truncate text-[8px] font-medium text-slate-500 dark:text-slate-400">
                                    s. {lesson.room}
                                  </span>
                                )}

                                {hasExam ? (
                                  <span className="truncate rounded bg-fuchsia-200/80 px-1 py-0.2 text-[8px] font-bold text-fuchsia-900 dark:bg-fuchsia-900/80 dark:text-fuchsia-200">
                                    {matchingExams[0].type}
                                  </span>
                                ) : (
                                  changeCfg && (
                                    <span
                                      className={clsx(
                                        'truncate rounded border px-0.5 py-0.2 text-[8px] font-bold',
                                        changeCfg.badgeClass,
                                      )}
                                    >
                                      {changeCfg.label}
                                    </span>
                                  )
                                )}
                              </div>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TimetablePage;
