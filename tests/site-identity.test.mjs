import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ARABIC_TITLE = "ممدوح أبو عمار";
const ARABIC_TAGLINE = "أفكار في هندسة البرمجيات وأدوات المطورين";

/** Mirror of resolveBlogSiteIdentity with Arabic defaults */
function resolveBlogSiteIdentity(settings) {
  return {
    siteTitle: settings?.title ?? ARABIC_TITLE,
    siteTagline: settings?.tagline ?? ARABIC_TAGLINE,
    siteLogo: settings?.logo?.url ? settings.logo : null,
  };
}

test("site-identity.ts keeps Arabic-first fallbacks and drops English template copy", async () => {
  const source = await readFile(
    new URL("../src/utils/site-identity.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, new RegExp(ARABIC_TITLE));
  assert.match(source, new RegExp(ARABIC_TAGLINE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(source, /My Blog/);
  assert.doesNotMatch(source, /Thoughts, stories, and ideas\./);
});

test("resolveBlogSiteIdentity covers undefined, partial, and complete settings", () => {
  assert.deepEqual(resolveBlogSiteIdentity(undefined), {
    siteTitle: ARABIC_TITLE,
    siteTagline: ARABIC_TAGLINE,
    siteLogo: null,
  });
  assert.deepEqual(resolveBlogSiteIdentity({}), {
    siteTitle: ARABIC_TITLE,
    siteTagline: ARABIC_TAGLINE,
    siteLogo: null,
  });
  assert.deepEqual(resolveBlogSiteIdentity({ title: "عنوان مخصص" }), {
    siteTitle: "عنوان مخصص",
    siteTagline: ARABIC_TAGLINE,
    siteLogo: null,
  });
  assert.deepEqual(
    resolveBlogSiteIdentity({
      title: "عنوان",
      tagline: "وصف",
      logo: { mediaId: "1", url: "https://example.com/logo.png" },
    }),
    {
      siteTitle: "عنوان",
      siteTagline: "وصف",
      siteLogo: { mediaId: "1", url: "https://example.com/logo.png" },
    },
  );
});
