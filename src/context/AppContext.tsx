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
import { LiveVulcanProvider } from '@/api/LiveVulcanProvider';
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

  loginDemo: () => Promise<void>;
  loginLive: (credentials: LiveCredentials) => Promise<void>;
  loginWithWebView: () => Promise<VulcanWebLoginResult>;
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

  // Refs so long-lived callbacks (poller) always see fresh state.
  const sessionRef = useRef(session);
  const settingsRef = useRef(settings);
  sessionRef.current = session;
  settingsRef.current = settings;

  const persistSession = useCallback(async (next: AuthSession) => {
    sessionRef.current = next;
    setSession(next);
    await SessionService.saveSession(next);
  }, []);

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
    if (!current.isAuthenticated) return null;
    if (!navigator.onLine) {
      setLastError('Brak połączenia – wyświetlane są dane offline.');
      return null;
    }

    setSyncStatus('syncing');
    setLastError(null);
    try {
      const result = await syncAllData(getProvider(current), { notify: settingsRef.current.notificationsEnabled });
      setLastSyncResult(result);
      setSyncStatus('success');
      setSessionExpired(false);
      await persistSession({ ...sessionRef.current, lastSync: result.syncedAt });
      return result;
    } catch (err) {
      await handleError(err);
      return null;
    }
  }, [handleError, persistSession]);

  const syncNowRef = useRef(syncNow);
  syncNowRef.current = syncNow;
  const poller = useMemo(() => new SyncPoller(() => syncNowRef.current()), []);

  // ─────────────── Init ───────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedSession, storedSettings] = await Promise.all([
        SessionService.loadSession(),
        SessionService.loadSettings(),
      ]);
      if (cancelled) return;

      setSettings(storedSettings);
      settingsRef.current = storedSettings;

      // First launch → start in Demo mode so the app is usable immediately.
      const initial = storedSession ?? { ...DEFAULT_SESSION, isAuthenticated: true, mode: 'mock' as const, userName: 'Demo' };
      sessionRef.current = initial;
      setSession(initial);
      if (!storedSession) await SessionService.saveSession(initial);

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
      // Validate first – throws on invalid cookie/tenant (caller shows the error).
      const info = await new LiveVulcanProvider({ sessionCookie, tenant }).verifySession();

      const prev = sessionRef.current;
      const sameAccount = prev.mode === 'live' && prev.tenant === tenant.trim() && prev.userName === info.userName;
      if (!sameAccount) await resetLocalState();

      resetProviderCache();
      setSessionExpired(false);
      await persistSession({
        ...DEFAULT_SESSION,
        isAuthenticated: true,
        mode: 'live',
        sessionCookie: sessionCookie.trim(),
        tenant: tenant.trim(),
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
        // Offline copy is still shown; only surface session problems.
        if (isSessionExpiredError(err)) await handleError(err);
        else console.warn('[openMessage]', err);
      }
    },
    [handleError],
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
      loginDemo,
      loginLive,
      loginWithWebView,
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
      loginDemo,
      loginLive,
      loginWithWebView,
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
