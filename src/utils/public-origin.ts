/**
 * Origin used for canonical URLs, JSON-LD and absolute media links.
 *
 * Prefers the configured `site` (SITE_URL at build time) so links stay on the
 * public domain even when the app sits behind a proxy that forwards requests
 * to an internal host/port. Falls back to the request origin for local dev.
 */
export function getPublicOrigin(site: URL | undefined, requestUrl: URL): string {
	return (site ?? requestUrl).origin;
}
