import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const THEME_REGEX = /(?:^|;\s*)theme=([^;]*)/;

function readThemeCookie(cookieHeader) {
  const match = String(cookieHeader || "").match(THEME_REGEX);
  return match ? match[1] : null;
}

function normalizeTheme(theme) {
  if (theme === "light" || theme === "dark" || theme === "system") {
    return theme;
  }
  return "system";
}

test("theme cookie parser requires an exact cookie-name boundary", () => {
  assert.equal(readThemeCookie("theme=dark"), "dark");
  assert.equal(readThemeCookie("foo=1; theme=light; bar=2"), "light");
  assert.equal(readThemeCookie("x-theme=dark"), null);
  assert.equal(readThemeCookie("mytheme=dark"), null);
  assert.equal(readThemeCookie("theme="), "");
});

test("normalizeTheme accepts only light, dark, or system", () => {
  assert.equal(normalizeTheme("light"), "light");
  assert.equal(normalizeTheme("dark"), "dark");
  assert.equal(normalizeTheme("system"), "system");
  assert.equal(normalizeTheme("purple"), "system");
  assert.equal(normalizeTheme(""), "system");
  assert.equal(normalizeTheme(null), "system");
  assert.equal(normalizeTheme("Dark"), "system");
});

test("Base.astro uses boundary-aware theme cookie parsing in both paths", async () => {
  const source = await readFile(new URL("../src/layouts/Base.astro", import.meta.url), "utf8");
  assert.match(source, /\(\?:\^\|;\\s\*\)theme=/);
  assert.doesNotMatch(source, /indexOf\(["']theme=/);
  assert.doesNotMatch(source, /THEME_REGEX = \/theme=/);
});

test("Base.astro rejects invalid theme values before applying root classes", async () => {
  const source = await readFile(new URL("../src/layouts/Base.astro", import.meta.url), "utf8");
  assert.match(source, /function normalizeTheme\(/);
  assert.match(source, /getStoredTheme\(\): "light" \| "dark" \| "system"/);
  assert.match(source, /const next = normalizeTheme\(theme\)/);
  assert.match(source, /root\.classList\.add\(next\)/);
  assert.doesNotMatch(source, /root\.classList\.add\(theme\)/);
});
