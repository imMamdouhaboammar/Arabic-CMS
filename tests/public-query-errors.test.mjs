import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public query error responses hide internal details while retaining diagnostics", async () => {
  const { createPublicQueryErrorResponse } = await import(
    "../src/utils/public-query-error.js"
  );
  const originalConsoleError = console.error;
  const calls = [];
  const internalError = new Error("SQLITE_BUSY /srv/private/data.db SECRET_TOKEN");

  console.error = (...args) => calls.push(args);
  try {
    const response = createPublicQueryErrorResponse("home:posts", internalError);
    const body = await response.text();

    assert.equal(response.status, 500);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(body, /SQLITE_BUSY|\/srv\/private|SECRET_TOKEN/);
    assert.equal(calls.length, 1);
    assert.match(String(calls[0][0]), /home:posts/);
    assert.equal(calls[0][1], internalError);
  } finally {
    console.error = originalConsoleError;
  }
});

test("layout query failures throw only a generic public error after logging context", async () => {
  const { throwPublicQueryError } = await import(
    "../src/utils/public-query-error.js"
  );
  const originalConsoleError = console.error;
  const calls = [];
  const internalError = new Error("SQLITE_CORRUPT /secret/path");

  console.error = (...args) => calls.push(args);
  try {
    assert.throws(
      () => throwPublicQueryError("layout:pages", internalError),
      (error) => {
        assert.equal(error.message, "Public CMS query failed");
        assert.doesNotMatch(error.message, /SQLITE_CORRUPT|secret/);
        return true;
      },
    );
    assert.equal(calls.length, 1);
    assert.match(String(calls[0][0]), /layout:pages/);
    assert.equal(calls[0][1], internalError);
  } finally {
    console.error = originalConsoleError;
  }
});

const responseBoundaries = [
  {
    path: "src/pages/index.astro",
    importPath: "../utils/public-query-error.js",
    errorNames: ["postsError"],
  },
  {
    path: "src/pages/posts/index.astro",
    importPath: "../../utils/public-query-error.js",
    errorNames: ["postsError"],
  },
  {
    path: "src/pages/posts/[slug].astro",
    importPath: "../../utils/public-query-error.js",
    errorNames: ["postError", "recentPostsError"],
    notFound: ["postError", "if (!post)"],
  },
  {
    path: "src/pages/pages/[slug].astro",
    importPath: "../../utils/public-query-error.js",
    errorNames: ["pageError"],
    notFound: ["pageError", "if (!page)"],
  },
  {
    path: "src/pages/category/[slug].astro",
    importPath: "../../utils/public-query-error.js",
    errorNames: ["postsError"],
  },
  {
    path: "src/pages/tag/[slug].astro",
    importPath: "../../utils/public-query-error.js",
    errorNames: ["postsError"],
  },
  {
    path: "src/pages/rss.xml.ts",
    importPath: "../utils/public-query-error.js",
    errorNames: ["postsError"],
  },
];

for (const contract of responseBoundaries) {
  test(`${contract.path} fails closed on EmDash query errors`, async () => {
    const source = await read(contract.path);

    assert.match(
      source,
      new RegExp(
        `import\\s+\\{\\s*createPublicQueryErrorResponse\\s*\\}\\s+from\\s+["']${contract.importPath.replaceAll(".", "\\.")}["']`,
      ),
    );

    for (const errorName of contract.errorNames) {
      assert.match(
        source,
        new RegExp(`\\berror\\s*:\\s*${errorName}\\b`),
        `expected ${contract.path} to capture ${errorName}`,
      );
      assert.match(
        source,
        new RegExp(
          `if\\s*\\(\\s*${errorName}\\s*\\)[\\s\\S]{0,180}return\\s+createPublicQueryErrorResponse\\(`,
        ),
        `expected ${contract.path} to return a safe 500 for ${errorName}`,
      );
    }

    if (contract.notFound) {
      const [errorName, notFoundMarker] = contract.notFound;
      assert.ok(
        source.indexOf(`if (${errorName})`) < source.indexOf(notFoundMarker),
        `expected ${contract.path} to handle query failure before not-found`,
      );
    }
  });
}

test("shared Base layout fails closed when its pages collection query errors", async () => {
  const source = await read("src/layouts/Base.astro");

  assert.match(
    source,
    /import\s+\{\s*throwPublicQueryError\s*\}\s+from\s+["']\.\.\/utils\/public-query-error\.js["']/,
  );
  assert.match(source, /error\s*:\s*pagesError/);
  assert.match(
    source,
    /if\s*\(\s*pagesError\s*\)[\s\S]{0,160}throwPublicQueryError\(/,
  );
});

test("custom 500 page is standalone, Arabic, and does not expose the thrown error", async () => {
  const source = await read("src/pages/500.astro");

  assert.match(source, /<html\s+lang="ar"\s+dir="rtl"/);
  assert.match(source, /Astro\.response\.status\s*=\s*500/);
  assert.match(source, /Cache-Control["']?,\s*["']no-store/);
  assert.doesNotMatch(source, /Base\.astro|<Base\b/);
  assert.doesNotMatch(source, /Astro\.props\.error|\{\s*error\s*\}/);
});
