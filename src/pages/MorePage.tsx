import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import clsx from 'clsx';
import {
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  MessageSquareHeart,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  User,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { db } from '@/db/database';
import type {
  AttendanceCategory,
  AttendanceEntry,
  DayOfWeek,
  Lesson,
  MeetingEntry,
  NoteEntry,
} from '@/models/types';
import { getProvider } from '@/services/sync.service';

type MoreTab = 'attendance' | 'notes' | 'meetings';
type NoteFilter = 'all' | 'praise' | 'remark';

const WEEKDAYS: ReadonlyArray<{ day: DayOfWeek; short: string; full: string }> = [
  { day: 1, short: 'Pon', full: 'Poniedziałek' },
  { day: 2, short: 'Wt', full: 'Wtorek' },
  { day: 3, short: 'Śr', full: 'Środa' },
  { day: 4, short: 'Czw', full: 'Czwartek' },
  { day: 5, short: 'Pt', full: 'Piątek' },
];

function formatDayMonth(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getWeekMeta(weekOffset: number) {
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

  return { weekStart: monday, weekEnd: sunday, title, rangeLabel, dayDates };
}

function getAttendanceVisual(category?: AttendanceCategory) {
  switch (category) {
    case 'present':
      return {
        shortLabel: 'Obecność',
        cellClass:
          'border-emerald-300 bg-emerald-50/90 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-100',
        badgeClass:
          'bg-emerald-200/80 text-emerald-900 dark:bg-emerald-900/80 dark:text-emerald-200',
      };
    case 'absent':
      return {
        shortLabel: 'Nieobecność',
        cellClass:
          'border-rose-300 bg-rose-50/90 text-rose-950 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100',
        badgeClass:
          'bg-rose-200/80 text-rose-900 dark:bg-rose-900/80 dark:text-rose-200',
      };
    case 'excused':
      return {
        shortLabel: 'Uspr.',
        cellClass:
          'border-sky-300 bg-sky-50/90 text-sky-950 dark:border-sky-800 dark:bg-sky-950/45 dark:text-sky-100',
        badgeClass:
          'bg-sky-200/80 text-sky-900 dark:bg-sky-900/80 dark:text-sky-200',
      };
    case 'late':
      return {
        shortLabel: 'Spóźnienie',
        cellClass:
          'border-amber-300 bg-amber-50/90 text-amber-950 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100',
        badgeClass:
          'bg-amber-200/80 text-amber-900 dark:bg-amber-900/80 dark:text-amber-200',
      };
    case 'late-excused':
      return {
        shortLabel: 'Spóźn. uspr.',
        cellClass:
          'border-amber-300 bg-amber-50/90 text-amber-950 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100',
        badgeClass:
          'bg-amber-200/80 text-amber-900 dark:bg-amber-900/80 dark:text-amber-200',
      };
    case 'exempt':
      return {
        shortLabel: 'Zwolnienie',
        cellClass:
          'border-violet-300 bg-violet-50/90 text-violet-950 dark:border-violet-800 dark:bg-violet-950/45 dark:text-violet-100',
        badgeClass:
          'bg-violet-200/80 text-violet-900 dark:bg-violet-900/80 dark:text-violet-200',
      };
    default:
      return {
        shortLabel: 'Brak wpisu',
        cellClass:
          'border-slate-200/80 bg-slate-50/80 text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300',
        badgeClass:
          'bg-slate-200/80 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
      };
  }
}

function formatDateLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pl-PL', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface SelectedAttendanceCell {
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  subject: string;
  teacher?: string;
  category?: AttendanceCategory;
  categoryName: string;
}

export function MorePage() {
  const { session, isOnline } = useApp();
  const [activeTab, setActiveTab] = useState<MoreTab>('attendance');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedCell, setSelectedCell] = useState<SelectedAttendanceCell | null>(null);
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('all');

  const [remoteLessons, setRemoteLessons] = useState<Lesson[] | null>(null);
  const [remoteAttendance, setRemoteAttendance] = useState<AttendanceEntry[] | null>(null);
  const [isLoadingWeek, setIsLoadingWeek] = useState(false);
  const [weekError, setWeekError] = useState<string | null>(null);

  const dbLessons = useLiveQuery(() => db.lessons.toArray(), [], [] as Lesson[]);
  const dbAttendance = useLiveQuery(() => db.attendance.toArray(), [], [] as AttendanceEntry[]);
  const dbNotes = useLiveQuery(() => db.notes.orderBy('date').reverse().toArray(), [], [] as NoteEntry[]);
  const dbMeetings = useLiveQuery(() => db.meetings.orderBy('date').reverse().toArray(), [], [] as MeetingEntry[]);

  const weekMeta = useMemo(() => getWeekMeta(weekOffset), [weekOffset]);

  // Fetch remote attendance & timetable when switching weeks (weekOffset !== 0)
  useEffect(() => {
    if (weekOffset === 0) {
      setRemoteLessons(null);
      setRemoteAttendance(null);
      setIsLoadingWeek(false);
      setWeekError(null);
      return;
    }

    if (!session.isAuthenticated) {
      setRemoteLessons([]);
      setRemoteAttendance([]);
      setWeekError('Zaloguj się, aby podejrzeć inne tygodnie.');
      return;
    }

    if (!isOnline && session.mode === 'live') {
      setRemoteLessons([]);
      setRemoteAttendance([]);
      setWeekError('Brak połączenia z internetem – inne tygodnie wymagają dostępu online.');
      return;
    }

    let cancelled = false;
    setIsLoadingWeek(true);
    setWeekError(null);

    const provider = getProvider(session);
    void Promise.all([
      provider.fetchTimetable(weekMeta.weekStart),
      provider.fetchAttendance(weekMeta.weekStart).catch(() => [] as AttendanceEntry[]),
    ])
      .then(([lessonsRes, attRes]) => {
        if (cancelled) return;
        setRemoteLessons(lessonsRes);
        setRemoteAttendance(attRes);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRemoteLessons([]);
        setRemoteAttendance([]);
        setWeekError(err instanceof Error ? err.message : 'Nie udało się pobrać frekwencji.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingWeek(false);
      });

    return () => {
      cancelled = true;
    };
  }, [weekOffset, weekMeta.weekStart, session, isOnline]);

  const activeLessons = weekOffset === 0 ? dbLessons : (remoteLessons ?? []);
  const activeAttendance = weekOffset === 0 ? dbAttendance : (remoteAttendance ?? []);

  // Build unique sorted time slots across Mon–Fri from lessons + attendance entries
  const weekTimeSlots = useMemo(() => {
    const slotMap = new Map<string, { startTime: string; endTime: string }>();
    for (const l of activeLessons) {
      if (l.dayOfWeek < 1 || l.dayOfWeek > 5 || !l.startTime) continue;
      if (!slotMap.has(l.startTime)) {
        slotMap.set(l.startTime, { startTime: l.startTime, endTime: l.endTime });
      }
    }
    for (const a of activeAttendance) {
      if (a.dayOfWeek < 1 || a.dayOfWeek > 5 || !a.startTime) continue;
      if (!slotMap.has(a.startTime)) {
        slotMap.set(a.startTime, { startTime: a.startTime, endTime: a.endTime });
      }
    }
    return Array.from(slotMap.values())
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((slot, index) => ({
        slotIndex: index + 1,
        startTime: slot.startTime,
        endTime: slot.endTime,
      }));
  }, [activeLessons, activeAttendance]);

  // Summary counters for the currently shown week
  const attendanceStats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let excused = 0;
    let late = 0;
    let exempt = 0;

    for (const entry of activeAttendance) {
      if (entry.category === 'present') present++;
      else if (entry.category === 'absent') absent++;
      else if (entry.category === 'excused') excused++;
      else if (entry.category === 'late' || entry.category === 'late-excused') late++;
      else if (entry.category === 'exempt') exempt++;
    }

    const counted = present + absent + excused + late;
    const rate = counted > 0 ? Math.round(((present + late) / counted) * 100) : null;

    return { present, absent, excused, late, exempt, rate };
  }, [activeAttendance]);

  const filteredNotes = useMemo(() => {
    if (noteFilter === 'all') return dbNotes;
    return dbNotes.filter((n) => n.kind === noteFilter);
  }, [dbNotes, noteFilter]);

  const tabs: ReadonlyArray<{ id: MoreTab; label: string; icon: typeof CalendarCheck }> = [
    { id: 'attendance', label: 'Frekwencja', icon: CalendarCheck },
    { id: 'notes', label: 'Uwagi', icon: MessageSquareHeart },
    { id: 'meetings', label: 'Zebrania', icon: Users },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-3.5">
      {/* ───────────── Top Sub-tabs Switcher ───────────── */}
      <div
        role="tablist"
        aria-label="Dodatkowe funkcje dziennika"
        className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-200/75 p-1 dark:bg-slate-800/90"
      >
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(id)}
              className={clsx(
                'flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[11px] font-bold transition',
                active
                  ? 'bg-white text-brand-600 shadow-sm dark:bg-slate-900 dark:text-brand-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* ───────────── 1. ATTENDANCE TAB (Weekly Table) ───────────── */}
      {activeTab === 'attendance' && (
        <div className="flex flex-col gap-3">
          {/* Week Navigation Bar */}
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white px-2.5 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => {
                setWeekOffset((w) => w - 1);
                setSelectedCell(null);
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
                    setSelectedCell(null);
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
                setSelectedCell(null);
              }}
              aria-label="Kolejny tydzień"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition hover:bg-slate-200 active:scale-95 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Attendance Summary & Legend */}
          <div className="rounded-2xl border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Frekwencja w tym tygodniu
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                {attendanceStats.rate !== null ? `${attendanceStats.rate}%` : '—'}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
              <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300">
                Obecności: {attendanceStats.present}
              </span>
              <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-rose-900 dark:bg-rose-950/70 dark:text-rose-300">
                Nieobecności: {attendanceStats.absent}
              </span>
              <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-sky-900 dark:bg-sky-950/70 dark:text-sky-300">
                Uspr.: {attendanceStats.excused}
              </span>
              <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300">
                Spóźnienia: {attendanceStats.late}
              </span>
              <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-violet-900 dark:bg-violet-950/70 dark:text-violet-300">
                Zwolnienia: {attendanceStats.exempt}
              </span>
            </div>
          </div>

          {isLoadingWeek && (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-4 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <Loader2 size={16} className="animate-spin text-brand-600" />
              <span>Pobieranie frekwencji na wybrany tydzień…</span>
            </div>
          )}

          {!isLoadingWeek && weekError && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-center text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              {weekError}
            </div>
          )}

          {/* Selected Attendance Cell Details */}
          {selectedCell && (
            <div className="rounded-2xl border border-brand-200 bg-white p-3.5 shadow-md dark:border-brand-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                    {WEEKDAYS.find((d) => d.day === selectedCell.day)?.full} (
                    {weekMeta.dayDates[selectedCell.day]}) · {selectedCell.startTime} –{' '}
                    {selectedCell.endTime}
                  </p>
                  <h2 className="mt-0.5 text-sm font-extrabold text-slate-900 dark:text-white">
                    {selectedCell.subject}
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Status: {selectedCell.categoryName}
                  </p>
                  {selectedCell.teacher && (
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {selectedCell.teacher}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCell(null)}
                  aria-label="Zamknij szczegóły frekwencji"
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Attendance Full-Week Table (Only Attendance Status + Subject, Fixed Cell Height) */}
          {!isLoadingWeek && weekTimeSlots.length === 0 ? (
            <div className="my-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                <CalendarCheck size={24} />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                Brak danych frekwencji w tym tygodniu
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Dane zostaną wyświetlone po synchronizacji z dziennikiem.
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
                    {WEEKDAYS.map(({ day, short }) => (
                      <th
                        key={day}
                        className="border-r border-slate-200 px-0.5 py-1.5 text-center last:border-r-0 dark:border-slate-800"
                      >
                        <p className="text-[11px] font-extrabold text-slate-900 dark:text-white">
                          {short}
                        </p>
                        <p className="text-[9px] font-medium text-slate-500 dark:text-slate-400">
                          {weekMeta.dayDates[day]}
                        </p>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {weekTimeSlots.map((slot) => (
                    <tr
                      key={slot.startTime}
                      className="border-b border-slate-200/80 last:border-b-0 dark:border-slate-800/80"
                    >
                      {/* Hours Column */}
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

                      {/* 5 Day Columns */}
                      {WEEKDAYS.map(({ day }) => {
                        const lesson = activeLessons.find(
                          (l) => l.dayOfWeek === day && l.startTime === slot.startTime,
                        );
                        const att = activeAttendance.find(
                          (a) =>
                            a.dayOfWeek === day &&
                            (a.startTime === slot.startTime ||
                              (!a.startTime && a.lessonNumber === slot.slotIndex) ||
                              (lesson && a.lessonNumber > 0 && a.lessonNumber === lesson.lessonNumber)),
                        );

                        if (!lesson && !att) {
                          return (
                            <td
                              key={day}
                              className="h-[68px] border-r border-slate-100 p-0.5 align-top last:border-r-0 dark:border-slate-800/60"
                            >
                              <div className="h-full w-full" />
                            </td>
                          );
                        }

                        const visual = getAttendanceVisual(att?.category);
                        const subjectName = att?.subject || lesson?.subject || 'Lekcja';
                        const categoryLabel = att?.categoryName || 'Brak wpisu frekwencji';
                        const isSelected =
                          selectedCell?.day === day && selectedCell?.startTime === slot.startTime;

                        return (
                          <td
                            key={day}
                            className="h-[68px] border-r border-slate-100 p-0.5 align-top last:border-r-0 dark:border-slate-800/60"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedCell({
                                  day,
                                  startTime: slot.startTime,
                                  endTime: slot.endTime,
                                  subject: subjectName,
                                  teacher: att?.teacher || lesson?.teacher,
                                  category: att?.category,
                                  categoryName: categoryLabel,
                                })
                              }
                              className={clsx(
                                'flex h-full w-full flex-col justify-between overflow-hidden rounded-lg border p-1 text-left transition active:scale-[0.97]',
                                visual.cellClass,
                                isSelected && 'ring-2 ring-brand-600',
                              )}
                            >
                              <span className="line-clamp-2 break-words text-[10px] font-bold leading-tight">
                                {subjectName}
                              </span>

                              <span
                                className={clsx(
                                  'truncate rounded px-1 py-0.5 text-center text-[8px] font-extrabold',
                                  visual.badgeClass,
                                )}
                              >
                                {visual.shortLabel}
                              </span>
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

      {/* ───────────── 2. NOTES TAB (Pochwały i uwagi) ───────────── */}
      {activeTab === 'notes' && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800/90">
            {(
              [
                { id: 'all', label: 'Wszystkie' },
                { id: 'praise', label: 'Pochwały' },
                { id: 'remark', label: 'Uwagi' },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setNoteFilter(id)}
                className={clsx(
                  'rounded-xl py-1.5 text-xs font-bold transition',
                  noteFilter === id
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredNotes.length === 0 ? (
            <div className="my-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/40">
              <MessageSquareHeart size={28} className="text-slate-400" />
              <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                Brak pochwał i uwag
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Wpisy pojawią się tutaj po synchronizacji z dziennikiem.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {filteredNotes.map((note) => {
                const isPraise = note.kind === 'praise';
                const isRemark = note.kind === 'remark';
                return (
                  <li
                    key={note.id}
                    className={clsx(
                      'rounded-2xl border p-3.5 shadow-sm',
                      isPraise
                        ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/25'
                        : isRemark
                          ? 'border-rose-200 bg-rose-50/50 dark:border-rose-900/60 dark:bg-rose-950/25'
                          : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={clsx(
                            'flex h-7 w-7 items-center justify-center rounded-lg',
                            isPraise
                              ? 'bg-emerald-600 text-white'
                              : isRemark
                                ? 'bg-rose-600 text-white'
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                          )}
                        >
                          {isPraise ? (
                            <ThumbsUp size={14} />
                          ) : isRemark ? (
                            <ThumbsDown size={14} />
                          ) : (
                            <MessageSquareHeart size={14} />
                          )}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">
                            {note.category}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {formatDateLong(note.date)}
                          </p>
                        </div>
                      </div>

                      {note.points !== undefined && (
                        <span
                          className={clsx(
                            'rounded-full px-2 py-0.5 text-[11px] font-bold',
                            isPraise
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : isRemark
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                          )}
                        >
                          {note.points} pkt
                        </span>
                      )}
                    </div>

                    <p className="selectable mt-2.5 text-xs leading-relaxed text-slate-800 dark:text-slate-200">
                      {note.content}
                    </p>

                    <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <User size={11} />
                      <span>{note.teacher}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ───────────── 3. MEETINGS TAB (Zebrania) ───────────── */}
      {activeTab === 'meetings' && (
        <div className="flex flex-col gap-2.5">
          {dbMeetings.length === 0 ? (
            <div className="my-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/40">
              <Users size={28} className="text-slate-400" />
              <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                Brak zaplanowanych zebrań
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Informacje o wywiadówkach i spotkaniach z rodzicami pojawią się tutaj po
                synchronizacji.
              </p>
            </div>
          ) : (
            dbMeetings.map((meeting) => {
              const isUpcoming = Date.parse(meeting.date) >= Date.now();
              return (
                <article
                  key={meeting.id}
                  className={clsx(
                    'rounded-2xl border p-4 shadow-sm',
                    isUpcoming
                      ? 'border-brand-200 bg-brand-50/40 dark:border-brand-900/60 dark:bg-brand-950/20'
                      : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      {meeting.title}
                    </h2>
                    {isUpcoming && (
                      <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                        Nadchodzące
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1 capitalize">
                      <CalendarDays size={13} />
                      {formatDateTime(meeting.date)}
                    </span>
                    {meeting.roomOrPlace && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={13} />
                        {meeting.roomOrPlace}
                      </span>
                    )}
                    {meeting.teacher && (
                      <span className="inline-flex items-center gap-1">
                        <User size={13} />
                        {meeting.teacher}
                      </span>
                    )}
                  </div>

                  {meeting.agenda && (
                    <p className="selectable mt-2.5 rounded-xl bg-white/80 p-2.5 text-xs leading-relaxed text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                      {meeting.agenda}
                    </p>
                  )}
                </article>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default MorePage;
