/**
 * eduVULCAN web endpoints configuration.
 *
 * Verified against the live eduVULCAN web application
 * (`uczen.eduvulcan.pl` and `wiadomosci.eduvulcan.pl`).
 * Keep ALL URLs in this single file so they can be updated in one place.
 *
 * Placeholders:
 *   {tenant} – school/municipality symbol from the URL after logging in,
 *              e.g. https://uczen.eduvulcan.pl/<tenant>/App/...
 *              (also returned in `/api/Context` as `uczniowie[].config.projectClient`).
 */

export const EDUVULCAN_ENDPOINTS = {
  /** Public portal (login page, used for WebView login flow). */
  portal: {
    base: 'https://eduvulcan.pl',
    login: 'https://eduvulcan.pl/logowanie',
    /** Fragments of URLs that indicate a redirect to the login page (= session expired). */
    loginRedirectMarkers: ['/logowanie', '/Account/Login', '/LoginEndpoint', 'login.eduvulcan.pl'],
  },

  /** Student module (`uczen.eduvulcan.pl`). */
  student: {
    base: 'https://uczen.eduvulcan.pl/{tenant}',
    /**
     * Returns logged-in student list (`uczniowie[]`) with `key` (base64),
     * `idDziennik`, `uczen`, `oddzial`, `jednostka`, and `globalKeySkrzynka`.
     */
    context: '/api/Context',
    /**
     * Classification periods (semesters) for a student diary.
     * Query params: `key`, `idDziennik`.
     */
    periods: '/api/OkresyKlasyfikacyjne',
    /**
     * Grades for a given student key and classification period.
     * Query params: `key`, `idOkresKlasyfikacyjny`.
     */
    grades: '/api/Oceny',
    /**
     * Timetable for a given student key and UTC ISO date range.
     * Query params: `key`, `dataOd` (ISO UTC), `dataDo` (ISO UTC), `zakresDanych` (2).
     */
    timetable: '/api/PlanZajec',
    /** Scheduled tests / exams (`dataOd`, `dataDo`, `key`). */
    exams: '/api/Sprawdziany',
    /** Upcoming tests / exams for dashboard (`key`). */
    examsDashboard: '/api/SprawdzianyTablica',
    /** Classroom duty roster (`key`, `dataOd`, `dataDo`). */
    duties: '/api/Dyzurni',
    /** Attendance list (`key`, `dataOd`, `dataDo`). */
    attendance: '/api/Frekwencja',
    /** Attendance dashboard summary (`key`). */
    attendanceDashboard: '/api/FrekwencjaTablica',
    /** Notes / praises / remarks (`key`, `idOkresKlasyfikacyjny`). */
    notes: '/api/Uwagi',
    /** Alternative notes endpoint (`key`). */
    notesAlt: '/api/UwagiOsiagniecia',
    /** Parent-teacher meetings (`key`). */
    meetings: '/api/Zebrania',
    /** Quick unread messages counter on the student portal. */
    unreadCount: '/api/WiadomosciNieodczytane',
  },

  /** Messages module (`wiadomosci.eduvulcan.pl`). */
  messages: {
    base: 'https://wiadomosci.eduvulcan.pl/{tenant}',
    /** Entry route that establishes the `EduVulcan.Wiadomosci.Sso` cookie. */
    appEntry: '/App',
    /** Mailboxes available for the user (`[{ globalKey, nazwa, typUzytkownika }]`). */
    mailboxes: '/api/Skrzynki',
    /** Unread counts per mailbox (`[{ globalKey, liczbaWiadomosci }]`). */
    unreadCounts: '/api/LiczbyNieodczytanych',
    /**
     * Inbox list across all mailboxes.
     * Query params: `idLastWiadomosc` (0 for first page), `pageSize` (50).
     */
    inbox: '/api/Odebrane',
    /**
     * Inbox list filtered by a specific mailbox.
     * Query params: `globalKeySkrzynka`, `idLastWiadomosc`, `pageSize`.
     */
    inboxByMailbox: '/api/OdebraneSkrzynka',
    /**
     * Incremental poll for inbox messages newer than `idTopWiadomosc`.
     * Query params: `idTopWiadomosc`.
     */
    inboxNew: '/api/OdebraneNowe',
    /**
     * Sent list across all mailboxes.
     * Query params: `idLastWiadomosc` (0 for first page), `pageSize` (50).
     */
    sent: '/api/Wyslane',
    /**
     * Sent list filtered by a specific mailbox.
     * Query params: `globalKeySkrzynka`, `idLastWiadomosc`, `pageSize`.
     */
    sentByMailbox: '/api/WyslaneSkrzynka',
    /**
     * Message details by `apiGlobalKey` (GUID).
     * NOTE: Calling this GET endpoint automatically marks the message as read server-side.
     */
    details: '/api/WiadomoscSzczegoly',
  },
} as const;

/** Default page size for message lists. */
export const MESSAGES_PAGE_SIZE = 50;

/** Mobile browser User-Agent matching the WebView login client. */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

/** Request timeout in milliseconds. */
export const REQUEST_TIMEOUT_MS = 20_000;

/** Builds a full URL: substitutes `{tenant}` and appends query params. */
export function buildUrl(
  base: string,
  path: string,
  tenant: string,
  params?: Record<string, string | number | undefined>,
): string {
  const url = new URL(base.replace('{tenant}', encodeURIComponent(tenant)) + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}
