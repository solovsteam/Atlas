import { getQuickJS } from "quickjs-emscripten";
import { dateInput } from "@shared/recurringReferences";

export async function evaluateRecurrence(
  source: string,
  dates: string[],
): Promise<boolean[]> {
  if (!source || source.length > 12000 || dates.length > 3660)
    throw new Error("Invalid or oversized repetition predicate");
  const engine = await getQuickJS();
  const runtime = engine.newRuntime();
  runtime.setMemoryLimit(8 * 1024 * 1024);
  runtime.setMaxStackSize(256 * 1024);
  let interrupts = 0;
  let deadline = Date.now() + 20;
  runtime.setInterruptHandler(
    () => ++interrupts > 2000 || Date.now() > deadline,
  );
  try {
    // This VM has no host bindings: no network, DOM, storage, timers or imports.
    // A fresh context per date also prevents stateful predicates from drifting.
    const result: boolean[] = [];
    for (const date of dates) {
      interrupts = 0;
      deadline = Date.now() + 20;
      const input = JSON.stringify(dateInput(date));
      const code = `(() => { 'use strict'; Date = undefined; Math.random = undefined; const rule = (${source}); const result = rule(Object.freeze(${input})); if (typeof result !== 'boolean') throw new Error('Rule must return a boolean'); return result; })()`;
      const context = runtime.newContext();
      try {
        const value = context.evalCode(code);
        if (value.error) {
          const failure = context.dump(value.error);
          value.error.dispose();
          throw new Error(failure?.message ?? "Repetition predicate failed");
        }
        result.push(context.dump(value.value));
        value.value.dispose();
      } finally {
        context.dispose();
      }
    }
    return result;
  } finally {
    runtime.dispose();
  }
}
