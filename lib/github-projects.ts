import 'server-only'

import { logError, logWarn, serializeError } from '@/lib/server-logger'

type GithubRepo = {
  name: string
  full_name: string
  description: string | null
  html_url: string
  language: string | null
  stargazers_count: number
  fork: boolean
  archived: boolean
  disabled: boolean
  pushed_at: string
}

export type GithubProject = {
  name: string
  description: string
  url: string | null
  language: string | null
  stars: number
}

type GithubProjectHighlights = {
  username: string
  highlights: string[]
}

type GithubProjectsContext = {
  username: string
  projects: GithubProject[]
}

const RESERVED_PROFILE_SEGMENTS = new Set([
  'features',
  'topics',
  'orgs',
  'users',
  'marketplace',
  'settings',
  'login',
  'signup',
  'explore',
  'notifications',
  'new',
])

const MAX_REPOS_TO_IMPORT = 8
const README_FETCH_TIMEOUT_MS = 3500
const DOC_SECTION_HINTS = /(table of contents|license|installation|usage|contributing|setup|changelog|roadmap|faq|references|credits)/i
const PROJECT_DESCRIPTION_HINTS = /(build|built|builds|create|creates|develop|developed|generate|generates|extract|extracts|analyz|automate|orchestrate|platform|application|service|api|pipeline|tool|dashboard|library)/i
const STACK_SECTION_HINTS = /(tech stack|stack|frontend|backend|database|devops|infrastructure|deployment|tooling|framework|library|dependencies|architecture)/i
const PURPOSE_VERB_HINTS = /(build|built|create|created|develop|developed|generate|generated|extract|extracted|automate|automated|orchestrate|orchestrated|manage|managed|track|tracked|analyz|optimiz|improv|support|supported|enable|enabled|allow|allowed|help|helped|deliver|delivered)/i

const TECH_KEYWORDS = [
  'react',
  'next',
  'vue',
  'angular',
  'svelte',
  'typescript',
  'javascript',
  'node',
  'express',
  'nestjs',
  'python',
  'django',
  'flask',
  'fastapi',
  'java',
  'spring',
  'go',
  'golang',
  'rust',
  'postgres',
  'mysql',
  'mongodb',
  'redis',
  'docker',
  'kubernetes',
  'tailwind',
  'vite',
  'webpack',
  'graphql',
  'prisma',
  'supabase',
  'firebase',
  'aws',
  'azure',
  'gcp',
  'vercel',
  'netlify',
  'jest',
  'vitest',
  'playwright',
  'cypress',
]

function trimText(value: string | null | undefined, max = 120): string {
  if (!value) return ''
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized
}

export function getGithubUsernameFromUrl(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw) return null

  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase()
  if (host !== 'github.com' && host !== 'www.github.com') {
    return null
  }

  const segment = url.pathname.split('/').filter(Boolean)[0]
  if (!segment) return null

  const username = segment.replace(/^@/, '')
  if (!username) return null
  if (RESERVED_PROFILE_SEGMENTS.has(username.toLowerCase())) return null

  const isValidGithubUsername = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(username)
  return isValidGithubUsername ? username : null
}

function formatProjectHighlight(project: GithubProject): string {
  const name = trimText(project.name, 64)
  const description = trimText(project.description, 110)
  const language = trimText(project.language, 28)
  const stars = Number.isFinite(project.stars) ? project.stars : 0

  const parts = [`${name}`]
  if (language) parts.push(`Stack: ${language}`)
  if (description) parts.push(description)
  if (stars > 0) parts.push(`Stars: ${stars}`)

  return parts.join(' | ')
}

function sortRepos(repos: GithubRepo[]): GithubRepo[] {
  return [...repos].sort((a, b) => {
    if (b.stargazers_count !== a.stargazers_count) {
      return b.stargazers_count - a.stargazers_count
    }

    const aPushed = Date.parse(a.pushed_at || '')
    const bPushed = Date.parse(b.pushed_at || '')
    return (Number.isNaN(bPushed) ? 0 : bPushed) - (Number.isNaN(aPushed) ? 0 : aPushed)
  })
}

function splitOwnerAndRepo(fullName: string, fallbackOwner: string, fallbackRepo: string): { owner: string, repo: string } {
  const segments = fullName.split('/').filter(Boolean)
  if (segments.length >= 2) {
    return { owner: segments[0], repo: segments[1] }
  }

  return { owner: fallbackOwner, repo: fallbackRepo }
}

function stripMarkdown(input: string): string {
  return input
    .replace(/^#{1,6}\s+.*$/gm, ' ')
    .replace(/^\s*[-*]\s+\[[ xX]\]\s+.*$/gm, ' ')
    .replace(/^\s*[-*]\s+!\[[^\]]*]\([^)]*\)\s*$/gm, ' ')
    .replace(/^\s*!\[[^\]]*]\([^)]*\)\s*$/gm, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`{3}[\s\S]*$/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isHeadingLikeParagraph(paragraph: string): boolean {
  const normalized = paragraph.trim()
  if (!normalized) return true

  const words = normalized.split(/\s+/)
  const hasSentencePunctuation = /[.!?]/.test(normalized)

  if (words.length <= 7 && !hasSentencePunctuation) return true
  if (DOC_SECTION_HINTS.test(normalized)) return true

  return false
}

function scoreParagraph(paragraph: string): number {
  if (isHeadingLikeParagraph(paragraph)) return -100

  let score = 0
  const words = paragraph.split(/\s+/).length
  if (words >= 12) score += 3
  if (words >= 20) score += 2
  if (PROJECT_DESCRIPTION_HINTS.test(paragraph.toLowerCase())) score += 4
  if (/[,:;]/.test(paragraph)) score += 1
  if (DOC_SECTION_HINTS.test(paragraph.toLowerCase())) score -= 4

  return score
}

function pickBestSentences(paragraph: string, maxSentences: number): string[] {
  const sentences = paragraph
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean)

  if (sentences.length === 0) return []

  return sentences.slice(0, maxSentences)
}

function sentenceCase(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

function ensureSentencePunctuation(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/[.!?]$/.test(trimmed)) return trimmed
  return `${trimmed}.`
}

function joinNatural(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function uniqueCaseInsensitive(items: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const item of items) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }

  return result
}

function stripVersionNoise(value: string): string {
  return value
    .replace(/\b[vV]?\d+\.\d+(?:\.\d+)?\b/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeTechItem(value: string): string {
  const noVersion = stripVersionNoise(value)
    .replace(/\s+for\s+.+$/i, '')
    .replace(/^\W+|\W+$/g, '')
    .trim()

  return noVersion
}

function parseTechItems(value: string, maxItems = 6): string[] {
  const normalized = value
    .replace(/\s*\|\s*/g, ', ')
    .replace(/\s*;\s*/g, ', ')
    .replace(/\s+and\s+/gi, ', ')
    .replace(/\s+-\s+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()

  const items = normalized
    .split(/\s*,\s*/)
    .map(item => normalizeTechItem(item))
    .map(item => item.replace(/^(?:with|using)\s+/i, '').trim())
    .filter(Boolean)
    .filter(item => !STACK_SECTION_HINTS.test(item))
    .filter(item => item.length <= 42)

  return uniqueCaseInsensitive(items).slice(0, maxItems)
}

function countTechKeywordHits(value: string): number {
  const lower = value.toLowerCase()
  let hits = 0

  for (const keyword of TECH_KEYWORDS) {
    if (lower.includes(keyword)) hits += 1
  }

  return hits
}

function isStackHeavyText(value: string): boolean {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return false

  const hasStackHint = STACK_SECTION_HINTS.test(normalized)
  const techHits = countTechKeywordHits(normalized)
  const techItems = parseTechItems(normalized).length
  const hasPurposeVerb = PURPOSE_VERB_HINTS.test(normalized) || PROJECT_DESCRIPTION_HINTS.test(normalized)

  if (hasStackHint && (techHits >= 2 || techItems >= 3) && !hasPurposeVerb) return true
  if (techHits >= 4 && !hasPurposeVerb) return true
  if (techItems >= 5 && !hasPurposeVerb) return true

  return false
}

function addLanguageStackSentence(description: string, language: string | null | undefined): string {
  const normalized = description.replace(/\s+/g, ' ').trim()
  const lang = trimText(language, 32)
  if (!normalized || !lang) return normalized

  if (isStackHeavyText(normalized) || /\btech stack\b|\bstack includes\b/i.test(normalized)) {
    return normalized
  }

  return `${ensureSentencePunctuation(normalized)} The tech stack includes ${lang}.`
}

function labelToPrefix(label: string): string {
  const normalized = label.toLowerCase()
  if (normalized.includes('frontend')) return 'The frontend uses'
  if (normalized.includes('backend')) return 'The backend uses'
  if (normalized.includes('database')) return 'The data layer includes'
  if (normalized.includes('devops')) return 'The deployment and tooling include'
  if (normalized.includes('tech')) return 'The main stack includes'
  if (normalized.includes('architecture')) return 'The architecture uses'
  return `The ${normalized} includes`
}

function finalizeDescription(text: string, max = 320): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= max) return ensureSentencePunctuation(normalized)

  const clipped = normalized.slice(0, max)
  const cutAtSentence = Math.max(clipped.lastIndexOf('.'), clipped.lastIndexOf('!'), clipped.lastIndexOf('?'))
  const cutAtComma = clipped.lastIndexOf(',')
  const cutAtSpace = clipped.lastIndexOf(' ')
  const cutIndex = cutAtSentence > max * 0.6
    ? cutAtSentence + 1
    : cutAtComma > max * 0.6
      ? cutAtComma
      : cutAtSpace > max * 0.6
        ? cutAtSpace
        : max

  const cleaned = clipped
    .slice(0, cutIndex)
    .replace(/[,:;]\s*$/g, '')
    .trim()

  return ensureSentencePunctuation(cleaned)
}

function rewriteListStyleSummary(input: string): string {
  const cleaned = stripMarkdown(input)
  if (!cleaned) return ''

  const colonListPattern = /^([A-Za-z][A-Za-z0-9 /&()+-]{2,32}):\s*(.+)$/i
  const match = cleaned.match(colonListPattern)
  if (!match) {
    const items = parseTechItems(cleaned, 5)
    if ((STACK_SECTION_HINTS.test(cleaned) || countTechKeywordHits(cleaned) >= 2) && items.length >= 3) {
      return ensureSentencePunctuation(`The tech stack includes ${joinNatural(items)}`)
    }
    return ensureSentencePunctuation(cleaned)
  }

  const label = sentenceCase(match[1].trim())
  const rest = match[2]
    .replace(/\s+-\s+/g, ', ')
    .replace(/\s*\|\s*/g, ', ')
    .replace(/\s*;\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()

  const items = parseTechItems(rest, 5)

  if (items.length === 0) {
    return ensureSentencePunctuation(cleaned)
  }

  return ensureSentencePunctuation(`${labelToPrefix(label)} ${joinNatural(items)}`)
}

function summaryLooksListy(input: string): boolean {
  return (
    /\*\*/.test(input) ||
    /:\s*-\s*/.test(input) ||
    /(^| )-\s+[A-Za-z]/.test(input) ||
    input.split(/\s+/).length < 10
  )
}

function extractSummaryFromLines(readme: string): string {
  const lines = readme
    .replace(/\r/g, '')
    .split('\n')
    .map(line => stripMarkdown(line))
    .map(line => line.replace(/^\s*[-*+]\s*/, '').trim())
    .filter(Boolean)
    .filter(line => line.length >= 30)
    .filter(line => !DOC_SECTION_HINTS.test(line))

  if (lines.length === 0) return ''

  const ranked = lines
    .map((line, index) => ({ line, index, score: scoreParagraph(line) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map(entry => rewriteListStyleSummary(entry.line))
    .filter(Boolean)

  const paragraph = ranked
    .map(sentenceCase)
    .map(ensureSentencePunctuation)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  return finalizeDescription(paragraph, 240)
}

function extractStackSummaryFromReadme(readme: string): string {
  const lines = readme
    .replace(/\r/g, '')
    .split('\n')
    .map(line => stripMarkdown(line))
    .map(line => line.replace(/^\s*[-*+]\s*/, '').trim())
    .filter(Boolean)
    .filter(line => line.length >= 16)
    .filter(line => !DOC_SECTION_HINTS.test(line))

  if (lines.length === 0) return ''

  const ranked = lines
    .map((line, index) => {
      const rewritten = rewriteListStyleSummary(line)
      const techHits = countTechKeywordHits(line)
      const techItems = parseTechItems(line).length
      const hasStackHint = STACK_SECTION_HINTS.test(line)
      const score = (hasStackHint ? 5 : 0) + Math.min(techHits, 4) + Math.min(techItems, 4)

      return {
        index,
        score,
        summary: rewritten,
      }
    })
    .filter(candidate => candidate.summary)
    .filter(candidate => candidate.score >= 6)
    .sort((a, b) => b.score - a.score || a.index - b.index)

  return finalizeDescription(ranked[0]?.summary || '', 170)
}

function extractReadmeSummary(readme: string): string {
  const paragraphs = readme
    .replace(/\r/g, '')
    .split(/\n\s*\n/g)
    .map(chunk => stripMarkdown(chunk))
    .filter(chunk => chunk.length >= 45)
    .filter(chunk => !isHeadingLikeParagraph(chunk))

  const stackSummary = extractStackSummaryFromReadme(readme)

  if (paragraphs.length === 0) return stackSummary

  const ranked = [...paragraphs]
    .map((paragraph, index) => ({
      paragraph,
      index,
      score: scoreParagraph(paragraph) - (isStackHeavyText(paragraph) ? 6 : 0),
    }))
    .filter(candidate => !isStackHeavyText(candidate.paragraph) || PROJECT_DESCRIPTION_HINTS.test(candidate.paragraph))
    .sort((a, b) => b.score - a.score || a.index - b.index)

  const bestPrimary = ranked[0]?.paragraph || ''
  const bestSecondary = ranked.find(candidate => candidate.paragraph !== bestPrimary)?.paragraph || ''

  const chosenSentences = [
    ...pickBestSentences(bestPrimary, 2),
    ...pickBestSentences(bestSecondary, 1),
  ]

  const combined = chosenSentences
    .map(sentence => rewriteListStyleSummary(sentence))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  const purposeSummary = finalizeDescription(combined, 210)

  if (!purposeSummary) {
    const fromLines = extractSummaryFromLines(readme) || finalizeDescription(rewriteListStyleSummary(bestPrimary), 210)
    if (!fromLines) return stackSummary
    if (!stackSummary) return fromLines
    return finalizeDescription(`${fromLines} ${stackSummary}`, 300)
  }

  if (summaryLooksListy(purposeSummary)) {
    const fromLines = extractSummaryFromLines(readme)
    if (fromLines) {
      if (!stackSummary) return fromLines
      return finalizeDescription(`${fromLines} ${stackSummary}`, 300)
    }
  }

  if (!stackSummary) return finalizeDescription(purposeSummary, 300)

  if (purposeSummary.toLowerCase().includes(stackSummary.toLowerCase())) {
    return finalizeDescription(purposeSummary, 300)
  }

  return finalizeDescription(`${purposeSummary} ${stackSummary}`, 300)
}

async function fetchReadmeSummary(
  owner: string,
  repo: string,
  headers: Record<string, string>
): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), README_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`,
      {
        headers: {
          ...headers,
          Accept: 'application/vnd.github.raw+json',
        },
        signal: controller.signal,
        cache: 'no-store',
      }
    )

    if (!response.ok) return null
    const readmeText = await response.text()
    if (!readmeText.trim()) return null

    const summary = extractReadmeSummary(readmeText)
    return summary || null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function fallbackDescription(repo: GithubRepo): string {
  const language = trimText(repo.language, 40)
  if (language) {
    return `A public software project from GitHub that is primarily built with ${language}.`
  }

  return 'A public software project from this GitHub profile.'
}

function toGithubProject(repo: GithubRepo, generatedDescription: string | null): GithubProject {
  const repoDescription = finalizeDescription(repo.description || '', 180)
  const readmeDescription = finalizeDescription(generatedDescription || '', 260)

  let combinedDescription = readmeDescription || repoDescription || fallbackDescription(repo)

  if (readmeDescription && isStackHeavyText(readmeDescription) && repoDescription) {
    combinedDescription = `${repoDescription} ${readmeDescription}`
  } else if (!readmeDescription && repoDescription) {
    combinedDescription = repoDescription
  }

  combinedDescription = addLanguageStackSentence(combinedDescription, repo.language)

  const finalDescription = finalizeDescription(combinedDescription, 300) || fallbackDescription(repo)

  return {
    name: trimText(repo.name, 80),
    description: finalDescription,
    url: trimText(repo.html_url, 180) || null,
    language: trimText(repo.language, 40) || null,
    stars: Number.isFinite(repo.stargazers_count) ? repo.stargazers_count : 0,
  }
}

async function fetchGithubProjectsContext(
  githubUrl: string | null | undefined,
  context: { requestId?: string, userId?: string } = {}
): Promise<GithubProjectsContext | null> {
  const username = getGithubUsernameFromUrl(githubUrl)
  if (!username) return null

  const apiUrl = `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&type=owner`
  const token = process.env.GITHUB_TOKEN?.trim()
  const baseHeaders: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'CoverMe-App',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)

  try {
    const response = await fetch(apiUrl, {
      headers: baseHeaders,
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!response.ok) {
      logWarn('github_projects_fetch_failed', {
        request_id: context.requestId,
        user_id: context.userId,
        username,
        status: response.status,
      })
      return null
    }

    const repos = await response.json() as GithubRepo[]
    if (!Array.isArray(repos) || repos.length === 0) {
      return { username, projects: [] }
    }

    const candidateRepos = sortRepos(
      repos.filter(repo => !repo.fork && !repo.archived && !repo.disabled)
    )
      .slice(0, MAX_REPOS_TO_IMPORT)

    const projects = await Promise.all(
      candidateRepos.map(async repo => {
        const { owner, repo: repoName } = splitOwnerAndRepo(repo.full_name, username, repo.name)
        const readmeDescription = await fetchReadmeSummary(owner, repoName, baseHeaders)
        return toGithubProject(repo, readmeDescription)
      })
    )

    const filteredProjects = projects.filter(project => project.name && project.description)

    return { username, projects: filteredProjects }
  } catch (error) {
    logError('github_projects_fetch_unexpected_error', {
      request_id: context.requestId,
      user_id: context.userId,
      username,
      error: serializeError(error),
    })
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function getGithubProjects(
  githubUrl: string | null | undefined,
  context: { requestId?: string, userId?: string } = {}
): Promise<{ username: string, projects: GithubProject[] } | null> {
  const result = await fetchGithubProjectsContext(githubUrl, context)
  if (!result) return null
  return result
}

export async function getGithubProjectHighlights(
  githubUrl: string | null | undefined,
  context: { requestId?: string, userId?: string } = {}
): Promise<GithubProjectHighlights | null> {
  const githubContext = await fetchGithubProjectsContext(githubUrl, context)
  if (!githubContext) return null

  if (githubContext.projects.length === 0) {
    return { username: githubContext.username, highlights: [] }
  }

  const highlights = githubContext.projects
    .slice(0, 5)
    .map(formatProjectHighlight)
    .filter(Boolean)

  return { username: githubContext.username, highlights }
}
