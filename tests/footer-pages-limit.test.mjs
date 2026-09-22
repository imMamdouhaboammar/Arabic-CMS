import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("footer pages query asks EmDash for at most three published pages", async () => {
  const base = await readFile(
    new URL("../src/layouts/Base.astro", import.meta.url),
    "utf8",
  );
  assert.match(
    base,
    /getEmDashCollection\(\s*"pages"\s*,\s*\{[\s\S]*?status:\s*"published"[\s\S]*?limit:\s*3[\s\S]*?\}\s*\)/,
  );
  assert.match(base, /pages\.slice\(0,\s*3\)/);
});
