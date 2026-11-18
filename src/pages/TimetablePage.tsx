import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import clsx from 'clsx';
import {
  AlertCircle,
  ArrowRightLeft,
  BookOpenCheck,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  User,
  XCircle,
} from 'lucide-react';
import { db } from '@/db/database';
import type { DayOfWeek, Exam, Lesson, LessonChangeInfo } from '@/models/types';

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

export function TimetablePage() {
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(getInitialWeekday);
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);

  const allLessons = useLiveQuery(() => db.lessons.toArray(), [], [] as Lesson[]);
  const allExams = useLiveQuery(() => db.exams.toArray(), [], [] as Exam[]);

  // Days that have at least one substitution / cancellation
  const daysWithChanges = useMemo(() => {
    const set = new Set<DayOfWeek>();
    for (const l of allLessons) {
      if (l.changeInfo) set.add(l.dayOfWeek);
    }
    return set;
  }, [allLessons]);

  // Days that have at least one scheduled exam/quiz
  const daysWithExams = useMemo(() => {
    const set = new Set<DayOfWeek>();
    for (const e of allExams) {
      set.add(e.dayOfWeek);
    }
    return set;
  }, [allExams]);

  // Map "<dayOfWeek>::<normalizedSubject>" -> Exam[]
  const examsByDayAndSubject = useMemo(() => {
    const map = new Map<string, Exam[]>();
    for (const exam of allExams) {
      const key = `${exam.dayOfWeek}::${normalizeSubject(exam.subject)}`;
      const list = map.get(key) ?? [];
      list.push(exam);
      map.set(key, list);
    }
    return map;
  }, [allExams]);

  // Lessons for the currently selected day, sorted by lessonNumber & startTime
  const dayLessons = useMemo(() => {
    return allLessons
      .filter((l) => l.dayOfWeek === selectedDay)
      .sort((a, b) => a.lessonNumber - b.lessonNumber || a.startTime.localeCompare(b.startTime));
  }, [allLessons, selectedDay]);

  const activeDayMeta = WEEKDAYS.find((d) => d.day === selectedDay) ?? WEEKDAYS[0];
  const dayChangesCount = dayLessons.filter((l) => Boolean(l.changeInfo)).length;
  const dayExamsCount = dayLessons.filter((l) =>
    examsByDayAndSubject.has(`${l.dayOfWeek}::${normalizeSubject(l.subject)}`),
  ).length;
  const firstLesson = dayLessons[0];
  const lastLesson = dayLessons[dayLessons.length - 1];

  return (
    <div className="flex flex-col gap-3.5 p-3.5">
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
          const count = allLessons.filter((l) => l.dayOfWeek === day).length;
          return (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-label={full}
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
                  'mt-0.5 text-[10px]',
                  isSelected ? 'text-brand-100' : 'text-slate-400 dark:text-slate-500',
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
            {activeDayMeta.full}
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
      {dayLessons.length === 0 ? (
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
          {dayLessons.map((lesson) => {
            const changeCfg = lesson.changeInfo ? getChangeBadgeConfig(lesson.changeInfo) : null;
            const isCancelled = lesson.changeInfo?.type === 'cancelled';
            const ChangeIcon = changeCfg?.icon;

            const matchingExams =
              examsByDayAndSubject.get(`${lesson.dayOfWeek}::${normalizeSubject(lesson.subject)}`) ??
              [];
            const hasExam = matchingExams.length > 0 && !isCancelled;
            const isExpanded = hasExam && expandedLessonId === lesson.id;

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
              <li key={lesson.id}>
                {hasExam ? (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedLessonId((prev) => (prev === lesson.id ? null : lesson.id))
                    }
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
          })}
        </ol>
      )}
    </div>
  );
}

export default TimetablePage;
