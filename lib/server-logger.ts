import 'server-only'

type LogLevel = 'info' | 'warn' | 'error'
type LogContext = Record<string, unknown>

function sanitizeContext(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined)
  )
}

function safeStringify(payload: LogContext): string {
  try {
    return JSON.stringify(payload)
  } catch {
    return JSON.stringify({
      level: payload.level,
      event: payload.event,
      timestamp: payload.timestamp,
      message: 'Failed to stringify log payload',
    })
  }
}

function writeLog(level: LogLevel, event: string, context: LogContext = {}) {
  const payload = sanitizeContext({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  })

  const line = safeStringify(payload)

  if (level === 'error') {
    console.error(line)
    return
  }

  if (level === 'warn') {
    console.warn(line)
    return
  }

  console.info(line)
}

export function serializeError(error: unknown): LogContext {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: string, status?: number }
    return sanitizeContext({
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: withCode.code,
      status: withCode.status,
    })
  }

  if (typeof error === 'object' && error !== null) {
    return sanitizeContext({ error })
  }

  return { error: String(error) }
}

export function maskEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim().toLowerCase()
  const atIndex = trimmed.indexOf('@')
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return null
  }

  const local = trimmed.slice(0, atIndex)
  const domain = trimmed.slice(atIndex + 1)
  const maskedLocal =
    local.length <= 2 ? `${local[0]}*` : `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}`

  return `${maskedLocal}@${domain}`
}

export function logInfo(event: string, context?: LogContext) {
  writeLog('info', event, context)
}

export function logWarn(event: string, context?: LogContext) {
  writeLog('warn', event, context)
}

export function logError(event: string, context?: LogContext) {
  writeLog('error', event, context)
}
