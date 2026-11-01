/**
 * Volitelné AI vylepšení parseru harmonogramu a sylabů (Claude API).
 * Klíč: hlavička `x-anthropic-key` nebo env `ANTHROPIC_API_KEY`.
 * Výstup je strukturovaný JSON validovaný schématem (structured outputs).
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { HttpError, errorResponse, json, methodNotAllowed, pickKey, readJsonBody } from './http.js';

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
      : 'Text je sylabus nebo podmínky zakončení předmětu. Kromě termínů vrať i každou hodnocenou složku (test, seminární práce, prezentace, zkouška) – i když nemá datum.',
    `Dnes je ${today}. Akademický rok je ${ayStart}/${ayStart + 1}: září až prosinec patří do roku ${ayStart}, leden až srpen do roku ${ayStart + 1}, pokud text neříká jinak. Rozsahy vždy běží dopředu v čase.`,
    'Pravidla pro pole:',
    '- start/end: ISO datum YYYY-MM-DD, s časem YYYY-MM-DDTHH:MM. Konec rozsahu je včetně.',
    '- category: semester | teaching (výuka) | exam-period (zkouškové) | enrollment (zápis, škrtání) | holiday (prázdniny, děkanský/rektorský den, svátek) | deadline (mezní termín, odevzdání) | assessment (test, zápočet, zkouška, prezentace) | event.',
    '- is_deadline: true pro „do <datum>“, „nejpozději“, „mezní termín“ a termíny odevzdání.',
    '- target: "requirement" pro hodnocené složky předmětu ze sylabu, jinak "milestone". requirement_type vyplň jen u requirement.',
    '- source_line: původní řádek textu.',
    'Nevymýšlej položky, které v textu nejsou. Témata jednotlivých přednášek vynech, pokud nejde o test nebo odevzdání.',
  ].join('\n');
}

export async function handleAiParse(request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  try {
    const apiKey = pickKey(request, 'x-anthropic-key', 'ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new HttpError(401, 'missing_anthropic_key', 'AI parser není nastavený (chybí ANTHROPIC_API_KEY). Lokální parser funguje i bez něj.');
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

    const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 55_000 });
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(ExtractionResult) },
      system: systemPrompt(mode, ayStart, today),
      messages: [{ role: 'user', content: `<text>\n${body.text}\n</text>` }],
    });

    if (response.stop_reason === 'refusal') {
      throw new HttpError(422, 'ai_refused', 'AI tento text nezpracovalo. Použij výsledek lokálního parseru.');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new HttpError(422, 'ai_truncated', 'Výstup AI byl příliš dlouhý – zkus vložit kratší část textu.');
    }
    const parsed = response.parsed_output;
    if (!parsed) throw new HttpError(502, 'ai_unparseable', 'AI vrátilo nečitelnou odpověď.');
    return json({ items: parsed.items, model: response.model });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return json({ error: 'invalid_anthropic_key', message: 'Anthropic API odmítlo klíč.' }, 401);
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
    return errorResponse(error);
  }
}
