/**
 * Minimal Keycloak Admin REST client for staff accounts (realm `KEYCLOAK_REALM`).
 * Authenticates as the `bizone-api` service account (client_credentials), which needs the
 * realm-management roles view-users, query-users and manage-users.
 *
 * Keycloak owns identities and passwords; BizOne keeps the staff profile in `users`
 * (matched by username). Every account carries the attribute `tenant_id` — callers must
 * check it before touching an existing account (`assertTenant`), since the realm is shared.
 */
import { bizoneError } from "@/lib/errors";

const KC_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const KC_REALM = process.env.KEYCLOAK_REALM ?? "bizone";
const TIMEOUT_MS = 8_000;

export interface KcUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  attributes?: Record<string, string[]>;
}

export class KeycloakAdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "KeycloakAdminError";
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function kcFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw bizoneError(
      "SERVICE_UNAVAILABLE",
      `Không kết nối được Keycloak (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

async function serviceToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 10_000) return cachedToken.value;
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw bizoneError(
      "SERVICE_UNAVAILABLE",
      "Chưa cấu hình KEYCLOAK_CLIENT_ID / KEYCLOAK_CLIENT_SECRET để quản lý tài khoản nhân viên",
    );
  }
  const res = await kcFetch(`${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    throw bizoneError("SERVICE_UNAVAILABLE", `Keycloak từ chối service account (${res.status})`);
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

async function admin<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const token = await serviceToken();
  const res = await kcFetch(`${KC_URL}/admin/realms/${KC_REALM}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if ((res.status === 401 || res.status === 403) && !retried) {
    // Cached token may predate a role change on the service account — fetch a new one once
    cachedToken = null;
    return admin<T>(method, path, body, true);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text;
    try {
      const parsed = JSON.parse(text) as { errorMessage?: string; error?: string };
      message = parsed.errorMessage ?? parsed.error ?? text;
    } catch {
      /* plain text */
    }
    throw new KeycloakAdminError(`${method} ${path} → ${res.status} ${message}`, res.status);
  }
  if (res.status === 201) {
    // Created: id is the last segment of Location
    const location = res.headers.get("location") ?? "";
    return location.split("/").pop() as T;
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Map Keycloak admin failures to BizOne errors (403 = service account lacks manage-users) */
export function mapKeycloakError(err: unknown): never {
  if (err instanceof KeycloakAdminError) {
    if (err.status === 409) throw bizoneError("CONFLICT", "Tên đăng nhập hoặc email đã tồn tại");
    if (err.status === 400) {
      throw bizoneError("VALIDATION_ERROR", `Keycloak từ chối dữ liệu: ${err.message}`);
    }
    if (err.status === 403) {
      throw bizoneError(
        "SERVICE_UNAVAILABLE",
        "Service account Keycloak thiếu quyền manage-users (realm-management)",
      );
    }
    throw bizoneError("SERVICE_UNAVAILABLE", `Keycloak lỗi: ${err.message}`);
  }
  throw err;
}

export function splitName(fullName: string): { firstName: string; lastName: string } {
  // Vietnamese order: family name first, given name last
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts.pop() ?? fullName;
  return { firstName, lastName: parts.join(" ") };
}

export function tenantOf(user: KcUser): string | undefined {
  return user.attributes?.tenant_id?.[0];
}

export function assertTenant(user: KcUser, tenantId: string): void {
  if (tenantOf(user) !== tenantId) {
    throw bizoneError("FORBIDDEN", "Tài khoản Keycloak thuộc tenant khác");
  }
}

export async function findUserByUsername(username: string): Promise<KcUser | null> {
  const list = await admin<KcUser[]>(
    "GET",
    `/users?exact=true&briefRepresentation=false&username=${encodeURIComponent(username)}`,
  );
  return list.find((u) => u.username === username.toLowerCase()) ?? null;
}

export async function getUser(id: string): Promise<KcUser> {
  return admin<KcUser>("GET", `/users/${encodeURIComponent(id)}`);
}

export interface CreateKcUserInput {
  username: string;
  email?: string | null;
  fullName: string;
  tenantId: string;
  branchIds: number[];
  password: string;
  temporaryPassword: boolean;
}

export async function createUser(input: CreateKcUserInput): Promise<string> {
  return admin<string>("POST", "/users", {
    username: input.username,
    email: input.email || undefined,
    emailVerified: Boolean(input.email),
    ...splitName(input.fullName),
    enabled: true,
    attributes: { tenant_id: [input.tenantId], branch_ids: [JSON.stringify(input.branchIds)] },
    credentials: [{ type: "password", value: input.password, temporary: input.temporaryPassword }],
  });
}

/** Partial update — Keycloak's PUT replaces attributes, so merge them from the current record */
export async function updateUser(
  current: KcUser,
  patch: {
    email?: string | null;
    fullName?: string;
    enabled?: boolean;
    attributes?: Record<string, string[]>;
  },
): Promise<void> {
  await admin("PUT", `/users/${current.id}`, {
    ...(patch.email !== undefined ? { email: patch.email ?? "" } : {}),
    ...(patch.fullName ? splitName(patch.fullName) : {}),
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    attributes: { ...current.attributes, ...patch.attributes },
  });
}

export async function resetPassword(id: string, password: string, temporary: boolean) {
  await admin("PUT", `/users/${id}/reset-password`, {
    type: "password",
    value: password,
    temporary,
  });
}

export async function deleteUser(id: string): Promise<void> {
  await admin("DELETE", `/users/${id}`);
}

interface KcRole {
  id: string;
  name: string;
}

export async function realmRolesOf(id: string): Promise<string[]> {
  const roles = await admin<KcRole[]>("GET", `/users/${id}/role-mappings/realm`);
  return roles.map((r) => r.name);
}

/**
 * Make the user's `bizone-*` realm roles exactly `wanted`; realm roles outside that prefix
 * (default-roles, offline_access…) are left alone.
 */
export async function syncBizoneRealmRoles(id: string, wanted: string[]): Promise<void> {
  const current = await admin<KcRole[]>("GET", `/users/${id}/role-mappings/realm`);
  const currentBizone = current.filter((r) => r.name.startsWith("bizone-"));
  const remove = currentBizone.filter((r) => !wanted.includes(r.name));
  const missing = wanted.filter((name) => !currentBizone.some((r) => r.name === name));
  if (remove.length) await admin("DELETE", `/users/${id}/role-mappings/realm`, remove);
  if (missing.length) {
    // "available" works with manage-users alone (GET /roles/{name} would need view-realm)
    const available = await admin<KcRole[]>("GET", `/users/${id}/role-mappings/realm/available`);
    const add = available.filter((r) => missing.includes(r.name));
    if (add.length !== missing.length) {
      throw new KeycloakAdminError(`realm role not found: ${missing.join(", ")}`, 400);
    }
    await admin("POST", `/users/${id}/role-mappings/realm`, add);
  }
}
