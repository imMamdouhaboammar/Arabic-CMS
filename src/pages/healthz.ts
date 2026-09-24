import type { APIRoute } from "astro";
import { getSiteSettings } from "emdash";

/**
 * Liveness + readiness probe for uptime monitors and the host panel.
 * Reads site settings to prove the SQLite database is reachable, and never
 * exposes error details, paths, or versions to anonymous callers.
 */
export const GET: APIRoute = async () => {
	let database: "ok" | "error" = "ok";
	try {
		await getSiteSettings();
	} catch (error) {
		database = "error";
		console.error("[healthz] database check failed", error);
	}

	const ok = database === "ok";
	return new Response(JSON.stringify({ status: ok ? "ok" : "degraded", database }), {
		status: ok ? 200 : 503,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
};
