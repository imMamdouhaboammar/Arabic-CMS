import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SURFACES = [
  "../src/pages/index.astro",
  "../src/pages/posts/index.astro",
  "../src/pages/posts/[slug].astro",
  "../src/components/PostCard.astro",
];

test("byline avatars adjacent to visible names use empty alt text", async () => {
  for (const rel of SURFACES) {
    const source = await readFile(new URL(rel, import.meta.url), "utf8");
    assert.match(
      source,
      /alt=""/,
      `${rel} should include empty alt for decorative byline avatars`,
    );
    assert.doesNotMatch(
      source,
      /alt=\{credit\.byline\.displayName\}/,
      `${rel} must not reuse displayName as avatar alt beside visible name`,
    );
  }
});
