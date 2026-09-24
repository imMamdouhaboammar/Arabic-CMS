import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  resolvePersistencePaths,
  resolveSiteUrl,
} from "../src/utils/runtime-paths.mjs";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("persistence defaults keep the local ./data.db and ./uploads layout", () => {
  const paths = resolvePersistencePaths({}, "/app");
  assert.deepEqual(paths, {
    databaseUrl: "file:./data.db",
    uploadsDir: "./uploads",
    configured: false,
  });
});

test("CMS_DATA_DIR moves both database and uploads outside the build directory", () => {
  const paths = resolvePersistencePaths(
    { CMS_DATA_DIR: "/home/u1/domains/example.com/cms-data" },
    "/home/u1/domains/example.com/hbuilds/current/nodejs",
  );
  assert.equal(paths.databaseUrl, "file:/home/u1/domains/example.com/cms-data/data.db");
  assert.equal(paths.uploadsDir, "/home/u1/domains/example.com/cms-data/uploads");
  assert.equal(paths.configured, true);
});

test("explicit database and uploads paths override CMS_DATA_DIR and resolve relative paths", () => {
  const paths = resolvePersistencePaths(
    {
      CMS_DATA_DIR: "/ignored",
      CMS_DATABASE_PATH: "state/site.db",
      CMS_UPLOADS_DIR: " /srv/media ",
    },
    "/app",
  );
  assert.equal(paths.databaseUrl, "file:/app/state/site.db");
  assert.equal(paths.uploadsDir, "/srv/media");
});

test("site URL resolves to an origin with EmDash precedence and rejects bad values", () => {
  assert.equal(resolveSiteUrl({}), undefined);
  assert.equal(resolveSiteUrl({ SITE_URL: "https://mamdouhaboammar.com/" }), "https://mamdouhaboammar.com");
  assert.equal(
    resolveSiteUrl({ SITE_URL: "https://a.example", EMDASH_SITE_URL: "https://b.example" }),
    "https://b.example",
  );
  assert.throws(() => resolveSiteUrl({ SITE_URL: "mamdouhaboammar.com" }), /absolute URL/);
  assert.throws(() => resolveSiteUrl({ SITE_URL: "ftp://example.com" }), /http or https/);
});

test("astro config wires persistence paths and canonical site into EmDash", async () => {
  const config = await read("astro.config.mjs");
  assert.match(config, /sqlite\(\{ url: persistence\.databaseUrl \}\)/);
  assert.match(config, /directory: persistence\.uploadsDir/);
  assert.match(config, /site: siteUrl/);
  assert.doesNotMatch(config, /"file:\.\/data\.db"/);
});

test("start script lets the host inject PORT and HOST", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.scripts.start, "node ./dist/server/entry.mjs");
  assert.doesNotMatch(pkg.scripts.start, /PORT=|HOST=/);
  assert.equal(pkg.engines.node, ">=22.16.0");
});

test("npm is the only package manager: no pnpm workspace file, npm lockfile present", async () => {
  await assert.rejects(read("pnpm-workspace.yaml"), { code: "ENOENT" });
  await read("package-lock.json");
  const workflow = await read(".github/workflows/quality.yml");
  assert.match(workflow, /npm ci/);
});

test("health endpoint reports database reachability without leaking details", async () => {
  const source = await read("src/pages/healthz.ts");
  assert.match(source, /export const GET: APIRoute/);
  assert.match(source, /status: ok \? 200 : 503/);
  assert.match(source, /"Cache-Control": "no-store"/);
  assert.doesNotMatch(source, /error\.message|stack/);
});

test("missing posts and pages render the 404 page instead of a 500", async () => {
  const { isEntryNotFoundError } = await import("../src/utils/public-query-error.js");
  const notFound = Object.assign(new Error("Entry was not found."), { name: "LiveEntryNotFoundError" });
  assert.equal(isEntryNotFoundError(notFound), true);
  assert.equal(isEntryNotFoundError(new Error("SQLITE_BUSY")), false);
  assert.equal(isEntryNotFoundError(undefined), false);

  for (const [route, variable] of [
    ["src/pages/posts/[slug].astro", "postError"],
    ["src/pages/pages/[slug].astro", "pageError"],
  ]) {
    const source = await read(route);
    assert.match(source, new RegExp(`const ${variable} = isEntryNotFoundError\\(\\w+QueryError\\) \\? undefined`));
  }
});

test("search result pages are noindex so query URLs do not become duplicate pages", async () => {
  const source = await read("src/pages/search.astro");
  assert.match(source, /robots=\{query \? "noindex, follow" : null\}/);
});
