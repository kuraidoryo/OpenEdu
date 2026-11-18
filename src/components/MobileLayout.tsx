import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import clsx from 'clsx';
import {
  AlertTriangle,
  Award,
  Bell,
  CalendarDays,
  GraduationCap,
  Home,
  LayoutGrid,
  Mail,
  RefreshCw,
  Settings,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { countUnreadMessages } from '@/db/database';
import {
  NotificationService,
  subscribeToToasts,
  type ToastPayload,
} from '@/services/notification.service';

interface MobileLayoutProps {
  children?: ReactNode;
}

/** Formats the last sync ISO timestamp into a short Polish label. */
function formatSyncTime(iso: string | null): string {
  if (!iso) return 'Brak synchronizacji';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Brak synchronizacji';
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const time = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Sync: ${time}`;
  const date = d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  return `Sync: ${date} ${time}`;
}

export function MobileLayout({ children }: MobileLayoutProps) {
  const {
    session,
    isOnline,
    syncStatus,
    lastError,
    sessionExpired,
    syncNow,
  } = useApp();

  const navigate = useNavigate();
  const unreadCount = useLiveQuery(() => countUnreadMessages(), [], 0);
  const [toasts, setToasts] = useState<ToastPayload[]>([]);
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  // Subscribe to in-app notification toasts
  useEffect(() => {
    return subscribeToToasts((toast) => {
      setToasts((prev) => [toast, ...prev].slice(0, 3));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 4500);
    });
  }, []);

  // Handle native notification taps
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void NotificationService.onNotificationTap((route) => {
      if (route) navigate(route);
    }).then((fn) => {
      cleanup = fn;
    });
    return () => cleanup?.();
  }, [navigate]);

  const isSyncing = syncStatus === 'syncing';
  const visibleError = lastError && lastError !== dismissedError ? lastError : null;

  const navItems = [
    {
      to: '/home',
      label: 'Start',
      icon: Home,
    },
    {
      to: '/messages',
      label: 'Wiadomości',
      icon: Mail,
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
    {
      to: '/timetable',
      label: 'Plan lekcji',
      icon: CalendarDays,
    },
    {
      to: '/grades',
      label: 'Oceny',
      icon: Award,
    },
    {
      to: '/more',
      label: 'Inne',
      icon: LayoutGrid,
    },
    {
      to: '/settings',
      label: 'Konto',
      icon: Settings,
      dot: sessionExpired || !session.isAuthenticated,
    },
  ];

  return (
    <div className="min-h-full bg-slate-200/70 dark:bg-slate-950 sm:flex sm:justify-center sm:py-3">
      {/* Mobile viewport container */}
      <div className="relative flex min-h-screen w-full max-w-md flex-col bg-slate-50 shadow-2xl dark:bg-slate-900 sm:min-h-[calc(100vh-1.5rem)] sm:overflow-hidden sm:rounded-[2rem] sm:border sm:border-slate-200/90 dark:sm:border-slate-800">
        {/* ───────────── Floating Toast Notifications (below status bar) ───────────── */}
        {toasts.length > 0 && (
          <div
            aria-live="polite"
            style={{ top: 'calc(max(env(safe-area-inset-top, 0px), 30px) + 10px)' }}
            className="pointer-events-none fixed inset-x-0 z-50 mx-auto flex max-w-md flex-col gap-2 px-3.5"
          >
            {toasts.map((t) => (
              <div
                key={t.id}
                className={clsx(
                  'pointer-events-auto flex items-start gap-3 rounded-2xl border p-3.5 shadow-xl backdrop-blur-xl transition-all',
                  t.kind === 'message' &&
                    'border-brand-200 bg-white/95 text-slate-900 dark:border-brand-800 dark:bg-slate-900/95 dark:text-slate-100',
                  t.kind === 'grade' &&
                    'border-emerald-200 bg-white/95 text-slate-900 dark:border-emerald-800 dark:bg-slate-900/95 dark:text-slate-100',
                  t.kind === 'session' &&
                    'border-amber-300 bg-amber-50/95 text-amber-950 dark:border-amber-700 dark:bg-amber-950/95 dark:text-amber-100',
                  (t.kind === 'info' || t.kind === 'error') &&
                    'border-slate-200 bg-white/95 text-slate-900 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100',
                )}
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600 dark:bg-brand-400/15 dark:text-brand-400">
                  <Bell size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{t.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                    {t.body}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                  aria-label="Zamknij powiadomienie"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ───────────── Top Status Header with Phone Status-Bar Safe Spacer ───────────── */}
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl dark:border-slate-800/90 dark:bg-slate-900/95">
          {/* Empty reserved space for the phone's system notification / status bar */}
          <div
            aria-hidden="true"
            className="status-bar-spacer w-full select-none bg-gradient-to-b from-slate-100/70 to-transparent dark:from-slate-950/60"
          />

          <div className="px-4 pb-3 pt-1.5">
            <div className="flex items-center justify-between gap-2.5">
              {/* Brand + Student summary */}
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/20">
                  <GraduationCap size={21} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                      OpenEdu
                    </span>
                    {/* Mode Pill */}
                    <span
                      className={clsx(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                        session.mode === 'mock'
                          ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/90 dark:text-violet-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/90 dark:text-emerald-300',
                      )}
                    >
                      {session.mode === 'mock' ? 'Demo' : 'Live'}
                    </span>
                  </div>
                  <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {session.isAuthenticated && session.userName
                      ? `${session.userName} · ${formatSyncTime(session.lastSync)}`
                      : 'Tryb offline · nie zalogowano'}
                  </p>
                </div>
              </div>

              {/* Connection badge + Quick Sync button */}
              <div className="flex shrink-0 items-center gap-1.5">
                <div
                  title={isOnline ? 'Połączono z internetem' : 'Tryb offline – dane z pamięci urządzenia'}
                  className={clsx(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                    isOnline
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800/50'
                      : 'bg-amber-100 text-amber-800 ring-1 ring-amber-300/60 dark:bg-amber-950/70 dark:text-amber-300 dark:ring-amber-800/50',
                  )}
                >
                  {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
                  <span>{isOnline ? 'Online' : 'Offline'}</span>
                </div>

                <button
                  type="button"
                  onClick={() => void syncNow()}
                  disabled={isSyncing || !isOnline || !session.isAuthenticated}
                  title="Synchronizuj teraz"
                  aria-label="Synchronizuj teraz"
                  className={clsx(
                    'flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/90 bg-slate-50 text-slate-700 shadow-sm transition active:scale-95 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
                    !isSyncing && 'hover:bg-slate-100 dark:hover:bg-slate-700',
                  )}
                >
                  <RefreshCw size={15} className={clsx(isSyncing && 'animate-spin text-brand-600')} />
                </button>
              </div>
            </div>

            {/* Session Expired / Error Banners */}
            {sessionExpired && (
              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-amber-100/90 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/80 dark:text-amber-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>Sesja eduVULCAN wygasła. Dane offline są nadal dostępne.</span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/settings')}
                  className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700"
                >
                  Zaloguj
                </button>
              </div>
            )}

            {!sessionExpired && visibleError && (
              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-rose-50 px-3 py-1.5 text-xs text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                <span className="truncate">{visibleError}</span>
                <button
                  type="button"
                  onClick={() => setDismissedError(visibleError)}
                  className="rounded p-0.5 hover:bg-rose-100 dark:hover:bg-rose-900"
                  aria-label="Ukryj błąd"
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* ───────────── Main Page Content ───────────── */}
        <main className="flex-1 overflow-y-auto pb-24">{children ?? <Outlet />}</main>

        {/* ───────────── Bottom Navigation Bar ───────────── */}
        <nav
          aria-label="Główna nawigacja"
          className="bottom-nav-safe fixed bottom-0 left-0 right-0 z-30 mx-auto max-w-md border-t border-slate-200/90 bg-white/95 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 sm:rounded-b-[2rem]"
        >
          <div className="grid grid-cols-6 px-0.5 pt-1.5">
            {navItems.map(({ to, label, icon: Icon, badge, dot }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  clsx(
                    'group relative flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[10px] font-semibold transition',
                    isActive
                      ? 'text-brand-600 dark:text-brand-400'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <div
                      className={clsx(
                        'relative flex h-7 w-10 items-center justify-center rounded-full transition-colors',
                        isActive && 'bg-brand-50 dark:bg-brand-950/80',
                      )}
                    >
                      <Icon size={18} strokeWidth={isActive ? 2.4 : 2} />
                      {badge !== undefined && badge > 0 && (
                        <span className="absolute -right-0.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                      {dot && badge === undefined && (
                        <span className="absolute right-2 top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900" />
                      )}
                    </div>
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

export default MobileLayout;
