import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { advanceRun, skipStep, startRun, durationText } from '../shared/timedRoutines';

test('a routine records the delay after the alarm and sequential steps, including skips', () => {
  let run = startRun(new Date('2026-10-29T07:30:00Z'), ['Recall', 'Shower', 'Breakfast']);
  run = skipStep(run, 1);
  run = advanceRun(run, new Date('2026-10-29T07:45:00Z'));
  assert.equal(run.steps[0].start, '2026-10-29T07:45:00.000Z');
  run = advanceRun(run, new Date('2026-10-29T07:48:00Z'));
  assert.equal(run.steps[0].end, run.steps[2].start);
  assert.equal(run.steps[1].status, 'skipped');
  run = advanceRun(run, new Date('2026-10-29T08:08:00Z'));
  assert.equal(run.endedAt, '2026-10-29T08:08:00.000Z');
  assert.equal(durationText(run.startedAt, run.endedAt!), '38 min');
  assert.throws(() => advanceRun(run, new Date()));
});
