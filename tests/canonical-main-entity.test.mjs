import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("BlogPosting mainEntityOfPage uses seo.canonical instead of the raw request URL", async () => {
  const source = await readFile(
    new URL("../src/pages/posts/[slug].astro", import.meta.url),
    "utf8",
  );
  assert.match(source, /"mainEntityOfPage":\s*seo\.canonical\s*\|\|\s*Astro\.url\.href/);
  assert.doesNotMatch(source, /"mainEntityOfPage":\s*Astro\.url\.href/);
});
