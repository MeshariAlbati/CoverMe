import { NextRequest, NextResponse } from 'next/server'
import { logError, logInfo, logWarn, maskEmail, serializeError } from '@/lib/server-logger'

type AuthEventBody = {
  event?: 'login_success' | 'login_error'
  email?: string
  userId?: string
  errorMessage?: string
}

function truncate(value: unknown, max = 300): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (!normalized) return null
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as AuthEventBody

    if (body.event !== 'login_success' && body.event !== 'login_error') {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
    }

    const context = {
      user_id: body.userId || null,
      email: maskEmail(body.email),
      error_message: truncate(body.errorMessage),
      user_agent: req.headers.get('user-agent') || null,
      path: req.nextUrl.pathname,
    }

    if (body.event === 'login_success') {
      logInfo('auth_login_success', context)
    } else {
      logWarn('auth_login_error', context)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    logError('auth_event_logging_failed', { error: serializeError(error) })
    return NextResponse.json({ error: 'Failed to log auth event' }, { status: 500 })
  }
}
