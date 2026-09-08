import node from "@astrojs/node";
import react from "@astrojs/react";
import auditLog from "@emdash-cms/plugin-audit-log";
import { defineConfig, fontProviders } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";

export default defineConfig({
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
			database: sqlite({ url: "file:./data.db" }),
			storage: local({
				directory: "./uploads",
				baseUrl: "/_emdash/api/media/file",
			}),
			plugins: [auditLog],
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
