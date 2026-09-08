import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  opendir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULTS = {
  sourceDb: "data.db",
  sourceUploads: "uploads",
  output: "backups",
};

function usageError(message) {
  const error = new Error(message);
  error.code = "USAGE";
  return error;
}

function parseArgs(argv) {
  const options = {
    sourceDb: DEFAULTS.sourceDb,
    sourceUploads: DEFAULTS.sourceUploads,
    output: DEFAULTS.output,
    confirmQuiesced: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--confirm-quiesced") {
      options.confirmQuiesced = true;
      continue;
    }

    const valueOptions = new Map([
      ["--source-db", "sourceDb"],
      ["--source-uploads", "sourceUploads"],
      ["--output", "output"],
    ]);

    if (valueOptions.has(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw usageError(`Missing value for ${arg}`);
      }
      options[valueOptions.get(arg)] = value;
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  npm run backup -- --confirm-quiesced [--source-db PATH] [--source-uploads PATH] [--output PATH]

Defaults:
  --source-db data.db
  --source-uploads uploads
  --output backups

The command refuses to run unless --confirm-quiesced is supplied.`);
      return { help: true };
    }

    throw usageError(`Unknown argument: ${arg}`);
  }

  return options;
}

async function assertRegularFile(path, label) {
  const info = await lstat(path).catch((error) => {
    if (error.code === "ENOENT") {
      throw new Error(`${label} does not exist: ${path}`);
    }
    throw error;
  });

  if (info.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${path}`);
  }
  if (!info.isFile()) {
    throw new Error(`${label} must be a regular file: ${path}`);
  }
}

async function assertDirectory(path, label) {
  const info = await lstat(path).catch((error) => {
    if (error.code === "ENOENT") {
      throw new Error(`${label} does not exist: ${path}`);
    }
    throw error;
  });

  if (info.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${path}`);
  }
  if (!info.isDirectory()) {
    throw new Error(`${label} must be a directory: ${path}`);
  }
}

function isInside(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function prepareOutputRoot(outputRoot) {
  const existing = await lstat(outputRoot).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });

  if (!existing) {
    await mkdir(outputRoot, { recursive: true, mode: 0o700 });
    return;
  }

  if (existing.isSymbolicLink()) {
    throw new Error(`Backup output must not be a symbolic link: ${outputRoot}`);
  }
  if (!existing.isDirectory()) {
    throw new Error(`Backup output must be a directory: ${outputRoot}`);
  }
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function createDatabaseSnapshot(sourceDb, destinationDb) {
  const database = new DatabaseSync(sourceDb, { readOnly: true });
  try {
    database.exec(`VACUUM INTO ${sqlString(destinationDb)}`);
  } finally {
    database.close();
  }

  const snapshot = new DatabaseSync(destinationDb, { readOnly: true });
  try {
    const result = snapshot.prepare("PRAGMA quick_check").get();
    if (!result || result.quick_check !== "ok") {
      throw new Error("SQLite snapshot failed PRAGMA quick_check");
    }
  } finally {
    snapshot.close();
  }
}

async function copyUploads(source, destination, relativePath = "") {
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const directory = await opendir(source);

  for await (const entry of directory) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    const logicalPath = relativePath
      ? `${relativePath}/${entry.name}`
      : entry.name;
    const info = await lstat(sourcePath);

    if (info.isSymbolicLink()) {
      throw new Error(`Refusing symbolic link in uploads: ${logicalPath}`);
    }

    if (info.isDirectory()) {
      await copyUploads(sourcePath, destinationPath, logicalPath);
      continue;
    }

    if (!info.isFile()) {
      throw new Error(`Refusing non-regular upload entry: ${logicalPath}`);
    }

    await copyFile(sourcePath, destinationPath);
  }
}

async function sha256File(path) {
  const contents = await readFile(path);
  return createHash("sha256").update(contents).digest("hex");
}

async function collectFiles(root, logicalRoot = "") {
  const results = [];
  const directory = await opendir(root);

  for await (const entry of directory) {
    const path = join(root, entry.name);
    const logicalPath = logicalRoot
      ? `${logicalRoot}/${entry.name}`
      : entry.name;
    const info = await lstat(path);

    if (info.isSymbolicLink()) {
      throw new Error(`Backup staging unexpectedly contains a symbolic link: ${logicalPath}`);
    }

    if (info.isDirectory()) {
      results.push(...(await collectFiles(path, logicalPath)));
      continue;
    }

    if (!info.isFile()) {
      throw new Error(`Backup staging contains a non-regular entry: ${logicalPath}`);
    }

    results.push({
      path: logicalPath,
      bytes: info.size,
      sha256: await sha256File(path),
    });
  }

  return results;
}

async function applicationMetadata() {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  return {
    packageVersion: packageJson.version,
    commit:
      process.env.APP_COMMIT_SHA ??
      process.env.GITHUB_SHA ??
      null,
    nodeVersion: process.version,
  };
}

function timestampLabel(date) {
  return date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(".", "");
}

async function validateManifest(partialRoot, manifest) {
  if (manifest.state !== "complete") {
    throw new Error("Backup manifest is not marked complete");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("Backup manifest has no captured files");
  }

  const capturedPaths = new Set();
  for (const file of manifest.files) {
    if (
      typeof file.path !== "string" ||
      typeof file.bytes !== "number" ||
      typeof file.sha256 !== "string"
    ) {
      throw new Error("Backup manifest contains an invalid file entry");
    }
    if (capturedPaths.has(file.path)) {
      throw new Error(`Backup manifest contains duplicate file path: ${file.path}`);
    }
    capturedPaths.add(file.path);

    const destination = join(partialRoot, ...file.path.split("/"));
    const info = await stat(destination);
    if (!info.isFile() || info.size !== file.bytes) {
      throw new Error(`Backup file size validation failed: ${file.path}`);
    }
    if ((await sha256File(destination)) !== file.sha256) {
      throw new Error(`Backup checksum validation failed: ${file.path}`);
    }
  }

  if (!capturedPaths.has("data.db")) {
    throw new Error("Backup manifest is missing data.db");
  }
  if (!manifest.files.some((file) => file.path.startsWith("uploads/"))) {
    const uploadsInfo = await stat(join(partialRoot, "uploads"));
    if (!uploadsInfo.isDirectory()) {
      throw new Error("Backup media directory is missing");
    }
  }
}

async function createBackup(options) {
  if (!options.confirmQuiesced) {
    throw usageError(
      "Refusing backup: --confirm-quiesced is required after editorial and media writes are stopped",
    );
  }

  const sourceDb = resolve(options.sourceDb);
  const sourceUploads = resolve(options.sourceUploads);
  const outputRoot = resolve(options.output);

  await assertRegularFile(sourceDb, "SQLite source database");
  await assertDirectory(sourceUploads, "Uploads source");

  if (isInside(sourceUploads, outputRoot)) {
    throw new Error("Backup output must not be inside the uploads source directory");
  }

  await prepareOutputRoot(outputRoot);

  const createdAt = new Date();
  const backupName = `backup-${timestampLabel(createdAt)}-${randomUUID().slice(0, 8)}`;
  const finalRoot = join(outputRoot, backupName);
  const partialRoot = join(outputRoot, `.partial-${backupName}-${randomUUID().slice(0, 8)}`);
  let published = false;

  await mkdir(partialRoot, { mode: 0o700 });

  try {
    const destinationDb = join(partialRoot, "data.db");
    const destinationUploads = join(partialRoot, "uploads");

    await createDatabaseSnapshot(sourceDb, destinationDb);
    await copyUploads(sourceUploads, destinationUploads);

    const files = [
      {
        path: "data.db",
        bytes: (await stat(destinationDb)).size,
        sha256: await sha256File(destinationDb),
      },
      ...(await collectFiles(destinationUploads, "uploads")),
    ].sort((a, b) => a.path.localeCompare(b.path));

    const manifest = {
      version: 1,
      state: "complete",
      createdAt: createdAt.toISOString(),
      recoveryPoint: createdAt.toISOString(),
      database: {
        path: "data.db",
        captureMethod: "sqlite-vacuum-into",
      },
      media: {
        path: "uploads",
      },
      application: await applicationMetadata(),
      files,
    };

    await validateManifest(partialRoot, manifest);
    await writeFile(
      join(partialRoot, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { mode: 0o600 },
    );

    await rename(partialRoot, finalRoot);
    published = true;

    console.log(finalRoot);
    return finalRoot;
  } finally {
    if (!published) {
      await rm(partialRoot, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return;

  await createBackup(options);
}

main().catch((error) => {
  console.error(`Backup failed: ${error.message}`);
  process.exitCode = 1;
});
