import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import clsx from 'clsx';
import {
  Bell,
  BellRing,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Clock,
  Database,
  HelpCircle,
  KeyRound,
  Lock,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Smartphone,
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
  type TimetableViewMode,
} from '@/services/session.service';

export function SettingsAuthPage() {
  const {
    session,
    settings,
    savedCredentialsEmail,
    loginWithWebView,
    saveAutoLoginCredentials,
    clearAutoLoginCredentials,
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
  const [credEmail, setCredEmail] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credError, setCredError] = useState<string | null>(null);
  const [isSavingCreds, setIsSavingCreds] = useState(false);

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

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredError(null);
    if (!credEmail.trim() || !credPassword) {
      setCredError('Wpisz adres e-mail i hasło do konta eduVULCAN.');
      return;
    }
    setIsSavingCreds(true);
    try {
      await saveAutoLoginCredentials(credEmail.trim(), credPassword);
      setCredPassword('');
      showToast(
        'info',
        '🔒 Dane zapisane bezpiecznie',
        'Zaszyfrowano w Android Keystore do automatycznego odnawiania sesji.',
      );
    } catch (err) {
      setCredError(err instanceof Error ? err.message : 'Nie udało się zapisać danych.');
    } finally {
      setIsSavingCreds(false);
    }
  };

  const handleClearCredentials = async () => {
    await clearAutoLoginCredentials();
    setCredEmail('');
    setCredPassword('');
    showToast('info', '🗑️ Usunięto zapisane dane', 'Usunięto zaszyfrowane dane logowania z telefonu.');
  };

  const themeOptions: ReadonlyArray<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
    { value: 'system', label: 'Systemowy', icon: Monitor },
    { value: 'light', label: 'Jasny', icon: Sun },
    { value: 'dark', label: 'Ciemny', icon: Moon },
  ];

  return (
    <div className="flex flex-col gap-4 p-3.5">
      {/* ───────────── 1. Current Session Status Card ───────────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={clsx(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm',
                session.isAuthenticated
                  ? 'bg-emerald-600'
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
                  : 'Zaloguj się poniżej kontem eduVULCAN.'}
              </p>
            </div>
          </div>

          {session.isAuthenticated && (
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <LogOut size={13} />
              <span>Wyloguj</span>
            </button>
          )}
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

      {/* ───────────── 3b. Session Keep-Alive & Auto-Relogin (Android Keystore) ───────────── */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <KeyRound size={17} className="text-brand-600 dark:text-brand-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Automatyczne odnawianie sesji
            </h2>
          </div>

          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={settings.autoReloginEnabled}
              onChange={(e) =>
                void updateSettings({ autoReloginEnabled: e.target.checked })
              }
              className="peer sr-only"
            />
            <div className="h-6 w-11 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-brand-600 peer-checked:after:translate-x-full dark:bg-slate-700" />
          </label>
        </div>

        <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          OpenEdu automatycznie podtrzymuje sesję i cicho odświeża ciasteczka SSO w tle. Możesz
          opcjonalnie zapisać dane logowania w szyfrowanym{' '}
          <strong className="font-semibold text-slate-700 dark:text-slate-300">
            Android Keystore
          </strong>
          , aby aplikacja odnowiła sesję nawet po wygaśnięciu głównego logowania SSO.
        </p>

        {savedCredentialsEmail ? (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <div className="flex min-w-0 items-center gap-2">
              <Lock size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                  Zapisane szyfrowane logowanie
                </p>
                <p className="truncate text-xs text-emerald-700 dark:text-emerald-400">
                  {savedCredentialsEmail}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleClearCredentials()}
              className="shrink-0 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-400"
            >
              Usuń
            </button>
          </div>
        ) : (
          settings.autoReloginEnabled && (
            <form onSubmit={(e) => void handleSaveCredentials(e)} className="mt-3 flex flex-col gap-2">
              <input
                type="email"
                autoComplete="username"
                placeholder="E-mail / login eduVULCAN"
                value={credEmail}
                onChange={(e) => setCredEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Hasło eduVULCAN"
                value={credPassword}
                onChange={(e) => setCredPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-brand-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              {credError && (
                <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{credError}</p>
              )}
              <button
                type="submit"
                disabled={isSavingCreds}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.99] disabled:opacity-60"
              >
                <Lock size={13} />
                <span>
                  {isSavingCreds ? 'Szyfrowanie…' : 'Zapisz bezpiecznie na telefonie'}
                </span>
              </button>
            </form>
          )
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

      {/* ───────────── 5. Appearance / Dark Mode & Timetable View ───────────── */}
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

        <div className="mt-4 border-t border-slate-100 pt-3.5 dark:border-slate-800">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Widok planu lekcji
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                { value: 'day', label: 'Jeden dzień', icon: CalendarDays },
                { value: 'week', label: 'Cały tydzień', icon: CalendarRange },
              ] as ReadonlyArray<{
                value: TimetableViewMode;
                label: string;
                icon: typeof CalendarDays;
              }>
            ).map(({ value, label, icon: Icon }) => {
              const active = settings.timetableViewMode === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => void updateSettings({ timetableViewMode: value })}
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
