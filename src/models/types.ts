/**
 * OpenEdu – core domain models.
 *
 * These types are shared by the API providers (Mock / Live), the offline
 * database (Dexie) and the UI layer.
 */

/** Message folder in the eduVULCAN mailbox. */
export type MessageFolder = 'inbox' | 'sent';

/** File attached to a message. */
export interface MessageAttachment {
  /** Display file name, e.g. "regulamin_wycieczki.pdf". */
  name: string;
  /** Download URL (may require an authenticated session). */
  url: string;
  /** Size in bytes, if known. */
  size?: number;
}

/** Single message from the eduVULCAN mailbox. */
export interface Message {
  /** Unique message ID (stable between syncs – used by the diff engine). */
  id: string;
  /** Sender display name (for `sent` folder: the recipient(s)). */
  sender: string;
  subject: string;
  /** Full message body (plain text or sanitized HTML). May be empty until fetched. */
  content: string;
  /** ISO 8601 date-time string. */
  dateSent: string;
  isRead: boolean;
  folder: MessageFolder;
  attachments?: MessageAttachment[];
}

/** Grade category as presented in the school diary. */
export type GradeCategory =
  | 'Sprawdzian'
  | 'Kartkówka'
  | 'Odpowiedź ustna'
  | 'Praca domowa'
  | 'Aktywność'
  | 'Projekt'
  | 'Inne'
  | (string & {});

/** Single grade entry. */
export interface Grade {
  /** Unique grade ID (stable between syncs – used by the diff engine). */
  id: string;
  /** Subject name, e.g. "Matematyka". */
  subject: string;
  /**
   * Raw grade value as shown in the diary, e.g. "5", "4+", "3-", "+", "np".
   * Numeric conversion is done in the UI/average calculator.
   */
  value: string;
  /** Weight used in the weighted average (0 = not counted). */
  weight: number;
  description: string;
  /** ISO 8601 date string. */
  date: string;
  teacher: string;
  category: GradeCategory;
}

/** Day of week: 1 = Monday … 5 = Friday (6/7 reserved for weekend). */
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Information about a timetable change (substitution / cancellation). */
export interface LessonChangeInfo {
  type: 'substitution' | 'cancelled' | 'room-change' | 'other';
  /** Human readable description, e.g. "Zastępstwo: mgr Anna Nowak". */
  description: string;
  substituteTeacher?: string;
  newRoom?: string;
}

/** Single lesson slot in the weekly timetable. */
export interface Lesson {
  /** Unique lesson ID. */
  id: string;
  dayOfWeek: DayOfWeek;
  /** Lesson number in the day (bell schedule), starting from 0 or 1. */
  lessonNumber: number;
  /** "HH:mm" */
  startTime: string;
  /** "HH:mm" */
  endTime: string;
  subject: string;
  teacher: string;
  room: string;
  changeInfo?: LessonChangeInfo;
}

/** Data source mode. */
export type AppMode = 'mock' | 'live';

/** Persisted authentication / session state. */
export interface AuthSession {
  isAuthenticated: boolean;
  userName: string;
  schoolName: string;
  /** Raw `Cookie` header value for eduvulcan.pl (Live mode only). */
  sessionCookie: string;
  /** ISO 8601 date-time of the last successful sync, or null if never synced. */
  lastSync: string | null;
  mode: AppMode;
}

/** Default (logged-out) session. */
export const DEFAULT_SESSION: AuthSession = {
  isAuthenticated: false,
  userName: '',
  schoolName: '',
  sessionCookie: '',
  lastSync: null,
  mode: 'mock',
};
