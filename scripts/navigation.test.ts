import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BAR, normalizeNavigation, splitNavigation, tabIsActive, TAB_IDS } from "../shared/navigation";
test("missing and invalid choices use defaults", () => {
  for (const value of [undefined, null, {}, "bad", [false, "/unknown"]]) assert.deepEqual(normalizeNavigation(value), DEFAULT_BAR);
});
test("choices preserve order, ignore unknown ids and duplicates, and cap at five", () => {
  assert.deepEqual(normalizeNavigation(["/sleep", "/unknown", "/sleep", "/tasks"]), ["/sleep", "/tasks"]);
  assert.equal(normalizeNavigation([...TAB_IDS]).length, 5);
});
test("Now and every other tab can be removed", () => {
  assert.deepEqual(splitNavigation([]), { bar: [], more: [...TAB_IDS] });
  assert.deepEqual(normalizeNavigation(["/tasks"]), ["/tasks"]);
});
test("remaining and newly introduced tabs appear in More", () => {
  const result = splitNavigation(undefined, [...TAB_IDS, "/new"]);
  assert.deepEqual(result.bar, DEFAULT_BAR);
  assert.deepEqual(result.more, ["/tasks", "/items", "/archive", "/new"]);
});
test("nested routes activate their tab without prefix collisions", () => {
  assert.equal(tabIsActive("/sleep/morning", "/sleep"), true);
  assert.equal(tabIsActive("/track/123", "/track"), true);
  assert.equal(tabIsActive("/sleep", "/"), false);
  assert.equal(tabIsActive("/sleepy", "/sleep"), false);
});
