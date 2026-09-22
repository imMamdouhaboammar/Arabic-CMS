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

test("Quality workflow pins third-party Actions to full commit SHAs", async () => {
  const workflow = await read(".github/workflows/quality.yml");
  const uses = [...workflow.matchAll(/^\s*-\s*uses:\s*([^\s#]+)/gm)].map((m) => m[1]);
  assert.ok(uses.length > 0, "Quality must declare at least one Action");
  for (const action of uses) {
    assert.match(
      action,
      /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/,
      `Action must be pinned to a 40-char commit SHA: ${action}`,
    );
  }
});
