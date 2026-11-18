import type {
  AppMode,
  AttendanceEntry,
  DutyEntry,
  DutyInfo,
  Exam,
  Grade,
  Lesson,
  MeetingEntry,
  Message,
  MessageFolder,
  NoteEntry,
} from '@/models/types';

/** Basic info about the logged-in user, returned by `verifySession()`. */
export interface SessionInfo {
  userName: string;
  schoolName: string;
}

/**
 * Common contract for all data sources (Mock / Live).
 *
 * Implementations MUST throw `SessionExpiredError` (see `./errors`) when
 * the session is invalid, so the sync layer can react uniformly.
 */
export interface IVulcanDataProvider {
  readonly mode: AppMode;

  /** Fetches message headers. Without `folder` returns both inbox and sent. */
  fetchMessages(folder?: MessageFolder): Promise<Message[]>;

  /** Fetches the full body of a single message. */
  fetchMessageContent(id: string): Promise<string>;

  /** Marks a message as read on the server side. */
  markMessageAsRead(id: string): Promise<void>;

  /** Fetches all grades for the current classification period. */
  fetchGrades(): Promise<Grade[]>;

  /** Fetches the timetable for the week containing `weekDate` (default: current week). */
  fetchTimetable(weekDate?: Date): Promise<Lesson[]>;

  /** Fetches scheduled exams/quizzes for the current/upcoming weeks. */
  fetchExams(weekDate?: Date): Promise<Exam[]>;

  /** Checks whether the student has classroom duty in the given week. */
  fetchDutyStatus(weekDate?: Date): Promise<DutyInfo>;

  /** Fetches attendance entries for the week containing `weekDate` (default: current week). */
  fetchAttendance(weekDate?: Date): Promise<AttendanceEntry[]>;

  /** Fetches teacher praises and remarks. */
  fetchNotes(): Promise<NoteEntry[]>;

  /** Fetches parent-teacher meetings. */
  fetchMeetings(): Promise<MeetingEntry[]>;

  /** Fetches classroom duty roster entries. */
  fetchDuties(weekDate?: Date): Promise<DutyEntry[]>;

  /** Checks if the session is valid; throws `SessionExpiredError` if not. */
  verifySession(): Promise<SessionInfo>;
}
