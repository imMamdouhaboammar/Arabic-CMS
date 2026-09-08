import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("JSON-LD serializer neutralizes script-context delimiters while preserving JSON", async () => {
  const { serializeJsonLd } = await import("../src/utils/json-ld.js");
  const hostile = {
    title: '</script><script>alert("xss")</script><!--',
    arabic: "عنوان عربي <script> تجريبي",
    nested: { value: "<ScRiPt /" },
  };

  const serialized = serializeJsonLd(hostile);

  assert.doesNotMatch(serialized, /</);
  assert.match(serialized, /\\u003C/i);
  assert.deepEqual(JSON.parse(serialized), hostile);
});

test("both public JSON-LD script sinks use the shared safe serializer", async () => {
  const [base, article] = await Promise.all([
    read("src/layouts/Base.astro"),
    read("src/pages/posts/[slug].astro"),
  ]);

  assert.match(
    base,
    /import\s+\{\s*serializeJsonLd\s*\}\s+from\s+["']\.\.\/utils\/json-ld\.js["']/,
  );
  assert.match(
    article,
    /import\s+\{\s*serializeJsonLd\s*\}\s+from\s+["']\.\.\/\.\.\/utils\/json-ld\.js["']/,
  );

  for (const source of [base, article]) {
    assert.match(source, /set:html\s*=\s*\{serializeJsonLd\(\s*\{/);
    assert.doesNotMatch(source, /set:html\s*=\s*\{JSON\.stringify\(/);
  }
});
