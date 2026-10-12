import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createCompiler } from "./recurrence-compiler.mjs";
const origin = "http://localhost:5173";
test("compiler queues one bounded signed-in-worker job, dedupes retries and rejects foreign origins", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atlas-compile-test-"));
  const calls = [];
  let runs = [];
  const server = createCompiler({
    directory,
    runBrain: async (args) => {
      calls.push(args);
      return args[0] === "instruction-runs" ? runs : {};
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = `http://127.0.0.1:${server.address().port}`;
  const id = "11111111-1111-4111-8111-111111111111";
  const send = (text = "Every Monday", requestOrigin = origin) =>
    fetch(`${address}/compile/${id}`, {
      method: "POST",
      headers: { Origin: requestOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ text, timeZone: "Europe/Berlin" }),
    });
  try {
    assert.equal(
      (await send("Every Monday", "https://attacker.example")).status,
      403,
    );
    assert.equal(calls.length, 0);
    assert.equal((await send()).status, 202);
    assert.equal((await send()).status, 202);
    assert.equal(calls.filter((c) => c[0] === "schedule-put").length, 1);
    const { readFile } = await import("node:fs/promises");
    const schedule = JSON.parse(await readFile(calls[0][2], "utf8"));
    assert.deepEqual(schedule.budget, {
      maxToolCalls: 4,
      maxChanges: 0,
      timeoutSeconds: 120,
    });
    assert.equal(schedule.model.model, "gpt-6-luna");
    assert.match(schedule.instruction, /untrusted/);
    assert.equal(schedule.timing.kind, "once");
    assert.equal((await send("Other rule")).status, 400);
    runs = [
      {
        scheduleId: `atlas-rule-${id}`,
        id: "IR-fixture",
        status: "succeeded",
        result: {
          summary: JSON.stringify({
            text: "Every Monday",
            timeZone: "Europe/Berlin",
            source: "d => d.weekday === 1",
          }),
        },
      },
    ];
    let response = await fetch(`${address}/compile/${id}`, {
      headers: { Origin: origin },
    });
    assert.equal((await response.json()).source, "d => d.weekday === 1");
    runs[0].result.summary = JSON.stringify({
      text: "Other rule",
      timeZone: "Europe/Berlin",
      source: "d=>true",
    });
    response = await fetch(`${address}/compile/${id}`, {
      headers: { Origin: origin },
    });
    assert.equal(response.status, 400);
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test("uncertain dispatch is retained and never replayed by a retry", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atlas-compile-uncertain-"));
  let attempts = 0;
  const server = createCompiler({
    directory,
    runBrain: async () => {
      attempts++;
      throw new Error("lost receipt");
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/compile/11111111-1111-4111-8111-111111111111`;
  const request = () =>
    fetch(url, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Daily", timeZone: "UTC" }),
    });
  try {
    assert.equal((await (await request()).json()).status, "uncertain");
    await request();
    assert.equal(attempts, 1);
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
