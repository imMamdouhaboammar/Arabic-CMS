import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/** Mirror of absolutePublicUrl in src/pages/rss.xml.ts */
function absolutePublicUrl(base, pathname = "") {
  const root = new URL(base.endsWith("/") ? base : `${base}/`);
  if (!pathname) {
    const path = root.pathname === "/" ? "" : root.pathname.replace(/\/+$/, "");
    return `${root.origin}${path}`;
  }
  return new URL(pathname.replace(/^\/+/, ""), root).toString();
}

test("absolutePublicUrl normalizes trailing slashes on site base", () => {
  assert.equal(absolutePublicUrl("https://example.com"), "https://example.com");
  assert.equal(absolutePublicUrl("https://example.com/"), "https://example.com");
  assert.equal(absolutePublicUrl("https://example.com", "rss.xml"), "https://example.com/rss.xml");
  assert.equal(absolutePublicUrl("https://example.com/", "rss.xml"), "https://example.com/rss.xml");
  assert.equal(absolutePublicUrl("https://example.com/", "posts/hello"), "https://example.com/posts/hello");
  assert.equal(absolutePublicUrl("https://example.com/blog/", "posts/hello"), "https://example.com/blog/posts/hello");
  assert.equal(absolutePublicUrl("https://example.com/blog", "posts/hello"), "https://example.com/blog/posts/hello");
});

test("rss.xml.ts builds feed URLs through absolutePublicUrl", async () => {
  const source = await readFile(new URL("../src/pages/rss.xml.ts", import.meta.url), "utf8");
  assert.match(source, /function absolutePublicUrl\(/);
  assert.match(source, /absolutePublicUrl\(siteUrl, `posts\/\$\{post\.id\}`\)/);
  assert.match(source, /absolutePublicUrl\(siteUrl, "rss\.xml"\)/);
  assert.doesNotMatch(source, /\$\{siteUrl\}\/posts\//);
  assert.doesNotMatch(source, /\$\{siteUrl\}\/rss\.xml/);
});
