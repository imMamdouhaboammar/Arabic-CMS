import assert from "node:assert/strict";
import test from "node:test";

/** Mirror of the RSS missing-title gate in src/pages/rss.xml.ts */
function shouldIncludeRssItem(title) {
  const titleText = typeof title === "string" ? title.trim() : "";
  return Boolean(titleText);
}

test("RSS omits items with missing empty or whitespace-only titles", () => {
  assert.equal(shouldIncludeRssItem("عنوان"), true);
  assert.equal(shouldIncludeRssItem(""), false);
  assert.equal(shouldIncludeRssItem("   "), false);
  assert.equal(shouldIncludeRssItem(undefined), false);
  assert.equal(shouldIncludeRssItem(null), false);
});

test("RSS never falls back to English Untitled placeholder", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/pages/rss.xml.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Untitled/);
  assert.match(source, /skipping published post without title/);
});
