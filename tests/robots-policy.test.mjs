import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

/** Mirror of buildRobotsTxt in src/pages/robots.txt.ts */
function buildRobotsTxt(origin) {
  const lines = ["User-agent: *", "Allow: /", "Disallow: /_emdash/"];
  if (origin) lines.push("", `Sitemap: ${origin.replace(/\/$/, "")}/sitemap.xml`);
  lines.push("");
  return lines.join("\n");
}

test("robots policy allows public content and disallows EmDash admin/API", () => {
  const body = buildRobotsTxt();
  assert.match(body, /^User-agent: \*\n/);
  assert.match(body, /\nAllow: \/\n/);
  assert.match(body, /\nDisallow: \/_emdash\/\n/);
  assert.doesNotMatch(body, /^Disallow: \/$/m);
  assert.doesNotMatch(body, /\nDisallow: \/posts/i);
  assert.doesNotMatch(body, /\nDisallow: \/search/i);
});

test("robots policy advertises the absolute sitemap index for the public origin", () => {
  const body = buildRobotsTxt("https://mamdouhaboammar.com/");
  assert.match(body, /\nSitemap: https:\/\/mamdouhaboammar\.com\/sitemap\.xml\n$/);
});

test("robots.txt.ts serves text/plain through an Astro API route using the public origin", async () => {
  const source = await read("src/pages/robots.txt.ts");
  assert.match(source, /export function buildRobotsTxt\(origin\?: string\)/);
  assert.match(source, /export const GET:\s*APIRoute/);
  assert.match(source, /Content-Type":\s*"text\/plain; charset=utf-8"/);
  assert.match(source, /Disallow: \/_emdash\//);
  assert.match(source, /Sitemap: \$\{origin/);
  assert.match(source, /buildRobotsTxt\(getPublicOrigin\(site, url\)\)/);
});
