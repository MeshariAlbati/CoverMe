type ParsedEvent = {
  event: string
  data: unknown
}

function parseEventBlock(rawEvent: string): ParsedEvent | null {
  const lines = rawEvent.split('\n')
  let eventType = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trimEnd()
    if (!trimmed || trimmed.startsWith(':')) continue

    if (trimmed.startsWith('event:')) {
      eventType = trimmed.slice('event:'.length).trim()
      continue
    }

    if (trimmed.startsWith('data:')) {
      dataLines.push(trimmed.slice('data:'.length).trimStart())
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  const rawData = dataLines.join('\n')
  try {
    return { event: eventType, data: JSON.parse(rawData) }
  } catch {
    return { event: eventType, data: rawData }
  }
}

function getErrorMessage(data: unknown): string {
  if (typeof data === 'string' && data.trim()) {
    return data
  }

  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }

  return 'Generation failed'
}

export async function consumeSSE(
  response: Response,
  onEvent: (eventType: string, data: unknown) => void
): Promise<void> {
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || 'Generation failed')
  }

  if (!response.body) {
    throw new Error('Empty response body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done }).replace(/\r\n/g, '\n')

    let separatorIndex = buffer.indexOf('\n\n')
    while (separatorIndex !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)

      const parsed = parseEventBlock(rawEvent)
      if (parsed) {
        if (parsed.event === 'error') {
          throw new Error(getErrorMessage(parsed.data))
        }
        onEvent(parsed.event, parsed.data)
      }

      separatorIndex = buffer.indexOf('\n\n')
    }

    if (done) break
  }

  if (buffer.trim()) {
    const parsed = parseEventBlock(buffer)
    if (parsed) {
      if (parsed.event === 'error') {
        throw new Error(getErrorMessage(parsed.data))
      }
      onEvent(parsed.event, parsed.data)
    }
  }
}
