import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("backup contract defines one recoverable SQLite and media boundary", async () => {
  const contract = await read("docs/backup-and-restore.md");
  const readme = await read("README.md");

  assert.match(contract, /data\.db/);
  assert.match(contract, /uploads\//);
  assert.match(contract, /single backup set|one backup set|same recovery point/i);

  assert.match(contract, /quiesc|stop.*write|write.*stop/i);
  assert.match(contract, /Online Backup API|VACUUM INTO/);
  assert.match(contract, /do not.*copy.*live|must not.*copy.*live|never.*copy.*live/i);

  assert.match(contract, /EMDASH_ENCRYPTION_KEY/);
  assert.match(contract, /secret store|password manager|KMS/i);
  assert.match(contract, /not.*backup artifact|do not.*backup artifact|must not.*backup artifact/i);

  assert.match(contract, /incomplete/i);
  assert.match(contract, /restore verification checklist/i);
  assert.match(contract, /published.*content|public.*content/i);
  assert.match(contract, /media/i);
  assert.match(contract, /writab|permissions/i);

  assert.match(
    readme,
    /docs\/backup-and-restore\.md/,
    "README must link to the backup and restore contract",
  );
});
