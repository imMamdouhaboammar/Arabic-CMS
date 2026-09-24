import node from "@astrojs/node";
import react from "@astrojs/react";
import auditLog from "@emdash-cms/plugin-audit-log";
import { defineConfig, fontProviders } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { resolvePersistencePaths, resolveSiteUrl } from "./src/utils/runtime-paths.mjs";

const persistence = resolvePersistencePaths();
const siteUrl = resolveSiteUrl();

if (persistence.configured) {
	// Create the external state directories up front so the first request
	// does not fail on a fresh host.
	mkdirSync(dirname(persistence.databaseUrl.slice("file:".length)), { recursive: true });
	mkdirSync(persistence.uploadsDir, { recursive: true });
}

export default defineConfig({
	site: siteUrl,
	i18n: {
		defaultLocale: "ar",
		locales: ["ar"],
	},
	output: "server",
	adapter: node({
		mode: "standalone",
	}),
	server: {
		port: 3000,
		host: "0.0.0.0",
	},
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			fonts: {
				scripts: ["arabic"],
			},
			database: sqlite({ url: persistence.databaseUrl }),
			storage: local({
				directory: persistence.uploadsDir,
				baseUrl: "/_emdash/api/media/file",
			}),
			plugins: [auditLog],
			...(siteUrl ? { siteUrl } : {}),
		}),
	],
	fonts: [
		{
			provider: fontProviders.google(),
			name: "IBM Plex Sans Arabic",
			cssVariable: "--font-body",
			weights: [400, 500, 600, 700],
			fallbacks: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Geeza Pro", "Noto Sans Arabic", "Tahoma", "sans-serif"],
		},
		{
			provider: fontProviders.google(),
			name: "JetBrains Mono",
			cssVariable: "--font-mono",
			weights: [400, 500],
			fallbacks: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
		},
	],
	devToolbar: { enabled: false },
});
