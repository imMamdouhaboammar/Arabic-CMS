import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public Base head advertises one RSS autodiscovery alternate", async () => {
  const base = await read("src/layouts/Base.astro");
  const matches = [
    ...base.matchAll(
      /<link\b[^>]*rel="alternate"[^>]*type="application\/rss\+xml"[^>]*\/?>/g,
    ),
  ];
  // Astro may split attributes across lines; fall back to a looser block match
  const blockMatches = [
    ...base.matchAll(
      /<link[\s\S]*?rel="alternate"[\s\S]*?type="application\/rss\+xml"[\s\S]*?\/>/g,
    ),
  ];
  assert.equal(blockMatches.length, 1, "exactly one RSS alternate link block");
  assert.match(blockMatches[0][0], /href="\/rss\.xml"/);
  assert.match(blockMatches[0][0], /title=\{`\$\{siteTitle\} — موجز RSS`\}/);
  assert.doesNotMatch(base, /type="application\/atom\+xml"/);
});

test("footer RSS link remains available alongside head autodiscovery", async () => {
  const base = await read("src/layouts/Base.astro");
  assert.match(base, /href="\/rss\.xml">موجز RSS<\/a>/);
});
