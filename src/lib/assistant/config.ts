export interface AssistantConfig {
  /** OpenAI-compatible base URL (e.g. Groq, OpenRouter, Together, local Ollama). */
  baseUrl: string;
  apiKey: string;
  /** Open-source model id, e.g. openai/gpt-oss-20b or meta-llama/llama-4-scout. */
  model: string;
  /**
   * Ordered fallback models tried (after the primary) when a request fails with a
   * transient/5xx/429 error — so a momentary Groq hiccup on one model degrades to
   * another instead of erroring the member. Excludes the primary; never empty by
   * default. Override with ASSISTANT_FALLBACK_MODELS (comma-separated, "" disables).
   */
  fallbackModels: string[];
  configured: boolean;
}

/** Default fallback chain — both are reliable tool-calling models on Groq's free tier. */
const DEFAULT_FALLBACKS = 'llama-3.3-70b-versatile,openai/gpt-oss-120b';

/**
 * Resolve the assistant's LLM host. Defaults to Groq's free tier running the
 * open-weight gpt-oss-20b, but any OpenAI-compatible endpoint works by setting
 * ASSISTANT_BASE_URL / ASSISTANT_API_KEY / ASSISTANT_MODEL (GROQ_API_KEY is also
 * accepted as the key). Pure: takes env in, so it is unit-tested.
 */
export function resolveAssistantConfig(env: Record<string, string | undefined>): AssistantConfig {
  const baseUrl = (env.ASSISTANT_BASE_URL || 'https://api.groq.com/openai/v1').trim().replace(/\/+$/, '');
  const apiKey = (env.ASSISTANT_API_KEY || env.GROQ_API_KEY || '').trim();
  const model = (env.ASSISTANT_MODEL || 'openai/gpt-oss-20b').trim();
  const fallbackRaw = env.ASSISTANT_FALLBACK_MODELS ?? DEFAULT_FALLBACKS;
  const fallbackModels = fallbackRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((m) => m !== model); // never list the primary twice
  return { baseUrl, apiKey, model, fallbackModels, configured: apiKey.length > 0 };
}
