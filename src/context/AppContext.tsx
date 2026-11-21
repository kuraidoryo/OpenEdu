import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { isSessionExpiredError } from '@/api/errors';
import { clearAllData, db, markMessageReadLocally, saveMessageContent } from '@/db/database';
import { DEFAULT_SESSION, type AppMode, type AuthSession, type Grade, type Message } from '@/models/types';
import { NotificationService } from '@/services/notification.service';
import { DEFAULT_SETTINGS, SessionService, type AppSettings } from '@/services/session.service';
import {
  SyncPoller,
  getProvider,
  mockProvider,
  resetProviderCache,
  syncAllData,
  type SyncResult,
} from '@/services/sync.service';
import {
  VulcanAuth,
  isNativeAndroidAuthAvailable,
  packDomainCookies,
  type VulcanWebLoginResult,
} from '@/services/vulcan-auth.plugin';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface LiveCredentials {
  sessionCookie: string;
  tenant: string;
}

export interface AppContextValue {
  /** True once the persisted session/settings have been loaded. */
  isReady: boolean;
  session: AuthSession;
  settings: AppSettings;
  isOnline: boolean;
  syncStatus: SyncStatus;
  lastError: string | null;
  lastSyncResult: SyncResult | null;
  /** True when Live session expired and the user must log in again. */
  sessionExpired: boolean;
  /** Email of credentials encrypted in Android Keystore (if saved by the user). */
  savedCredentialsEmail: string | null;

  loginDemo: () => Promise<void>;
  loginLive: (credentials: LiveCredentials) => Promise<void>;
  loginWithWebView: () => Promise<VulcanWebLoginResult>;
  saveAutoLoginCredentials: (email: string, password: string) => Promise<void>;
  clearAutoLoginCredentials: () => Promise<void>;
  logout: () => Promise<void>;
  switchMode: (mode: AppMode) => Promise<void>;

  syncNow: () => Promise<SyncResult | null>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;

  /** Marks message read (locally + server) and loads full content if missing. */
  openMessage: (id: string) => Promise<void>;

  /** Demo helpers – Mock mode only. */
  simulateIncomingMessage: () => Promise<Message | null>;
  simulateIncomingGrade: () => Promise<Grade | null>;

  clearOfflineData: () => Promise<void>;
  requestNotificationPermission: () => Promise<boolean>;
  sendTestNotification: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Nieznany błąd');

export function AppProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [session, setSession] = useState<AuthSession>(DEFAULT_SESSION);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [savedCredentialsEmail, setSavedCredentialsEmail] = useState<string | null>(null);

  // Refs so long-lived callbacks (poller, keep-alive) always see fresh state.
  const sessionRef = useRef(session);
  const settingsRef = useRef(settings);
  const refreshInFlightRef = useRef<Promise<AuthSession | null> | null>(null);
  const lastKeepAliveRef = useRef(0);
  sessionRef.current = session;
  settingsRef.current = settings;

  const persistSession = useCallback(async (next: AuthSession) => {
    sessionRef.current = next;
    setSession(next);
    await SessionService.saveSession(next);
  }, []);

  /** Reads fresher sliding-expiration cookies from Android's CookieManager and saves them. */
  const syncNativeCookiesToSession = useCallback(
    async (baseSession: AuthSession, lastSync?: string): Promise<AuthSession> => {
      let nextCookie = baseSession.sessionCookie;
      if (isNativeAndroidAuthAvailable() && baseSession.mode === 'live' && baseSession.tenant) {
        try {
          const latest = await VulcanAuth.getCurrentCookies({ tenant: baseSession.tenant });
          if (latest.uczenCookie && latest.uczenCookie.includes('Eduvulcan.Uczen.Sso')) {
            const packed = packDomainCookies(latest.uczenCookie, latest.wiadomosciCookie);
            if (packed) nextCookie = packed;
          }
        } catch {
          // Non-critical: keep existing cookie
        }
      }

      const updated: AuthSession = {
        ...baseSession,
        sessionCookie: nextCookie,
        ...(lastSync !== undefined ? { lastSync } : {}),
      };
      await persistSession(updated);
      return updated;
    },
    [persistSession],
  );

  /**
   * Attempts a silent background session refresh on Android via hidden WebView
   * (using persistent SSO cookies, and optionally Keystore-encrypted credentials).
   * Concurrent callers share the same in-flight promise.
   */
  const trySilentRefresh = useCallback(async (): Promise<AuthSession | null> => {
    const current = sessionRef.current;
    if (!isNativeAndroidAuthAvailable() || current.mode !== 'live' || !current.tenant) {
      return null;
    }
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const promise = (async (): Promise<AuthSession | null> => {
      try {
        const res = await VulcanAuth.refreshSessionSilently({
          tenant: current.tenant,
          allowAutoLogin: settingsRef.current.autoReloginEnabled,
        });
        const packedCookie =
          res.uczenCookie || res.wiadomosciCookie
            ? packDomainCookies(res.uczenCookie || res.sessionCookie, res.wiadomosciCookie)
            : res.sessionCookie;
        if (!packedCookie) return null;

        resetProviderCache();
        const refreshed: AuthSession = {
          ...sessionRef.current,
          isAuthenticated: true,
          mode: 'live',
          tenant: res.tenant || current.tenant,
          sessionCookie: packedCookie,
        };
        setSessionExpired(false);
        await persistSession(refreshed);
        lastKeepAliveRef.current = Date.now();
        return refreshed;
      } catch (err) {
        console.warn('[auth] Silent session refresh failed:', err);
        return null;
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = promise;
    return promise;
  }, [persistSession]);

  // ─────────────── Error handling ───────────────

  const handleError = useCallback(
    async (err: unknown) => {
      setSyncStatus('error');
      if (isSessionExpiredError(err)) {
        setLastError('Sesja eduVULCAN wygasła – zaloguj się ponownie.');
        if (!sessionExpired) {
          setSessionExpired(true);
          if (settingsRef.current.notificationsEnabled) await NotificationService.notifySessionExpired();
        }
        resetProviderCache();
        // Do NOT wipe WebView cookies here so persistent eduvulcan.pl SSO cookies remain intact.
        await persistSession({ ...sessionRef.current, isAuthenticated: false });
      } else {
        setLastError(errorMessage(err));
      }
    },
    [persistSession, sessionExpired],
  );

  // ─────────────── Sync ───────────────

  const syncNow = useCallback(async (): Promise<SyncResult | null> => {
    const current = sessionRef.current;
    if (!current.isAuthenticated && !(current.mode === 'live' && current.tenant && isNativeAndroidAuthAvailable())) {
      return null;
    }
    if (!navigator.onLine) {
      setLastError('Brak połączenia – wyświetlane są dane offline.');
      return null;
    }

    setSyncStatus('syncing');
    setLastError(null);
    try {
      let activeSession = current;
      if (!activeSession.isAuthenticated) {
        const recovered = await trySilentRefresh();
        if (!recovered) return null;
        activeSession = recovered;
      }

      let result: SyncResult;
      try {
        result = await syncAllData(getProvider(activeSession), {
          notify: settingsRef.current.notificationsEnabled,
        });
      } catch (err) {
        if (isSessionExpiredError(err)) {
          const refreshed = await trySilentRefresh();
          if (refreshed) {
            activeSession = refreshed;
            result = await syncAllData(getProvider(refreshed), {
              notify: settingsRef.current.notificationsEnabled,
            });
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

      setLastSyncResult(result);
      setSyncStatus('success');
      setSessionExpired(false);
      lastKeepAliveRef.current = Date.now();
      await syncNativeCookiesToSession(activeSession, result.syncedAt);
      return result;
    } catch (err) {
      await handleError(err);
      return null;
    }
  }, [handleError, syncNativeCookiesToSession, trySilentRefresh]);

  const syncNowRef = useRef(syncNow);
  syncNowRef.current = syncNow;
  const poller = useMemo(() => new SyncPoller(() => syncNowRef.current()), []);

  // ─────────────── Init ───────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedSession, storedSettings, credsStatus] = await Promise.all([
        SessionService.loadSession(),
        SessionService.loadSettings(),
        VulcanAuth.getCredentialsStatus().catch(() => ({ hasCredentials: false, email: '' })),
      ]);
      if (cancelled) return;

      setSavedCredentialsEmail(credsStatus.hasCredentials ? credsStatus.email : null);
      setSettings(storedSettings);
      settingsRef.current = storedSettings;

      // Default to live mode (clear any legacy mock data if present)
      let initial = storedSession;
      if (!initial || initial.mode === 'mock') {
        await clearAllData();
        initial = { ...DEFAULT_SESSION, mode: 'live', isAuthenticated: false };
        await SessionService.saveSession(initial);
      }
      sessionRef.current = initial;
      setSession(initial);

      setIsReady(true);
      if (storedSettings.notificationsEnabled) void NotificationService.requestPermission();
      if (initial.isAuthenticated) void syncNowRef.current();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Online / offline tracking (+ sync on reconnect).
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      void syncNowRef.current();
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Background polling follows auth state & interval.
  useEffect(() => {
    if (!isReady || !session.isAuthenticated) {
      poller.stop();
      return;
    }
    poller.start(settings.pollingIntervalMin);
    return () => poller.stop();
  }, [isReady, session.isAuthenticated, settings.pollingIntervalMin, poller]);

  // Lightweight session Keep-Alive (extends sliding-expiration cookies & silently refreshes if needed).
  useEffect(() => {
    if (!isReady || !session.isAuthenticated || session.mode !== 'live') return;

    const KEEP_ALIVE_MS = 20 * 60_000;
    const RESUME_THRESHOLD_MS = 10 * 60_000;

    const runKeepAlive = async () => {
      if (!navigator.onLine || !sessionRef.current.isAuthenticated) return;
      lastKeepAliveRef.current = Date.now();
      try {
        await getProvider(sessionRef.current).verifySession();
        await syncNativeCookiesToSession(sessionRef.current);
      } catch (err) {
        if (isSessionExpiredError(err)) {
          await trySilentRefresh();
        }
      }
    };

    const timer = setInterval(() => void runKeepAlive(), KEEP_ALIVE_MS);
    const onVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastKeepAliveRef.current >= RESUME_THRESHOLD_MS
      ) {
        void runKeepAlive();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isReady, session.isAuthenticated, session.mode, syncNativeCookiesToSession, trySilentRefresh]);

  // Theme (dark mode) handling.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme]);

  // ─────────────── Auth & mode ───────────────

  const resetLocalState = useCallback(async () => {
    await clearAllData();
    setLastSyncResult(null);
    setLastError(null);
    setSyncStatus('idle');
    setSessionExpired(false);
  }, []);

  const loginDemo = useCallback(async () => {
    if (sessionRef.current.mode !== 'mock') await resetLocalState();
    resetProviderCache();
    const info = await mockProvider.verifySession();
    await persistSession({
      ...DEFAULT_SESSION,
      isAuthenticated: true,
      mode: 'mock',
      userName: info.userName,
      schoolName: info.schoolName,
    });
    await syncNowRef.current();
  }, [persistSession, resetLocalState]);

  const loginLive = useCallback(
    async ({ sessionCookie, tenant }: LiveCredentials) => {
      resetProviderCache();
      const candidateSession: AuthSession = {
        ...DEFAULT_SESSION,
        isAuthenticated: true,
        mode: 'live',
        sessionCookie: sessionCookie.trim(),
        tenant: tenant.trim(),
      };
      // Validate using the cached provider so context & restored cookies are reused on syncNow.
      const info = await getProvider(candidateSession).verifySession();

      const prev = sessionRef.current;
      const sameAccount = prev.mode === 'live' && prev.tenant === tenant.trim() && prev.userName === info.userName;
      if (!sameAccount) await resetLocalState();

      setSessionExpired(false);
      await persistSession({
        ...candidateSession,
        userName: info.userName,
        schoolName: info.schoolName,
        lastSync: sameAccount ? prev.lastSync : null,
      });
      await syncNowRef.current();
    },
    [persistSession, resetLocalState],
  );

  const loginWithWebView = useCallback(async (): Promise<VulcanWebLoginResult> => {
    const res = await VulcanAuth.loginWithWebView();
    const packedCookie =
      res.uczenCookie || res.wiadomosciCookie
        ? packDomainCookies(res.uczenCookie || res.sessionCookie, res.wiadomosciCookie)
        : res.sessionCookie;
    await loginLive({
      tenant: res.tenant,
      sessionCookie: packedCookie,
    });
    return { ...res, sessionCookie: packedCookie };
  }, [loginLive]);

  const saveAutoLoginCredentials = useCallback(async (email: string, password: string) => {
    const trimmedEmail = email.trim();
    await VulcanAuth.saveCredentials({ email: trimmedEmail, password });
    setSavedCredentialsEmail(trimmedEmail);
  }, []);

  const clearAutoLoginCredentials = useCallback(async () => {
    await VulcanAuth.clearCredentials();
    setSavedCredentialsEmail(null);
  }, []);

  const logout = useCallback(async () => {
    poller.stop();
    resetProviderCache();
    await VulcanAuth.clearWebViewCookies().catch(() => undefined);
    await resetLocalState();
    await persistSession({ ...DEFAULT_SESSION, mode: sessionRef.current.mode });
  }, [persistSession, poller, resetLocalState]);

  const switchMode = useCallback(
    async (mode: AppMode) => {
      if (mode === sessionRef.current.mode) return;
      // Never mix demo and real data in the offline DB.
      resetProviderCache();
      await resetLocalState();
      if (mode === 'mock') {
        await loginDemo();
      } else {
        await persistSession({ ...DEFAULT_SESSION, mode: 'live' });
      }
    },
    [loginDemo, persistSession, resetLocalState],
  );

  // ─────────────── Settings ───────────────

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    await SessionService.saveSettings(next);
    if (patch.notificationsEnabled) await NotificationService.requestPermission();
  }, []);

  // ─────────────── Messages ───────────────

  const openMessage = useCallback(
    async (id: string) => {
      const msg = await db.messages.get(id);
      if (!msg) return;

      if (!msg.isRead) await markMessageReadLocally(id);

      const current = sessionRef.current;
      if (!current.isAuthenticated || !navigator.onLine) return;

      try {
        const provider = getProvider(current);
        if (!msg.content) {
          const content = await provider.fetchMessageContent(id);
          await saveMessageContent(id, content);
        }
        if (!msg.isRead && msg.folder === 'inbox') await provider.markMessageAsRead(id);
      } catch (err) {
        if (isSessionExpiredError(err)) {
          const refreshed = await trySilentRefresh();
          if (refreshed) {
            try {
              const provider = getProvider(refreshed);
              if (!msg.content) {
                const content = await provider.fetchMessageContent(id);
                await saveMessageContent(id, content);
              }
              if (!msg.isRead && msg.folder === 'inbox') await provider.markMessageAsRead(id);
              return;
            } catch (retryErr) {
              if (isSessionExpiredError(retryErr)) await handleError(retryErr);
              else console.warn('[openMessage retry]', retryErr);
              return;
            }
          }
          await handleError(err);
        } else {
          console.warn('[openMessage]', err);
        }
      }
    },
    [handleError, trySilentRefresh],
  );

  // ─────────────── Demo helpers ───────────────

  const simulateIncomingMessage = useCallback(async () => {
    if (sessionRef.current.mode !== 'mock') return null;
    const msg = mockProvider.simulateIncomingMessage();
    await syncNowRef.current();
    return msg;
  }, []);

  const simulateIncomingGrade = useCallback(async () => {
    if (sessionRef.current.mode !== 'mock') return null;
    const grade = mockProvider.simulateIncomingGrade();
    await syncNowRef.current();
    return grade;
  }, []);

  // ─────────────── Misc ───────────────

  const clearOfflineData = useCallback(async () => {
    await resetLocalState();
    await persistSession({ ...sessionRef.current, lastSync: null });
  }, [persistSession, resetLocalState]);

  const value = useMemo<AppContextValue>(
    () => ({
      isReady,
      session,
      settings,
      isOnline,
      syncStatus,
      lastError,
      lastSyncResult,
      sessionExpired,
      savedCredentialsEmail,
      loginDemo,
      loginLive,
      loginWithWebView,
      saveAutoLoginCredentials,
      clearAutoLoginCredentials,
      logout,
      switchMode,
      syncNow,
      updateSettings,
      openMessage,
      simulateIncomingMessage,
      simulateIncomingGrade,
      clearOfflineData,
      requestNotificationPermission: NotificationService.requestPermission,
      sendTestNotification: NotificationService.sendTestNotification,
    }),
    [
      isReady,
      session,
      settings,
      isOnline,
      syncStatus,
      lastError,
      lastSyncResult,
      sessionExpired,
      savedCredentialsEmail,
      loginDemo,
      loginLive,
      loginWithWebView,
      saveAutoLoginCredentials,
      clearAutoLoginCredentials,
      logout,
      switchMode,
      syncNow,
      updateSettings,
      openMessage,
      simulateIncomingMessage,
      simulateIncomingGrade,
      clearOfflineData,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp() must be used inside <AppProvider>');
  return ctx;
}
