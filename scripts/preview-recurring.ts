import { readFileSync } from "node:fs";
import { generateRecurringPreview, type RoutineInput, type RoutineSpec } from "../shared/recurringPreview.ts";

// JSON envelope: { spec, horizon: { startDate, days: 7 }, timezone? }.
// Exit status makes unresolved required inputs and failed placement visible to callers.
try {
  if (process.argv.length !== 3) throw new Error("Usage: npx tsx scripts/preview-recurring.ts <request.json>");
  const request = JSON.parse(readFileSync(process.argv[2], "utf8")) as {
    spec: RoutineSpec; horizon: { startDate: string; days: 7 }; timezone?: RoutineInput
  };
  const preview = generateRecurringPreview(request.spec, request.horizon, request.timezone);
  process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
  if (preview.status !== "feasible" && preview.status !== "provisional") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
