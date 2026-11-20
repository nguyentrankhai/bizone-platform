/**
 * Where to go after logging in (`?next=`): a path on this site only. `//host`, `/\\host`
 * (browsers read a backslash as a slash) and control / whitespace characters could send the
 * customer to another site (QA-5 #158).
 */
export function safeNext(v: string): string {
  return /^\/(?![/\\])[^\\\s\x00-\x1f]*$/.test(v) ? v : "/account";
}
