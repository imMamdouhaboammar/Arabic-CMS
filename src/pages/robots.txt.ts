import type { APIRoute } from "astro";

/** Advisory crawler policy for the public publication and EmDash admin/API surfaces. */
export function buildRobotsTxt(): string {
	return [
		"User-agent: *",
		"Allow: /",
		"Disallow: /_emdash/",
		"",
	].join("\n");
}

export const GET: APIRoute = async () => {
	return new Response(buildRobotsTxt(), {
		status: 200,
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
};
