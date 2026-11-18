import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Grade, Message } from '@/models/types';

/**
 * NotificationService
 *
 * - Native (Android/iOS): `@capacitor/local-notifications` (no push servers).
 * - Browser (PC): Web Notifications API, with an in-app toast fallback when
 *   permission is denied/unsupported.
 */

// ───────────────────────────── Toast bus (in-app fallback) ─────────────────────────────

export type ToastKind = 'message' | 'grade' | 'session' | 'info' | 'error';

export interface ToastPayload {
  id: number;
  kind: ToastKind;
  title: string;
  body: string;
}

type ToastListener = (toast: ToastPayload) => void;
const toastListeners = new Set<ToastListener>();

/** Subscribes to in-app toasts. Returns an unsubscribe function. */
export function subscribeToToasts(listener: ToastListener): () => void {
  toastListeners.add(listener);
  return () => toastListeners.delete(listener);
}

export function showToast(kind: ToastKind, title: string, body: string): void {
  const toast: ToastPayload = { id: nextId(), kind, title, body };
  toastListeners.forEach((l) => l(toast));
}

// ───────────────────────────── Internals ─────────────────────────────

const CHANNELS = {
  messages: 'openedu-messages',
  grades: 'openedu-grades',
  session: 'openedu-session',
} as const;

type ChannelId = (typeof CHANNELS)[keyof typeof CHANNELS];

const isNative = () => Capacitor.isNativePlatform();
const hasWebNotifications = () => typeof window !== 'undefined' && 'Notification' in window;

let idCounter = 0;
/** Unique 32-bit positive int (required by Android notification IDs). */
function nextId(): number {
  idCounter = (idCounter + 1) % 1000;
  return (Math.floor(Date.now() / 1000) % 2_000_000) * 1000 + idCounter;
}

let channelsReady = false;

async function ensureChannels(): Promise<void> {
  if (channelsReady || Capacitor.getPlatform() !== 'android') return;
  await Promise.all([
    LocalNotifications.createChannel({
      id: CHANNELS.messages,
      name: 'Nowe wiadomości',
      description: 'Powiadomienia o nowych wiadomościach z dziennika',
      importance: 4,
      visibility: 1,
      vibration: true,
    }),
    LocalNotifications.createChannel({
      id: CHANNELS.grades,
      name: 'Nowe oceny',
      description: 'Powiadomienia o nowych ocenach',
      importance: 4,
      visibility: 1,
      vibration: true,
    }),
    LocalNotifications.createChannel({
      id: CHANNELS.session,
      name: 'Sesja i konto',
      description: 'Informacje o wygaśnięciu sesji eduVULCAN',
      importance: 3,
      visibility: 1,
    }),
  ]);
  channelsReady = true;
}

async function deliver(
  channelId: ChannelId,
  kind: ToastKind,
  title: string,
  body: string,
  extra?: Record<string, string>,
): Promise<void> {
  try {
    if (isNative()) {
      await ensureChannels();
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        showToast(kind, title, body);
        return;
      }
      await LocalNotifications.schedule({
        notifications: [
          {
            id: nextId(),
            title,
            body,
            largeBody: body,
            channelId,
            group: channelId,
            extra: { kind, ...extra },
          },
        ],
      });
      return;
    }

    if (hasWebNotifications() && Notification.permission === 'granted') {
      const n = new Notification(title, { body, tag: `${channelId}-${nextId()}`, icon: './favicon.svg' });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      // Also show in-app – desktop notifications are easy to miss while testing.
      showToast(kind, title, body);
      return;
    }
  } catch (err) {
    console.warn('[NotificationService] Delivery failed, falling back to toast', err);
  }
  showToast(kind, title, body);
}

const truncate = (s: string, max = 120) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

// ───────────────────────────── Public API ─────────────────────────────

export const NotificationService = {
  /** Asks the user for permission. Returns true if notifications may be shown. */
  async requestPermission(): Promise<boolean> {
    try {
      if (isNative()) {
        let perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
        await ensureChannels();
        return perm.display === 'granted';
      }
      if (hasWebNotifications()) {
        if (Notification.permission === 'granted') return true;
        if (Notification.permission === 'denied') return false;
        return (await Notification.requestPermission()) === 'granted';
      }
    } catch (err) {
      console.warn('[NotificationService] Permission request failed', err);
    }
    return false;
  },

  /** Current permission state without prompting. */
  async hasPermission(): Promise<boolean> {
    try {
      if (isNative()) return (await LocalNotifications.checkPermissions()).display === 'granted';
      return hasWebNotifications() && Notification.permission === 'granted';
    } catch {
      return false;
    }
  },

  async notifyNewMessage(msg: Message): Promise<void> {
    await deliver(CHANNELS.messages, 'message', `✉️ ${msg.sender}`, truncate(msg.subject), {
      route: `/messages/${msg.id}`,
    });
  },

  /** Single summary notification when many messages arrive at once. */
  async notifyNewMessagesSummary(count: number): Promise<void> {
    await deliver(CHANNELS.messages, 'message', 'OpenEdu', `Masz ${count} nowych wiadomości`, { route: '/messages' });
  },

  async notifyNewGrade(grade: Grade): Promise<void> {
    const weight = grade.weight ? ` (waga ${grade.weight})` : '';
    const desc = grade.description ? ` – ${grade.description}` : '';
    await deliver(
      CHANNELS.grades,
      'grade',
      `📊 Nowa ocena: ${grade.value} z ${grade.subject}`,
      truncate(`${grade.category}${weight}${desc}`),
      { route: '/grades' },
    );
  },

  async notifyNewGradesSummary(count: number): Promise<void> {
    await deliver(CHANNELS.grades, 'grade', 'OpenEdu', `Otrzymałeś ${count} nowych ocen`, { route: '/grades' });
  },

  async notifySessionExpired(): Promise<void> {
    await deliver(
      CHANNELS.session,
      'session',
      '🔒 Sesja eduVULCAN wygasła',
      'Zaloguj się ponownie, aby wznowić synchronizację. Dane offline są nadal dostępne.',
      { route: '/settings' },
    );
  },

  async sendTestNotification(): Promise<void> {
    await deliver(CHANNELS.messages, 'info', '🔔 Test powiadomień OpenEdu', 'Jeśli to widzisz – powiadomienia działają!');
  },

  /** Registers a handler for taps on native notifications (returns cleanup). */
  async onNotificationTap(handler: (route: string | undefined) => void): Promise<() => void> {
    if (!isNative()) return () => undefined;
    const listener = await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      handler(event.notification.extra?.route as string | undefined);
    });
    return () => void listener.remove();
  },
};
