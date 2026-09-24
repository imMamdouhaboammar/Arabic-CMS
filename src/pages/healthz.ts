import type { APIRoute } from "astro";
import { DatabaseSync } from "node:sqlite";

/**
 * Liveness + readiness probe for uptime monitors and the host panel.
 *
 * Opens the configured SQLite file read-only and runs a real query on every
 * request. EmDash caches site settings across requests and does not expose
 * its connection to public routes, so a cached read could keep reporting
 * "ok" after the database became unavailable. Never exposes error details,
 * paths, or versions.
 */
function probeDatabase(databaseUrl: string): void {
	const path = databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : databaseUrl;
	const db = new DatabaseSync(path, { readOnly: true });
	try {
		db.prepare("SELECT 1 FROM _emdash_migrations LIMIT 1").get();
	} finally {
		db.close();
	}
}

export const GET: APIRoute = async () => {
	let database: "ok" | "error" = "ok";
	try {
		probeDatabase(import.meta.env.CMS_DATABASE_URL);
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
