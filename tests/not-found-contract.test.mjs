import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const DYNAMIC_PUBLIC_ROUTES = [
  "src/pages/posts/[slug].astro",
  "src/pages/pages/[slug].astro",
  "src/pages/category/[slug].astro",
  "src/pages/tag/[slug].astro",
];

for (const path of DYNAMIC_PUBLIC_ROUTES) {
  test(`${path} renders missing content through the 404 route without redirecting`, async () => {
    const source = await read(path);

    assert.doesNotMatch(
      source,
      /Astro\.redirect\(\s*["']\/404["']\s*\)/,
      `${path} must not redirect missing content to /404`,
    );
    assert.match(
      source,
      /return\s+Astro\.rewrite\(\s*["']\/404["']\s*\)/,
      `${path} must rewrite missing content to the 404 route`,
    );
  });
}

test("the custom 404 route preserves the Arabic not-found presentation", async () => {
  const source = await read("src/pages/404.astro");

  assert.match(source, /<h1>404<\/h1>/);
  assert.match(source, /الصفحة التي تبحث عنها غير موجودة أو تم نقلها/);
  assert.match(source, /العودة إلى الصفحة الرئيسية/);
});
