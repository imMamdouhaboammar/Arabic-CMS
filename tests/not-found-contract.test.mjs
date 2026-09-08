import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const DYNAMIC_PUBLIC_ROUTES = [
  "src/pages/posts/[slug].astro",
  "src/pages/pages/[slug].astro",
  "src/pages/category/[slug].astro",
  "src/pages/tag/[slug].astro",
];

for (const path of DYNAMIC_PUBLIC_ROUTES) {
  test(`${path} renders missing content through the 404 route without redirecting`, async () => {
    const source = await read(path);

    assert.doesNotMatch(
      source,
      /Astro\.redirect\(\s*["']\/404["']\s*\)/,
      `${path} must not redirect missing content to /404`,
    );
    assert.match(
      source,
      /return\s+Astro\.rewrite\(\s*["']\/404["']\s*\)/,
      `${path} must rewrite missing content to the 404 route`,
    );
  });
}

test("the custom 404 route preserves the Arabic not-found presentation", async () => {
  const source = await read("src/pages/404.astro");

  assert.match(source, /<h1>404<\/h1>/);
  assert.match(source, /الصفحة التي تبحث عنها غير موجودة أو تم نقلها/);
  assert.match(source, /العودة إلى الصفحة الرئيسية/);
});

test(
  "Astro rewrite to /404 returns HTTP 404 in place",
  { timeout: 30_000 },
  async () => {
    const port = 3187;
    const origin = `http://127.0.0.1:${port}`;
    const fixtureRoot = fileURLToPath(
      new URL("./fixtures/not-found-runtime/", import.meta.url),
    );
    const astroBin = fileURLToPath(
      new URL(
        process.platform === "win32"
          ? "../node_modules/.bin/astro.cmd"
          : "../node_modules/.bin/astro",
        import.meta.url,
      ),
    );
    const output = { text: "", exited: false };
    const server = spawn(
      astroBin,
      [
        "--root",
        fixtureRoot,
        "dev",
        "--port",
        String(port),
        "--host",
        "127.0.0.1",
      ],
      {
        env: {
          ...process.env,
          ASTRO_TELEMETRY_DISABLED: "1",
          NODE_ENV: "test",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    for (const stream of [server.stdout, server.stderr]) {
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        output.text = `${output.text}${chunk}`.slice(-12_000);
      });
    }
    server.once("error", (error) => {
      output.text = `${output.text}\n${error.stack ?? error.message}`;
      output.exited = true;
    });
    server.once("exit", () => {
      output.exited = true;
    });

    try {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        try {
          await fetch(`${origin}/404`, { redirect: "manual" });
          break;
        } catch {
          if (output.exited) {
            throw new Error(`Astro fixture server exited early:\n${output.text}`);
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      const response = await fetch(`${origin}/missing-contract`, {
        redirect: "manual",
      });
      const body = await response.text();

      assert.equal(response.status, 404);
      assert.equal(response.headers.get("location"), null);
      assert.match(body, /fixture Arabic 404/);
    } finally {
      if (!output.exited) {
        server.kill("SIGTERM");
        await new Promise((resolve) => {
          server.once("exit", resolve);
          setTimeout(() => {
            server.kill("SIGKILL");
            resolve();
          }, 3_000).unref();
        });
      }
    }
  },
);
