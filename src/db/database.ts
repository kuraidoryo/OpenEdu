import Dexie, { type EntityTable } from 'dexie';
import type { DutyInfo, Exam, Grade, Lesson, Message, MessageFolder } from '@/models/types';

/** Generic key/value record for small app metadata (e.g. last sync time). */
export interface MetaEntry {
  key: string;
  value: string;
}

/**
 * OpenEdu offline database (IndexedDB via Dexie).
 *
 * Stores messages, grades and the timetable so that the app works fully
 * offline. The sync service compares freshly fetched IDs with the records
 * stored here to detect new items (diff & notify).
 */
export class OpenEduDB extends Dexie {
  messages!: EntityTable<Message, 'id'>;
  grades!: EntityTable<Grade, 'id'>;
  lessons!: EntityTable<Lesson, 'id'>;
  exams!: EntityTable<Exam, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor() {
    super('OpenEduDB');

    // Only indexed fields are listed; all other properties are stored as well.
    this.version(1).stores({
      messages: 'id, folder, isRead, dateSent, sender, [folder+dateSent]',
      grades: 'id, subject, date, category',
      lessons: 'id, dayOfWeek, [dayOfWeek+lessonNumber]',
      meta: 'key',
    });

    this.version(2).stores({
      messages: 'id, folder, isRead, dateSent, sender, [folder+dateSent]',
      grades: 'id, subject, date, category',
      lessons: 'id, dayOfWeek, [dayOfWeek+lessonNumber]',
      exams: 'id, subject, date, dayOfWeek',
      meta: 'key',
    });
  }
}

export const db = new OpenEduDB();

// ───────────────────────────── Messages ─────────────────────────────

/** Returns the set of all stored message IDs (used by the diff engine). */
export async function getStoredMessageIds(): Promise<Set<string>> {
  const keys = await db.messages.toCollection().primaryKeys();
  return new Set(keys);
}

/**
 * Upserts a batch of messages.
 *
 * Local-only state is preserved: if a message was already read locally or
 * its full content was fetched before, we don't overwrite that with an
 * emptier server snapshot.
 */
export async function saveMessages(messages: Message[]): Promise<void> {
  if (messages.length === 0) return;

  await db.transaction('rw', db.messages, async () => {
    const existing = await db.messages.bulkGet(messages.map((m) => m.id));
    const merged = messages.map((incoming, i) => {
      const prev = existing[i];
      if (!prev) return incoming;
      return {
        ...incoming,
        isRead: incoming.isRead || prev.isRead,
        content: incoming.content || prev.content,
        attachments: incoming.attachments ?? prev.attachments,
      };
    });
    await db.messages.bulkPut(merged);
  });
}

/** Marks a single message as read locally. */
export async function markMessageReadLocally(id: string): Promise<void> {
  await db.messages.update(id, { isRead: true });
}

/** Stores the full content of a message (fetched on demand). */
export async function saveMessageContent(id: string, content: string): Promise<void> {
  await db.messages.update(id, { content });
}

/** Messages from a folder, newest first. */
export async function getMessagesByFolder(folder: MessageFolder): Promise<Message[]> {
  return db.messages
    .where('[folder+dateSent]')
    .between([folder, Dexie.minKey], [folder, Dexie.maxKey])
    .reverse()
    .toArray();
}

/** Number of unread messages in the inbox. */
export async function countUnreadMessages(): Promise<number> {
  return db.messages
    .where('folder')
    .equals('inbox')
    .filter((m) => !m.isRead)
    .count();
}

// ───────────────────────────── Grades ─────────────────────────────

/** Returns the set of all stored grade IDs (used by the diff engine). */
export async function getStoredGradeIds(): Promise<Set<string>> {
  const keys = await db.grades.toCollection().primaryKeys();
  return new Set(keys);
}

/** Replaces all grades with a fresh snapshot from the server. */
export async function replaceGrades(grades: Grade[]): Promise<void> {
  await db.transaction('rw', db.grades, async () => {
    await db.grades.clear();
    if (grades.length) await db.grades.bulkPut(grades);
  });
}

// ───────────────────────────── Timetable ─────────────────────────────

/** Replaces the whole timetable with a fresh snapshot from the server. */
export async function replaceLessons(lessons: Lesson[]): Promise<void> {
  await db.transaction('rw', db.lessons, async () => {
    await db.lessons.clear();
    if (lessons.length) await db.lessons.bulkPut(lessons);
  });
}

/** Lessons for a given day, ordered by lesson number. */
export async function getLessonsByDay(dayOfWeek: number): Promise<Lesson[]> {
  return db.lessons
    .where('[dayOfWeek+lessonNumber]')
    .between([dayOfWeek, Dexie.minKey], [dayOfWeek, Dexie.maxKey])
    .toArray();
}

// ───────────────────────────── Exams ─────────────────────────────

/** Replaces all exams with a fresh snapshot from the server. */
export async function replaceExams(exams: Exam[]): Promise<void> {
  await db.transaction('rw', db.exams, async () => {
    await db.exams.clear();
    if (exams.length) await db.exams.bulkPut(exams);
  });
}

// ───────────────────────────── Meta ─────────────────────────────

export const META_KEYS = {
  lastSync: 'lastSync',
  initialSyncDone: 'initialSyncDone',
  dutyInfo: 'dutyInfo',
} as const;

export async function getMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

/** Saves current week classroom duty status. */
export async function saveDutyInfo(duty: DutyInfo): Promise<void> {
  await setMeta(META_KEYS.dutyInfo, JSON.stringify(duty));
}

/** Reads current week classroom duty status. */
export async function getDutyInfo(): Promise<DutyInfo> {
  const raw = await getMeta(META_KEYS.dutyInfo);
  if (!raw) return { isOnDutyThisWeek: false };
  try {
    return JSON.parse(raw) as DutyInfo;
  } catch {
    return { isOnDutyThisWeek: false };
  }
}

/** Whether the database has been populated at least once (first sync guard). */
export async function isInitialSyncDone(): Promise<boolean> {
  return (await getMeta(META_KEYS.initialSyncDone)) === 'true';
}

// ───────────────────────────── Maintenance ─────────────────────────────

/** Wipes all offline data (messages, grades, timetable, exams and metadata). */
export async function clearAllData(): Promise<void> {
  await db.transaction('rw', [db.messages, db.grades, db.lessons, db.exams, db.meta], async () => {
    await Promise.all([
      db.messages.clear(),
      db.grades.clear(),
      db.lessons.clear(),
      db.exams.clear(),
      db.meta.clear(),
    ]);
  });
}

/** Quick stats – handy for the settings screen. */
export async function getDatabaseStats(): Promise<{ messages: number; grades: number; lessons: number }> {
  const [messages, grades, lessons] = await Promise.all([
    db.messages.count(),
    db.grades.count(),
    db.lessons.count(),
  ]);
  return { messages, grades, lessons };
}
