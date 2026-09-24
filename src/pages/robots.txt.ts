import type { APIRoute } from "astro";

import { getPublicOrigin } from "../utils/public-origin";

/**
 * Advisory crawler policy for the public publication and EmDash admin/API
 * surfaces. The sitemap index is served by EmDash at /sitemap.xml.
 */
export function buildRobotsTxt(origin?: string): string {
	const lines = ["User-agent: *", "Allow: /", "Disallow: /_emdash/"];
	if (origin) lines.push("", `Sitemap: ${origin.replace(/\/$/, "")}/sitemap.xml`);
	lines.push("");
	return lines.join("\n");
}

export const GET: APIRoute = async ({ site, url }) => {
	return new Response(buildRobotsTxt(getPublicOrigin(site, url)), {
		status: 200,
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
};
