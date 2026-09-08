import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Quality workflow grants only read access to repository contents", async () => {
  const workflow = await read(".github/workflows/quality.yml");
  const normalized = workflow.replace(/#.*$/gm, "");
  const permissionsMatch = normalized.match(
    /^permissions:\s*\n((?:^[ \t]+[^\n]+\n?)*)/m,
  );

  assert.ok(permissionsMatch, "Quality must declare workflow-level permissions");
  assert.doesNotMatch(
    normalized,
    /^[ \t]+permissions\s*:/m,
    "Quality jobs must not override workflow-level token permissions",
  );

  const permissions = permissionsMatch[1];
  assert.match(permissions, /^\s+contents:\s*read\s*$/m);
  assert.doesNotMatch(permissions, /:\s*write\s*$/m);
  assert.doesNotMatch(normalized, /^\s*permissions:\s*write-all\s*$/m);
});
