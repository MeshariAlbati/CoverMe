function firstHeaderValue(value: string | null): string | null {
  if (!value) {
    return null
  }

  const first = value.split(',')[0]?.trim()
  return first || null
}

function toOrigin(value: string | undefined | null): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const withProtocol = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`

  try {
    return new URL(withProtocol).origin
  } catch {
    return null
  }
}

function getConfiguredSiteOrigin(): string | null {
  return (
    toOrigin(process.env.SITE_URL) ||
    toOrigin(process.env.NEXT_PUBLIC_SITE_URL) ||
    toOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    toOrigin(process.env.RAILWAY_PUBLIC_DOMAIN) ||
    toOrigin(process.env.RAILWAY_STATIC_URL)
  )
}

export function getBaseUrlForClient(): string {
  return getConfiguredSiteOrigin() || window.location.origin
}

export function getBaseUrlForRequest(request: Request): string {
  const configured = getConfiguredSiteOrigin()
  if (configured) {
    return configured
  }

  const forwardedHost = firstHeaderValue(request.headers.get('x-forwarded-host'))
  const host = forwardedHost || firstHeaderValue(request.headers.get('host'))
  const forwardedProto = firstHeaderValue(request.headers.get('x-forwarded-proto'))

  if (host) {
    const isLocalHost = host.startsWith('localhost') || host.startsWith('127.0.0.1')
    const protocol = forwardedProto || (isLocalHost ? 'http' : 'https')
    return `${protocol}://${host}`
  }

  return new URL(request.url).origin
}
