import { describe, test, expect } from 'vitest';
import { resolveAssistantConfig } from './config';

describe('resolveAssistantConfig() — pick the (free, open-source) model host', () => {
  test('defaults to Groq + gpt-oss-20b when nothing is set', () => {
    const c = resolveAssistantConfig({});
    expect(c.baseUrl).toBe('https://api.groq.com/openai/v1');
    expect(c.model).toBe('openai/gpt-oss-20b');
    expect(c.apiKey).toBe('');
    expect(c.configured).toBe(false);
  });

  test('GROQ_API_KEY alone is enough (configured=true)', () => {
    const c = resolveAssistantConfig({ GROQ_API_KEY: 'gsk_test' });
    expect(c.apiKey).toBe('gsk_test');
    expect(c.configured).toBe(true);
  });

  test('explicit ASSISTANT_* env overrides the defaults', () => {
    const c = resolveAssistantConfig({
      ASSISTANT_BASE_URL: 'https://openrouter.ai/api/v1',
      ASSISTANT_API_KEY: 'or_key',
      ASSISTANT_MODEL: 'meta-llama/llama-4-scout',
    });
    expect(c.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(c.apiKey).toBe('or_key');
    expect(c.model).toBe('meta-llama/llama-4-scout');
    expect(c.configured).toBe(true);
  });

  test('ASSISTANT_API_KEY takes precedence over GROQ_API_KEY', () => {
    expect(resolveAssistantConfig({ ASSISTANT_API_KEY: 'a', GROQ_API_KEY: 'b' }).apiKey).toBe('a');
  });

  test('a trailing slash on the base URL is trimmed', () => {
    expect(resolveAssistantConfig({ ASSISTANT_BASE_URL: 'https://host/v1/' }).baseUrl).toBe('https://host/v1');
  });

  test('provides a default fallback model chain that excludes the primary', () => {
    const c = resolveAssistantConfig({});
    expect(c.fallbackModels.length).toBeGreaterThan(0);
    expect(c.fallbackModels).not.toContain(c.model);
  });

  test('the primary is never duplicated in the fallback chain', () => {
    const c = resolveAssistantConfig({
      ASSISTANT_MODEL: 'llama-3.3-70b-versatile',
      ASSISTANT_FALLBACK_MODELS: 'llama-3.3-70b-versatile, openai/gpt-oss-120b',
    });
    expect(c.fallbackModels).toEqual(['openai/gpt-oss-120b']);
  });

  test('ASSISTANT_FALLBACK_MODELS="" disables fallbacks', () => {
    expect(resolveAssistantConfig({ ASSISTANT_FALLBACK_MODELS: '' }).fallbackModels).toEqual([]);
  });
});
