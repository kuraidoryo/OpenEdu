import type { IVulcanDataProvider } from '@/api/IVulcanProvider';
import { LiveVulcanProvider } from '@/api/LiveVulcanProvider';
import { MockVulcanProvider } from '@/api/MockVulcanProvider';
import { isSessionExpiredError } from '@/api/errors';
import {
  META_KEYS,
  getStoredGradeIds,
  getStoredMessageIds,
  isInitialSyncDone,
  replaceGrades,
  replaceLessons,
  saveMessages,
  setMeta,
} from '@/db/database';
import type { AuthSession, Grade, Message } from '@/models/types';
import { NotificationService } from './notification.service';

// ───────────────────────────── Provider factory ─────────────────────────────

/** Single mock instance – keeps simulated messages between syncs. */
export const mockProvider = new MockVulcanProvider();

let liveCache: { key: string; provider: LiveVulcanProvider } | null = null;

/**
 * Returns the provider matching the session mode.
 * Throws `SessionExpiredError` for Live mode without a cookie.
 */
export function getProvider(session: AuthSession): IVulcanDataProvider {
  if (session.mode === 'mock') return mockProvider;

  const key = `${session.tenant}::${session.sessionCookie}`;
  if (!liveCache || liveCache.key !== key) {
    liveCache = { key, provider: new LiveVulcanProvider({ sessionCookie: session.sessionCookie, tenant: session.tenant }) };
  }
  return liveCache.provider;
}

/** Drops the cached Live client (e.g. after logout or cookie change). */
export function resetProviderCache(): void {
  liveCache = null;
}

// ───────────────────────────── Sync ─────────────────────────────

export interface SyncOptions {
  /** Fire notifications for new items (default: true). */
  notify?: boolean;
}

export interface SyncResult {
  newMessages: Message[];
  newGrades: Grade[];
  /** True if this was the first population of the local DB (no notifications sent). */
  initialSync: boolean;
  timetableUpdated: boolean;
  /** ISO timestamp of this sync. */
  syncedAt: string;
}

/** Above this many new items a single summary notification is sent instead. */
const SUMMARY_THRESHOLD = 3;

let inFlight: Promise<SyncResult> | null = null;

/**
 * Fetches messages, grades and timetable, diffs them against the offline DB,
 * notifies about new items and persists everything locally.
 *
 * Concurrent calls share the same in-flight promise.
 * Re-throws `SessionExpiredError` so callers can handle re-login.
 */
export function syncAllData(provider: IVulcanDataProvider, options: SyncOptions = {}): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = runSync(provider, options).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function isSyncInProgress(): boolean {
  return inFlight !== null;
}

async function runSync(provider: IVulcanDataProvider, { notify = true }: SyncOptions): Promise<SyncResult> {
  // 1. Fetch (messages + grades are required; timetable is best-effort).
  const [messages, grades, timetableResult] = await Promise.all([
    provider.fetchMessages(),
    provider.fetchGrades(),
    provider.fetchTimetable().then(
      (lessons) => ({ ok: true as const, lessons }),
      (error: unknown) => {
        if (isSessionExpiredError(error)) throw error;
        console.warn('[sync] Timetable fetch failed, keeping offline copy', error);
        return { ok: false as const };
      },
    ),
  ]);

  // 2. Diff against the local DB.
  const [knownMessageIds, knownGradeIds, initialDone] = await Promise.all([
    getStoredMessageIds(),
    getStoredGradeIds(),
    isInitialSyncDone(),
  ]);

  const initialSync = !initialDone;
  const newMessages = initialSync
    ? []
    : messages.filter((m) => m.folder === 'inbox' && !m.isRead && !knownMessageIds.has(m.id));
  const newGrades = initialSync ? [] : grades.filter((g) => !knownGradeIds.has(g.id));

  // 3. Persist (offline source of truth).
  await saveMessages(messages);
  await replaceGrades(grades);
  if (timetableResult.ok) await replaceLessons(timetableResult.lessons);

  const syncedAt = new Date().toISOString();
  await setMeta(META_KEYS.lastSync, syncedAt);
  if (initialSync) await setMeta(META_KEYS.initialSyncDone, 'true');

  // 4. Notify (after persisting, so tapping a notification opens cached data).
  if (notify) await dispatchNotifications(newMessages, newGrades);

  return { newMessages, newGrades, initialSync, timetableUpdated: timetableResult.ok, syncedAt };
}

async function dispatchNotifications(messages: Message[], grades: Grade[]): Promise<void> {
  if (messages.length > SUMMARY_THRESHOLD) {
    await NotificationService.notifyNewMessagesSummary(messages.length);
  } else {
    for (const m of messages) await NotificationService.notifyNewMessage(m);
  }

  if (grades.length > SUMMARY_THRESHOLD) {
    await NotificationService.notifyNewGradesSummary(grades.length);
  } else {
    for (const g of grades) await NotificationService.notifyNewGrade(g);
  }
}

// ───────────────────────────── Background polling ─────────────────────────────

/**
 * Periodic sync while the app process is alive (foreground or recently
 * backgrounded WebView). Also triggers a sync when the app becomes visible
 * again and the last tick is older than the interval.
 *
 * NOTE: When Android kills the app process, JS timers stop. True background
 * fetch would require a native worker (e.g. @capacitor/background-runner) –
 * a possible future enhancement.
 */
export class SyncPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private intervalMs = 0;
  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible' && Date.now() - this.lastTick >= this.intervalMs) {
      void this.tick();
    }
  };

  constructor(private readonly task: () => Promise<unknown>) {}

  start(intervalMinutes: number): void {
    this.stop();
    this.intervalMs = intervalMinutes * 60_000;
    this.lastTick = Date.now();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  get isRunning(): boolean {
    return this.timer !== null;
  }

  private async tick(): Promise<void> {
    this.lastTick = Date.now();
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      await this.task();
    } catch (err) {
      console.warn('[SyncPoller] Tick failed', err);
    }
  }
}
