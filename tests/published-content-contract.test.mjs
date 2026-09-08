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
    const collectionCall = source.match(
      /getEmDashCollection\("posts",\s*\{([\s\S]*?)\n\s*\}\),?/,
    );

    assert.ok(collectionCall, `expected a posts collection query in ${path}`);
    assert.match(
      collectionCall[1],
      /status:\s*"published"/,
      `public posts query in ${path} must explicitly filter published content`,
    );
  });
}
