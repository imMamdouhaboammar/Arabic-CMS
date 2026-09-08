# Backup and Restore Contract

This document defines the recovery boundary for the Node.js deployment in this repository. The repository now provides a local capture command for this boundary. Scheduling, retention tooling, remote backup storage, and production restore execution remain operator concerns.

## Recovery boundary

The CMS has two pieces of persistent runtime state:

- `data.db` — the SQLite database configured by `astro.config.mjs`
- `uploads/` — the local media directory configured by `astro.config.mjs`

They form a **single backup set** and must represent the **same recovery point**. A database snapshot from one capture and an uploads directory from another must never be combined and treated as a valid backup.

A backup is incomplete if either `data.db` or `uploads/` is missing, unreadable, or failed validation. An incomplete set must never be promoted, retained as a successful backup, or used for restore.

## Consistency requirement

Content records and media files can reference each other. The backup boundary therefore includes both database writes and media writes.

Before capture, quiesce editorial writes for the whole backup window. No post/page/settings/media mutation may be allowed until both parts of the backup set are captured and validated.

For the SQLite portion:

- **Do not copy a live `data.db` file with a generic filesystem copy while SQLite may be writing to it**
- If the application keeps the database open, create the database snapshot with a SQLite-supported mechanism such as the **Online Backup API** or **`VACUUM INTO`**
- An offline filesystem copy is acceptable only after the application has been stopped cleanly and database connections are closed
- Do not cherry-pick WAL or journal sidecar files from an active database as a substitute for SQLite-supported snapshot semantics

This keeps the database snapshot internally consistent while the write-quiescence window keeps the database and media at the same recovery point.

## Safe capture sequence

1. Announce or enter a maintenance window that prevents editorial and media writes
2. Confirm no write-capable CMS operation is still in flight
3. Capture a consistent SQLite snapshot using the rule above
4. Capture the complete `uploads/` directory while writes remain quiesced
5. Stage both items in a temporary backup-set location that is explicitly marked incomplete
6. Record at minimum the capture timestamp, application commit/version, database snapshot name, and media directory name
7. Verify that both state items exist and are readable before marking the set complete
8. Only after successful validation, mark the backup set complete and release the write-quiescence window
9. If any capture or validation step fails, leave the source state untouched, discard or clearly quarantine the incomplete destination, and return a failure

The repository backup command implements this sequence with SQLite `VACUUM INTO`, staged media copying, SHA-256 file metadata, and atomic publication of the completed set.

## Automated capture command

This command requires **Node.js 22.16.0 or later**, matching the current EmDash Node.js deployment requirement. It uses the built-in `node:sqlite` module and does not add an external SQLite CLI dependency.

The command deliberately does not stop application/editor writes for you. First establish the write-quiescence window described above, then run:

```bash
npm run backup -- --confirm-quiesced
```

Defaults:

- source database: `data.db`
- source media: `uploads/`
- destination root: `backups/`

For an explicit deployment layout:

```bash
npm run backup -- --confirm-quiesced \
  --source-db /srv/arabic-cms/data.db \
  --source-uploads /srv/arabic-cms/uploads \
  --output /srv/backups/arabic-cms
```

The command refuses to run without `--confirm-quiesced`. That flag is an operator assertion that all editorial and media writes have already stopped for the capture window.

The output path must not contain symbolic-link components and must not resolve inside the source `uploads/` tree. Upload files are opened with no-follow semantics before copying and hashing so a path replaced with a symlink is rejected rather than followed.

Each completed backup is published as one timestamped `backup-*` directory containing:

- `data.db` — a SQLite `VACUUM INTO` snapshot
- `uploads/` — the matching local media tree
- `manifest.json` — capture time, application metadata, logical file paths, byte sizes, and SHA-256 checksums
- `COMPLETE` — a synced completion marker; a set without this marker is not eligible for restore

The operation builds the set under a `.partial-*` directory and renames it to `backup-*` only after snapshot, media capture, checksum validation, file synchronization, directory synchronization, and a synced `COMPLETE` marker succeed. If the output root does not already exist, every newly created output directory plus the nearest pre-existing ancestor is synchronized so the new directory entries are durable. The output parent directory is also synchronized before and after the final rename on platforms that support directory fsync. A `.partial-*` directory or a set without `COMPLETE` is never a valid restore source. Normal failures are cleaned up and exit non-zero; an unexpected process or host interruption may leave a `.partial-*` directory that operators must treat as incomplete.

Symbolic links and non-regular entries under `uploads/` are rejected rather than followed into the backup.

The default `backups/` directory is excluded from Git. Production backup destinations should live on storage with the access, encryption, retention, and durability controls required by the deployment.

## Secret and configuration prerequisites

`EMDASH_ENCRYPTION_KEY` is operator-provided secret material and is not stored in the SQLite database. Preserve the deployment's key in a durable **secret store**, password manager, or KMS according to the operator's access policy.

The plaintext `EMDASH_ENCRYPTION_KEY` must **not be stored in the backup artifact**, committed to Git, written into the manifest, or copied into ordinary documentation. The backup command does not read or serialize this environment variable. The backup set may record a non-secret key identifier/fingerprint only if future operational tooling explicitly adds one.

A restore operator must also know the application version/commit and deployment configuration required to place the database and media at the paths expected by the application. Environment-specific credentials stay in the deployment secret/configuration store rather than the CMS data backup.

## Backup handling and security

A backup can contain unpublished content, user/editor data, configuration stored in SQLite, and uploaded media. Treat every complete or incomplete backup as sensitive operational data.

At minimum:

- restrict backup access to authorized operators
- store backup sets outside the public web root
- use storage encryption and retention controls appropriate to the deployment
- do not expose backup paths or contents through application routes
- never test restore procedures against the active production database or uploads directory

## Restore prerequisites

Before restoring:

1. Select one **complete** `backup-*` set with a `COMPLETE` marker; never use `.partial-*`, never use a set without the marker, and never mix database and media from different sets
2. Use an empty/disposable target or place the destination application into maintenance with all writers stopped
3. Confirm the target application version/schema is compatible with the recorded backup version
4. Restore the required deployment secrets from the operator secret store, including the same `EMDASH_ENCRYPTION_KEY` when applicable
5. Confirm the target paths for `data.db` and `uploads/`
6. Confirm filesystem ownership and **writability/permissions** are correct for the Node.js process
7. Keep the source backup immutable during the restore attempt
8. Validate file byte sizes and SHA-256 checksums against `manifest.json` before using the set

## Restore sequence

1. Stop the target application or otherwise guarantee no database/media writer is active
2. Re-check that the selected backup set contains both the database snapshot and `uploads/`
3. Validate the files against `manifest.json`
4. Restore the database snapshot to the configured `data.db` location
5. Restore the matching media directory to `uploads/`
6. Apply required environment configuration and secrets from the deployment's secret store
7. Set required ownership and filesystem permissions
8. Start the application
9. Run the restore verification checklist below before declaring recovery successful

## Restore verification checklist

A restore is not complete until an operator verifies all applicable checks:

- [ ] The Node.js application starts without SQLite or media-storage startup errors
- [ ] The CMS/admin surface can read the restored site state without database errors
- [ ] Representative **published content** is visible on the public site
- [ ] A representative restored **media** item referenced by content loads successfully
- [ ] Public content routes do not return unexpected 5xx responses
- [ ] The restored `data.db` and `uploads/` are writable with the expected runtime permissions
- [ ] The source backup set remains unchanged after the restore test
- [ ] The backup timestamp/version recorded in the set matches the recovery point being declared

If any verification check fails, the restore is failed. Keep the target isolated, preserve diagnostics without secret values, and roll back to the pre-restore state or retry from a known-complete backup set.

## What this command does not implement

The repository command performs one local capture. It does not schedule backups, upload them to remote/object storage, enforce retention, rotate encryption-at-rest keys, stop application writes automatically, or execute a production restore. Those operational controls must wrap this command without weakening the recovery boundary above.

## Primary references

- SQLite Online Backup API: https://www.sqlite.org/backup.html
- SQLite `VACUUM INTO`: https://sqlite.org/lang_vacuum.html
- Node.js `node:sqlite`: https://nodejs.org/docs/latest-v22.x/api/sqlite.html
- EmDash secrets and key management: https://docs.emdashcms.com/deployment/secrets/
