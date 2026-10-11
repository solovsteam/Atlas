import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const config = JSON.parse(readFileSync(new URL(".brain.json", root), "utf8"));
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

test("unattended Atlas changes await batch approval on one experimental branch", () => {
  assert.equal(config.project, "atlas");
  assert.equal(config.coder.main_branch, "main");
  assert.equal(config.coder.experimental_branch, "brain-experimental");
  assert.equal(config.coder.check, "npm run check");
  assert.equal(config.inquiries[0], "IQ-b3a3849d");
});

test("the complete Atlas effect boundary and authority configuration stay frozen", () => {
  for (const path of [
    ".brain.json", ".claude", ".cursor", ".github", ".gitignore", "AGENTS.md", "CLAUDE.md",
    "package.json", "package-lock.json", "tsconfig.json", "tsconfig.app.json",
    "tsconfig.node.json", "tsconfig.brain-mcp.json", "vite.config.ts",
    "scripts/brain-atlas-mcp.ts", "src/services/brainTools.ts", "src/services/items.ts",
    "src/services/links.ts", "src/services/schemaScheduleRuns.ts", "src/services/webHandoff.ts",
    "src/services/schema.ts", "src/lib/supabase.ts", "src/hooks/useAuthSession.ts",
    "src/types/database.ts", "shared/item.ts", "shared/links.ts", "shared/schemaSchedule.ts",
    "shared/webHandoff.ts", "shared/subtasks.ts", "shared/completion.ts", "shared/duration.ts",
    "supabase", "docs/BRAIN_MCP.md"
  ]) assert.ok(config.coder.frozen.includes(path), `${path} must be frozen`);
});

test("protected effect and Brain contract tests cannot be replaced or disabled", () => {
  for (const path of ["tests/constraints", "scripts/brain-atlas-mcp.test.ts", "scripts/brain-contract.test.ts"])
    assert.ok(config.coder.append_only.includes(path), `${path} must be append-only`);
  assert.match(pkg.scripts.test, /npm run test:brain-mcp/);
  assert.match(pkg.scripts.test, /npm run test:brain-contract/);
  assert.match(pkg.scripts.test, /npm run test:constraints/);
  assert.equal(pkg.scripts["test:constraints"], "tsx --test tests/constraints/*.test.ts");
});
