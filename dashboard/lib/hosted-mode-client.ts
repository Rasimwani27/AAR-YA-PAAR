export function isHostedClient(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const h = window.location.hostname.toLowerCase();
  if (h === "127.0.0.1" || h === "localhost" || h === "::1") {
    return false;
  }
  return true;
}
