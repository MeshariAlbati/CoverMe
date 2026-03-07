function stripThinkingBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

function extractFromCodeFence(text: string): string | null {
  const fencedBlocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
  for (const block of fencedBlocks) {
    const candidate = block[1]?.trim()
    if (candidate) {
      return candidate
    }
  }
  return null
}

function extractBalancedJson(text: string): string | null {
  const firstObject = text.indexOf('{')
  const firstArray = text.indexOf('[')
  const start =
    firstObject === -1
      ? firstArray
      : firstArray === -1
        ? firstObject
        : Math.min(firstObject, firstArray)

  if (start === -1) {
    return null
  }

  const stack: string[] = []
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '{') {
      stack.push('}')
      continue
    }
    if (ch === '[') {
      stack.push(']')
      continue
    }

    if (stack.length > 0 && ch === stack[stack.length - 1]) {
      stack.pop()
      if (stack.length === 0) {
        return text.slice(start, i + 1).trim()
      }
    }
  }

  return null
}

export function extractJsonFromModelText(text: string): string {
  const cleaned = stripThinkingBlocks(String(text || '').trim())
  if (!cleaned) {
    throw new Error('Model response was empty')
  }

  const directCandidate = cleaned
  try {
    JSON.parse(directCandidate)
    return directCandidate
  } catch {
    // continue to fallback extraction paths
  }

  const fencedCandidate = extractFromCodeFence(cleaned)
  if (fencedCandidate) {
    try {
      JSON.parse(fencedCandidate)
      return fencedCandidate
    } catch {
      // continue to fallback extraction paths
    }
  }

  const balancedCandidate = extractBalancedJson(cleaned)
  if (balancedCandidate) {
    try {
      JSON.parse(balancedCandidate)
      return balancedCandidate
    } catch {
      // fall through to final error
    }
  }

  throw new Error('Could not extract valid JSON from model response')
}

export function parseJsonFromModelText<T = unknown>(text: string): T {
  return JSON.parse(extractJsonFromModelText(text)) as T
}
