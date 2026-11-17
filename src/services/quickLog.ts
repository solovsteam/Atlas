import type { SupabaseClient } from '@supabase/supabase-js';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { localNow, quickLogOptions, validQuickLogOutput, type QuickLogContext, type QuickLogOutput } from '@shared/quickLog';
import type { Database } from '../types/database';

type Client = SupabaseClient<Database>;
export type ModelInterpretation = { output: QuickLogOutput; model: string; ms: number };

const MESSAGES: Record<string, string> = {
  not_configured: 'The interpreter has no API key yet. Simple sentences such as “cola 250 ml at 15:00” still work.',
  not_allowed: 'This account may not use the interpreter.',
  not_signed_in: 'Sign in again to use the interpreter.',
  rate_limited: 'The interpreter is busy. Try again in a minute.',
  refused: 'The interpreter declined this sentence.',
  invalid_output: 'The interpreter gave an unreadable answer.',
  too_long: 'The interpreter gave an unreadable answer.',
};

/** Sends the sentence and the option lists to the quick-log server function. */
export async function interpretWithModel(client: Client, text: string, ctx: QuickLogContext): Promise<ModelInterpretation> {
  const { data, error } = await client.functions.invoke('quick-log', {
    body: { text, localNow: localNow(ctx), timeZone: ctx.timeZone, options: quickLogOptions(ctx) },
  });
  if (error) {
    let code = '';
    if (error instanceof FunctionsHttpError) {
      try { code = String((await error.context.json()).error ?? ''); } catch { /* keep the generic message */ }
    }
    throw new Error(MESSAGES[code] ?? 'The interpreter is not reachable. Check the connection and try again.');
  }
  const body = data as { output?: unknown; error?: string; model?: string; ms?: number };
  if (body.error) throw new Error(MESSAGES[body.error] ?? 'The interpreter failed.');
  if (!validQuickLogOutput(body.output)) throw new Error('The interpreter gave an answer in the wrong shape.');
  return { output: body.output, model: body.model ?? 'unknown', ms: body.ms ?? 0 };
}
