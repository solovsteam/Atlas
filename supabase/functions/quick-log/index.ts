// Supabase Edge Function (Deno). It holds the Anthropic API key, so the browser never sees it.
// Secrets: ANTHROPIC_API_KEY, QUICK_LOG_ALLOWED_USERS (comma-separated Atlas user IDs), optional QUICK_LOG_MODEL.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { QUICK_LOG_SCHEMA, QUICK_LOG_SYSTEM, quickLogUserMessage, validQuickLogRequest } from './prompt.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  const authorization = request.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
  const { data: { user } } = await supabase.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
  if (!user) return reply(401, { error: 'not_signed_in' });
  // Only listed accounts may spend the API key.
  const allowed = (Deno.env.get('QUICK_LOG_ALLOWED_USERS') ?? '').split(',').map(id => id.trim()).filter(Boolean);
  if (!allowed.includes(user.id)) return reply(403, { error: 'not_allowed' });
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return reply(503, { error: 'not_configured' });

  let body: unknown;
  try { body = await request.json(); } catch { return reply(400, { error: 'invalid_json' }); }
  if (!validQuickLogRequest(body)) return reply(400, { error: 'invalid_request' });

  const model = Deno.env.get('QUICK_LOG_MODEL') || 'claude-opus-5-5';
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 30000 });
  const started = Date.now();
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4000,
      // Low effort: the task is a short, bounded extraction and speed matters.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: QUICK_LOG_SCHEMA } },
      system: QUICK_LOG_SYSTEM,
      messages: [{ role: 'user', content: quickLogUserMessage(body) }],
    });
    const ms = Date.now() - started;
    if (response.stop_reason === 'refusal') return reply(200, { output: null, error: 'refused', model: response.model, ms });
    if (response.stop_reason === 'max_tokens') return reply(200, { output: null, error: 'too_long', model: response.model, ms });
    const text = response.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('');
    let output: unknown = null;
    try { output = JSON.parse(text); } catch { return reply(200, { output: null, error: 'invalid_output', model: response.model, ms }); }
    return reply(200, { output, model: response.model, ms, usage: { input: response.usage.input_tokens, output: response.usage.output_tokens } });
  } catch (error) {
    const status = error instanceof Anthropic.APIError ? error.status ?? 502 : 502;
    console.error('quick-log model call failed', status, error instanceof Error ? error.message : error);
    return reply(502, { error: status === 429 ? 'rate_limited' : 'model_unavailable' });
  }
});
