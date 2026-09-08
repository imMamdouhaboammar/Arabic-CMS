import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public reading shell uses the lightweight search route", async () => {
  const base = await read("src/layouts/Base.astro");
  assert.doesNotMatch(base, /LiveSearch/);
  assert.match(base, /href="\/search"/);
});

test("article reading path does not ship comments without moderation", async () => {
  const article = await read("src/pages/posts/[slug].astro");
  assert.doesNotMatch(article, /CommentForm|<Comments/);
});

test("mobile featured image clears logical start overflow", async () => {
  const home = await read("src/pages/index.astro");
  assert.match(home, /margin-inline-start:\s*0;/);
});

test("motion and theme controls expose accessibility safeguards", async () => {
  const [theme, base] = await Promise.all([
    read("src/styles/theme.css"),
    read("src/layouts/Base.astro"),
  ]);
  assert.match(theme, /prefers-reduced-motion:\s*reduce/);
  assert.match(base, /aria-pressed="false"/);
  assert.match(base, /setAttribute\("aria-pressed"/);
  assert.match(base, /width:\s*44px;/);
  assert.match(base, /height:\s*44px;/);
});
