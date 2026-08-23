import { schedulingFixtureSummary } from "../shared/scheduling/fixtures.ts";

const summary = schedulingFixtureSummary();
for (const result of summary.results) {
  const mark = result.pass ? "ok" : "FAIL";
  console.log(`${mark}  ${result.name} — ${result.detail}`);
}
console.log(`\n${summary.passed} passed, ${summary.failed} failed`);
if (summary.failed > 0) {
  process.exit(1);
}
