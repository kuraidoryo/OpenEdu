import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Result returned by the native Android WebView login flow (`VulcanAuthPlugin.java`).
 */
export interface VulcanWebLoginResult {
  /** Extracted school/municipality symbol from `uczen.eduvulcan.pl/{tenant}/App`. */
  tenant: string;
  /** Combined cookie header (or domain-tagged cookie payload). */
  sessionCookie: string;
  /** Cookies specifically for `uczen.eduvulcan.pl`. */
  uczenCookie?: string;
  /** Cookies specifically for `wiadomosci.eduvulcan.pl`. */
  wiadomosciCookie?: string;
}

export interface VulcanAuthPlugin {
  /**
   * Opens a native Android WebView dialog on `https://eduvulcan.pl/logowanie`,
   * waits for the user to log in, automatically extracts `{tenant}` and all
   * `HttpOnly` session cookies (`Eduvulcan.Uczen.Sso` & `EduVulcan.Wiadomosci.Sso`)
   * from `android.webkit.CookieManager`, closes the dialog and resolves.
   */
  loginWithWebView(): Promise<VulcanWebLoginResult>;

  /** Restores stored domain cookies into Android's native WebView CookieManager. */
  restoreCookies(options: {
    uczenCookie: string;
    wiadomosciCookie?: string;
    tenant?: string;
  }): Promise<void>;

  /** Clears all WebView cookies (used on logout). */
  clearWebViewCookies(): Promise<void>;
}

export const VulcanAuth = registerPlugin<VulcanAuthPlugin>('VulcanAuth', {
  web: () => ({
    async loginWithWebView(): Promise<VulcanWebLoginResult> {
      window.open('https://eduvulcan.pl/logowanie', '_blank', 'noopener,noreferrer');
      throw new Error(
        'Logowanie przez WebView działa bezpośrednio w aplikacji na Androidzie.',
      );
    },
    async restoreCookies(): Promise<void> {
      // No-op in web browser
    },
    async clearWebViewCookies(): Promise<void> {
      // No-op in web browser
    },
  }),
});

export function isNativeAndroidAuthAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

// ───────────────────── Domain-tagged Cookie Packing ─────────────────────

const UCZEN_PREFIX = '__OPENEDU_UCZEN__=';
const WIAD_PREFIX = '__OPENEDU_WIAD__=';
const DOMAIN_SEP = ' ||| ';

/**
 * Packs separate `uczen.eduvulcan.pl` and `wiadomosci.eduvulcan.pl` cookie strings
 * into a single `sessionCookie` field so they don't overwrite each other's
 * `ASP.NET_SessionId`, while remaining backward-compatible with a single string.
 */
export function packDomainCookies(uczenCookie: string, wiadomosciCookie?: string): string {
  const u = uczenCookie.trim();
  const w = (wiadomosciCookie ?? '').trim();
  if (!w || u === w) return u;
  return `${UCZEN_PREFIX}${u}${DOMAIN_SEP}${WIAD_PREFIX}${w}`;
}

/**
 * Unpacks domain-tagged cookies into separate `uczenCookie` and `wiadomosciCookie` strings.
 */
export function unpackDomainCookies(packedOrRawCookie: string): {
  uczenCookie: string;
  wiadomosciCookie: string;
} {
  const raw = packedOrRawCookie.trim();
  if (!raw.includes(DOMAIN_SEP)) {
    return { uczenCookie: raw, wiadomosciCookie: raw };
  }

  let uczenCookie = '';
  let wiadomosciCookie = '';
  for (const part of raw.split(DOMAIN_SEP)) {
    if (part.startsWith(UCZEN_PREFIX)) uczenCookie = part.slice(UCZEN_PREFIX.length).trim();
    if (part.startsWith(WIAD_PREFIX)) wiadomosciCookie = part.slice(WIAD_PREFIX.length).trim();
  }
  return {
    uczenCookie: uczenCookie || wiadomosciCookie,
    wiadomosciCookie: wiadomosciCookie || uczenCookie,
  };
}

/**
 * Resolves the appropriate `Cookie` header for a target URL (`uczen` vs `wiadomosci`).
 */
export function resolveCookieForUrl(packedOrRawCookie: string, url: string): string {
  const { uczenCookie, wiadomosciCookie } = unpackDomainCookies(packedOrRawCookie);
  const isMessagesHost = url.includes('wiadomosci.eduvulcan.pl');
  return isMessagesHost ? wiadomosciCookie : uczenCookie;
}

// ───────────────────── Smart Input Parser (Rozwiązanie 3) ─────────────────────

export interface SmartAuthParseResult {
  tenant?: string;
  sessionCookie?: string;
  detectedType: 'json' | 'curl' | 'url' | 'cookie' | 'unknown';
  summary: string;
}

/**
 * Extracts `tenant` from any `uczen.eduvulcan.pl/<tenant>/...` or
 * `wiadomosci.eduvulcan.pl/<tenant>/...` URL inside a text block.
 */
export function extractTenantFromText(text: string): string | undefined {
  const match =
    /https?:\/\/(?:uczen|wiadomosci)\.eduvulcan\.pl\/([a-zA-Z0-9_-]+)(?:\/|\?|$|["'\s])/i.exec(
      text,
    );
  if (match && match[1]) {
    const candidate = match[1].trim();
    if (candidate.toLowerCase() !== 'api' && candidate.toLowerCase() !== 'app') {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Parses any text pasted by the user:
 * 1. OpenEdu JSON session export (`{"tenant":"...","sessionCookie":"..."}`)
 * 2. Chrome/Edge/Firefox "Copy as cURL" command (bash, cmd, or PowerShell)
 * 3. Direct URL (`https://uczen.eduvulcan.pl/<tenant>/App/...`)
 * 4. Raw `Cookie:` header string
 */
export function parseSmartAuthInput(rawInput: string): SmartAuthParseResult {
  const text = rawInput.trim();
  if (!text) {
    return { detectedType: 'unknown', summary: 'Puste pole' };
  }

  // 1. JSON export format
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      const tenant = typeof obj.tenant === 'string' ? obj.tenant.trim() : undefined;
      const cookie =
        typeof obj.sessionCookie === 'string'
          ? obj.sessionCookie.trim()
          : typeof obj.cookie === 'string'
            ? obj.cookie.trim()
            : undefined;
      if (tenant || cookie) {
        return {
          tenant,
          sessionCookie: cookie,
          detectedType: 'json',
          summary: `Rozpoznano pakiet sesji JSON (${[tenant && `symbol: ${tenant}`, cookie && 'ciasteczko sesji'].filter(Boolean).join(', ')})`,
        };
      }
    } catch {
      // Not valid JSON, continue checking other formats
    }
  }

  const tenantFromUrl = extractTenantFromText(text);

  // 2. cURL command (bash `-H 'cookie: ...'`, `-b '...'`, cmd `-H "Cookie: ..."`, PowerShell)
  const isCurl = /^\s*curl\b/i.test(text) || /(?:-H|--header|-b|--cookie)\s+/i.test(text);
  if (isCurl) {
    let extractedCookie: string | undefined;

    // Match `-H 'cookie: ...'` or `-H "Cookie: ..."`
    const headerMatch =
      /(?:-H|--header)\s+['"]cookie:\s*([^'"]+)['"]/i.exec(text) ??
      /(?:-b|--cookie)\s+['"]([^'"]+)['"]/i.exec(text) ??
      /\.Cookies\.Add\(([^)]+)\)/i.exec(text);

    if (headerMatch?.[1]) {
      extractedCookie = headerMatch[1].replace(/\\\r?\n/g, '').trim();
    }

    return {
      tenant: tenantFromUrl,
      sessionCookie: extractedCookie,
      detectedType: 'curl',
      summary: `Rozpoznano polecenie cURL (${[
        tenantFromUrl ? `symbol: ${tenantFromUrl}` : 'brak symbolu w URL',
        extractedCookie ? 'wyodrębniono Cookie' : 'nie znaleziono nagłówka Cookie',
      ].join(', ')})`,
    };
  }

  // 3. Pure URL pasted from address bar
  if (/^https?:\/\//i.test(text) && !text.includes(';') && !text.includes('Sso=')) {
    return {
      tenant: tenantFromUrl,
      detectedType: 'url',
      summary: tenantFromUrl
        ? `Wyodrębniono symbol szkoły z linku: "${tenantFromUrl}"`
        : 'Nie znaleziono symbolu szkoły w podanym linku (wklej link z uczen.eduvulcan.pl/<symbol>/App/...)',
    };
  }

  // 4. Raw Cookie header (with or without leading `Cookie:`)
  const cleanedCookie = text.replace(/^cookie:\s*/i, '').trim();
  const looksLikeCookie =
    /Eduvulcan\.Uczen\.Sso|EduVulcan\.Wiadomosci\.Sso|ASP\.NET_SessionId|=/i.test(cleanedCookie);

  if (looksLikeCookie) {
    return {
      tenant: tenantFromUrl,
      sessionCookie: cleanedCookie,
      detectedType: 'cookie',
      summary: tenantFromUrl
        ? `Rozpoznano ciasteczko sesyjne oraz symbol "${tenantFromUrl}"`
        : 'Rozpoznano ciasteczko sesyjne Cookie',
    };
  }

  return {
    tenant: tenantFromUrl,
    detectedType: 'unknown',
    summary: 'Nie rozpoznano formatu (wklej link z eduvulcan.pl, polecenie Copy as cURL lub JSON)',
  };
}
