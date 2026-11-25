/**
 * The browser store still backs every screen, so demo sign-in stays the default while
 * the API cutover lands. Set `NEXT_PUBLIC_DEMO_MODE=false` to authenticate through
 * the backend instead (demo mode remains available for offline demos).
 */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
}

/**
 * Where the school store reads from. `api` needs an API session, so demo sign-in
 * keeps the browser store even if the data flag is set (auth and data are still
 * separate flags so each can be verified on its own).
 */
export function isApiDataMode(): boolean {
  return process.env.NEXT_PUBLIC_DATA_SOURCE === "api" && !isDemoMode();
}
