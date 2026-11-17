// Pure TypeScript shared by the server function and the Node tests. No Deno or npm imports.

export type QuickLogRequest = {
  text: string;
  /** "YYYY-MM-DDTHH:MM" in the person's time zone. */
  localNow: string;
  timeZone: string;
  options: {
    drinks: { id: string; name: string; otherNames: string[]; servings: string[] }[];
    intakes: { id: string; name: string; usualDose: number; unit: string }[];
    trackers: { id: string; name: string; kind: string }[];
  };
};

const MAX_TEXT = 500;
const MAX_OPTIONS = 100;
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const short = (value: unknown, max = 200) => typeof value === 'string' && value.length > 0 && value.length <= max;
const list = (value: unknown, check: (v: Record<string, unknown>) => boolean) =>
  Array.isArray(value) && value.length <= MAX_OPTIONS && value.every(v => isObject(v) && check(v));

export function validQuickLogRequest(value: unknown): value is QuickLogRequest {
  if (!isObject(value) || !short(value.text, MAX_TEXT) || !(typeof value.localNow === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value.localNow))) return false;
  if (!short(value.timeZone, 64)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value.timeZone as string }); } catch { return false; }
  const o = value.options;
  return isObject(o)
    && list(o.drinks, d => short(d.id) && short(d.name) && Array.isArray(d.otherNames) && d.otherNames.length <= 20 && d.otherNames.every(n => short(n))
      && Array.isArray(d.servings) && d.servings.length <= 20 && d.servings.every(n => short(n)))
    && list(o.intakes, i => short(i.id) && short(i.name) && typeof i.usualDose === 'number' && short(i.unit))
    && list(o.trackers, t => short(t.id) && short(t.name) && short(t.kind));
}

export const QUICK_LOG_SYSTEM = `You turn one sentence that a person typed into records for their personal tracking app, Atlas.
You only choose from the options in the request and copy what the sentence says. Atlas code calculates every amount and checks every record.

Rules:
- Each record uses kind "drink", "intake" or "tracker" and an optionId copied exactly from the matching list. Never invent an id.
- task: use kind "task" for something the person wants to do later, for example "buy milk tomorrow" or "call mom". Set optionId to "task", taskTitle to the task in the person's words and language, with a stated day or time kept in the title, and amount, unit and localTime to null. Use taskTitle null for every other kind. Something that already happened is never a task: "called the dentist" or "habe eingekauft" describes the past, so it goes to unmatched when no option fits.
- Match by meaning across languages, spelling mistakes and brand names. "coke" can mean Coca-Cola. "Kaffee" can mean coffee.
- drink: copy the amount and the unit from the sentence. The unit is "ml", "cl", "l" or one of that drink's serving names without the size, for example "can". "a can" means amount 1 and unit "can". Do not convert units yourself. When every serving of a drink has the same size, "a" or "ein" means amount 1 of the first serving, and you never ask which serving.
- intake: set amount and unit only when the sentence states a dose. Otherwise set both to null, and Atlas uses the usual dose.
- tracker: amount and unit are null. Set stage to "urge" only when the person noticed an urge and did not act on it. When the person did the thing, for example "caught myself scrolling", stage is "none". Stage is "none" for drinks and intakes.
- localTime: "YYYY-MM-DDTHH:MM" in the person's time zone when the sentence states or implies a time, such as "at 3pm", "an hour ago" or "after lunch yesterday at 1". Use localNow to calculate it. Use null for now or when no time is given. A clock time later than localNow without a day means the previous day.
- One record for each thing that was consumed or done. "two coffees" with two separate times are two records; "2 cans of cola" is one record with amount 2.
- unmatched: the words for a thing that fits no option and is not a task, for example "headache 4 of 10". Otherwise null. Still return the records that do match.
- question: ask one short question, in the language of the sentence, only when the answer changes what is recorded. Examples: a drink without any amount, or an option that could be two different things. When you ask a question, records is empty.
- Never guess a drink or a substance that is not in the lists. Put it in unmatched instead.`;

export function quickLogUserMessage(request: QuickLogRequest): string {
  const weekday = new Date(`${request.localNow.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en', { weekday: 'long', timeZone: 'UTC' });
  return JSON.stringify({ sentence: request.text, localNow: request.localNow, weekday, timeZone: request.timeZone, options: request.options }, null, 1);
}

/** Strict JSON schema: every property is required, and nothing else is allowed. */
export const QUICK_LOG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['records', 'unmatched', 'question'],
  properties: {
    records: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'optionId', 'amount', 'unit', 'localTime', 'stage', 'taskTitle'],
        properties: {
          kind: { type: 'string', enum: ['drink', 'intake', 'tracker', 'task'] },
          optionId: { type: 'string' },
          amount: { type: ['number', 'null'] },
          unit: { type: ['string', 'null'] },
          localTime: { type: ['string', 'null'] },
          stage: { type: 'string', enum: ['urge', 'none'] },
          taskTitle: { type: ['string', 'null'] },
        },
      },
    },
    unmatched: { type: ['string', 'null'] },
    question: { type: ['string', 'null'] },
  },
} as const;
