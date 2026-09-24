import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWebHandoff } from "../shared/webHandoff.ts";
import { atlasTaskBody, atlasTaskId } from "../src/services/webHandoff.ts";

const valid = {
  format: "schema-web.atlas-handoff",
  version: 1,
  requestedAction: "review-task",
  source: {
    kind: "human-intention",
    status: "active",
    id: "I-1234abcd",
    createdAt: "2026-09-24T10:00:00Z",
    text: "I intend to practice lucid dreaming.",
    provenance: "Decided in dialogue"
  },
  exportedAt: "2026-09-24T10:05:00.000Z"
};

test("a repeated export maps to the same Atlas item", async () => {
  const first = parseWebHandoff(valid);
  const second = parseWebHandoff({ ...valid, exportedAt: "2026-09-25T10:05:00.000Z" });
  const id = await atlasTaskId(first);
  assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(await atlasTaskId(second), id);
  assert.match(atlasTaskBody(first), /Web intention I-1234abcd/);
});

test("only a bounded human intention is accepted", () => {
  assert.throws(() => parseWebHandoff({ ...valid, source: { ...valid.source, kind: "schema" } }), /human intention/);
  assert.throws(() => parseWebHandoff({ ...valid, source: { ...valid.source, text: "x".repeat(2001) } }), /too long/);
  assert.throws(() => parseWebHandoff({ ...valid, version: 2 }), /Unsupported/);
});

test("an agent suggestion is bounded, attributed, and keeps task identity stable", async () => {
  const withProposal = parseWebHandoff({
    ...valid,
    proposal: {
      origin: "agent",
      policy: "one-action-existing-block-v1",
      title: "Draft a practice plan",
      durationMinutes: 30,
      reason: "One bounded next action",
      schemaIds: ["J-1e2d186f", "J-60015f29"]
    }
  });
  assert.equal(withProposal.proposal?.durationMinutes, 30);
  assert.equal(await atlasTaskId(withProposal), await atlasTaskId(parseWebHandoff(valid)));
  assert.match(atlasTaskBody(withProposal), /Proposal schemas: J-1e2d186f, J-60015f29/);
  assert.throws(() => parseWebHandoff({ ...valid, proposal: { ...withProposal.proposal, durationMinutes: 0 } }), /duration/);
  assert.throws(() => parseWebHandoff({ ...valid, proposal: { ...withProposal.proposal, schemaIds: ["C-12345678"] } }), /schema IDs/);
});
