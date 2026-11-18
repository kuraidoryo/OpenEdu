import { Capacitor, CapacitorHttp, type HttpResponse } from '@capacitor/core';
import type {
  DayOfWeek,
  DutyInfo,
  Exam,
  Grade,
  Lesson,
  LessonChangeInfo,
  Message,
  MessageAttachment,
  MessageFolder,
} from '@/models/types';
import type { IVulcanDataProvider, SessionInfo } from './IVulcanProvider';
import { SessionExpiredError, VulcanApiError } from './errors';
import {
  BROWSER_USER_AGENT,
  EDUVULCAN_ENDPOINTS as EP,
  MESSAGES_PAGE_SIZE,
  REQUEST_TIMEOUT_MS,
  buildUrl,
} from './endpoints.config';
import {
  VulcanAuth,
  resolveCookieForUrl,
  unpackDomainCookies,
} from '@/services/vulcan-auth.plugin';

/**
 * Live eduVULCAN client.
 *
 * Uses `CapacitorHttp` – on Android/iOS requests go through the native HTTP
 * stack, so browser CORS rules do not apply and we can send `Cookie` and
 * `User-Agent` headers.
 *
 * Endpoint paths, query parameters and JSON schemas match the real
 * `uczen.eduvulcan.pl` and `wiadomosci.eduvulcan.pl` web applications.
 */

export interface LiveProviderOptions {
  /**
   * Raw `Cookie` header value copied from an authenticated eduvulcan.pl session.
   * Should contain cookies for `uczen.eduvulcan.pl` (`Eduvulcan.Uczen.Sso`) and
   * `wiadomosci.eduvulcan.pl` (`EduVulcan.Wiadomosci.Sso`).
   */
  sessionCookie: string;
  /** School/municipality symbol (see `AuthSession.tenant`). */
  tenant: string;
}

type HttpMethod = 'GET' | 'POST';
type Json = Record<string, unknown>;

/** Student context resolved from `/api/Context` + `/api/OkresyKlasyfikacyjne`. */
interface StudentContext {
  userName: string;
  schoolName: string;
  studentKey: string;
  diaryId?: number;
  periodId?: number | string;
  mailboxGlobalKey?: string;
}

// ───────────────────────────── Parsing helpers ─────────────────────────────

const asObj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Returns the first non-empty string/number value under any of the given keys. */
function str(obj: Json, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return '';
}

function num(obj: Json, fallback: number, ...keys: string[]): number {
  for (const k of keys) {
    const v = obj[k];
    const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(',', '.')) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function bool(obj: Json, ...keys: string[]): boolean | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'boolean') return v;
  }
  return undefined;
}

/** Small deterministic hash – used to build stable IDs when the API gives none. */
function hashId(prefix: string, ...parts: string[]): string {
  let h = 5381;
  for (const ch of parts.join('|')) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return `${prefix}-${(h >>> 0).toString(36)}`;
}

/** Normalises "8:00", "08:00:00" or an ISO date-time ("2026-11-18T08:50:00+01:00") into "HH:mm". */
function toHHmm(value: string): string {
  if (!value) return '';
  const timePart = value.includes('T') ? value.split('T')[1] : value;
  const [h = '0', m = '0'] = timePart.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0').slice(0, 2)}`;
}

/**
 * Parses either an ISO 8601 date string OR Polish `DD.MM.YYYY` format (used by
 * `dataOceny` in `/api/Oceny`) into a valid ISO 8601 string.
 */
function toIsoDate(value: string): string {
  if (!value) return new Date().toISOString();
  const dmyMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value.trim());
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const d = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Converts message HTML into plain text (safe to render without innerHTML). */
function htmlToText(html: string): string {
  if (!html) return '';
  if (!/<[a-z][\s\S]*>/i.test(html)) return html;
  const prepared = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');
  const doc = new DOMParser().parseFromString(prepared, 'text/html');
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Cleans eduVULCAN correspondent strings like
 * `"Kowalski Jan [KJ] - P - (SP123)"` into a cleaner display form while keeping full context.
 */
function cleanCorrespondent(raw: string): string {
  if (!raw) return 'Nieznany nadawca';
  return raw.replace(/\s+-\s+[PURO]\s+-\s+\([^)]+\)$/i, '').trim() || raw.trim();
}

/** Monday 00:00:00.000 and Sunday 23:59:59.999 (local time) of the week containing `date`. */
function weekRange(date: Date): { from: Date; to: Date } {
  const from = new Date(date);
  const day = (from.getDay() + 6) % 7; // 0 = Monday
  from.setDate(from.getDate() - day);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

// ───────────────────────────── Provider ─────────────────────────────

export class LiveVulcanProvider implements IVulcanDataProvider {
  readonly mode = 'live' as const;

  private readonly cookie: string;
  private readonly tenant: string;
  private context?: StudentContext;
  private contextPromise?: Promise<StudentContext>;
  private cookiesRestored = false;

  constructor(options: LiveProviderOptions) {
    if (!options.sessionCookie.trim()) throw new SessionExpiredError('Brak ciasteczka sesyjnego eduVULCAN.');
    if (!options.tenant.trim()) throw new VulcanApiError('Brak symbolu szkoły (tenant).');
    this.cookie = options.sessionCookie.trim();
    this.tenant = options.tenant.trim();
  }

  // ─────────────── HTTP core ───────────────

  private async ensureNativeCookiesRestored(): Promise<void> {
    if (this.cookiesRestored || !Capacitor.isNativePlatform()) return;
    const { uczenCookie, wiadomosciCookie } = unpackDomainCookies(this.cookie);
    await VulcanAuth.restoreCookies({
      uczenCookie,
      wiadomosciCookie,
      tenant: this.tenant,
    }).catch(() => undefined);
    this.cookiesRestored = true;
  }

  private headersFor(url: string): Record<string, string> {
    const origin = new URL(url).origin;
    const headers: Record<string, string> = {
      'User-Agent': BROWSER_USER_AGENT,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
      Referer: `${origin}/${encodeURIComponent(this.tenant)}/App`,
    };
    // On native Android/iOS, CapacitorCookieManager automatically attaches the Cookie
    // header from android.webkit.CookieManager. Setting Cookie manually would cause
    // HttpURLConnection to emit two separate Cookie headers, breaking ASP.NET SSO.
    if (!Capacitor.isNativePlatform()) {
      headers.Cookie = resolveCookieForUrl(this.cookie, url);
    }
    return headers;
  }

  private isLoginUrl(url: string | undefined): boolean {
    if (!url) return false;
    return EP.portal.loginRedirectMarkers.some((m) => url.includes(m));
  }

  /** Performs a request and returns parsed JSON; maps auth failures to `SessionExpiredError`. */
  private async request<T = unknown>(method: HttpMethod, url: string, body?: unknown): Promise<T> {
    await this.ensureNativeCookiesRestored();

    let res: HttpResponse;
    try {
      res = await CapacitorHttp.request({
        method,
        url,
        headers: {
          ...this.headersFor(url),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        data: body,
        responseType: 'json',
        connectTimeout: REQUEST_TIMEOUT_MS,
        readTimeout: REQUEST_TIMEOUT_MS,
      });
    } catch (err) {
      throw new VulcanApiError(`Błąd sieci: ${(err as Error)?.message ?? 'brak połączenia'}`, undefined, url);
    }

    const { status } = res;
    const location = res.headers?.Location ?? res.headers?.location;
    const resolvedUrl = res.url ? String(res.url) : '';

    if (status === 401 || status === 403) {
      throw new SessionExpiredError(undefined, status);
    }
    if (status >= 300 && status < 400) {
      if (!location || this.isLoginUrl(location)) throw new SessionExpiredError(undefined, status);
      throw new VulcanApiError(`Nieoczekiwane przekierowanie do ${location}`, status, url);
    }
    if (this.isLoginUrl(resolvedUrl) && !this.isLoginUrl(url)) {
      throw new SessionExpiredError(undefined, status);
    }
    if (status >= 400) {
      throw new VulcanApiError(`Serwer eduVULCAN zwrócił błąd ${status}`, status, url);
    }

    let data: unknown = res.data;
    if (typeof data === 'string') {
      const text = data.trim();
      if (text.startsWith('<')) {
        // HTML instead of JSON – almost always the login page.
        if (/logowanie|login|<form/i.test(text)) throw new SessionExpiredError(undefined, status);
        throw new VulcanApiError('Otrzymano HTML zamiast danych JSON', status, url);
      }
      if (!text) return undefined as T;
      try {
        data = JSON.parse(text);
      } catch {
        throw new VulcanApiError('Nie udało się sparsować odpowiedzi serwera', status, url);
      }
    }
    return data as T;
  }

  private studentUrl(path: string, params?: Record<string, string | number | undefined>) {
    return buildUrl(EP.student.base, path, this.tenant, params);
  }

  private messagesUrl(path: string, params?: Record<string, string | number | undefined>) {
    return buildUrl(EP.messages.base, path, this.tenant, params);
  }

  // ─────────────── Context / session ───────────────

  private async loadContext(force = false): Promise<StudentContext> {
    if (this.context && !force) return this.context;
    if (this.contextPromise && !force) return this.contextPromise;

    const promise = (async () => {
      const raw = asObj(await this.request('GET', this.studentUrl(EP.student.context)));
      const students = asArr(raw.uczniowie ?? raw.Uczniowie ?? raw.students);
      const student = asObj(students[0] ?? raw);

      const studentKey = str(student, 'key', 'klucz', 'Key');
      if (!studentKey) throw new VulcanApiError('Nie znaleziono klucza ucznia w /api/Context.');

      const diaryId = num(student, NaN, 'idDziennik', 'IdDziennik');
      const mailboxGlobalKey = str(student, 'globalKeySkrzynka', 'GlobalKeySkrzynka') || undefined;

      // Fetch classification periods from `/api/OkresyKlasyfikacyjne?key=...&idDziennik=...`
      let periodId: number | string | undefined;
      try {
        const periodsRaw = await this.request(
          'GET',
          this.studentUrl(EP.student.periods, {
            key: studentKey,
            idDziennik: Number.isFinite(diaryId) ? diaryId : undefined,
          }),
        );
        const periods = asArr(periodsRaw).map(asObj);
        const now = Date.now();
        const current =
          periods.find((p) => {
            const from = Date.parse(str(p, 'dataOd', 'from'));
            const to = Date.parse(str(p, 'dataDo', 'to'));
            return from <= now && now <= to;
          }) ?? periods[periods.length - 1];

        if (current) {
          const numericId = num(current, NaN, 'id', 'Id');
          periodId = Number.isFinite(numericId) ? numericId : str(current, 'id', 'Id');
        }
      } catch (err) {
        if (err instanceof SessionExpiredError) throw err;
        console.warn('[LiveVulcanProvider] Could not fetch OkresyKlasyfikacyjne', err);
      }

      const oddzial = str(student, 'oddzial', 'Oddzial');
      const jednostka = str(student, 'jednostka', 'nazwaJednostki', 'szkola', 'school') || this.tenant;

      const resolved: StudentContext = {
        studentKey,
        diaryId: Number.isFinite(diaryId) ? diaryId : undefined,
        periodId,
        mailboxGlobalKey,
        userName: str(student, 'uczen', 'imieNazwisko', 'nazwa', 'name') || 'Uczeń',
        schoolName: oddzial ? `${jednostka} (${oddzial})` : jednostka,
      };
      this.context = resolved;
      return resolved;
    })().finally(() => {
      if (this.contextPromise === promise) {
        this.contextPromise = undefined;
      }
    });

    this.contextPromise = promise;
    return promise;
  }

  async verifySession(): Promise<SessionInfo> {
    const ctx = await this.loadContext(true);
    return { userName: ctx.userName, schoolName: ctx.schoolName };
  }

  // ─────────────── Messages ───────────────

  private mapMessageHeader(raw: Json, folder: MessageFolder): Message {
    const id = str(raw, 'apiGlobalKey', 'globalKey', 'id', 'Id');
    return {
      id: id || hashId('msg', str(raw, 'temat'), str(raw, 'data')),
      sender: cleanCorrespondent(str(raw, 'korespondenci', 'nadawca', 'odbiorcy', 'sender')),
      subject: str(raw, 'temat', 'subject') || '(bez tematu)',
      content: htmlToText(str(raw, 'tresc', 'content')),
      dateSent: toIsoDate(str(raw, 'data', 'dataWyslania', 'date')),
      isRead: folder === 'sent' ? true : (bool(raw, 'przeczytana', 'odczytana', 'isRead') ?? false),
      folder,
      attachments: bool(raw, 'hasZalaczniki') ? [] : undefined,
    };
  }

  private async fetchFolder(folder: MessageFolder): Promise<Message[]> {
    // `/api/Odebrane?idLastWiadomosc=0&pageSize=50` and `/api/Wyslane?idLastWiadomosc=0&pageSize=50`
    // return messages across all of the user's mailboxes without requiring a separate `/api/Skrzynki` lookup.
    const path = folder === 'inbox' ? EP.messages.inbox : EP.messages.sent;
    const raw = await this.request(
      'GET',
      this.messagesUrl(path, {
        idLastWiadomosc: 0,
        pageSize: MESSAGES_PAGE_SIZE,
      }),
    );
    return asArr(raw).map((m) => this.mapMessageHeader(asObj(m), folder));
  }

  async fetchMessages(folder?: MessageFolder): Promise<Message[]> {
    if (folder) return this.fetchFolder(folder);
    const [inbox, sent] = await Promise.all([this.fetchFolder('inbox'), this.fetchFolder('sent')]);
    return [...inbox, ...sent].sort((a, b) => b.dateSent.localeCompare(a.dateSent));
  }

  /** Full message details (body + attachments) from `/api/WiadomoscSzczegoly?apiGlobalKey={GUID}`. */
  async fetchMessageDetails(id: string): Promise<{ content: string; attachments: MessageAttachment[] }> {
    const raw = asObj(await this.request('GET', this.messagesUrl(EP.messages.details, { apiGlobalKey: id })));
    const attachments = asArr(raw.zalaczniki ?? raw.attachments).map((a) => {
      const att = asObj(a);
      return {
        name: str(att, 'nazwaPliku', 'nazwa', 'name') || 'załącznik',
        url: str(att, 'url', 'link'),
      };
    });
    return { content: htmlToText(str(raw, 'tresc', 'content')), attachments };
  }

  async fetchMessageContent(id: string): Promise<string> {
    return (await this.fetchMessageDetails(id)).content;
  }

  async markMessageAsRead(id: string): Promise<void> {
    // In eduVULCAN web, GET `/api/WiadomoscSzczegoly?apiGlobalKey={GUID}` marks the message as read
    // server-side as a side effect. When `openMessage()` already fetched details, this is a no-op;
    // otherwise we trigger a lightweight details GET.
    try {
      await this.request('GET', this.messagesUrl(EP.messages.details, { apiGlobalKey: id }));
    } catch (err) {
      if (err instanceof SessionExpiredError) throw err;
    }
  }

  // ─────────────── Grades ───────────────

  async fetchGrades(): Promise<Grade[]> {
    const ctx = await this.loadContext();
    const raw = asObj(
      await this.request(
        'GET',
        this.studentUrl(EP.student.grades, {
          key: ctx.studentKey,
          idOkresKlasyfikacyjny: ctx.periodId,
        }),
      ),
    );

    // Real schema: `{ ocenyPrzedmioty: [ { przedmiotNazwa, nauczyciele, kolumnyOcenyCzastkowe: [ { idKolumny, kategoriaKolumny, nazwaKolumny, oceny: [...] } ] } ] }`
    const subjects = asArr(raw.ocenyPrzedmioty ?? raw.ocenyPrzedmiot ?? raw.przedmioty ?? raw.subjects ?? raw);
    const grades: Grade[] = [];

    for (const s of subjects.map(asObj)) {
      const subject = str(s, 'przedmiotNazwa', 'przedmiot', 'nazwa', 'subject') || 'Przedmiot';
      const defaultTeachers = asArr(s.nauczyciele)
        .filter((t): t is string => typeof t === 'string')
        .join(', ');

      const columns = asArr(s.kolumnyOcenyCzastkowe);
      if (columns.length > 0) {
        for (const col of columns.map(asObj)) {
          const colId = str(col, 'idKolumny', 'id');
          const colCategory = str(col, 'kategoriaKolumny', 'kategoria');
          const colName = str(col, 'nazwaKolumny', 'opis');
          const entries = asArr(col.oceny).map(asObj);

          entries.forEach((g, idx) => {
            const value = str(g, 'wpis', 'wartosc', 'ocena', 'value');
            if (!value) return;
            const dateRaw = str(g, 'dataOceny', 'data', 'date');
            const description = str(g, 'nazwaKolumny', 'opis', 'description') || colName;
            const category = str(g, 'kategoriaKolumny', 'kategoria', 'category') || colCategory || 'Bieżące';
            const teacher = str(g, 'nauczyciel', 'teacher') || defaultTeachers;

            grades.push({
              id:
                str(g, 'id', 'Id') ||
                hashId('grade', subject, colId || description, value, dateRaw, String(idx)),
              subject,
              value,
              weight: num(g, 0, 'waga', 'weight'),
              description,
              date: toIsoDate(dateRaw),
              teacher,
              category,
            });
          });
        }
        continue;
      }

      // Fallback for flat `ocenyCzastkowe` / `oceny` arrays
      const partial = asArr(s.ocenyCzastkowe ?? s.oceny ?? s.grades).map(asObj);
      partial.forEach((g, idx) => {
        const value = str(g, 'wpis', 'wartosc', 'ocena', 'value');
        if (!value) return;
        const dateRaw = str(g, 'dataOceny', 'data', 'date');
        const description = str(g, 'nazwaKolumny', 'opis', 'description');
        grades.push({
          id: str(g, 'id', 'Id') || hashId('grade', subject, value, dateRaw, description, String(idx)),
          subject,
          value,
          weight: num(g, 1, 'waga', 'weight'),
          description,
          date: toIsoDate(dateRaw),
          teacher: str(g, 'nauczyciel', 'nauczycielImieNazwisko', 'teacher') || defaultTeachers,
          category: str(g, 'kategoriaKolumny', 'kategoria', 'kodKolumny', 'category') || 'Inne',
        });
      });
    }
    return grades;
  }

  // ─────────────── Timetable ───────────────

  async fetchTimetable(weekDate: Date = new Date()): Promise<Lesson[]> {
    const ctx = await this.loadContext();
    const { from, to } = weekRange(weekDate);
    const raw = await this.request(
      'GET',
      this.studentUrl(EP.student.timetable, {
        key: ctx.studentKey,
        dataOd: from.toISOString(),
        dataDo: to.toISOString(),
        zakresDanych: 2,
      }),
    );

    // Real schema: array of lessons with `data`, `godzinaOd`, `godzinaDo`, `prowadzacy`, `przedmiot`,
    // `sala`, `adnotacja` (0 = normal, 3 = cancelled/changed) and `zmiany: [ { zmiana, nrLekcji, sala, prowadzacy, zajecia, informacjeNieobecnosc } ]`
    const parsed = asArr(raw)
      .map(asObj)
      .map((l): Lesson => {
        const dateStr = str(l, 'data', 'date');
        const date = new Date(dateStr);
        const jsDay = Number.isNaN(date.getTime()) ? 1 : date.getDay();
        const dayOfWeek = (jsDay === 0 ? 7 : jsDay) as DayOfWeek;
        const startTime = toHHmm(str(l, 'godzinaOd', 'odGodziny', 'start'));
        const endTime = toHHmm(str(l, 'godzinaDo', 'doGodziny', 'end'));
        const baseSubject = str(l, 'przedmiot', 'subject') || 'Lekcja';

        const changesArr = asArr(l.zmiany).map(asObj);
        const firstChange = changesArr[0] ?? asObj(l.zmiana ?? l.change);
        const adnotacja = num(l, 0, 'adnotacja');
        const changeCode = num(firstChange, 0, 'zmiana');

        const lessonNumber = num(
          l,
          num(firstChange, 0, 'nrLekcji'),
          'pozycja',
          'numerLekcji',
          'nrLekcji',
          'number',
        );

        const substitute = str(firstChange, 'prowadzacy', 'nauczyciel');
        const newRoom = str(firstChange, 'sala');
        const newSubject = str(firstChange, 'zajecia');
        const changeText =
          str(firstChange, 'informacjeNieobecnosc', 'informacja', 'opis') ||
          str(l, 'informacja');

        const isCancelled =
          (bool(l, 'odwolana', 'isCancelled') ?? false) ||
          changeCode === 1 ||
          (adnotacja === 3 && !substitute && !newRoom && !newSubject);

        let changeInfo: LessonChangeInfo | undefined;
        if (isCancelled) {
          changeInfo = { type: 'cancelled', description: changeText || 'Lekcja odwołana' };
        } else if (substitute) {
          changeInfo = {
            type: 'substitution',
            description: changeText || `Zastępstwo: ${substitute}`,
            substituteTeacher: substitute,
          };
        } else if (newRoom) {
          changeInfo = {
            type: 'room-change',
            description: changeText || `Zmiana sali: ${newRoom}`,
            newRoom,
          };
        } else if (changeText || adnotacja !== 0 || changeCode !== 0) {
          changeInfo = { type: 'other', description: changeText || 'Zmiana w planie lekcji' };
        }

        const subject = newSubject || baseSubject;
        return {
          id: str(l, 'id', 'Id') || hashId('lesson', dateStr, startTime, subject),
          dayOfWeek,
          lessonNumber,
          startTime,
          endTime,
          subject,
          teacher: substitute || str(l, 'prowadzacy', 'nauczyciel', 'teacher'),
          room: newRoom || str(l, 'sala', 'room'),
          changeInfo,
        };
      })
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));

    // When the API omits `nrLekcji` on normal lessons, assign sequential 1..N per day based on start time.
    const counterByDay = new Map<DayOfWeek, number>();
    for (const lesson of parsed) {
      const nextNum = (counterByDay.get(lesson.dayOfWeek) ?? 0) + 1;
      counterByDay.set(lesson.dayOfWeek, nextNum);
      if (!lesson.lessonNumber) {
        lesson.lessonNumber = nextNum;
      }
    }

    return parsed;
  }

  // ─────────────── Exams ───────────────

  async fetchExams(weekDate: Date = new Date()): Promise<Exam[]> {
    const ctx = await this.loadContext();
    const { from } = weekRange(weekDate);
    const to = new Date(from);
    to.setDate(from.getDate() + 13);
    to.setHours(23, 59, 59, 999);

    let raw: unknown = [];
    try {
      raw = await this.request(
        'GET',
        this.studentUrl(EP.student.examsDashboard, { key: ctx.studentKey }),
      );
    } catch {
      raw = [];
    }

    const hasDashboardItems = Array.isArray(raw)
      ? raw.length > 0
      : asArr(asObj(raw).sprawdziany ?? asObj(raw).items ?? asObj(raw).data).length > 0;

    if (!hasDashboardItems) {
      try {
        raw = await this.request(
          'GET',
          this.studentUrl(EP.student.exams, {
            key: ctx.studentKey,
            dataOd: from.toISOString(),
            dataDo: to.toISOString(),
          }),
        );
      } catch {
        // Optional endpoint: do not invalidate session if unavailable
      }
    }

    const root = asObj(raw);
    const items = Array.isArray(raw)
      ? raw
      : asArr(root.sprawdziany ?? root.items ?? root.data);

    return items
      .map(asObj)
      .map((e): Exam | null => {
        const subject = str(e, 'przedmiotNazwa', 'przedmiot', 'nazwaPrzedmiotu', 'subject');
        const dateRaw = str(e, 'data', 'dataSprawdzianu', 'termin', 'date');
        if (!subject && !dateRaw) return null;

        const isoDate = toIsoDate(dateRaw);
        const parsedDate = new Date(isoDate);
        const jsDay = Number.isNaN(parsedDate.getTime()) ? 1 : parsedDate.getDay();
        const dayOfWeek = (jsDay === 0 ? 7 : jsDay) as DayOfWeek;

        const rawType = str(e, 'rodzaj', 'typ', 'kategoria', 'type');
        let type = rawType || 'Sprawdzian';
        if (/kartk/i.test(type)) type = 'Kartkówka';
        else if (/klasow/i.test(type)) type = 'Praca klasowa';
        else if (/sprawdz/i.test(type)) type = 'Sprawdzian';

        const description =
          str(e, 'opis', 'temat', 'zakres', 'nazwa', 'description') || 'Brak opisu zakresu materiału';
        const teacher = str(e, 'nauczyciel', 'prowadzacy', 'nauczycielImieNazwisko', 'teacher');

        return {
          id: str(e, 'id', 'Id') || hashId('exam', subject, isoDate, type, description),
          subject: subject || 'Przedmiot',
          type,
          description,
          date: isoDate,
          dayOfWeek,
          teacher,
        };
      })
      .filter((e): e is Exam => e !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // ─────────────── Classroom Duties ───────────────

  async fetchDutyStatus(weekDate: Date = new Date()): Promise<DutyInfo> {
    const ctx = await this.loadContext();
    const { from, to } = weekRange(weekDate);

    try {
      const raw = await this.request(
        'GET',
        this.studentUrl(EP.student.duties, {
          key: ctx.studentKey,
          dataOd: from.toISOString(),
          dataDo: to.toISOString(),
        }),
      );

      const root = asObj(raw);
      const list = Array.isArray(raw)
        ? raw
        : asArr(root.dyzurni ?? root.items ?? root.data);

      if (list.length === 0) {
        return { isOnDutyThisWeek: false };
      }

      const studentTokens = ctx.userName
        .toLowerCase()
        .split(/\s+/)
        .filter((p) => p.length > 2);

      const entries = list.map(asObj);
      const matched = entries.find((item) => {
        if (bool(item, 'czyJa', 'isCurrentUser', 'mojDyzur', 'isDuty')) return true;
        const text = JSON.stringify(item).toLowerCase();
        return studentTokens.length > 0 && studentTokens.every((t) => text.includes(t));
      });

      if (matched) {
        const desc = str(matched, 'opis', 'uwagi', 'zadania');
        return {
          isOnDutyThisWeek: true,
          details: desc || 'Masz dyżur klasowy w tym tygodniu.',
        };
      }

      // If API returns entries specifically filtered for the current student without name fields
      const hasAnyNamedPerson = entries.some((item) =>
        Boolean(str(item, 'uczen', 'imieNazwisko', 'nazwisko', 'osoba')),
      );
      if (!hasAnyNamedPerson && entries.length > 0) {
        return {
          isOnDutyThisWeek: true,
          details: 'Masz dyżur klasowy w tym tygodniu.',
        };
      }

      return { isOnDutyThisWeek: false };
    } catch {
      return { isOnDutyThisWeek: false };
    }
  }
}
