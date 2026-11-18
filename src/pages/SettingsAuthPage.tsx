import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import clsx from 'clsx';
import {
  Bell,
  BellRing,
  CheckCircle2,
  Clock,
  Database,
  HelpCircle,
  KeyRound,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { getDatabaseStats } from '@/db/database';
import { showToast } from '@/services/notification.service';
import {
  POLLING_INTERVALS,
  type PollingInterval,
  type ThemePreference,
} from '@/services/session.service';

export function SettingsAuthPage() {
  const {
    session,
    settings,
    switchMode,
    loginDemo,
    loginWithWebView,
    logout,
    updateSettings,
    clearOfflineData,
    sendTestNotification,
    requestNotificationPermission,
  } = useApp();

  const [isWebViewLoggingIn, setIsWebViewLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [confirmClearDb, setConfirmClearDb] = useState(false);

  const dbStats = useLiveQuery(
    () => getDatabaseStats(),
    [],
    { messages: 0, grades: 0, lessons: 0 },
  );

  const handleWebViewLogin = async () => {
    setAuthError(null);
    setIsWebViewLoggingIn(true);
    try {
      const res = await loginWithWebView();
      showToast(
        'info',
        '✅ Zalogowano do eduVULCAN',
        `Pobrano sesję dla jednostki "${res.tenant}" i zsynchronizowano dane offline.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Logowanie nie powiodło się.';
      setAuthError(msg);
    } finally {
      setIsWebViewLoggingIn(false);
    }
  };

  const handleClearDatabase = async () => {
    await clearOfflineData();
    setConfirmClearDb(false);
    showToast('info', '🗑️ Baza offline wyczyszczona', 'Usunięto lokalną kopię wiadomości, ocen i planu.');
  };

  const handleTestNotification = async () => {
    await requestNotificationPermission();
    await sendTestNotification();
  };

  const themeOptions: ReadonlyArray<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
    { value: 'system', label: 'Systemowy', icon: Monitor },
    { value: 'light', label: 'Jasny', icon: Sun },
    { value: 'dark', label: 'Ciemny', icon: Moon },
  ];

  return (
    <div className="flex flex-col gap-4 p-3.5">
      {/* ───────────── 1. Mode Switcher (Mock vs Live) ───────────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h1 className="text-sm font-bold text-slate-900 dark:text-white">
            Tryb źródła danych
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Przełączaj między realistycznymi danymi Demo a prawdziwym kontem eduVULCAN.
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => void switchMode('mock')}
            className={clsx(
              'flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition',
              session.mode === 'mock'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
            )}
          >
            <Sparkles size={15} />
            <span>Tryb Demo (Mock)</span>
          </button>

          <button
            type="button"
            onClick={() => void switchMode('live')}
            className={clsx(
              'flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition',
              session.mode === 'live'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
            )}
          >
            <KeyRound size={15} />
            <span>Tryb Live (eduVULCAN)</span>
          </button>
        </div>
      </section>

      {/* ───────────── 2. Current Session Status Card ───────────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={clsx(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm',
                session.isAuthenticated
                  ? session.mode === 'mock'
                    ? 'bg-violet-600'
                    : 'bg-emerald-600'
                  : 'bg-slate-400 dark:bg-slate-700',
              )}
            >
              <UserCheck size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {session.isAuthenticated ? session.userName || 'Aktywna sesja' : 'Nie zalogowano'}
                </h2>
                {session.isAuthenticated && (
                  <CheckCircle2 size={14} className="text-emerald-500" />
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {session.isAuthenticated
                  ? session.schoolName
                  : 'Zaloguj się poniżej lub włącz Tryb Demo.'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {session.isAuthenticated ? (
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <LogOut size={13} />
                <span>Wyloguj</span>
              </button>
            ) : (
              session.mode === 'mock' && (
                <button
                  type="button"
                  onClick={() => void loginDemo()}
                  className="inline-flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
                >
                  <LogIn size={13} />
                  <span>Wczytaj Demo</span>
                </button>
              )
            )}
          </div>
        </div>
      </section>

      {/* ───────────── 3. WebView Login ───────────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Smartphone size={17} className="text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Logowanie do konta eduVULCAN
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/60"
          >
            <HelpCircle size={13} />
            <span>{showGuide ? 'Ukryj pomoc' : 'Jak to działa?'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => void handleWebViewLogin()}
          disabled={isWebViewLoggingIn}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-60"
        >
          <Smartphone size={16} />
          <span>
            {isWebViewLoggingIn
              ? 'Oczekiwanie na zalogowanie w oknie…'
              : 'Zaloguj się kontem eduVULCAN'}
          </span>
        </button>

        {showGuide && (
          <div className="mt-3 rounded-xl border border-brand-200/80 bg-brand-50/60 p-3 text-xs leading-relaxed text-slate-700 dark:border-brand-900/60 dark:bg-brand-950/30 dark:text-slate-300">
            Po kliknięciu przycisku otworzy się oficjalna strona logowania eduVULCAN wewnątrz
            aplikacji. Gdy wpiszesz swoje dane, OpenEdu automatycznie zapisze sesję wyłącznie na
            Twoim urządzeniu i zamknie okno logowania.
          </div>
        )}

        {authError && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
            {authError}
          </p>
        )}
      </section>

      {/* ───────────── 4. Notifications & Polling Interval ───────────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bell size={17} className="text-brand-600 dark:text-brand-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Powiadomienia i synchronizacja w tle
            </h2>
          </div>

          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={settings.notificationsEnabled}
              onChange={(e) =>
                void updateSettings({ notificationsEnabled: e.target.checked })
              }
              className="peer sr-only"
            />
            <div className="h-6 w-11 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-brand-600 peer-checked:after:translate-x-full dark:bg-slate-700" />
          </label>
        </div>

        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Lokalny mechanizm Diff &amp; Notify wykrywa nowe wiadomości i oceny bez zewnętrznych
          serwerów push.
        </p>

        {/* Polling Interval Selector (15 / 30 / 60 min) */}
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Clock size={13} />
            <span>Interwał sprawdzania nowych wiadomości i ocen:</span>
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {POLLING_INTERVALS.map((interval: PollingInterval) => {
              const active = settings.pollingIntervalMin === interval;
              return (
                <button
                  key={interval}
                  type="button"
                  onClick={() => void updateSettings({ pollingIntervalMin: interval })}
                  className={clsx(
                    'rounded-xl border py-2 text-xs font-bold transition',
                    active
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-950/70 dark:text-brand-300'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
                  )}
                >
                  Co {interval} min
                </button>
              );
            })}
          </div>
        </div>

        {/* Test Notification Button */}
        <button
          type="button"
          onClick={() => void handleTestNotification()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50/80 px-3.5 py-2.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 active:scale-[0.99] dark:border-brand-800 dark:bg-brand-950/60 dark:text-brand-300"
        >
          <BellRing size={15} />
          <span>Wyślij testowe powiadomienie</span>
        </button>
      </section>

      {/* ───────────── 5. Appearance / Dark Mode ───────────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Wygląd aplikacji</h2>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {themeOptions.map(({ value, label, icon: Icon }) => {
            const active = settings.theme === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => void updateSettings({ theme: value })}
                className={clsx(
                  'flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition',
                  active
                    ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-950/70 dark:text-brand-300'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
                )}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ───────────── 6. Offline Database Maintenance ───────────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Database size={17} className="text-brand-600 dark:text-brand-400" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Lokalna baza danych Offline (Dexie / IndexedDB)
          </h2>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/70">
            <p className="text-base font-extrabold text-slate-900 dark:text-white">
              {dbStats.messages}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Wiadomości</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/70">
            <p className="text-base font-extrabold text-slate-900 dark:text-white">
              {dbStats.grades}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Ocen</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/70">
            <p className="text-base font-extrabold text-slate-900 dark:text-white">
              {dbStats.lessons}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Lekcji</p>
          </div>
        </div>

        {!confirmClearDb ? (
          <button
            type="button"
            onClick={() => setConfirmClearDb(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/70 px-3.5 py-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-300"
          >
            <Trash2 size={15} />
            <span>Wyczyść lokalną bazę offline</span>
          </button>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleClearDatabase()}
              className="flex-1 rounded-xl bg-rose-600 py-2 text-xs font-bold text-white hover:bg-rose-700"
            >
              Tak, usuń dane offline
            </button>
            <button
              type="button"
              onClick={() => setConfirmClearDb(false)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Anuluj
            </button>
          </div>
        )}
      </section>

      {/* Privacy & Disclaimer Footer */}
      <footer className="flex items-start gap-2 px-1 pb-2 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
        <ShieldCheck size={15} className="mt-0.5 shrink-0" />
        <p>
          OpenEdu działa w 100% lokalnie na Twoim urządzeniu. Projekt open-source, niepowiązany z
          firmą VULCAN sp. z o.o.
        </p>
      </footer>
    </div>
  );
}

export default SettingsAuthPage;
