import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import clsx from 'clsx';
import {
  Bell,
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Clock,
  Copy,
  Database,
  ExternalLink,
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
  Wand2,
} from 'lucide-react';
import { EDUVULCAN_ENDPOINTS } from '@/api/endpoints.config';
import { useApp } from '@/context/AppContext';
import { getDatabaseStats } from '@/db/database';
import { showToast } from '@/services/notification.service';
import {
  POLLING_INTERVALS,
  type PollingInterval,
  type ThemePreference,
} from '@/services/session.service';
import {
  isNativeAndroidAuthAvailable,
  parseSmartAuthInput,
} from '@/services/vulcan-auth.plugin';

export function SettingsAuthPage() {
  const {
    session,
    settings,
    switchMode,
    loginDemo,
    loginLive,
    loginWithWebView,
    logout,
    updateSettings,
    clearOfflineData,
    sendTestNotification,
    requestNotificationPermission,
  } = useApp();

  const [tenantInput, setTenantInput] = useState(session.tenant || '');
  const [cookieInput, setCookieInput] = useState(session.sessionCookie || '');
  const [smartInput, setSmartInput] = useState('');
  const [smartFeedback, setSmartFeedback] = useState<string | null>(null);
  const [showManualFields, setShowManualFields] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWebViewLoggingIn, setIsWebViewLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [confirmClearDb, setConfirmClearDb] = useState(false);

  const isNativeAndroid = isNativeAndroidAuthAvailable();

  const dbStats = useLiveQuery(
    () => getDatabaseStats(),
    [],
    { messages: 0, grades: 0, lessons: 0 },
  );

  // ─────────────── Solution 1: 1-Click In-App WebView Login ───────────────
  const handleWebViewLogin = async () => {
    setAuthError(null);
    setIsWebViewLoggingIn(true);
    try {
      const res = await loginWithWebView();
      setTenantInput(res.tenant);
      setCookieInput(res.sessionCookie);
      showToast(
        'info',
        '✅ Zalogowano do eduVULCAN',
        `Pobrano sesję dla jednostki "${res.tenant}" i zsynchronizowano dane offline.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Logowanie WebView nie powiodło się.';
      setAuthError(msg);
      if (!isNativeAndroid) {
        setShowGuide(true);
      }
    } finally {
      setIsWebViewLoggingIn(false);
    }
  };

  // ─────────────── Solution 3: Smart Input Parser (URL / cURL / JSON) ───────────────
  const handleSmartInputChange = (value: string) => {
    setSmartInput(value);
    setAuthError(null);
    if (!value.trim()) {
      setSmartFeedback(null);
      return;
    }

    const parsed = parseSmartAuthInput(value);
    setSmartFeedback(parsed.summary);

    if (parsed.tenant) {
      setTenantInput(parsed.tenant);
    }
    if (parsed.sessionCookie) {
      setCookieInput(parsed.sessionCookie);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (!clipText.trim()) {
        showToast('info', 'Schowek jest pusty', 'Skopiuj wcześniej link, polecenie cURL lub JSON.');
        return;
      }
      handleSmartInputChange(clipText);
      showToast('info', '📋 Wklejono ze schowka', 'Automatycznie przeanalizowano zawartość.');
    } catch {
      showToast('error', 'Brak dostępu do schowka', 'Wklej tekst ręcznie w pole poniżej.');
    }
  };

  const handleExportSessionJson = async () => {
    const payload = JSON.stringify(
      {
        tenant: tenantInput.trim() || session.tenant,
        sessionCookie: cookieInput.trim() || session.sessionCookie,
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(payload);
      showToast(
        'info',
        '📦 Skopiowano pakiet sesji JSON',
        'Możesz go wkleić w polu Szybkiego importu na telefonie.',
      );
    } catch {
      setSmartInput(payload);
      showToast('info', 'Pakiet JSON wygenerowany', 'Skopiuj go z pola Szybkiego importu.');
    }
  };

  const handleLiveSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    // Also allow submitting directly if the user only pasted into smartInput
    let finalTenant = tenantInput.trim();
    let finalCookie = cookieInput.trim();
    if ((!finalTenant || !finalCookie) && smartInput.trim()) {
      const parsed = parseSmartAuthInput(smartInput);
      if (!finalTenant && parsed.tenant) finalTenant = parsed.tenant;
      if (!finalCookie && parsed.sessionCookie) finalCookie = parsed.sessionCookie;
    }

    if (!finalTenant) {
      setAuthError(
        'Brakuje symbolu szkoły / miasta (np. warszawa). Wklej link z uczen.eduvulcan.pl/<symbol>/App/... lub wpisz go ręcznie.',
      );
      setShowManualFields(true);
      return;
    }
    if (!finalCookie) {
      setAuthError('Brakuje ciasteczka sesyjnego Cookie. Użyj logowania WebView lub wklej cURL / JSON.');
      setShowManualFields(true);
      return;
    }

    setIsConnecting(true);
    try {
      await loginLive({
        tenant: finalTenant,
        sessionCookie: finalCookie,
      });
      showToast('info', '✅ Połączono z eduVULCAN', 'Dane ucznia zostały pobrane i zapisane offline.');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Nie udało się zweryfikować sesji.');
    } finally {
      setIsConnecting(false);
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
                  : 'Zaloguj się poniżej jednym kliknięciem lub włącz Tryb Demo.'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {session.isAuthenticated && session.mode === 'live' && (
              <button
                type="button"
                onClick={() => void handleExportSessionJson()}
                title="Skopiuj pakiet sesji JSON"
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Copy size={13} />
                <span>JSON</span>
              </button>
            )}

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

      {/* ───────────── 3. Solution 1 + 3: Native WebView Login & Smart Import ───────────── */}
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

        {/* Solution 1: 1-Click In-App WebView Login Button */}
        <div className="mt-3 rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-teal-50/60 to-white p-3.5 dark:border-emerald-900/60 dark:from-emerald-950/40 dark:via-teal-950/20 dark:to-slate-900">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Rekomendowane na telefonie
              </span>
              <h3 className="mt-1.5 text-xs font-bold text-slate-900 dark:text-white">
                1. Wbudowane okno logowania WebView (Bez F12)
              </h3>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                Otwiera stronę <code className="text-[10px]">eduvulcan.pl/logowanie</code> wewnątrz
                aplikacji. Po wpisaniu loginu i hasła automatycznie pobiera symbol szkoły oraz
                ciasteczka sesyjne i zamyka okno.
              </p>
            </div>
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
                : 'Zaloguj się kontem eduVULCAN (Automatycznie)'}
            </span>
          </button>
        </div>

        {/* Solution 3: Smart Import (Paste URL / cURL / JSON) */}
        <form onSubmit={(e) => void handleLiveSubmit(e)} className="mt-3.5 space-y-3">
          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="smart-auth-input"
                className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200"
              >
                <Wand2 size={14} className="text-brand-600 dark:text-brand-400" />
                <span>2. Szybki import (Wklej link, cURL lub JSON z PC)</span>
              </label>

              <button
                type="button"
                onClick={() => void handlePasteFromClipboard()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <ClipboardPaste size={12} />
                <span>Wklej ze schowka</span>
              </button>
            </div>

            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Wklej tutaj pełny adres URL po zalogowaniu (aby automatycznie wyciągnąć symbol szkoły),
              polecenie <em>Copy as cURL</em> lub wyeksportowany pakiet JSON:
            </p>

            <textarea
              id="smart-auth-input"
              rows={2}
              value={smartInput}
              onChange={(e) => handleSmartInputChange(e.target.value)}
              placeholder="Wklej np. https://uczen.eduvulcan.pl/symbol/App/... albo polecenie curl / JSON…"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />

            {smartFeedback && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                <CheckCircle2 size={13} className="shrink-0 text-emerald-500" />
                <span>{smartFeedback}</span>
              </p>
            )}

            {/* Detected values pill summary */}
            {(tenantInput || cookieInput) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span
                  className={clsx(
                    'rounded-lg px-2 py-0.5 font-semibold',
                    tenantInput
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
                  )}
                >
                  Symbol: {tenantInput || 'brak'}
                </span>
                <span
                  className={clsx(
                    'rounded-lg px-2 py-0.5 font-semibold',
                    cookieInput
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
                  )}
                >
                  Cookie: {cookieInput ? `gotowe (${cookieInput.length} zn.)` : 'brak'}
                </span>
              </div>
            )}
          </div>

          {/* Collapsible Manual Input Fields */}
          <div>
            <button
              type="button"
              onClick={() => setShowManualFields((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <span>Zaawansowane: ręczna edycja pól Symbol (`tenant`) i `Cookie`</span>
              {showManualFields ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {showManualFields && (
              <div className="mt-2 space-y-2.5 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
                <div>
                  <label
                    htmlFor="tenant-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Symbol jednostki / miasta (`tenant` z URL)
                  </label>
                  <input
                    id="tenant-input"
                    type="text"
                    value={tenantInput}
                    onChange={(e) => setTenantInput(e.target.value)}
                    placeholder="np. warszawa, krakow, domyslny…"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cookie-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Ciasteczko sesyjne (`Cookie`)
                  </label>
                  <textarea
                    id="cookie-input"
                    rows={3}
                    value={cookieInput}
                    onChange={(e) => setCookieInput(e.target.value)}
                    placeholder="Eduvulcan.Uczen.Sso=...; EduVulcan.Wiadomosci.Sso=..."
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {showGuide && (
            <div className="space-y-2 rounded-xl border border-brand-200/80 bg-brand-50/60 p-3 text-xs text-slate-700 dark:border-brand-900/60 dark:bg-brand-950/30 dark:text-slate-300">
              <p className="font-bold text-brand-800 dark:text-brand-300">
                Jak zalogować się najwygodniej?
              </p>
              <ul className="list-disc space-y-1.5 pl-4">
                <li>
                  <strong>Na telefonie (Android APK):</strong> Kliknij zielony przycisk{' '}
                  <em>„Zaloguj się kontem eduVULCAN (Automatycznie)”</em>. Zaloguj się w oknie
                  przeglądarki — aplikacja sama pobierze sesję i zamknie okno.
                </li>
                <li>
                  <strong>Przeniesienie sesji z komputera (1 wklejenie):</strong> W przeglądarce na
                  PC kliknij prawym przyciskiem na dowolne zapytanie <code className="text-[11px]">/api/</code> w
                  zakładce Network → <em>Copy → Copy as cURL (bash)</em> i wklej całość w polu{' '}
                  <strong>Szybki import</strong> powyżej. Symbol szkoły i ciasteczko uzupełnią się
                  automatycznie!
                </li>
              </ul>
            </div>
          )}

          {authError && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              {authError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={isConnecting}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.99] disabled:opacity-60"
            >
              <LogIn size={15} />
              <span>
                {isConnecting ? 'Weryfikacja sesji…' : 'Zapisz zaimportowaną sesję (Tryb Live)'}
              </span>
            </button>

            <a
              href={EDUVULCAN_ENDPOINTS.portal.login}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <span>eduvulcan.pl</span>
              <ExternalLink size={13} />
            </a>
          </div>
        </form>
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
