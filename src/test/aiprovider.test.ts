import { describe, expect, it } from 'vitest';
import { providerForKey } from '../lib/aiProvider';
import { providerForKey as serverProvider } from '../../server/aiParse';

describe('poskytovatel AI podle klíče', () => {
  it('Claude, ChatGPT, Gemini – stejně v aplikaci i na serveru', () => {
    for (const fn of [providerForKey, serverProvider]) {
      expect(fn('sk-ant-api03-abc')).toBe('anthropic');
      expect(fn('sk-proj-abc')).toBe('openai');
      expect(fn('AIzaSyabc')).toBe('gemini');
      expect(fn('nesmysl')).toBeNull();
    }
  });
});
