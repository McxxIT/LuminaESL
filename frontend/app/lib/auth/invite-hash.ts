/**
 * Invitation links look like `<APP_URL>/#set-password=<token>`. The token lives
 * in the URL fragment, so it never reaches a server, an access log, or a
 * `Referer` header. Only API mode reads it; demo mode ignores the hash.
 */
const SET_PASSWORD_HASH = /^#set-password=([A-Za-z0-9_-]{20,128})$/;

/** The invite token from a `location.hash` value, or null when it is not a well-formed invite hash. */
export function readSetPasswordToken(hash: string): string | null {
  const match = SET_PASSWORD_HASH.exec(hash);
  return match?.[1] ?? null;
}

/** Remove the fragment from the address bar and history entry (keeps path and query). */
export function clearInviteHash(): void {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  window.history.replaceState(null, "", `${pathname}${search}`);
}
