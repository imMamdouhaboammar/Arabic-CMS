import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const repoRoot = new URL("../", import.meta.url);
const backupScript = new URL("../scripts/backup.mjs", import.meta.url);

const sha256 = async (path) =>
  createHash("sha256").update(await readFile(path)).digest("hex");

const runBackup = (args, cwd) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [backupScript.pathname, ...args], {
      cwd,
      env: { ...process.env, EMDASH_ENCRYPTION_KEY: "must-not-be-read" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });

const createFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "arabic-cms-backup-"));
  const dbPath = join(root, "data.db");
  const uploadsPath = join(root, "uploads");
  const outputPath = join(root, "backups");

  await mkdir(join(uploadsPath, "nested"), { recursive: true });
  await writeFile(join(uploadsPath, "image.txt"), "media-one\n");
  await writeFile(join(uploadsPath, "nested", "asset.txt"), "media-two\n");

  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE content(id INTEGER PRIMARY KEY, title TEXT NOT NULL)");
  db.prepare("INSERT INTO content(title) VALUES (?)").run("نسخة اختبار");
  db.close();

  return { root, dbPath, uploadsPath, outputPath };
};

test("backup command creates one complete integrity-checkable recovery set without mutating source state", async () => {
  const fixture = await createFixture();

  try {
    const sourceDbHash = await sha256(fixture.dbPath);
    const sourceMediaHash = await sha256(join(fixture.uploadsPath, "image.txt"));

    const result = await runBackup(
      [
        "--source-db",
        fixture.dbPath,
        "--source-uploads",
        fixture.uploadsPath,
        "--output",
        fixture.outputPath,
        "--confirm-quiesced",
      ],
      fixture.root,
    );

    assert.equal(result.code, 0, result.stderr || result.stdout);

    const entries = await readdir(fixture.outputPath);
    assert.equal(entries.filter((name) => name.startsWith(".partial-")).length, 0);
    assert.equal(entries.length, 1);

    const setRoot = join(fixture.outputPath, entries[0]);
    const manifest = JSON.parse(await readFile(join(setRoot, "manifest.json"), "utf8"));

    assert.equal(manifest.version, 1);
    assert.match(manifest.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(manifest.state, "complete");
    assert.equal(manifest.database.path, "data.db");
    assert.equal(manifest.media.path, "uploads");
    assert.ok(Array.isArray(manifest.files));

    const expectedPaths = [
      "data.db",
      "uploads/image.txt",
      "uploads/nested/asset.txt",
    ];
    assert.deepEqual(
      manifest.files.map((entry) => entry.path).sort(),
      expectedPaths.sort(),
    );

    for (const entry of manifest.files) {
      const backupPath = join(setRoot, ...entry.path.split("/"));
      assert.equal(entry.sha256, await sha256(backupPath));
      assert.equal(typeof entry.bytes, "number");
      assert.ok(entry.bytes >= 0);
    }

    const backupDb = new DatabaseSync(join(setRoot, "data.db"), { readOnly: true });
    const row = backupDb.prepare("SELECT title FROM content WHERE id = 1").get();
    backupDb.close();
    assert.equal(row.title, "نسخة اختبار");

    assert.equal(await sha256(fixture.dbPath), sourceDbHash);
    assert.equal(
      await sha256(join(fixture.uploadsPath, "image.txt")),
      sourceMediaHash,
    );

    const manifestText = await readFile(join(setRoot, "manifest.json"), "utf8");
    assert.doesNotMatch(manifestText, /must-not-be-read/);
    assert.doesNotMatch(manifestText, /EMDASH_ENCRYPTION_KEY/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("backup command refuses capture without explicit quiescence confirmation", async () => {
  const fixture = await createFixture();

  try {
    const result = await runBackup(
      [
        "--source-db",
        fixture.dbPath,
        "--source-uploads",
        fixture.uploadsPath,
        "--output",
        fixture.outputPath,
      ],
      fixture.root,
    );

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /confirm-quiesced/i);

    const entries = await readdir(fixture.outputPath).catch(() => []);
    assert.deepEqual(entries, []);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("failed media capture exits non-zero and cannot leave a partial set looking complete", async () => {
  const fixture = await createFixture();

  try {
    await symlink(
      join(fixture.uploadsPath, "image.txt"),
      join(fixture.uploadsPath, "unsafe-link"),
    );

    const result = await runBackup(
      [
        "--source-db",
        fixture.dbPath,
        "--source-uploads",
        fixture.uploadsPath,
        "--output",
        fixture.outputPath,
        "--confirm-quiesced",
      ],
      fixture.root,
    );

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /symbolic link|symlink/i);

    const entries = await readdir(fixture.outputPath).catch(() => []);
    assert.equal(entries.filter((name) => !name.startsWith(".partial-")).length, 0);

    for (const name of entries) {
      const stat = await lstat(join(fixture.outputPath, name));
      assert.equal(stat.isDirectory(), true);
      assert.match(name, /^\.partial-/);
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("repository exposes and documents the backup command", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const contract = await readFile(
    new URL("../docs/backup-and-restore.md", import.meta.url),
    "utf8",
  );

  assert.equal(packageJson.scripts.backup, "node scripts/backup.mjs");
  assert.match(contract, /npm run backup/);
  assert.match(contract, /--confirm-quiesced/);
});
