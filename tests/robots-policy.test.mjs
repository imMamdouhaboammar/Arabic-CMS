import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

/** Mirror of buildRobotsTxt in src/pages/robots.txt.ts */
function buildRobotsTxt() {
  return ["User-agent: *", "Allow: /", "Disallow: /_emdash/", ""].join("\n");
}

test("robots policy allows public content and disallows EmDash admin/API", () => {
  const body = buildRobotsTxt();
  assert.match(body, /^User-agent: \*\n/);
  assert.match(body, /\nAllow: \/\n/);
  assert.match(body, /\nDisallow: \/_emdash\/\n/);
  assert.doesNotMatch(body, /^Disallow: \/$/m);
  assert.doesNotMatch(body, /\nDisallow: \/posts/i);
  assert.doesNotMatch(body, /\nDisallow: \/search/i);
  assert.doesNotMatch(body, /\nSitemap:/i);
});

test("robots.txt.ts serves text/plain through an Astro API route", async () => {
  const source = await read("src/pages/robots.txt.ts");
  assert.match(source, /export function buildRobotsTxt\(\)/);
  assert.match(source, /export const GET:\s*APIRoute/);
  assert.match(source, /Content-Type":\s*"text\/plain; charset=utf-8"/);
  assert.match(source, /Disallow: \/_emdash\//);
  assert.match(source, /Allow: \//);
  assert.doesNotMatch(source, /Sitemap:/);
  assert.match(source, /new Response\(buildRobotsTxt\(\)/);
});
