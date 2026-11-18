/**
 * Browser sign-in with Keycloak (P6.7): OIDC Authorization Code + PKCE for a public client.
 *
 * - `login()` sends the browser to Keycloak; `/auth/callback` calls `completeLogin()`, which swaps
 *   the code for tokens (the PKCE verifier never leaves this tab's sessionStorage).
 * - The session (access / refresh / id token) is kept in localStorage so every tab — and the
 *   installed PWA — shares it. Refresh tokens rotate (realm `revokeRefreshToken`), so a refresh
 *   runs under a Web Lock and re-reads storage first: the tab that loses the race uses the
 *   winner's tokens instead of replaying a spent refresh token.
 * - `getAccessToken()` hands out a token valid for at least `minValidityMs`, refreshing when
 *   needed; `startAutoRefresh()` refreshes a minute before expiry and when the tab wakes up.
 * - A refresh the server rejects (`invalid_grant`: session ended, user disabled) clears the
 *   session → listeners send the user back to Keycloak. A network failure keeps it (offline PWA).
 *
 * Kept free of React / Next imports; the pure helpers at the top are unit-tested.
 */

export interface OidcConfig {
  /** Keycloak base URL, e.g. http://localhost:8080 */
  url: string;
  realm: string;
  clientId: string;
  /** localStorage key of the session; also the Web Lock name */
  storageKey: string;
  /** Path of the callback page on this origin */
  callbackPath?: string;
  /**
   * Optional cookie mirroring the access token so server-rendered pages can check the session
   * (Payment Hub Admin). SameSite=Strict, read-only use on the server — APIs still need the
   * Authorization header.
   */
  cookieName?: string;
  /** Runs before the session is cleared on logout (drop offline caches, …) */
  onLogout?: () => Promise<void> | void;
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  /** epoch ms */
  expiresAt: number;
  /** epoch ms; 0 = refresh token does not expire (offline token) */
  refreshExpiresAt: number;
  /** access token lifetime (ms) — refresh timing scales with it */
  lifetimeMs: number;
}

export interface SessionClaims {
  sub: string;
  exp?: number;
  sid?: string;
  preferred_username?: string;
  name?: string;
  email?: string;
  tenant_id?: string;
  merchant_id?: string | number;
  realm_access?: { roles?: string[] };
}

/** Thrown by `completeLogin` with a message fit for the user */
export class LoginError extends Error {}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Payload of a JWT without checking the signature (the API verifies every request). */
export function decodeJwt<T = SessionClaims>(token: string): T | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(base64UrlDecode(part)) as T;
  } catch {
    return null;
  }
}

export function randomToken(bytes = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** RFC 7636 S256 code challenge */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Where to go after login: only a path on this origin ("/x…", not "//host" or "/\host"), never
 * back into the auth pages. Anything else → "/".
 */
export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f]/.test(raw)) return "/";
  if (raw === "/auth" || raw.startsWith("/auth/") || raw.startsWith("/auth?")) return "/";
  return raw;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  refresh_expires_in?: number;
}

export function sessionFromTokens(
  json: TokenResponse,
  now: number,
  previous?: StoredSession | null,
): StoredSession {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? previous?.refreshToken ?? "",
    idToken: json.id_token ?? previous?.idToken ?? "",
    expiresAt: now + json.expires_in * 1000,
    refreshExpiresAt: json.refresh_expires_in ? now + json.refresh_expires_in * 1000 : 0,
    lifetimeMs: json.expires_in * 1000,
  };
}

/** Token has less than `minValidityMs` left (capped at half its lifetime for short tokens). */
export function needsRefresh(s: StoredSession, now: number, minValidityMs: number): boolean {
  return s.expiresAt - now < Math.min(minValidityMs, s.lifetimeMs / 2);
}

/** How long before expiry the background refresh runs: 1 minute, ¼ of a short token's life. */
export function refreshAheadMs(s: StoredSession): number {
  return Math.min(60_000, s.lifetimeMs / 4);
}

/** Refresh token still usable (0 = no expiry). */
export function canRefresh(s: StoredSession, now: number): boolean {
  return !!s.refreshToken && (s.refreshExpiresAt === 0 || s.refreshExpiresAt > now + 5_000);
}

export function parseStoredSession(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof s.accessToken !== "string" || !s.accessToken) return null;
    if (typeof s.expiresAt !== "number") return null;
    return {
      accessToken: s.accessToken,
      refreshToken: typeof s.refreshToken === "string" ? s.refreshToken : "",
      idToken: typeof s.idToken === "string" ? s.idToken : "",
      expiresAt: s.expiresAt,
      refreshExpiresAt: typeof s.refreshExpiresAt === "number" ? s.refreshExpiresAt : 0,
      lifetimeMs: typeof s.lifetimeMs === "number" && s.lifetimeMs > 0 ? s.lifetimeMs : 900_000,
    };
  } catch {
    return null;
  }
}

// ─── Browser client ───────────────────────────────────────────────────────────

type Listener = (session: StoredSession | null) => void;

interface PendingLogin {
  verifier: string;
  nonce: string;
  returnTo: string;
  createdAt: number;
}

const PENDING_TTL_MS = 10 * 60 * 1000;

export class OidcClient {
  private readonly issuer: string;
  private listeners = new Set<Listener>();
  private inflight: Promise<StoredSession | null> | null = null;
  /** Set by `logout()`: no refresh / login / session write may race the end-session redirect */
  private loggingOut = false;
  private cache: { raw: string | null; session: StoredSession | null } = {
    raw: null,
    session: null,
  };

  constructor(private readonly cfg: OidcConfig) {
    this.issuer = `${cfg.url.replace(/\/$/, "")}/realms/${cfg.realm}`;
  }

  private get endpoint() {
    const base = `${this.issuer}/protocol/openid-connect`;
    return { auth: `${base}/auth`, token: `${base}/token`, logout: `${base}/logout` };
  }

  private redirectUri(): string {
    return `${window.location.origin}${this.cfg.callbackPath ?? "/auth/callback"}`;
  }

  // storage ────────────────────────────────────────────────────────────────

  /** Current session (same object until storage changes — safe for useSyncExternalStore). */
  getSession(): StoredSession | null {
    if (typeof window === "undefined") return null;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(this.cfg.storageKey);
    } catch {
      raw = null;
    }
    if (raw !== this.cache.raw) this.cache = { raw, session: parseStoredSession(raw) };
    return this.cache.session;
  }

  /** Access token as stored right now ("" when signed out) — may be about to expire. */
  currentToken(): string {
    return this.getSession()?.accessToken ?? "";
  }

  private save(session: StoredSession | null): void {
    if (session && this.loggingOut) return; // a refresh finishing after logout started
    try {
      if (session) window.localStorage.setItem(this.cfg.storageKey, JSON.stringify(session));
      else window.localStorage.removeItem(this.cfg.storageKey);
    } catch {
      // storage blocked: the session lives only as long as this call chain
    }
    this.syncCookie(session);
    this.emit();
  }

  private syncCookie(session: StoredSession | null): void {
    const name = this.cfg.cookieName;
    if (!name || typeof document === "undefined") return;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    if (!session) {
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Strict${secure}`;
      return;
    }
    const maxAge = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
    document.cookie = `${name}=${session.accessToken}; Path=/; Max-Age=${maxAge}; SameSite=Strict${secure}`;
  }

  private emit(): void {
    const s = this.getSession();
    for (const l of this.listeners) l(s);
  }

  /** Listen to session changes, including other tabs (storage event). */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === this.cfg.storageKey) {
        // another tab signed in / refreshed / out: keep this tab's cookie in step
        this.syncCookie(this.getSession());
        listener(this.getSession());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      this.listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  // login ──────────────────────────────────────────────────────────────────

  /** Redirects to Keycloak; comes back to `returnTo` (a path on this origin). */
  async login(returnTo = "/"): Promise<void> {
    if (this.loggingOut) return; // the end-session redirect is already on its way
    const state = randomToken(16);
    const verifier = randomToken(32);
    const nonce = randomToken(16);
    const pending: PendingLogin = {
      verifier,
      nonce,
      returnTo: safeReturnTo(returnTo),
      createdAt: Date.now(),
    };
    try {
      this.purgePending(false);
      window.sessionStorage.setItem(this.pendingKey(state), JSON.stringify(pending));
    } catch {
      throw new LoginError("Trình duyệt chặn lưu trữ phiên — không đăng nhập được.");
    }
    const params = new URLSearchParams({
      client_id: this.cfg.clientId,
      redirect_uri: this.redirectUri(),
      response_type: "code",
      scope: "openid",
      state,
      nonce,
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: "S256",
    });
    // Keycloak is another origin — a full navigation, not a Next.js route
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`${this.endpoint.auth}?${params}`);
  }

  private pendingKey(state: string): string {
    return `${this.cfg.storageKey}:pkce:${state}`;
  }

  /** Drop abandoned login attempts (all of them once a login succeeded). */
  private purgePending(all: boolean): void {
    const prefix = this.pendingKey("");
    for (const k of Object.keys(window.sessionStorage)) {
      if (!k.startsWith(prefix)) continue;
      if (all) {
        window.sessionStorage.removeItem(k);
        continue;
      }
      try {
        const p = JSON.parse(window.sessionStorage.getItem(k) ?? "") as PendingLogin;
        if (Date.now() - p.createdAt <= PENDING_TTL_MS) continue;
      } catch {
        /* unreadable → drop */
      }
      window.sessionStorage.removeItem(k);
    }
  }

  /** Handles `/auth/callback?code&state` → saves the session, returns where to go next. */
  async completeLogin(params: URLSearchParams): Promise<string> {
    const error = params.get("error");
    if (error) {
      throw new LoginError(
        params.get("error_description") ?? `Keycloak từ chối đăng nhập (${error}).`,
      );
    }
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) throw new LoginError("Thiếu mã đăng nhập — vui lòng đăng nhập lại.");

    let pending: PendingLogin | null = null;
    try {
      const raw = window.sessionStorage.getItem(this.pendingKey(state));
      window.sessionStorage.removeItem(this.pendingKey(state)); // one use
      pending = raw ? (JSON.parse(raw) as PendingLogin) : null;
    } catch {
      pending = null;
    }
    if (!pending || Date.now() - pending.createdAt > PENDING_TTL_MS) {
      throw new LoginError("Phiên đăng nhập không hợp lệ hoặc đã quá hạn — vui lòng thử lại.");
    }

    const res = await fetch(this.endpoint.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.cfg.clientId,
        code,
        redirect_uri: this.redirectUri(),
        code_verifier: pending.verifier,
      }),
    });
    const json = (await res.json().catch(() => null)) as TokenResponse | null;
    if (!res.ok || !json?.access_token) {
      throw new LoginError("Không đổi được mã đăng nhập lấy token — vui lòng thử lại.");
    }
    const idClaims = json.id_token ? decodeJwt<{ nonce?: string }>(json.id_token) : null;
    if (!idClaims || idClaims.nonce !== pending.nonce) {
      throw new LoginError("Phản hồi đăng nhập không khớp yêu cầu (nonce) — vui lòng thử lại.");
    }
    this.save(sessionFromTokens(json, Date.now()));
    try {
      this.purgePending(true);
    } catch {
      /* ignore */
    }
    return pending.returnTo;
  }

  // tokens ─────────────────────────────────────────────────────────────────

  /**
   * Access token valid for at least `minValidityMs` (refreshing if needed); null when signed
   * out. On a network error the current (possibly expired) token is returned — the API answers
   * 401 and the caller's retry gets a fresh one once the network is back.
   */
  async getAccessToken(minValidityMs = 30_000): Promise<string | null> {
    const s = this.getSession();
    if (!s) return null;
    if (!needsRefresh(s, Date.now(), minValidityMs)) return s.accessToken;
    const fresh = await this.refresh(minValidityMs);
    return fresh?.accessToken ?? null;
  }

  /** Refresh now (single flight per tab, Web Lock across tabs). */
  refresh(minValidityMs = Number.POSITIVE_INFINITY): Promise<StoredSession | null> {
    if (this.loggingOut) return Promise.resolve(null);
    this.inflight ??= this.refreshLocked(minValidityMs).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async refreshLocked(minValidityMs: number): Promise<StoredSession | null> {
    const run = async (): Promise<StoredSession | null> => {
      // another tab may have refreshed while we waited for the lock
      const s = this.getSession();
      if (!s) return null;
      if (Number.isFinite(minValidityMs) && !needsRefresh(s, Date.now(), minValidityMs)) return s;
      if (!canRefresh(s, Date.now())) {
        this.save(null);
        return null;
      }
      let res: Response;
      try {
        res = await fetch(this.endpoint.token, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: this.cfg.clientId,
            refresh_token: s.refreshToken,
          }),
        });
      } catch {
        return s; // offline: keep the session, try again later
      }
      const json = (await res.json().catch(() => null)) as
        (TokenResponse & { error?: string }) | null;
      if (res.ok && json?.access_token) {
        const next = sessionFromTokens(json, Date.now(), s);
        this.save(next);
        return next;
      }
      if (res.status === 400 || res.status === 401) {
        // invalid_grant: SSO session ended / token reused / user disabled → sign in again
        this.save(null);
        return null;
      }
      return s; // Keycloak 5xx: keep, retry later
    };
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    return locks ? locks.request(`${this.cfg.storageKey}:refresh`, run) : run();
  }

  /**
   * Keeps the token fresh while the page is open: refresh one minute before expiry, and on
   * waking up / coming back online. Returns a stop function.
   */
  startAutoRefresh(): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      const s = this.getSession();
      if (!s) return;
      const ahead = refreshAheadMs(s);
      // ≥ 10 s between attempts (e.g. offline: the token stays expired until the network is back)
      const wait = Math.max(10_000, s.expiresAt - Date.now() - ahead);
      timer = setTimeout(() => {
        void this.getAccessToken(ahead + 1_000).finally(schedule);
      }, wait);
    };
    const wake = () => {
      if (document.visibilityState === "visible") {
        const s = this.getSession();
        if (s) void this.getAccessToken(refreshAheadMs(s)).finally(schedule);
      }
    };
    const unsubscribe = this.subscribe(schedule);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    schedule();
    return () => {
      clearTimeout(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }

  // logout ─────────────────────────────────────────────────────────────────

  /**
   * Ends the session: storage is cleared, then `beforeClear(token)` (e.g. revoke the token on the
   * API) and `onLogout` run (each ≤ 2 s), then the browser goes to Keycloak's end-session
   * endpoint, which returns to `postLogoutPath`.
   */
  async logout(
    opts: { beforeClear?: (token: string) => Promise<void>; postLogoutPath?: string } = {},
  ): Promise<void> {
    if (this.loggingOut) return;
    // Clear first so nothing else uses the session, and block refresh / login meanwhile:
    // revoking the token makes in-flight API calls 401, whose retry would otherwise refresh
    // and write the session back.
    const s = this.getSession();
    this.loggingOut = true; // before save(null): its listeners may call login()
    this.save(null);
    // best effort, bounded: the user must leave even if the API or caches hang
    const bounded = (p: Promise<unknown> | unknown) =>
      Promise.race([
        Promise.resolve(p).catch(() => undefined),
        new Promise((r) => setTimeout(r, 2_000)),
      ]);
    if (s && opts.beforeClear) await bounded(opts.beforeClear(s.accessToken));
    try {
      await bounded(this.cfg.onLogout?.());
    } catch {
      // cleanup is best effort
    }
    const params = new URLSearchParams({
      client_id: this.cfg.clientId,
      post_logout_redirect_uri: `${window.location.origin}${opts.postLogoutPath ?? "/"}`,
    });
    if (s?.idToken) params.set("id_token_hint", s.idToken);
    // Keycloak is another origin — a full navigation, not a Next.js route
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`${this.endpoint.logout}?${params}`);
  }
}
