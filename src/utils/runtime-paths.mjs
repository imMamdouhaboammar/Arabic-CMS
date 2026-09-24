import { isAbsolute, resolve } from "node:path";

/**
 * Where CMS state lives on disk.
 *
 * Defaults keep the historical local layout (./data.db and ./uploads).
 * Production hosts that swap the build directory on every deploy
 * (Hostinger's managed Node.js apps use `hbuilds/current`) must point these
 * at a directory outside the build, otherwise every deploy starts from an
 * empty database and loses uploaded media.
 *
 * - CMS_DATA_DIR: base directory for both files (optional)
 * - CMS_DATABASE_PATH: SQLite file path (overrides CMS_DATA_DIR/data.db)
 * - CMS_UPLOADS_DIR: media directory (overrides CMS_DATA_DIR/uploads)
 *
 * These values are read when astro.config.mjs is evaluated, so they must be
 * present at build time as well as run time.
 */
export function resolvePersistencePaths(env = process.env, cwd = process.cwd()) {
	const clean = (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
	const dataDir = clean(env.CMS_DATA_DIR);
	const absolute = (path) => (isAbsolute(path) ? path : resolve(cwd, path));

	const databasePath = clean(env.CMS_DATABASE_PATH) ?? (dataDir ? resolve(absolute(dataDir), "data.db") : undefined);
	const uploadsDir = clean(env.CMS_UPLOADS_DIR) ?? (dataDir ? resolve(absolute(dataDir), "uploads") : undefined);

	return {
		databaseUrl: databasePath ? `file:${absolute(databasePath)}` : "file:./data.db",
		uploadsDir: uploadsDir ? absolute(uploadsDir) : "./uploads",
		configured: Boolean(databasePath || uploadsDir),
	};
}

/**
 * Canonical public origin (scheme + host, no trailing slash) or undefined.
 * EmDash itself reads EMDASH_SITE_URL > SITE_URL; keep the same precedence.
 */
export function resolveSiteUrl(env = process.env) {
	const raw = (env.EMDASH_SITE_URL || env.SITE_URL || "").trim();
	if (!raw) return undefined;
	let url;
	try {
		url = new URL(raw);
	} catch {
		throw new Error(`SITE_URL must be an absolute URL such as https://example.com (got "${raw}")`);
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error(`SITE_URL must use http or https (got "${raw}")`);
	}
	return url.origin;
}
