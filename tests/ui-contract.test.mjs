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

test("fresh CMS seed is Arabic-first and moderation-safe", async () => {
  const seed = JSON.parse(await read("seed/seed.json"));
  const posts = seed.collections.find((collection) => collection.slug === "posts");

  assert.equal(seed.settings.title, "ممدوح أبو عمار");
  assert.match(seed.settings.tagline, /هندسة البرمجيات/);
  assert.equal(posts.commentsEnabled, false);
  assert.equal(posts.label, "المقالات");
  assert.equal(seed.menus[0].items[0].label, "الرئيسية");
  assert.deepEqual(seed.sections, []);
  assert.deepEqual(seed.content.posts, []);
  assert.deepEqual(seed.content.pages, []);
});

test("narrow reading surfaces use logical spacing and resilient controls", async () => {
  const [cards, posts, search] = await Promise.all([
    read("src/components/PostCard.astro"),
    read("src/pages/posts/index.astro"),
    read("src/pages/search.astro"),
  ]);

  assert.match(cards, /margin-inline-start:\s*2px;/);
  assert.match(posts, /\.post-meta\s*\{[^}]*flex-wrap:\s*wrap;/s);
  assert.match(search, /\.search-input\s*\{[^}]*min-height:\s*44px;/s);
  assert.match(search, /\.search-button\s*\{[^}]*min-height:\s*44px;/s);
});

test("Astro and EmDash default fresh content to Arabic", async () => {
  const config = await read("astro.config.mjs");

  assert.match(config, /defaultLocale:\s*"ar"/);
  assert.match(config, /locales:\s*\["ar"\]/);
  assert.match(config, /scripts:\s*\["arabic"\]/);
});

test("public shell avoids unnecessary sequential CMS queries", async () => {
  const base = await read("src/layouts/Base.astro");

  assert.doesNotMatch(base, /getEmDashCollection/);
  assert.doesNotMatch(base, /getMenu\("social"\)/);
  assert.match(
    base,
    /Promise\.all\(\[\s*getSiteSettings\(\),\s*getMenu\("primary"\),?\s*\]\)/s,
  );
  assert.doesNotMatch(base, /<h4 class="footer-heading">/);
});
