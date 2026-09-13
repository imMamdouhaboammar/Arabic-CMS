import type { APIRoute } from "astro";
import { getEmDashCollection, getSiteSettings } from "emdash";

import { resolveBlogSiteIdentity } from "../utils/site-identity";
import { createPublicQueryErrorResponse } from "../utils/public-query-error.js";

/** Absolute public URL from site base + path, tolerant of trailing slashes on base. */
function absolutePublicUrl(base: string, pathname = ""): string {
	const root = new URL(base.endsWith("/") ? base : `${base}/`);
	if (!pathname) {
		const path = root.pathname === "/" ? "" : root.pathname.replace(/\/+$/, "");
		return `${root.origin}${path}`;
	}
	return new URL(pathname.replace(/^\/+/, ""), root).toString();
}

export const GET: APIRoute = async ({ site, url }) => {
	const siteUrl = site?.toString() || url.origin;
	const { siteTitle, siteTagline } = resolveBlogSiteIdentity(await getSiteSettings());

	const { entries: posts, error: postsError } = await getEmDashCollection("posts", {
		status: "published",
		orderBy: { published_at: "desc" },
		limit: 20,
	});

	if (postsError) {
		return createPublicQueryErrorResponse("rss:posts", postsError);
	}

	const channelLink = absolutePublicUrl(siteUrl);
	const feedSelfLink = absolutePublicUrl(siteUrl, "rss.xml");

	const items = posts
		.map((post) => {
			if (!post.data.publishedAt) return null;

			const titleText = typeof post.data.title === "string" ? post.data.title.trim() : "";
			if (!titleText) {
				console.warn(`rss: skipping published post without title (${post.id})`);
				return null;
			}

			const pubDate = post.data.publishedAt.toUTCString();
			const postUrl = absolutePublicUrl(siteUrl, `posts/${post.id}`);
			const title = escapeXml(titleText);
			const description = escapeXml(post.data.excerpt || "");

			return `    <item>
      <title>${title}</title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${description}</description>
    </item>`;
		})
		.filter(Boolean)
		.join("\n");

	const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <description>${escapeXml(siteTagline)}</description>
    <link>${channelLink}</link>
    <atom:link href="${feedSelfLink}" rel="self" type="application/rss+xml"/>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

	return new Response(rss, {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
};

const XML_ESCAPE_PATTERNS = [
	[/&/g, "&amp;"],
	[/</g, "&lt;"],
	[/>/g, "&gt;"],
	[/"/g, "&quot;"],
	[/'/g, "&apos;"],
] as const;

function escapeXml(str: string): string {
	let result = str;
	for (const [pattern, replacement] of XML_ESCAPE_PATTERNS) {
		result = result.replace(pattern, replacement);
	}
	return result;
}
