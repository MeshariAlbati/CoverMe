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

export function getAnthropicModelCandidates(): string[] {
  const singleModel = process.env.ANTHROPIC_MODEL?.trim()
  const listedModels = (process.env.ANTHROPIC_MODELS || '')
    .split(',')
    .map(model => model.trim())
    .filter(Boolean)

  const combined = [
    ...(singleModel ? [singleModel] : []),
    ...listedModels,
    ...DEFAULT_ANTHROPIC_MODELS,
  ]

  return [...new Set(combined)]
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

export async function withAnthropicModelFallback<T>(
  runner: (model: string) => Promise<T>
): Promise<T> {
  const models = getAnthropicModelCandidates()
  let lastError: unknown

  for (const model of models) {
    try {
      return await runner(model)
    } catch (error) {
      lastError = error

      if (!isAnthropicModelNotFoundError(error)) {
        throw error
      }
    }
  }

  throw (
    lastError ||
    new Error('No usable Anthropic model found. Set ANTHROPIC_MODEL in your environment.')
  )
}
