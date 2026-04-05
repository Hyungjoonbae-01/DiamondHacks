/**
 * Browser Use Cloud: embed live view per
 * https://docs.browser-use.com/cloud/browser/live-preview
 * Append ?ui=false (and theme) to the session liveUrl for iframe embedding.
 */
export function browserUseIframeSrc(liveUrl) {
  if (!liveUrl || typeof liveUrl !== "string") return null;
  try {
    const u = new URL(liveUrl);
    u.searchParams.set("ui", "false");
    u.searchParams.set("theme", "dark");
    return u.toString();
  } catch {
    return liveUrl;
  }
}
