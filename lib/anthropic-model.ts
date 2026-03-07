import { logError, logWarn, serializeError } from '@/lib/server-logger'

const DEFAULT_ANTHROPIC_MODELS = [
  'claude-sonnet-4-6',
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-latest',
  'claude-3-5-sonnet-latest',
]

type AnthropicErrorShape = {
  status?: number
  error?: {
    type?: string
    message?: string
  }
}

type AnthropicFallbackOptions = {
  models?: string[]
  maxRateLimitRetries?: number
  retryBaseMs?: number
  label?: string
}

function parseModelList(value?: string): string[] {
  return (value || '')
    .split(',')
    .map(model => model.trim())
    .filter(Boolean)
}

function unique(items: string[]): string[] {
  return [...new Set(items)]
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function getStageAnthropicModels(singleEnvKey: string, listEnvKey: string): string[] {
  const singleModel = process.env[singleEnvKey]?.trim()
  const listedModels = parseModelList(process.env[listEnvKey])
  return unique([...(singleModel ? [singleModel] : []), ...listedModels])
}

export function getAnthropicModelCandidates(preferredModels: string[] = []): string[] {
  const singleModel = process.env.ANTHROPIC_MODEL?.trim()
  const listedModels = parseModelList(process.env.ANTHROPIC_MODELS)

  const combined = [
    ...preferredModels,
    ...(singleModel ? [singleModel] : []),
    ...listedModels,
    ...DEFAULT_ANTHROPIC_MODELS,
  ]

  return unique(combined)
}

export function isAnthropicModelNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const shaped = error as AnthropicErrorShape
  if (shaped.status !== 404) {
    return false
  }

  const type = shaped.error?.type?.toLowerCase() || ''
  const apiMessage = shaped.error?.message?.toLowerCase() || ''
  const message = error instanceof Error ? error.message.toLowerCase() : ''

  return (
    type.includes('not_found') ||
    apiMessage.includes('model') ||
    message.includes('model')
  )
}

export function isAnthropicRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const shaped = error as AnthropicErrorShape
  const type = shaped.error?.type?.toLowerCase() || ''
  const apiMessage = shaped.error?.message?.toLowerCase() || ''
  const message = error instanceof Error ? error.message.toLowerCase() : ''

  return (
    shaped.status === 429 ||
    type.includes('rate_limit') ||
    apiMessage.includes('rate limit') ||
    message.includes('rate limit')
  )
}

export async function withAnthropicModelFallback<T>(
  runner: (model: string) => Promise<T>,
  options: AnthropicFallbackOptions = {}
): Promise<T> {
  const label = options.label || 'anthropic_request'
  const models = getAnthropicModelCandidates(options.models || [])
  const maxRateLimitRetries = Number(process.env.ANTHROPIC_RATE_LIMIT_RETRIES || options.maxRateLimitRetries || 2)
  const retryBaseMs = Number(process.env.ANTHROPIC_RETRY_BASE_MS || options.retryBaseMs || 1500)
  let lastError: unknown

  for (const model of models) {
    let attempt = 0

    while (attempt <= maxRateLimitRetries) {
      try {
        return await runner(model)
      } catch (error) {
        lastError = error

        if (isAnthropicModelNotFoundError(error)) {
          logWarn('llm_anthropic_model_unavailable', {
            label,
            model,
            error: serializeError(error),
          })
          break
        }

        if (isAnthropicRateLimitError(error)) {
          logWarn('llm_anthropic_rate_limited', {
            label,
            model,
            attempt,
            max_retries: maxRateLimitRetries,
            error: serializeError(error),
          })
          if (attempt < maxRateLimitRetries) {
            const delay = retryBaseMs * 2 ** attempt
            await sleep(delay)
            attempt += 1
            continue
          }

          break
        }

        logError('llm_anthropic_unhandled_error', {
          label,
          model,
          attempt,
          error: serializeError(error),
        })
        throw error
      }
    }
  }

  logError('llm_anthropic_all_models_failed', {
    label,
    models_tried: models,
    error: serializeError(lastError),
  })
  throw (
    lastError ||
    new Error('No usable Anthropic model found. Set ANTHROPIC_MODEL in your environment.')
  )
}
