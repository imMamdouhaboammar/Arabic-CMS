import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const PUBLIC_POST_COLLECTION_ROUTES = [
  "src/pages/index.astro",
  "src/pages/posts/index.astro",
  "src/pages/category/[slug].astro",
  "src/pages/tag/[slug].astro",
  "src/pages/posts/[slug].astro",
  "src/pages/rss.xml.ts",
];

for (const path of PUBLIC_POST_COLLECTION_ROUTES) {
  test(`${path} queries only published posts`, async () => {
    const source = await read(path);
    const collectionCalls = [
      ...source.matchAll(
        /getEmDashCollection\(\s*["']posts["']\s*,\s*\{([\s\S]*?)\}\s*\)/g,
      ),
    ];

    assert.ok(
      collectionCalls.length > 0,
      `expected at least one posts collection query in ${path}`,
    );

    for (const [, options] of collectionCalls) {
      assert.match(
        options,
        /status\s*:\s*["']published["']/,
        `every public posts query in ${path} must explicitly filter published content`,
      );
    }
  });
}
