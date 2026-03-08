import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logError, logInfo, logWarn, serializeError } from '@/lib/server-logger'
import { getBaseUrlForRequest } from '@/lib/site-url'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const origin = getBaseUrlForRequest(request)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (!code) {
    logWarn('auth_callback_missing_code', { next })
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      logInfo('auth_callback_success', {
        user_id: data?.user?.id || null,
        next,
      })
      return NextResponse.redirect(`${origin}${next}`)
    }

    logWarn('auth_callback_exchange_failed', {
      next,
      error_message: error.message,
      error_status: error.status || null,
    })
  } catch (error) {
    logError('auth_callback_unexpected_error', {
      next,
      error: serializeError(error),
    })
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
