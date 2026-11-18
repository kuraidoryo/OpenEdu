import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import clsx from 'clsx';
import {
  Award,
  BookOpenCheck,
  CalendarDays,
  ChevronRight,
  Clock,
  ShieldAlert,
  ShieldCheck,
  User,
} from 'lucide-react';
import { db, getDutyInfo } from '@/db/database';
import type { DayOfWeek, DutyInfo, Exam, Grade, Lesson } from '@/models/types';
import { parseGradeNumericValue } from '@/pages/GradesPage';

const DAY_NAMES: Record<DayOfWeek, string> = {
  1: 'Poniedziałek',
  2: 'Wtorek',
  3: 'Środa',
  4: 'Czwartek',
  5: 'Piątek',
  6: 'Sobota',
  7: 'Niedziela',
};

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

interface NextLessonMatch {
  lesson: Lesson;
  whenLabel: string;
  isOngoing: boolean;
}

/** Finds the currently running or next upcoming non-cancelled lesson. */
function findNextLesson(lessons: Lesson[], now: Date): NextLessonMatch | null {
  const activeLessons = lessons.filter((l) => l.changeInfo?.type !== 'cancelled');
  if (activeLessons.length === 0) return null;

  const jsDay = now.getDay(); // 0 = Sun .. 6 = Sat
  const todayDay: DayOfWeek = (jsDay === 0 ? 7 : jsDay) as DayOfWeek;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const sortDay = (day: DayOfWeek) =>
    activeLessons
      .filter((l) => l.dayOfWeek === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.lessonNumber - b.lessonNumber);

  // 1. Check today (if Mon–Fri)
  if (todayDay >= 1 && todayDay <= 5) {
    const todays = sortDay(todayDay);
    for (const lesson of todays) {
      const startMin = timeToMinutes(lesson.startTime);
      const endMin = timeToMinutes(lesson.endTime);
      if (nowMinutes >= startMin && nowMinutes < endMin) {
        return {
          lesson,
          whenLabel: `Dzisiaj (trwa teraz) · Lekcja #${lesson.lessonNumber}`,
          isOngoing: true,
        };
      }
      if (startMin > nowMinutes) {
        return {
          lesson,
          whenLabel: `Dzisiaj · Lekcja #${lesson.lessonNumber}`,
          isOngoing: false,
        };
      }
    }
  }

  // 2. Otherwise search upcoming days (wrapping around to Monday)
  for (let offset = 1; offset <= 7; offset++) {
    const candidateJsDay = (jsDay + offset) % 7;
    if (candidateJsDay === 0 || candidateJsDay === 6) continue;
    const candidateDay = candidateJsDay as DayOfWeek;
    const dayList = sortDay(candidateDay);
    if (dayList.length > 0) {
      const prefix = offset === 1 ? `Jutro (${DAY_NAMES[candidateDay]})` : DAY_NAMES[candidateDay];
      return {
        lesson: dayList[0],
        whenLabel: `${prefix} · Lekcja #${dayList[0].lessonNumber}`,
        isOngoing: false,
      };
    }
  }

  return null;
}

function getGradeBadgeClass(value: string): string {
  const num = parseGradeNumericValue(value);
  if (num === null) {
    return 'border border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
  if (num >= 5.5) return 'bg-emerald-600 text-white';
  if (num >= 4.75) return 'bg-green-600 text-white';
  if (num >= 3.75) return 'bg-sky-600 text-white';
  if (num >= 2.75) return 'bg-amber-500 text-white';
  if (num >= 1.75) return 'bg-orange-500 text-white';
  return 'bg-rose-600 text-white';
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
}

function formatExamDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function HomePage() {
  const navigate = useNavigate();

  const lessons = useLiveQuery(() => db.lessons.toArray(), [], [] as Lesson[]);
  const grades = useLiveQuery(() => db.grades.toArray(), [], [] as Grade[]);
  const exams = useLiveQuery(() => db.exams.toArray(), [], [] as Exam[]);
  const dutyInfo = useLiveQuery(
    () => getDutyInfo(),
    [],
    { isOnDutyThisWeek: false } as DutyInfo,
  );

  // 1. Next Lesson
  const nextLesson = useMemo(() => findNextLesson(lessons, new Date()), [lessons]);

  // 3. Latest 3 Grades
  const latestGrades = useMemo(() => {
    return [...grades]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3);
  }, [grades]);

  // 4. Nearest Exam
  const nearestExam = useMemo(() => {
    if (exams.length === 0) return null;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sorted = [...exams].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.find((e) => new Date(e.date).getTime() >= todayStart) ?? sorted[0];
  }, [exams]);

  return (
    <div className="flex flex-col gap-3.5 p-3.5">
      {/* ───────────── 1. Next Lesson Card ───────────── */}
      <section className="rounded-2xl border border-brand-200/80 bg-gradient-to-br from-brand-600 to-brand-700 p-4 text-white shadow-md shadow-brand-600/20">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-100">
            <Clock size={14} />
            <span>{nextLesson?.isOngoing ? 'Aktualna lekcja' : 'Następna lekcja'}</span>
          </span>

          <button
            type="button"
            onClick={() => navigate('/timetable')}
            className="inline-flex items-center gap-0.5 rounded-lg bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-white/25"
          >
            <span>Cały plan</span>
            <ChevronRight size={13} />
          </button>
        </div>

        {nextLesson ? (
          <div className="mt-2.5">
            <p className="text-xs font-medium text-brand-100">{nextLesson.whenLabel}</p>
            <p className="mt-1 text-lg font-extrabold leading-snug">
              {nextLesson.lesson.startTime} - {nextLesson.lesson.endTime} ·{' '}
              {nextLesson.lesson.subject}
              {nextLesson.lesson.room ? ` · sala ${nextLesson.lesson.room}` : ''}
            </p>
            {nextLesson.lesson.teacher && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-brand-100">
                <User size={12} className="shrink-0" />
                <span className="truncate">{nextLesson.lesson.teacher}</span>
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-brand-100">
            Brak zapisanych lekcji w planie offline. Zsynchronizuj dane, aby zobaczyć najbliższą lekcję.
          </p>
        )}
      </section>

      {/* ───────────── 2. Classroom Duty Status Card ───────────── */}
      <section
        className={clsx(
          'rounded-2xl border p-4 shadow-sm',
          dutyInfo.isOnDutyThisWeek
            ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/70 dark:bg-emerald-950/30'
            : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900',
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={clsx(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
              dutyInfo.isOnDutyThisWeek
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
            )}
          >
            {dutyInfo.isOnDutyThisWeek ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Dyżur klasowy w tym tygodniu
            </p>
            <h2
              className={clsx(
                'mt-0.5 text-sm font-bold',
                dutyInfo.isOnDutyThisWeek
                  ? 'text-emerald-900 dark:text-emerald-200'
                  : 'text-slate-900 dark:text-white',
              )}
            >
              {dutyInfo.isOnDutyThisWeek
                ? 'Tak – jesteś dyżurnym w tym tygodniu'
                : 'Nie – w tym tygodniu nie masz dyżuru'}
            </h2>
            {dutyInfo.details && (
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                {dutyInfo.details}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ───────────── 3. Latest 3 Grades Card ───────────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Award size={17} className="text-brand-600 dark:text-brand-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Najnowsze 3 oceny
            </h2>
          </div>

          <button
            type="button"
            onClick={() => navigate('/grades')}
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
          >
            <span>Wszystkie</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {latestGrades.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Brak zapisanych ocen w pamięci offline.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {latestGrades.map((grade) => (
              <li key={grade.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div
                  className={clsx(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold shadow-sm',
                    getGradeBadgeClass(grade.value),
                  )}
                >
                  <span className="leading-none">{grade.value}</span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                    {grade.subject}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {grade.category}
                    {grade.description ? ` · ${grade.description}` : ''}
                  </p>
                </div>

                <span className="shrink-0 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                  {formatShortDate(grade.date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ───────────── 4. Nearest Exam Card ───────────── */}
      <section className="rounded-2xl border border-fuchsia-200/90 bg-fuchsia-50/50 p-4 shadow-sm dark:border-fuchsia-900/60 dark:bg-fuchsia-950/25">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpenCheck size={17} className="text-fuchsia-600 dark:text-fuchsia-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Najbliższy sprawdzian
            </h2>
          </div>

          <button
            type="button"
            onClick={() => navigate('/timetable')}
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-fuchsia-700 hover:underline dark:text-fuchsia-300"
          >
            <span>Zobacz w planie</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {nearestExam ? (
          <button
            type="button"
            onClick={() => navigate('/timetable')}
            className="mt-3 block w-full rounded-xl border border-fuchsia-200/80 bg-white/90 p-3 text-left transition hover:bg-white dark:border-fuchsia-900/50 dark:bg-slate-900/80 dark:hover:bg-slate-900"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                {nearestExam.subject}
              </span>
              <span className="rounded-full bg-fuchsia-100 px-2.5 py-0.5 text-[11px] font-bold text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300">
                {nearestExam.type}
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1 capitalize">
                <CalendarDays size={12} />
                {formatExamDate(nearestExam.date)}
              </span>
              {nearestExam.teacher && (
                <span className="inline-flex items-center gap-1">
                  <User size={12} />
                  {nearestExam.teacher}
                </span>
              )}
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              {nearestExam.description}
            </p>
          </button>
        ) : (
          <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
            Brak zaplanowanych sprawdzianów i kartkówek w najbliższym czasie.
          </p>
        )}
      </section>
    </div>
  );
}

export default HomePage;
