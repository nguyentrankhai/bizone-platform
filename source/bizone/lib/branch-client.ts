/**
 * Branch the user works on in this browser (P4.6). Sent with every tRPC call as `X-Branch-ID`
 * (`apiContext`) and mirrored to a cookie so plain route handlers can read it (proxy.ts).
 * `"all"` = every branch (admins). Missing = the server's default for the user.
 */
const KEY = "bizone:branch";
export const BRANCH_COOKIE = "bizone_branch";

export function getSelectedBranch(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setSelectedBranch(value: string | null) {
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the selection lasts for this page only */
  }
  document.cookie = value
    ? `${BRANCH_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
    : `${BRANCH_COOKIE}=; path=/; max-age=0`;
}
