#!/usr/bin/env node
// P6.7 — Đăng nhập Keycloak tự động (không trình duyệt) bằng đúng luồng của app:
// Authorization Code + PKCE với client public, điền form đăng nhập của Keycloak, đổi code lấy token.
// Dùng cho kiểm thử e2e / đo hiệu năng (scripts/perf/bench.mjs --token …).
//
//   KC_PASSWORD=… node scripts/auth/login.mjs --user admin@bizone.vn [--json]
//        [--keycloak http://localhost:8080] [--realm bizone] [--client bizone-frontend]
//        [--redirect http://localhost:3000/auth/callback]
//
// In ra access token (mặc định) hoặc JSON token đầy đủ (--json). Mật khẩu chỉ đọc từ biến
// môi trường KC_PASSWORD để không lọt vào lịch sử shell.
import { createHash, randomBytes } from "node:crypto";

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const next = process.argv[i + 1];
  args[a.slice(2)] = next && !next.startsWith("--") ? (i++, next) : "true";
}
const KEYCLOAK = (args.keycloak ?? process.env.KEYCLOAK_URL ?? "http://localhost:8080").replace(
  /\/$/,
  "",
);
const REALM = args.realm ?? "bizone";
const CLIENT = args.client ?? "bizone-frontend";
const REDIRECT = args.redirect ?? "http://localhost:3000/auth/callback";
const USER = args.user;
const PASSWORD = process.env.KC_PASSWORD;
if (!USER || !PASSWORD) {
  console.error("Cần --user <username> và biến môi trường KC_PASSWORD");
  process.exit(2);
}

const b64url = (buf) => buf.toString("base64url");
const verifier = b64url(randomBytes(32));
const challenge = b64url(createHash("sha256").update(verifier).digest());
const state = b64url(randomBytes(16));
const oidc = `${KEYCLOAK}/realms/${REALM}/protocol/openid-connect`;

/** Minimal cookie jar: Keycloak ties the login form to AUTH_SESSION_ID / KC_RESTART cookies. */
const jar = new Map();
function keep(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
  }
}
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

const authUrl = `${oidc}/auth?${new URLSearchParams({
  client_id: CLIENT,
  redirect_uri: REDIRECT,
  response_type: "code",
  scope: "openid",
  state,
  code_challenge: challenge,
  code_challenge_method: "S256",
})}`;
const page = await fetch(authUrl, { redirect: "manual" });
keep(page);
const html = await page.text();
const action = html.match(/<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/)?.[1];
if (!action) {
  console.error(`Không thấy form đăng nhập Keycloak (HTTP ${page.status})`);
  process.exit(1);
}

const submit = await fetch(action.replace(/&amp;/g, "&"), {
  method: "POST",
  redirect: "manual",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader() },
  body: new URLSearchParams({ username: USER, password: PASSWORD, credentialId: "" }),
});
const location = submit.headers.get("location");
const back = location ? new URL(location) : null;
if (!back?.searchParams.get("code")) {
  const body = await submit.text();
  const err = body.match(/id="input-error"[^>]*>\s*([^<]+)/)?.[1]?.trim();
  console.error(`Đăng nhập thất bại (HTTP ${submit.status})${err ? `: ${err}` : ""}`);
  process.exit(1);
}
if (back.searchParams.get("state") !== state) {
  console.error("state không khớp");
  process.exit(1);
}

const tokenRes = await fetch(`${oidc}/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT,
    code: back.searchParams.get("code"),
    redirect_uri: REDIRECT,
    code_verifier: verifier,
  }),
});
const tokens = await tokenRes.json();
if (!tokenRes.ok) {
  console.error(`Đổi code lấy token thất bại: ${tokens.error_description ?? tokens.error}`);
  process.exit(1);
}
process.stdout.write(args.json ? `${JSON.stringify(tokens)}\n` : `${tokens.access_token}\n`);
