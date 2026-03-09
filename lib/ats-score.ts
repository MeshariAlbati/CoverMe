import type { AtsAnalysis, Profile } from '@/types'

interface AtsEvaluationInput {
  jobDescription: string
  userProfile: Profile
  coverLetterText: string
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'if', 'in', 'into',
  'is', 'it', 'of', 'on', 'or', 'our', 'the', 'their', 'they', 'this', 'to', 'we', 'will',
  'with', 'you', 'your', 'have', 'has', 'had', 'can', 'should', 'must', 'plus', 'using',
  'including', 'within', 'across', 'about', 'over', 'under', 'than', 'who', 'what', 'when',
  'where', 'why', 'how', 'while', 'also', 'such', 'etc', 'highly', 'strong', 'excellent',
  'preferred', 'required', 'requirement', 'requirements', 'qualification', 'qualifications',
  'candidate', 'role', 'position', 'team', 'teams', 'company', 'work', 'working',
])

const LOW_SIGNAL_TERMS = new Set([
  'ability', 'abilities', 'background', 'business', 'communication', 'cross', 'deliver',
  'driven', 'environment', 'experience', 'focus', 'goals', 'impact', 'learn', 'learning',
  'manage', 'management', 'problem', 'problems', 'process', 'processes', 'projects',
  'quality', 'results', 'skills', 'solutions', 'support', 'systems', 'tasks', 'time',
  'tools', 'understanding', 'years',
])

const NON_CORE_REQUIREMENT_TOKENS = new Set([
  'arabic', 'english', 'french', 'german', 'spanish', 'bilingual', 'fluency', 'fluent',
  'language', 'languages', 'native',
  'riyadh', 'jeddah', 'dammam', 'khobar', 'saudi', 'ksa', 'gcc', 'uae', 'dubai', 'abu', 'dhabi',
  'onsite', 'on-site', 'remote', 'hybrid', 'relocation', 'relocate', 'commute',
  'visa', 'sponsorship', 'permit', 'residency', 'resident', 'iqama',
  'nationality', 'citizen', 'citizenship',
  'immediate', 'immediately', 'availability', 'available',
  'gender', 'male', 'female',
])

const NON_CORE_REQUIREMENT_PATTERNS: RegExp[] = [
  /\b(english|arabic|bilingual|language|languages|fluency|fluent)\b/i,
  /\b(location|based in|riyadh|saudi|ksa|relocation|on-?site|remote|hybrid)\b/i,
  /\b(visa|work permit|residency|citizenship|nationality|sponsorship)\b/i,
  /\b(immediate join|available immediately|availability)\b/i,
]

const KEYWORD_LIBRARY: Array<{ keyword: string; variants: string[] }> = [
  { keyword: 'javascript', variants: ['javascript', 'js'] },
  { keyword: 'typescript', variants: ['typescript', 'ts'] },
  { keyword: 'python', variants: ['python'] },
  { keyword: 'java', variants: ['java'] },
  { keyword: 'go', variants: ['go', 'golang'] },
  { keyword: 'rust', variants: ['rust'] },
  { keyword: 'c++', variants: ['c++', 'cpp'] },
  { keyword: 'c#', variants: ['c#', 'c sharp', 'dotnet', '.net'] },
  { keyword: 'react', variants: ['react', 'react.js', 'reactjs'] },
  { keyword: 'next.js', variants: ['next.js', 'nextjs'] },
  { keyword: 'node.js', variants: ['node.js', 'nodejs', 'node'] },
  { keyword: 'express', variants: ['express', 'express.js'] },
  { keyword: 'nestjs', variants: ['nestjs'] },
  { keyword: 'angular', variants: ['angular'] },
  { keyword: 'vue', variants: ['vue', 'vue.js', 'vuejs'] },
  { keyword: 'svelte', variants: ['svelte'] },
  { keyword: 'tailwind', variants: ['tailwind', 'tailwindcss'] },
  { keyword: 'graphql', variants: ['graphql'] },
  { keyword: 'rest api', variants: ['rest api', 'restful api', 'restful services'] },
  { keyword: 'sql', variants: ['sql'] },
  { keyword: 'postgresql', variants: ['postgresql', 'postgres'] },
  { keyword: 'mysql', variants: ['mysql'] },
  { keyword: 'mongodb', variants: ['mongodb', 'mongo'] },
  { keyword: 'redis', variants: ['redis'] },
  { keyword: 'aws', variants: ['aws', 'amazon web services'] },
  { keyword: 'gcp', variants: ['gcp', 'google cloud', 'google cloud platform'] },
  { keyword: 'azure', variants: ['azure', 'microsoft azure'] },
  { keyword: 'docker', variants: ['docker'] },
  { keyword: 'kubernetes', variants: ['kubernetes', 'k8s'] },
  { keyword: 'terraform', variants: ['terraform'] },
  { keyword: 'ci/cd', variants: ['ci/cd', 'ci cd', 'continuous integration', 'continuous delivery'] },
  { keyword: 'github actions', variants: ['github actions'] },
  { keyword: 'testing', variants: ['testing', 'test automation'] },
  { keyword: 'jest', variants: ['jest'] },
  { keyword: 'playwright', variants: ['playwright'] },
  { keyword: 'cypress', variants: ['cypress'] },
  { keyword: 'unit testing', variants: ['unit testing', 'unit tests'] },
  { keyword: 'integration testing', variants: ['integration testing', 'integration tests'] },
  { keyword: 'machine learning', variants: ['machine learning', 'ml'] },
  { keyword: 'deep learning', variants: ['deep learning'] },
  { keyword: 'llm', variants: ['llm', 'large language model', 'large language models'] },
  { keyword: 'nlp', variants: ['nlp', 'natural language processing'] },
  { keyword: 'data analysis', variants: ['data analysis', 'data analytics'] },
  { keyword: 'data science', variants: ['data science'] },
  { keyword: 'product management', variants: ['product management', 'product manager'] },
  { keyword: 'leadership', variants: ['leadership', 'leading teams'] },
  { keyword: 'communication', variants: ['communication', 'stakeholder communication'] },
  { keyword: 'agile', variants: ['agile'] },
  { keyword: 'scrum', variants: ['scrum'] },
  { keyword: 'system design', variants: ['system design', 'software architecture'] },
  { keyword: 'microservices', variants: ['microservices'] },
  { keyword: 'distributed systems', variants: ['distributed systems'] },
  { keyword: 'linux', variants: ['linux'] },
  { keyword: 'security', variants: ['security', 'application security'] },
  { keyword: 'oauth', variants: ['oauth', 'oauth2'] },
  { keyword: 'authentication', variants: ['authentication', 'auth'] },
]

const UPPERCASE_KEYWORDS: Record<string, string> = {
  aws: 'AWS',
  gcp: 'GCP',
  ci: 'CI',
  cd: 'CD',
  llm: 'LLM',
  nlp: 'NLP',
  sql: 'SQL',
  oauth: 'OAuth',
  'c++': 'C++',
  'c#': 'C#',
}

const REQUIREMENT_CUE_PATTERN = /(required|requirements|must\s+have|experience\s+with|proficient\s+in|knowledge\s+of|familiar\s+with|expertise\s+in|qualifications|looking\s+for|you\s+will|responsibilities\s+include|preferred)/i

const canonicalKeywordRegexes = new Map<string, RegExp[]>(
  KEYWORD_LIBRARY.map((entry) => [
    entry.keyword,
    entry.variants.map((variant) => buildKeywordRegex(variant)),
  ])
)

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildKeywordRegex(keyword: string): RegExp {
  const escaped = escapeRegExp(keyword.trim().toLowerCase()).replace(/\s+/g, '\\s+')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i')
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  for (const value of values) {
    const trimmed = value.trim()
    const normalized = trimmed.toLowerCase()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(trimmed)
  }

  return out
}

function formatKeyword(keyword: string): string {
  const lower = keyword.toLowerCase().trim()
  if (UPPERCASE_KEYWORDS[lower]) return UPPERCASE_KEYWORDS[lower]

  if (lower.includes('/')) {
    return lower
      .split('/')
      .map(segment => (UPPERCASE_KEYWORDS[segment] || segment))
      .join('/')
  }

  return lower
}

function containsKeyword(text: string, keyword: string): boolean {
  const normalizedText = text.toLowerCase()
  const canonicalRegexes = canonicalKeywordRegexes.get(keyword)
  if (canonicalRegexes) {
    return canonicalRegexes.some(regex => regex.test(normalizedText))
  }

  return buildKeywordRegex(keyword).test(normalizedText)
}

function extractCanonicalKeywords(jobDescription: string): string[] {
  const normalized = jobDescription.toLowerCase()
  return KEYWORD_LIBRARY
    .filter(entry => entry.variants.some(variant => buildKeywordRegex(variant).test(normalized)))
    .map(entry => entry.keyword)
}

function toFilteredTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#./\-\s]/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2)
    .filter(token => !STOPWORDS.has(token))
}

function extractRequirementPhrases(jobDescription: string): string[] {
  const lines = jobDescription
    .split(/\n+/)
    .map(line => normalizeWhitespace(line.replace(/^[\-\*]+\s*/, '')))
    .filter(Boolean)

  const phrases: string[] = []

  for (const line of lines) {
    if (!REQUIREMENT_CUE_PATTERN.test(line) && line.length < 45) {
      continue
    }

    const fragments = line.split(/[,;]|\band\b|\bor\b/i)
    for (const fragment of fragments) {
      const cleaned = normalizeWhitespace(
        fragment
          .replace(REQUIREMENT_CUE_PATTERN, ' ')
          .replace(/^(at\s+least|minimum|strong|solid|proven|ability\s+to)\s+/i, '')
      )

      const tokens = toFilteredTokens(cleaned).filter(token => !LOW_SIGNAL_TERMS.has(token))
      if (tokens.length === 0) continue

      const phrase = tokens.slice(0, 3).join(' ')
      if (phrase.length < 3) continue
      phrases.push(phrase)
    }
  }

  return phrases
}

function extractFrequentKeywords(jobDescription: string): string[] {
  const counts = new Map<string, number>()
  const tokens = toFilteredTokens(jobDescription).filter(token => token.length >= 4 && !LOW_SIGNAL_TERMS.has(token))

  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1)
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([token]) => token)
}

function extractRequiredKeywords(jobDescription: string): string[] {
  const canonical = extractCanonicalKeywords(jobDescription)
  const phrases = extractRequirementPhrases(jobDescription)
  const fallback = extractFrequentKeywords(jobDescription)

  return filterCoreRequirements(unique([...canonical, ...phrases, ...fallback])).slice(0, 18)
}

function isNonCoreRequirement(value: string): boolean {
  const normalized = normalizeWhitespace(value).toLowerCase()
  if (!normalized) return true

  if (NON_CORE_REQUIREMENT_PATTERNS.some(pattern => pattern.test(normalized))) {
    return true
  }

  const tokens = toFilteredTokens(normalized)
  if (tokens.length > 0 && tokens.every(token => NON_CORE_REQUIREMENT_TOKENS.has(token))) {
    return true
  }

  return false
}

function filterCoreRequirements(values: string[]): string[] {
  return values.filter(value => !isNonCoreRequirement(value))
}

function buildProfileEvidence(profile: Profile): string {
  const skills = Array.isArray(profile.skills) ? profile.skills.join(' ') : ''
  const certifications = Array.isArray(profile.certifications) ? profile.certifications.join(' ') : ''
  const manualProjects = Array.isArray(profile.manual_projects)
    ? profile.manual_projects
      .map(project => `${project.name || ''} ${project.description || ''}`)
      .join(' ')
    : ''
  const projectHighlights = Array.isArray(profile.project_highlights_summary)
    ? profile.project_highlights_summary.join(' ')
    : Array.isArray(profile.github_projects_summary)
      ? profile.github_projects_summary.join(' ')
      : ''
  const experience = Array.isArray(profile.work_experience)
    ? profile.work_experience
      .map(exp => `${exp.title || ''} ${exp.company || ''} ${(exp.highlights || []).join(' ')}`)
      .join(' ')
    : ''

  return normalizeWhitespace([
    profile.job_title,
    profile.unique_value,
    profile.proudest_achievement,
    skills,
    certifications,
    manualProjects,
    projectHighlights,
    experience,
  ].filter(Boolean).join(' ')).toLowerCase()
}

function buildRecommendations(
  missingKeywords: string[],
  profileOnlyKeywords: string[]
): string[] {
  const suggestions = [
    ...missingKeywords.slice(0, 4).map(keyword => `Add a concrete result that demonstrates ${formatKeyword(keyword)}.`),
    ...profileOnlyKeywords.slice(0, 2).map(keyword => `Explicitly mention ${formatKeyword(keyword)} in the letter body for better ATS coverage.`),
  ]

  return unique(suggestions).slice(0, 6)
}

function scoreAts(
  totalRequirements: number,
  matchedByProfileCount: number,
  matchedByLetterCount: number,
  matchedOverallCount: number
): number {
  if (totalRequirements <= 0) return 0

  const profileCoverage = matchedByProfileCount / totalRequirements
  const letterCoverage = matchedByLetterCount / totalRequirements
  const overallCoverage = matchedOverallCount / totalRequirements

  const weighted = (profileCoverage * 45) + (letterCoverage * 35) + (overallCoverage * 20)
  return Math.max(0, Math.min(100, Math.round(weighted)))
}

export function evaluateAtsMatch(input: AtsEvaluationInput): AtsAnalysis {
  const jobDescription = normalizeWhitespace(input.jobDescription)
  if (!jobDescription) {
    return {
      score: 0,
      matched_keywords: [],
      missing_keywords: [],
      recommended_additions: ['Add a job description to generate ATS insights.'],
    }
  }

  const requiredKeywords = extractRequiredKeywords(jobDescription)
  if (requiredKeywords.length === 0) {
    return {
      score: 0,
      matched_keywords: [],
      missing_keywords: [],
      recommended_additions: ['No core role requirements were detected. Add role-specific skills/responsibilities for ATS scoring.'],
    }
  }

  const profileText = buildProfileEvidence(input.userProfile)
  const letterText = normalizeWhitespace(input.coverLetterText).toLowerCase()

  const matchedInProfile = requiredKeywords.filter(keyword => containsKeyword(profileText, keyword))
  const matchedInLetter = requiredKeywords.filter(keyword => containsKeyword(letterText, keyword))

  const matchedSet = new Set<string>([...matchedInProfile, ...matchedInLetter])
  const missing = requiredKeywords.filter(keyword => !matchedSet.has(keyword))

  const profileOnly = matchedInProfile.filter(keyword => !matchedInLetter.includes(keyword))

  const recommendations = buildRecommendations(missing, profileOnly)

  return {
    score: scoreAts(requiredKeywords.length, matchedInProfile.length, matchedInLetter.length, matchedSet.size),
    matched_keywords: [...matchedSet].slice(0, 10).map(formatKeyword),
    missing_keywords: missing.slice(0, 10).map(formatKeyword),
    recommended_additions: recommendations,
  }
}
