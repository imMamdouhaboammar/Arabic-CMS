import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

const port = 3177;
const origin = `http://127.0.0.1:${port}`;
const astroBin =
  process.platform === "win32"
    ? "node_modules/.bin/astro.cmd"
    : "node_modules/.bin/astro";

async function waitForServer(processOutput) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      await fetch(`${origin}/404`, { redirect: "manual" });
      return;
    } catch {
      if (processOutput.exited) {
        throw new Error(`Astro dev server exited early:\n${processOutput.text}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`Astro dev server did not start:\n${processOutput.text}`);
}

test(
  "missing public content routes return the Arabic 404 directly",
  { timeout: 45_000 },
  async () => {
    const output = { text: "", exited: false };
    const server = spawn(
      astroBin,
      ["dev", "--port", String(port), "--host", "127.0.0.1"],
      {
        env: { ...process.env, NODE_ENV: "test" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    for (const stream of [server.stdout, server.stderr]) {
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        output.text = `${output.text}${chunk}`.slice(-12_000);
      });
    }
    server.once("exit", () => {
      output.exited = true;
    });

    try {
      await waitForServer(output);

      const paths = [
        "/posts/definitely-not-present-404-contract",
        "/pages/definitely-not-present-404-contract",
        "/category/definitely-not-present-404-contract",
        "/tag/definitely-not-present-404-contract",
        "/404",
      ];

      for (const path of paths) {
        const response = await fetch(`${origin}${path}`, { redirect: "manual" });
        const body = await response.text();

        assert.equal(response.status, 404, `${path} must return HTTP 404`);
        assert.equal(
          response.headers.get("location"),
          null,
          `${path} must not redirect to another URL`,
        );
        assert.match(
          body,
          /الصفحة التي تبحث عنها غير موجودة أو تم نقلها/,
          `${path} must render the Arabic not-found presentation`,
        );
      }
    } finally {
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        if (output.exited) return resolve();
        server.once("exit", resolve);
        setTimeout(() => {
          server.kill("SIGKILL");
          resolve();
        }, 5_000).unref();
      });
    }
  },
);
