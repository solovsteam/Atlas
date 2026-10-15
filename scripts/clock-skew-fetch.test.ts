import assert from "node:assert/strict";
import { test } from "node:test";
import { retryWhenJwtFromFuture } from "../src/lib/clockSkewFetch";

const future = () => new Response(JSON.stringify({ code: "PGRST303", message: "JWT issued at future" }), { status: 401 });
const ok = () => new Response("[]", { status: 200 });
const noSleep = async () => {};

function scripted(responses: (() => Response)[]) {
  const calls: (RequestInit | undefined)[] = [];
  const base = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(init);
    return responses[Math.min(calls.length - 1, responses.length - 1)]!();
  }) as typeof fetch;
  return { base, calls };
}

test("retries a request refused with 'JWT issued at future' until it succeeds", async () => {
  const { base, calls } = scripted([future, future, ok]);
  const response = await retryWhenJwtFromFuture(base, [1, 1, 1], noSleep)("https://x/rest/v1/items", { method: "POST", body: "{}" });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 3);
  assert.equal(calls[2]!.body, "{}");
});

test("other failures are returned at once", async () => {
  const { base, calls } = scripted([() => new Response(JSON.stringify({ message: "JWT expired" }), { status: 401 })]);
  const response = await retryWhenJwtFromFuture(base, [1], noSleep)("https://x/rest/v1/items");
  assert.equal(response.status, 401);
  assert.equal(calls.length, 1);
});

test("gives up after the last delay and returns the refusal", async () => {
  const { base, calls } = scripted([future]);
  const response = await retryWhenJwtFromFuture(base, [1, 1], noSleep)("https://x/rest/v1/items");
  assert.equal(response.status, 401);
  assert.equal(calls.length, 3);
});

test("never resends a body that cannot be replayed", async () => {
  const { base, calls } = scripted([future, ok]);
  const body = new ReadableStream();
  const response = await retryWhenJwtFromFuture(base, [1], noSleep)("https://x/rest/v1/items", { method: "POST", body });
  assert.equal(response.status, 401);
  assert.equal(calls.length, 1);
});
