/** Jakou AI student zadal – pozná se podle tvaru klíče (stejně jako na serveru). */
export type AiProvider = 'anthropic' | 'openai' | 'gemini';

export const AI_NAMES: Record<AiProvider, string> = { anthropic: 'Claude', openai: 'ChatGPT', gemini: 'Gemini' };

/** Kdo čte texty, když student nemá vlastní klíč (podle serveru). */
export function serverAiLabel(provider: AiProvider | 'ovh' | null): string | null {
  if (!provider) return null;
  return provider === 'ovh' ? 'bezplatná AI (OVHcloud, servery v EU)' : `AI aplikace (${AI_NAMES[provider]})`;
}

export const AI_KEY_PAGES: Record<AiProvider, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/apikey',
};

export function providerForKey(key: string): AiProvider | null {
  const k = key.trim();
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('AIza')) return 'gemini';
  if (k.startsWith('sk-')) return 'openai';
  return null;
}
