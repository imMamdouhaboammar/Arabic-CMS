import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("rss.xml.ts declares Arabic channel language matching the site locale", async () => {
  const source = await readFile(
    new URL("../src/pages/rss.xml.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /<language>ar<\/language>/);
  assert.doesNotMatch(source, /<language>en-us<\/language>/);
  assert.doesNotMatch(source, /<language>en<\/language>/);
});
