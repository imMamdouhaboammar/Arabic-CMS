import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const THEME_REGEX = /(?:^|;\s*)theme=([^;]*)/;

function readThemeCookie(cookieHeader) {
  const match = String(cookieHeader || "").match(THEME_REGEX);
  return match ? match[1] : null;
}

test("theme cookie parser requires an exact cookie-name boundary", () => {
  assert.equal(readThemeCookie("theme=dark"), "dark");
  assert.equal(readThemeCookie("foo=1; theme=light; bar=2"), "light");
  assert.equal(readThemeCookie("x-theme=dark"), null);
  assert.equal(readThemeCookie("mytheme=dark"), null);
  assert.equal(readThemeCookie("theme="), "");
});

test("Base.astro uses boundary-aware theme cookie parsing in both paths", async () => {
  const source = await readFile(new URL("../src/layouts/Base.astro", import.meta.url), "utf8");
  assert.match(source, /\(\?:\^\|;\\s\*\)theme=/);
  assert.doesNotMatch(source, /indexOf\(["']theme=/);
  assert.doesNotMatch(source, /THEME_REGEX = \/theme=/);
});
