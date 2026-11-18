/**
 * eduVULCAN web endpoints configuration.
 *
 * ⚠️ eduVULCAN is a closed system and its web API is NOT publicly documented.
 * The paths below mirror the requests made by the official web front-end
 * (uczen.eduvulcan.pl / wiadomosci.eduvulcan.pl) and may change at any time.
 * Keep ALL URLs in this single file so they can be updated in one place.
 *
 * Placeholders:
 *   {tenant} – school/municipality symbol from the URL after logging in,
 *              e.g. https://uczen.eduvulcan.pl/<tenant>/App/...
 */

export const EDUVULCAN_ENDPOINTS = {
  /** Public portal (login page, used for WebView login flow). */
  portal: {
    base: 'https://eduvulcan.pl',
    login: 'https://eduvulcan.pl/logowanie',
    /** Fragments of URLs that indicate a redirect to the login page (= session expired). */
    loginRedirectMarkers: ['/logowanie', '/Account/Login', '/LoginEndpoint', 'login.eduvulcan.pl'],
  },

  /** Student module (grades, timetable, context). */
  student: {
    base: 'https://uczen.eduvulcan.pl/{tenant}',
    /** Returns logged-in user / student context (name, school, student key, periods). */
    context: '/api/Context',
    /** Grades for a given student key and classification period. */
    grades: '/api/Oceny',
    /** Timetable for a given student key and date range. */
    timetable: '/api/PlanZajec',
  },

  /** Messages module. */
  messages: {
    base: 'https://wiadomosci.eduvulcan.pl/{tenant}',
    /** Mailboxes available for the user. */
    mailboxes: '/api/Skrzynki',
    /** Inbox list (paged). */
    inbox: '/api/Odebrane',
    /** Sent list (paged). */
    sent: '/api/Wyslane',
    /** Message details by apiGlobalKey (opening usually marks it read server-side). */
    details: '/api/WiadomoscSzczegoly',
    /** Explicitly mark messages as read. */
    markAsRead: '/api/WiadomoscOdczytana',
  },
} as const;

/** Default page size for message lists. */
export const MESSAGES_PAGE_SIZE = 50;

/** Desktop browser User-Agent – the web endpoints expect a real browser. */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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
