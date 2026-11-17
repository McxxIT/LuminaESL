/**
 * The browser store still backs every screen, so demo sign-in stays the default while
 * the API cutover lands. Set `NEXT_PUBLIC_DEMO_MODE=false` to authenticate through
 * the backend instead (demo mode remains available for offline demos).
 */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
}
