/**
 * Render's blueprint can only inject a service's bare *hostname*
 * (fromService.property: host) — there is no "url" property — so APP_BASE_URL
 * may arrive as "punchline-web.onrender.com" with no scheme. Anything already
 * carrying http:// or https:// (local dev, a custom domain) is left alone.
 */
export function appBaseUrl(): string {
  const raw = (process.env.APP_BASE_URL || "").trim();
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

/** Deep link to a work order, used in SMS and email notifications. */
export function taskLink(workOrderId: string): string {
  return `${appBaseUrl()}/tasks/${workOrderId}`;
}
