/**
 * Volitelné AI vylepšení parseru harmonogramu a sylabů.
 * Funguje s Claude (Anthropic), ChatGPT (OpenAI) i Gemini (Google) – poskytovatel
 * se pozná podle klíče. Klíč: hlavička `x-ai-key` (vlastní klíč studenta), jinak
 * env `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` nebo `GEMINI_API_KEY` (správce).
 * Výstup je strukturovaný JSON validovaný schématem.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { HttpError, errorResponse, json, methodNotAllowed, readJsonBody } from './http.js';

const MODEL = 'claude-opus-5-5';
const MAX_TEXT_CHARS = 30_000;

const ExtractedItem = z.object({
  title: z.string().describe('Krátký český název položky bez dat, jak je uveden v textu.'),
  category: z.enum(['semester', 'teaching', 'exam-period', 'enrollment', 'holiday', 'deadline', 'assessment', 'event']),
  start: z.string().nullable().describe('YYYY-MM-DD nebo YYYY-MM-DDTHH:MM (místní pražský čas); null u složek hodnocení bez data.'),
  end: z.string().nullable().describe('Konec rozsahu (včetně), stejný formát; jinak null.'),
  is_deadline: z.boolean(),
  weight_percent: z.number().nullable().describe('Váha v hodnocení v procentech, pokud je uvedena.'),
  target: z.enum(['milestone', 'requirement']),
  requirement_type: z.enum(['assignment', 'test', 'presentation', 'exam', 'attendance', 'other']).nullable(),
  source_line: z.string(),
});

const ExtractionResult = z.object({ items: z.array(ExtractedItem) });

export type AiExtractionResult = z.infer<typeof ExtractionResult>;

interface AiParseBody {
  text?: unknown;
  mode?: unknown;
  academicYearStart?: unknown;
  today?: unknown;
}

function systemPrompt(mode: 'harmonogram' | 'syllabus', ayStart: number, today: string): string {
  return [
    'Z textu, který vložil student české vysoké školy, vytáhni všechny termíny.',
    mode === 'harmonogram'
      ? 'Text je harmonogram akademického roku fakulty (zápis, výuka, zkouškové, volné dny, mezní termíny).'
      : 'Text je sylabus, podmínky zakončení předmětu nebo stránka kurzu v Moodlu. Kromě termínů vrať i každou hodnocenou složku (test, seminární práce, prezentace, esej, docházka, zkouška) – i když nemá datum. Stejnou složku vrať jen jednou (s vahou i termínem, pokud jsou uvedené kdekoli v textu).',
    `Dnes je ${today}. Akademický rok je ${ayStart}/${ayStart + 1}: září až prosinec patří do roku ${ayStart}, leden až srpen do roku ${ayStart + 1}, pokud text neříká jinak. Rozsahy vždy běží dopředu v čase.`,
    'Pravidla pro pole:',
    '- start/end: ISO datum YYYY-MM-DD, s časem YYYY-MM-DDTHH:MM. Konec rozsahu je včetně.',
    '- category: semester | teaching (výuka) | exam-period (zkouškové) | enrollment (zápis, škrtání) | holiday (prázdniny, děkanský/rektorský den, svátek) | deadline (mezní termín, odevzdání) | assessment (test, zápočet, zkouška, prezentace) | event.',
    '- is_deadline: true pro „do <datum>“, „nejpozději“, „mezní termín“ a termíny odevzdání.',
    '- target: "requirement" pro hodnocené složky předmětu ze sylabu, jinak "milestone". requirement_type vyplň jen u requirement.',
    '- title: krátký český název (2–6 slov), např. „Seminární práce“, „Průběžný test“, „Skupinová prezentace“ – nikdy celá věta.',
    '- weight_percent: jen podíl složky na výsledné známce. Hranice jako „alespoň 60 %“, „vyšší než 50 %“ nebo „max. 20 % absencí“ nejsou váhy (null).',
    '- source_line: původní věta nebo řádek textu (u složek i s podmínkami, např. rozsah práce).',
    'Nevymýšlej položky, které v textu nejsou. Témata jednotlivých přednášek vynech, pokud nejde o test nebo odevzdání.',
  ].join('\n');
}

export type AiProvider = 'anthropic' | 'openai' | 'gemini';

/** Poskytovatel podle tvaru klíče: sk-ant-… Claude, AIza… Gemini, sk-… ChatGPT. */
export function providerForKey(key: string): AiProvider | null {
  const k = key.trim();
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('AIza')) return 'gemini';
  if (k.startsWith('sk-')) return 'openai';
  return null;
}

/** Je na serveru nastavená nějaká AI? */
export function serverAiProvider(): AiProvider | null {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return 'anthropic';
  if (process.env.OPENAI_API_KEY?.trim()) return 'openai';
  if (process.env.GEMINI_API_KEY?.trim()) return 'gemini';
  return null;
}

function resolveKey(request: Request): { provider: AiProvider; key: string } | null {
  const own = (request.headers.get('x-ai-key') ?? request.headers.get('x-anthropic-key') ?? '').trim();
  if (own) {
    const provider = providerForKey(own);
    if (!provider) throw new HttpError(400, 'unknown_ai_key', 'Tenhle klíč nepoznávám. Funguje klíč od Claude (sk-ant-…), ChatGPT (sk-…) nebo Gemini (AIza…).');
    return { provider, key: own };
  }
  const provider = serverAiProvider();
  if (!provider) return null;
  const env = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY';
  return { provider, key: process.env[env]!.trim() };
}

/** JSON Schema výstupu (pro OpenAI a Gemini; Claude používá zod přímo). */
const ITEM_PROPS = {
  title: { type: 'string' },
  category: { type: 'string', enum: ['semester', 'teaching', 'exam-period', 'enrollment', 'holiday', 'deadline', 'assessment', 'event'] },
  start: { type: ['string', 'null'] },
  end: { type: ['string', 'null'] },
  is_deadline: { type: 'boolean' },
  weight_percent: { type: ['number', 'null'] },
  target: { type: 'string', enum: ['milestone', 'requirement'] },
  requirement_type: { type: ['string', 'null'], enum: ['assignment', 'test', 'presentation', 'exam', 'attendance', 'other', null] },
  source_line: { type: 'string' },
} as const;
const REQUIRED = Object.keys(ITEM_PROPS);

async function callOpenAi(key: string, system: string, text: string): Promise<unknown> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(55_000),
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `<text>\n${text}\n</text>` },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'extraction',
          strict: true,
          schema: { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: REQUIRED, properties: ITEM_PROPS } } } },
        },
      },
    }),
  });
  if (response.status === 401) throw new HttpError(401, 'invalid_ai_key', 'ChatGPT (OpenAI) odmítlo klíč.');
  if (response.status === 429) throw new HttpError(429, 'ai_rate_limited', 'ChatGPT je teď přetížené nebo je vyčerpaný kredit.');
  if (!response.ok) throw new HttpError(502, 'ai_api_error', `Chyba ChatGPT (HTTP ${response.status}).`);
  const data = (await response.json()) as { choices?: { message?: { content?: string; refusal?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new HttpError(422, 'ai_refused', 'AI tento text nezpracovalo.');
  return JSON.parse(content);
}

/** Gemini má zjednodušené schéma (OpenAPI): nullable místo typu null. */
function geminiSchema() {
  const props: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(ITEM_PROPS)) {
    const v = raw as { type: string | readonly string[]; enum?: readonly (string | null)[] };
    const types: string[] = typeof v.type === 'string' ? [v.type] : [...v.type];
    const type = types.find((t) => t !== 'null')!.toUpperCase();
    const out: Record<string, unknown> = { type, nullable: types.includes('null') };
    if (v.enum) out.enum = v.enum.filter((x) => x !== null);
    props[k] = out;
  }
  return { type: 'OBJECT', properties: { items: { type: 'ARRAY', items: { type: 'OBJECT', properties: props, required: REQUIRED } } }, required: ['items'] };
}

async function callGemini(key: string, system: string, text: string): Promise<unknown> {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(55_000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: `<text>\n${text}\n</text>` }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: geminiSchema() },
    }),
  });
  if (response.status === 400 || response.status === 403) {
    const body = await response.text();
    if (/API key|PERMISSION/i.test(body)) throw new HttpError(401, 'invalid_ai_key', 'Gemini odmítlo klíč.');
    throw new HttpError(400, 'ai_bad_request', 'Gemini požadavek odmítlo.');
  }
  if (response.status === 429) throw new HttpError(429, 'ai_rate_limited', 'Gemini je teď přetížené nebo je vyčerpaný limit.');
  if (!response.ok) throw new HttpError(502, 'ai_api_error', `Chyba Gemini (HTTP ${response.status}).`);
  const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const content = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!content) throw new HttpError(422, 'ai_refused', 'AI tento text nezpracovalo.');
  return JSON.parse(content);
}

async function callClaude(key: string, system: string, text: string): Promise<{ items: AiExtractionResult['items']; model: string }> {
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 55_000 });
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(ExtractionResult) },
    system,
    messages: [{ role: 'user', content: `<text>\n${text}\n</text>` }],
  });
  if (response.stop_reason === 'refusal') throw new HttpError(422, 'ai_refused', 'AI tento text nezpracovalo. Použij výsledek lokálního parseru.');
  if (response.stop_reason === 'max_tokens') throw new HttpError(422, 'ai_truncated', 'Výstup AI byl příliš dlouhý – zkus vložit kratší část textu.');
  if (!response.parsed_output) throw new HttpError(502, 'ai_unparseable', 'AI vrátilo nečitelnou odpověď.');
  return { items: response.parsed_output.items, model: response.model };
}

export async function handleAiParse(request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  try {
    const resolved = resolveKey(request);
    if (!resolved) {
      throw new HttpError(401, 'missing_ai_key', 'AI není nastavená – vlož vlastní klíč (Claude, ChatGPT nebo Gemini). Lokální parser funguje i bez něj.');
    }
    const body = await readJsonBody<AiParseBody>(request, 120_000);
    if (typeof body.text !== 'string' || body.text.trim().length < 5) {
      throw new HttpError(400, 'missing_text', 'Vlož text harmonogramu nebo sylabu.');
    }
    if (body.text.length > MAX_TEXT_CHARS) {
      throw new HttpError(413, 'text_too_long', `Text je příliš dlouhý (max. ${MAX_TEXT_CHARS} znaků) – vlož jen část s termíny.`);
    }
    const mode = body.mode === 'syllabus' ? 'syllabus' : 'harmonogram';
    const ayStart = Number.isInteger(body.academicYearStart) ? Number(body.academicYearStart) : new Date().getFullYear();
    const today = typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
    const system = systemPrompt(mode, ayStart, today);

    if (resolved.provider === 'anthropic') {
      const out = await callClaude(resolved.key, system, body.text);
      return json({ ...out, provider: 'anthropic' });
    }
    const raw = resolved.provider === 'openai' ? await callOpenAi(resolved.key, system, body.text) : await callGemini(resolved.key, system, body.text);
    const parsed = ExtractionResult.safeParse(raw);
    if (!parsed.success) throw new HttpError(502, 'ai_unparseable', 'AI vrátilo odpověď v nečekaném tvaru.');
    return json({ items: parsed.data.items, provider: resolved.provider });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return json({ error: 'invalid_ai_key', message: 'Claude (Anthropic) odmítl klíč.' }, 401);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: 'ai_rate_limited', message: 'AI je teď přetížené nebo je vyčerpaný limit. Zkus to později.' }, 429);
    }
    if (error instanceof Anthropic.BadRequestError) {
      return json({ error: 'ai_bad_request', message: `Požadavek na AI byl odmítnut: ${error.message}` }, 400);
    }
    if (error instanceof Anthropic.APIError) {
      return json({ error: 'ai_api_error', message: `Chyba AI služby (${error.status ?? 'síť'}).` }, 502);
    }
    if (error instanceof SyntaxError) {
      return json({ error: 'ai_unparseable', message: 'AI vrátilo nečitelnou odpověď.' }, 502);
    }
    return errorResponse(error);
  }
}
