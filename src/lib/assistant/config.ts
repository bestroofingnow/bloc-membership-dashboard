export interface AssistantConfig {
  /** OpenAI-compatible base URL (e.g. Groq, OpenRouter, Together, local Ollama). */
  baseUrl: string;
  apiKey: string;
  /** Open-source model id, e.g. openai/gpt-oss-20b or meta-llama/llama-4-scout. */
  model: string;
  configured: boolean;
}

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
  return { baseUrl, apiKey, model, configured: apiKey.length > 0 };
}
