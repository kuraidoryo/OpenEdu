import { Preferences } from '@capacitor/preferences';
import { DEFAULT_SESSION, type AuthSession } from '@/models/types';

/**
 * Persists the session and user settings on the device via Capacitor
 * Preferences (SharedPreferences on Android, localStorage in the browser).
 */

const KEYS = {
  session: 'openedu.session',
  settings: 'openedu.settings',
} as const;

/** Allowed background polling intervals (minutes). */
export const POLLING_INTERVALS = [15, 30, 60] as const;
export type PollingInterval = (typeof POLLING_INTERVALS)[number];

export type ThemePreference = 'system' | 'light' | 'dark';

export type TimetableViewMode = 'day' | 'week';

export interface AppSettings {
  pollingIntervalMin: PollingInterval;
  notificationsEnabled: boolean;
  theme: ThemePreference;
  timetableViewMode: TimetableViewMode;
  /** Allow automatic re-login using locally encrypted Android Keystore credentials when SSO expires. */
  autoReloginEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  pollingIntervalMin: 30,
  notificationsEnabled: true,
  theme: 'system',
  timetableViewMode: 'day',
  autoReloginEnabled: true,
};

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const { value } = await Preferences.get({ key });
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await Preferences.set({ key, value: JSON.stringify(value) });
}

export const SessionService = {
  /** Returns the stored session, or `null` on first launch. */
  async loadSession(): Promise<AuthSession | null> {
    const stored = await readJson<Partial<AuthSession>>(KEYS.session);
    return stored ? { ...DEFAULT_SESSION, ...stored } : null;
  },

  async saveSession(session: AuthSession): Promise<void> {
    await writeJson(KEYS.session, session);
  },

  async clearSession(): Promise<void> {
    await Preferences.remove({ key: KEYS.session });
  },

  async loadSettings(): Promise<AppSettings> {
    const stored = await readJson<Partial<AppSettings>>(KEYS.settings);
    const merged = { ...DEFAULT_SETTINGS, ...stored };
    if (!POLLING_INTERVALS.includes(merged.pollingIntervalMin)) merged.pollingIntervalMin = DEFAULT_SETTINGS.pollingIntervalMin;
    if (merged.timetableViewMode !== 'day' && merged.timetableViewMode !== 'week') {
      merged.timetableViewMode = DEFAULT_SETTINGS.timetableViewMode;
    }
    return merged;
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    await writeJson(KEYS.settings, settings);
  },
};
