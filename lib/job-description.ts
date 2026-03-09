import dns from 'node:dns/promises'
import net from 'node:net'

const JOB_SECTION_CUE = /(requirements|qualifications|responsibilities|about\s+the\s+role|what\s+you\'ll\s+do|what\s+you\s+will\s+do|must\s+have|nice\s+to\s+have|preferred|experience\s+with|you\s+will)/i
const AUTH_WALL_CUES = [
  /join or sign in/i,
  /by clicking continue/i,
  /user agreement/i,
  /privacy policy/i,
  /cookie policy/i,
  /this button displays the currently selected search type/i,
  /new to linkedin/i,
  /forgot password/i,
  /sign in to view/i,
]
const UI_NOISE_CUES = [
  /user agreement/i,
  /privacy policy/i,
  /cookie policy/i,
  /join now/i,
  /sign in/i,
  /by clicking continue/i,
  /this button displays the currently selected search type/i,
]

function isLinkedInHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  return lower === 'linkedin.com' || lower.endsWith('.linkedin.com')
}

function hasRequirementSignals(text: string): boolean {
  if (JOB_SECTION_CUE.test(text)) return true
  return /\b(requirements?|responsibilities|qualifications?|must\s+have|nice\s+to\s+have|preferred|skills?|experience\s+with)\b/i.test(text)
}

function isLikelyUiNoiseLine(line: string): boolean {
  if (line.length > 220) return false
  return UI_NOISE_CUES.some(pattern => pattern.test(line))
}

function isLikelyAuthWall(text: string): boolean {
  const normalized = text.toLowerCase()
  let matches = 0
  for (const cue of AUTH_WALL_CUES) {
    if (cue.test(normalized)) matches++
  }
  return matches >= 2
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
}

function normalizeJobText(raw: string): string {
  const decoded = decodeHtmlEntities(raw)
  const stripped = stripTags(decoded)

  const lines = stripped
    .split(/\n+/)
    .map(line => normalizeWhitespace(line))
    .filter(Boolean)
    .filter(line => line.length >= 18)
    .filter(line => !isLikelyUiNoiseLine(line))

  if (lines.length === 0) return ''

  const highlighted: string[] = []
  for (const line of lines) {
    if (JOB_SECTION_CUE.test(line)) {
      highlighted.push(line)
      continue
    }

    if (/^[\-\u2022]/.test(line) && line.length > 24) {
      highlighted.push(line)
      continue
    }

    if (line.length >= 45 && line.length <= 240) {
      highlighted.push(line)
    }
  }

  const picked = (highlighted.length > 0 ? highlighted : lines).slice(0, 220)
  return normalizeWhitespace(picked.join('\n'))
}

function extractLinkedInJobId(url: URL): string | null {
  const pathMatch = url.pathname.match(/\/jobs\/view\/(\d+)/i)
  if (pathMatch?.[1]) return pathMatch[1]

  const searchJobId = url.searchParams.get('currentJobId')
  if (searchJobId && /^\d+$/.test(searchJobId)) return searchJobId

  return null
}

function getExtractionFailureReason(extracted: string, raw: string, hostname: string): string | null {
  const hasRequirements = hasRequirementSignals(extracted)
  if (hasRequirements) return null

  const sampledRaw = raw.slice(0, 15000)
  if (isLikelyAuthWall(`${sampledRaw}\n${extracted}`)) {
    return 'auth_wall_or_blocked'
  }

  if (isLinkedInHost(hostname)) {
    return 'linkedin_no_requirements'
  }

  if (extracted.length < 700) {
    return 'weak_requirements_signal'
  }

  return null
}

function isPrivateIp(ip: string): boolean {
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 10) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    return false
  }

  if (net.isIP(ip) === 6) {
    const lower = ip.toLowerCase()
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')
  }

  return true
}

async function isPublicHostname(hostname: string): Promise<boolean> {
  const lower = hostname.toLowerCase()
  if (
    lower === 'localhost' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.localhost')
  ) {
    return false
  }

  if (net.isIP(hostname)) {
    return !isPrivateIp(hostname)
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true })
    if (!addresses.length) return false
    return addresses.every(addr => !isPrivateIp(addr.address))
  } catch {
    return false
  }
}

export interface JobDescriptionFetchResult {
  jobDescription: string | null
  source: 'scraped' | null
  reason?: string
}

async function fetchWithSafeRedirects(startUrl: URL, signal: AbortSignal): Promise<Response> {
  let currentUrl = startUrl

  for (let i = 0; i < 4; i++) {
    const response = await fetch(currentUrl.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: {
        'User-Agent': 'CoverMeBot/1.0 (+https://coverme.local)',
        Accept: 'text/html,text/plain;q=0.9,*/*;q=0.2',
      },
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) {
        return response
      }

      let nextUrl: URL
      try {
        nextUrl = new URL(location, currentUrl)
      } catch {
        throw new Error('invalid_redirect_url')
      }

      if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
        throw new Error('invalid_redirect_protocol')
      }

      const safeRedirectHost = await isPublicHostname(nextUrl.hostname)
      if (!safeRedirectHost) {
        throw new Error('unsafe_redirect_host')
      }

      currentUrl = nextUrl
      continue
    }

    return response
  }

  throw new Error('too_many_redirects')
}

async function tryLinkedInGuestJobPosting(url: URL, signal: AbortSignal): Promise<JobDescriptionFetchResult> {
  if (!isLinkedInHost(url.hostname)) {
    return { jobDescription: null, source: null, reason: 'not_linkedin' }
  }

  const jobId = extractLinkedInJobId(url)
  if (!jobId) {
    return { jobDescription: null, source: null, reason: 'linkedin_job_id_missing' }
  }

  const guestEndpoint = new URL(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`)
  const response = await fetchWithSafeRedirects(guestEndpoint, signal)
  if (!response.ok) {
    return { jobDescription: null, source: null, reason: `linkedin_guest_http_${response.status}` }
  }

  const raw = await response.text()
  if (!raw.trim()) {
    return { jobDescription: null, source: null, reason: 'linkedin_guest_empty' }
  }

  const extracted = normalizeJobText(raw)
  if (extracted.length < 220) {
    return { jobDescription: null, source: null, reason: 'linkedin_guest_not_enough_text' }
  }

  const failureReason = getExtractionFailureReason(extracted, raw, 'linkedin.com')
  if (failureReason) {
    return { jobDescription: null, source: null, reason: failureReason }
  }

  return {
    jobDescription: extracted.slice(0, 20000),
    source: 'scraped',
  }
}

export async function fetchJobDescriptionFromUrl(url: string): Promise<JobDescriptionFetchResult> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { jobDescription: null, source: null, reason: 'invalid_url' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { jobDescription: null, source: null, reason: 'invalid_protocol' }
  }

  const safeHost = await isPublicHostname(parsed.hostname)
  if (!safeHost) {
    return { jobDescription: null, source: null, reason: 'unsafe_host' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 9000)

  try {
    if (isLinkedInHost(parsed.hostname)) {
      const guestResult = await tryLinkedInGuestJobPosting(parsed, controller.signal)
      if (guestResult.jobDescription) {
        return guestResult
      }
    }

    const response = await fetchWithSafeRedirects(parsed, controller.signal)

    if (!response.ok) {
      return { jobDescription: null, source: null, reason: `http_${response.status}` }
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return { jobDescription: null, source: null, reason: 'unsupported_content_type' }
    }

    const raw = await response.text()
    if (!raw.trim()) {
      return { jobDescription: null, source: null, reason: 'empty_response' }
    }

    const extracted = normalizeJobText(raw)
    if (extracted.length < 220) {
      return { jobDescription: null, source: null, reason: 'not_enough_job_text' }
    }

    const failureReason = getExtractionFailureReason(extracted, raw, parsed.hostname)
    if (failureReason) {
      return { jobDescription: null, source: null, reason: failureReason }
    }

    return {
      jobDescription: extracted.slice(0, 20000),
      source: 'scraped',
    }
  } catch (error) {
    if (error instanceof Error && error.message) {
      return { jobDescription: null, source: null, reason: error.message }
    }
    return { jobDescription: null, source: null, reason: 'fetch_failed' }
  } finally {
    clearTimeout(timeout)
  }
}
