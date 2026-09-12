import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  opendir,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
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

async function assertNoSymlinkComponents(path, label) {
  const absolute = resolve(path);
  const { root } = parse(absolute);
  const components = absolute
    .slice(root.length)
    .split(sep)
    .filter(Boolean);
  let current = root;

  for (const component of components) {
    current = join(current, component);
    const info = await lstat(current).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });

    if (!info) return;
    if (info.isSymbolicLink()) {
      throw new Error(`${label} must not contain symbolic-link components: ${current}`);
    }
  }
}

async function findNearestExistingDirectory(path) {
  let current = resolve(path);

  while (true) {
    const info = await lstat(current).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });

    if (info) {
      if (info.isSymbolicLink()) {
        throw new Error(
          `Backup output ancestor must not be a symbolic link: ${current}`,
        );
      }
      if (!info.isDirectory()) {
        throw new Error(
          `Backup output ancestor must be a directory: ${current}`,
        );
      }
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new Error("Could not find an existing backup output ancestor");
    }
    current = parent;
  }
}

async function syncCreatedOutputChain(outputRoot, existingAncestor) {
  const directories = [];
  let current = outputRoot;

  while (current !== existingAncestor) {
    directories.push(current);
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        "Backup output path escaped its existing ancestor during synchronization",
      );
    }
    current = parent;
  }

  for (const directory of directories) {
    await syncDirectory(directory, `new backup output directory ${directory}`);
  }
  await syncDirectory(
    existingAncestor,
    `existing backup output ancestor ${existingAncestor}`,
  );
}

async function prepareOutputRoot(outputRoot) {
  const existing = await lstat(outputRoot).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });

  if (!existing) {
    const existingAncestor = await findNearestExistingDirectory(
      dirname(outputRoot),
    );
    await mkdir(outputRoot, { recursive: true, mode: 0o700 });
    await syncCreatedOutputChain(outputRoot, existingAncestor);
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

const NO_FOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const READ_FLAGS = fsConstants.O_RDONLY | NO_FOLLOW;
const WRITE_NEW_FLAGS =
  fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL;
const SYNC_FILE_FLAGS = fsConstants.O_RDWR | NO_FOLLOW;
const DIRECTORY_FLAGS =
  fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | NO_FOLLOW;

async function syncRegularFile(path, label = path) {
  let handle;
  try {
    handle = await open(path, SYNC_FILE_FLAGS);
  } catch (error) {
    if (error.code === "ELOOP") {
      throw new Error(`Refusing symbolic link while syncing: ${label}`);
    }
    throw error;
  }

  try {
    const info = await handle.stat();
    if (!info.isFile()) {
      throw new Error(`Refusing non-regular file while syncing: ${label}`);
    }
    await handle.sync();
  } finally {
    await handle.close().catch(() => {});
  }
}

async function syncDirectory(path, label = path) {
  let handle;
  try {
    handle = await open(path, DIRECTORY_FLAGS);
  } catch (error) {
    if (
      process.platform === "win32" &&
      ["EISDIR", "EPERM", "EINVAL", "ENOTSUP"].includes(error.code)
    ) {
      return;
    }
    if (error.code === "ELOOP") {
      throw new Error(`Refusing symbolic-link directory while syncing: ${label}`);
    }
    throw error;
  }

  try {
    const info = await handle.stat();
    if (!info.isDirectory()) {
      throw new Error(`Refusing non-directory while syncing: ${label}`);
    }
    await handle.sync();
  } finally {
    await handle.close().catch(() => {});
  }
}

async function writeSyncedFile(path, contents, mode = 0o600) {
  const handle = await open(path, WRITE_NEW_FLAGS, mode);
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close().catch(() => {});
  }
}

async function openRegularFileNoFollow(path, label) {
  let handle;
  try {
    handle = await open(path, READ_FLAGS);
  } catch (error) {
    if (error.code === "ELOOP") {
      throw new Error(`Refusing symbolic link: ${label}`);
    }
    throw error;
  }

  try {
    const info = await handle.stat();
    if (!info.isFile()) {
      throw new Error(`Refusing non-regular file: ${label}`);
    }
    return { handle, info };
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  }
}

async function copyRegularFileNoFollow(sourcePath, destinationPath, logicalPath) {
  const { handle: sourceHandle } = await openRegularFileNoFollow(
    sourcePath,
    logicalPath,
  );
  let destinationHandle;

  try {
    destinationHandle = await open(destinationPath, WRITE_NEW_FLAGS, 0o600);
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;

    while (true) {
      const { bytesRead } = await sourceHandle.read(
        buffer,
        0,
        buffer.length,
        position,
      );
      if (bytesRead === 0) break;

      let written = 0;
      while (written < bytesRead) {
        const result = await destinationHandle.write(
          buffer,
          written,
          bytesRead - written,
          position + written,
        );
        written += result.bytesWritten;
      }
      position += bytesRead;
    }

    await destinationHandle.sync();
  } finally {
    await destinationHandle?.close().catch(() => {});
    await sourceHandle.close().catch(() => {});
  }
}

async function copyUploads(
  source,
  destination,
  relativePath = "",
  sourceRootReal = source,
) {
  const expectedReal = relativePath
    ? join(sourceRootReal, ...relativePath.split("/"))
    : sourceRootReal;
  const info = await lstat(source);

  if (info.isSymbolicLink()) {
    throw new Error(
      `Refusing symbolic link in uploads: ${relativePath || "."}`,
    );
  }
  if (!info.isDirectory()) {
    throw new Error(
      `Refusing non-directory upload path: ${relativePath || "."}`,
    );
  }

  const currentReal = await realpath(source);
  if (currentReal !== expectedReal) {
    throw new Error(
      `Uploads path changed or resolved through a symbolic link: ${relativePath || "."}`,
    );
  }

  await mkdir(destination, { recursive: true, mode: 0o700 });
  const directory = await opendir(source);

  for await (const entry of directory) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    const logicalPath = relativePath
      ? `${relativePath}/${entry.name}`
      : entry.name;
    const entryInfo = await lstat(sourcePath);

    if (entryInfo.isSymbolicLink()) {
      throw new Error(`Refusing symbolic link in uploads: ${logicalPath}`);
    }

    if (entryInfo.isDirectory()) {
      await copyUploads(
        sourcePath,
        destinationPath,
        logicalPath,
        sourceRootReal,
      );
      continue;
    }

    if (!entryInfo.isFile()) {
      throw new Error(`Refusing non-regular upload entry: ${logicalPath}`);
    }

    await copyRegularFileNoFollow(sourcePath, destinationPath, logicalPath);
  }

  await syncDirectory(destination, `backup media directory ${relativePath || "."}`);
}

async function inspectAndHashFile(path, label = path) {
  const { handle, info } = await openRegularFileNoFollow(path, label);
  const hash = createHash("sha256");

  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;

    while (true) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        buffer.length,
        position,
      );
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }

    return {
      bytes: info.size,
      sha256: hash.digest("hex"),
    };
  } finally {
    await handle.close().catch(() => {});
  }
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

    const inspected = await inspectAndHashFile(path, logicalPath);
    results.push({
      path: logicalPath,
      bytes: inspected.bytes,
      sha256: inspected.sha256,
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
    const inspected = await inspectAndHashFile(destination, file.path);
    if (inspected.bytes !== file.bytes) {
      throw new Error(`Backup file size validation failed: ${file.path}`);
    }
    if (inspected.sha256 !== file.sha256) {
      throw new Error(`Backup checksum validation failed: ${file.path}`);
    }
  }

  if (!capturedPaths.has("data.db")) {
    throw new Error("Backup manifest is missing data.db");
  }
  if (!manifest.files.some((file) => file.path.startsWith("uploads/"))) {
    const uploadsInfo = await lstat(join(partialRoot, "uploads"));
    if (uploadsInfo.isSymbolicLink() || !uploadsInfo.isDirectory()) {
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
  await assertNoSymlinkComponents(outputRoot, "Backup output path");

  const sourceDbReal = await realpath(sourceDb);
  const sourceUploadsReal = await realpath(sourceUploads);

  if (isInside(sourceUploadsReal, outputRoot)) {
    throw new Error("Backup output must not be inside the uploads source directory");
  }

  await prepareOutputRoot(outputRoot);
  await assertNoSymlinkComponents(outputRoot, "Backup output path");
  const outputRootReal = await realpath(outputRoot);

  if (isInside(sourceUploadsReal, outputRootReal)) {
    throw new Error("Backup output must not resolve inside the uploads source directory");
  }

  const createdAt = new Date();
  const backupName = `backup-${timestampLabel(createdAt)}-${randomUUID().slice(0, 8)}`;
  const finalRoot = join(outputRoot, backupName);
  const partialRoot = join(outputRoot, `.partial-${backupName}-${randomUUID().slice(0, 8)}`);
  let published = false;

  await mkdir(partialRoot, { mode: 0o700 });

  try {
    const destinationDb = join(partialRoot, "data.db");
    const destinationUploads = join(partialRoot, "uploads");

    await createDatabaseSnapshot(sourceDbReal, destinationDb);
    await copyUploads(
      sourceUploadsReal,
      destinationUploads,
      "",
      sourceUploadsReal,
    );

    const databaseFile = await inspectAndHashFile(destinationDb, "data.db");
    const files = [
      {
        path: "data.db",
        bytes: databaseFile.bytes,
        sha256: databaseFile.sha256,
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
    await syncRegularFile(destinationDb, "data.db");

    await writeSyncedFile(
      join(partialRoot, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await writeSyncedFile(
      join(partialRoot, "COMPLETE"),
      `${createdAt.toISOString()}\n`,
    );

    await syncDirectory(partialRoot, "backup staging directory");
    await syncDirectory(outputRoot, "backup output directory");

    await rename(partialRoot, finalRoot);
    try {
      await syncDirectory(outputRoot, "backup output directory");
    } catch (error) {
      const rolledBack = await rename(finalRoot, partialRoot)
        .then(() => true)
        .catch(() => false);
      if (!rolledBack) {
        await rm(finalRoot, { recursive: true, force: true }).catch(() => {});
      }
      await syncDirectory(outputRoot, "backup output directory").catch(() => {});
      throw error;
    }

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
