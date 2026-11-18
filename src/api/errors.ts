/** Thrown when the eduVULCAN session is no longer valid (401/403 or redirect to login). */
export class SessionExpiredError extends Error {
  readonly status?: number;

  constructor(message = 'Sesja eduVULCAN wygasła. Zaloguj się ponownie.', status?: number) {
    super(message);
    this.name = 'SessionExpiredError';
    this.status = status;
  }
}

/** Thrown on network failures or unexpected server responses. */
export class VulcanApiError extends Error {
  readonly status?: number;
  readonly url?: string;

  constructor(message: string, status?: number, url?: string) {
    super(message);
    this.name = 'VulcanApiError';
    this.status = status;
    this.url = url;
  }
}

export function isSessionExpiredError(err: unknown): err is SessionExpiredError {
  return err instanceof SessionExpiredError || (err as Error | undefined)?.name === 'SessionExpiredError';
}
