type GroqRole = 'system' | 'user' | 'assistant'

export interface GroqMessage {
  role: GroqRole
  content: string
}

type GroqApiErrorShape = {
  error?: {
    type?: string
    message?: string
  }
}

type GroqChatResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

type GroqFallbackOptions = {
  models?: string[]
  maxRateLimitRetries?: number
  retryBaseMs?: number
}

const DEFAULT_GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
]

function parseModelList(value?: string): string[] {
  return (value || '')
    .split(',')
    .map(model => model.trim())
    .filter(Boolean)
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function createGroqApiError(status: number, payload: GroqApiErrorShape, model: string): Error & { status: number, error: GroqApiErrorShape['error'] } {
  const message = payload.error?.message || `Groq request failed with status ${status} on model ${model}`
  const error = new Error(message) as Error & { status: number, error: GroqApiErrorShape['error'] }
  error.status = status
  error.error = payload.error
  return error
}

export function getGroqStageModels(singleEnvKey: string, listEnvKey: string): string[] {
  const singleModel = process.env[singleEnvKey]?.trim()
  const listedModels = parseModelList(process.env[listEnvKey])
  return unique([...(singleModel ? [singleModel] : []), ...listedModels])
}

export function getGroqModelCandidates(preferredModels: string[] = []): string[] {
  const singleModel = process.env.GROQ_MODEL?.trim()
  const listedModels = parseModelList(process.env.GROQ_MODELS)
  return unique([
    ...preferredModels,
    ...(singleModel ? [singleModel] : []),
    ...listedModels,
    ...DEFAULT_GROQ_MODELS,
  ])
}

export function isGroqModelNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const shaped = error as { status?: number, error?: GroqApiErrorShape['error'] }
  const type = shaped.error?.type?.toLowerCase() || ''
  const apiMessage = shaped.error?.message?.toLowerCase() || ''
  const message = error instanceof Error ? error.message.toLowerCase() : ''

  return (
    shaped.status === 404 ||
    type.includes('not_found') ||
    (apiMessage.includes('model') && apiMessage.includes('found')) ||
    (message.includes('model') && message.includes('found'))
  )
}

export function isGroqRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const shaped = error as { status?: number, error?: GroqApiErrorShape['error'] }
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

export async function chatWithGroq(
  messages: GroqMessage[],
  maxTokens: number,
  options: GroqFallbackOptions = {}
): Promise<{ text: string, model: string }> {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set')
  }

  const models = getGroqModelCandidates(options.models || [])
  const maxRateLimitRetries = Number(process.env.GROQ_RATE_LIMIT_RETRIES || options.maxRateLimitRetries || 2)
  const retryBaseMs = Number(process.env.GROQ_RETRY_BASE_MS || options.retryBaseMs || 1200)
  let lastError: unknown

  for (const model of models) {
    let attempt = 0

    while (attempt <= maxRateLimitRetries) {
      let response: Response
      try {
        response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            temperature: 0.2,
          }),
        })
      } catch (error) {
        throw new Error(`Failed to reach Groq API: ${error instanceof Error ? error.message : 'Unknown network error'}`)
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as GroqApiErrorShape
        const apiError = createGroqApiError(response.status, payload, model)
        lastError = apiError

        if (isGroqModelNotFoundError(apiError)) {
          break
        }

        if (isGroqRateLimitError(apiError)) {
          if (attempt < maxRateLimitRetries) {
            const delay = retryBaseMs * 2 ** attempt
            await sleep(delay)
            attempt += 1
            continue
          }

          break
        }

        throw apiError
      }

      const json = await response.json() as GroqChatResponse
      const text = json.choices?.[0]?.message?.content
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error(`Groq response did not include text output for model ${model}`)
      }

      return { text, model }
    }
  }

  throw (lastError || new Error('No usable Groq model found. Set GROQ_MODEL to an accessible model.'))
}
