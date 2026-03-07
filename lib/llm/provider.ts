import type { LLMProvider } from '@/types'

const SUPPORTED_PROVIDERS: LLMProvider[] = ['claude', 'groq']

export function resolveLlmProvider(input?: unknown): LLMProvider {
  const normalizedInput = typeof input === 'string' ? input.trim().toLowerCase() : ''
  if (SUPPORTED_PROVIDERS.includes(normalizedInput as LLMProvider)) {
    return normalizedInput as LLMProvider
  }

  const envProvider = (process.env.LLM_PROVIDER || process.env.DEFAULT_LLM_PROVIDER || 'claude')
    .trim()
    .toLowerCase()

  if (SUPPORTED_PROVIDERS.includes(envProvider as LLMProvider)) {
    return envProvider as LLMProvider
  }

  return 'claude'
}

export function isSupportedLlmProvider(input: unknown): input is LLMProvider {
  return typeof input === 'string' && SUPPORTED_PROVIDERS.includes(input as LLMProvider)
}
