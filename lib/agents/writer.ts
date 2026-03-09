import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { CoverLetterState } from './state'
import {
  getStageAnthropicModels,
  isAnthropicRateLimitError,
  withAnthropicModelFallback,
} from '@/lib/anthropic-model'
import {
  chatWithGroq,
  getGroqStageModels,
  isGroqRateLimitError,
} from '@/lib/llm/groq'
import { logError, logWarn, serializeError } from '@/lib/server-logger'

const TONE_INSTRUCTIONS = {
  formal: 'Use professional, polished language. Maintain a formal register throughout. Avoid contractions.',
  conversational: 'Use warm, natural language. Contractions are fine. Sound like a real person writing a letter.',
  confident: 'Use assertive, direct language. Lead with impact. Show certainty without arrogance.',
  balanced: 'Balance professionalism with warmth. Confident but approachable.',
}

const RELEVANCE_STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'from', 'that', 'this', 'have', 'has', 'were', 'was', 'are',
  'you', 'your', 'our', 'their', 'will', 'can', 'able', 'ability', 'role', 'team', 'company',
  'work', 'working', 'years', 'experience', 'using', 'through', 'across', 'into', 'about',
  'over', 'under', 'into', 'within', 'while', 'including', 'required', 'preferred',
])

interface ProjectCandidate {
  name: string
  description: string
  url: string
}

function trimText(value: unknown, max = 260): string {
  if (typeof value !== 'string') {
    return ''
  }

  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized
}

function normalizeResponseText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map(block => {
        if (!block || typeof block !== 'object') return ''
        if ('type' in block && (block as { type?: string }).type === 'text' && 'text' in block) {
          const text = (block as { text?: unknown }).text
          return typeof text === 'string' ? text : ''
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

function tokenizeForRelevance(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#./\-\s]/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 3)
    .filter(token => !RELEVANCE_STOPWORDS.has(token))
}

function buildRoleContextTokens(state: CoverLetterState): Set<string> {
  const inputs: string[] = []
  const company = state.company_research
  const matches = state.skill_matches

  inputs.push(trimText(state.job_description, 5000))

  if (company) {
    inputs.push(
      trimText(company.what_they_look_for, 600),
      trimText(company.products_and_services, 500),
      ...((company.tech_stack || []).slice(0, 20)),
      ...((company.growth_areas || []).slice(0, 8)),
      ...((company.culture_keywords || []).slice(0, 10))
    )
  }

  if (matches) {
    for (const item of (matches.top_matches || []).slice(0, 6)) {
      inputs.push(
        trimText(item.user_skill_or_experience, 160),
        trimText(item.company_need_it_addresses, 180),
        trimText(item.suggested_framing, 180)
      )
    }
  }

  const tokens = new Set<string>()
  for (const input of inputs) {
    for (const token of tokenizeForRelevance(input)) {
      tokens.add(token)
    }
  }

  return tokens
}

function scoreRelevance(text: string, contextTokens: Set<string>): number {
  if (!text || contextTokens.size === 0) return 0

  const tokens = new Set(tokenizeForRelevance(text))
  if (tokens.size === 0) return 0

  let overlap = 0
  for (const token of tokens) {
    if (contextTokens.has(token)) overlap++
  }

  const normalizedOverlap = overlap / Math.max(1, Math.min(tokens.size, 12))
  return normalizedOverlap
}

function pickMostRelevantStrings(items: string[], contextTokens: Set<string>, max = 3): string[] {
  return items
    .map(item => ({ item: trimText(item, 220), score: scoreRelevance(item, contextTokens) }))
    .filter(entry => entry.item)
    .sort((a, b) => b.score - a.score)
    .filter((entry, idx) => entry.score > 0 || idx === 0)
    .slice(0, max)
    .map(entry => entry.item)
}

function normalizeProjects(state: CoverLetterState): ProjectCandidate[] {
  const manualProjects = Array.isArray(state.user_profile.manual_projects)
    ? state.user_profile.manual_projects
    : []

  return manualProjects
    .map(project => ({
      name: trimText(project.name, 80),
      description: trimText(project.description, 180),
      url: trimText(project.url, 80),
    }))
    .filter(project => project.name && project.description)
}

function pickMostRelevantProjects(
  projects: ProjectCandidate[],
  contextTokens: Set<string>,
  max = 3
): ProjectCandidate[] {
  return projects
    .map(project => ({
      project,
      score: scoreRelevance(`${project.name} ${project.description}`, contextTokens),
    }))
    .sort((a, b) => b.score - a.score)
    .filter((entry, idx) => entry.score > 0 || idx === 0)
    .slice(0, max)
    .map(entry => entry.project)
}

function buildProofPoints(state: CoverLetterState): string[] {
  const experiences = Array.isArray(state.user_profile.work_experience)
    ? state.user_profile.work_experience
    : []

  const points = experiences
    .slice(0, 4)
    .flatMap(exp => {
      const title = trimText(exp.title, 60)
      const company = trimText(exp.company, 60)
      const highlights = Array.isArray(exp.highlights) ? exp.highlights : []
      return highlights
        .slice(0, 2)
        .map(highlight => {
          const normalizedHighlight = trimText(highlight, 180)
          if (!normalizedHighlight) return ''

          const roleLabel = [title, company].filter(Boolean).join(' @ ')
          return roleLabel ? `${roleLabel}: ${normalizedHighlight}` : normalizedHighlight
        })
        .filter(Boolean)
    })

  return [...new Set(points)].filter(Boolean).slice(0, 4)
}

function buildCertificationProofPoints(certifications: string[]): string[] {
  return certifications
    .map(cert => trimText(cert, 120))
    .filter(Boolean)
    .slice(0, 3)
    .map(cert => `Certification: ${cert}`)
}

function buildManualProjectProofPoints(manualProjects: ProjectCandidate[]): string[] {
  return manualProjects
    .slice(0, 3)
    .map(project => {
      const base = `Manual project: ${project.name} | ${project.description}`
      return project.url ? `${base} | URL: ${project.url}` : base
    })
}

function buildProjectHighlightProofPoints(projects: string[]): string[] {
  return projects
    .map(project => trimText(project, 180))
    .filter(Boolean)
    .slice(0, 3)
    .map(project => `Project: ${project}`)
}

export async function writeLetterNode(
  state: CoverLetterState
): Promise<Partial<CoverLetterState>> {
  if (state.error || !state.company_research || !state.skill_matches) {
    return {}
  }

  const tone = state.user_profile.preferred_tone || 'balanced'
  const cultureKeywords = Array.isArray(state.company_research.culture_keywords)
    ? state.company_research.culture_keywords
    : []
  const recentNews = Array.isArray(state.company_research.recent_news)
    ? state.company_research.recent_news
    : []
  const growthAreas = Array.isArray(state.company_research.growth_areas)
    ? state.company_research.growth_areas
    : []
  const topMatches = Array.isArray(state.skill_matches.top_matches)
    ? state.skill_matches.top_matches
    : []
  const bridgeStories = Array.isArray(state.skill_matches.bridge_stories)
    ? state.skill_matches.bridge_stories
    : []
  const contextTokens = buildRoleContextTokens(state)

  const allCertifications = Array.isArray(state.user_profile.certifications)
    ? state.user_profile.certifications
    : []
  const relevantCertifications = pickMostRelevantStrings(allCertifications, contextTokens, 3)

  const allManualProjects = normalizeProjects(state)
  const relevantManualProjects = pickMostRelevantProjects(allManualProjects, contextTokens, 3)

  const allProjectHighlights = Array.isArray(state.user_profile.project_highlights_summary)
    ? state.user_profile.project_highlights_summary
    : Array.isArray(state.user_profile.github_projects_summary)
      ? state.user_profile.github_projects_summary
    : []
  const relevantProjectHighlights = pickMostRelevantStrings(allProjectHighlights, contextTokens, 3)

  const experienceProofPoints = buildProofPoints(state)
  const certificationProofPoints = buildCertificationProofPoints(relevantCertifications)
  const manualProjectProofPoints = buildManualProjectProofPoints(relevantManualProjects)
  const projectHighlightProofPoints = buildProjectHighlightProofPoints(relevantProjectHighlights)
  const proofPoints = [
    ...experienceProofPoints,
    ...certificationProofPoints,
    ...manualProjectProofPoints,
    ...projectHighlightProofPoints,
  ].slice(0, 8)
  const jobDescription = trimText(state.job_description, 5000)
  const jobUrl = trimText(state.job_url, 300)

  try {
    const claudeWriterModels = getStageAnthropicModels('ANTHROPIC_WRITER_MODEL', 'ANTHROPIC_WRITER_MODELS')
    const groqWriterModels = getGroqStageModels('GROQ_WRITER_MODEL', 'GROQ_WRITER_MODELS')

    const systemPrompt = `You are an expert cover letter writer who crafts concise, high-conviction, personalized letters.

TONE INSTRUCTIONS: ${TONE_INSTRUCTIONS[tone]}

CRITICAL RULES:
- Return EXACTLY 3 short paragraphs
- Target 190-240 words total
- Do NOT include date, address headers, greeting, or sign-off
- Make the letter value-first: at least 70% about the candidate's impact, max 30% about praising the company
- Show 3 things clearly:
  1) Understanding of the company context
  2) What the candidate has done (evidence)
  3) Exactly how the candidate will help this team
- Use at least 2 concrete proof points from the candidate profile
- If a job description is provided, address at least 2 explicit job requirements
- Do NOT center the letter on non-core admin constraints (language, location, visa, relocation, availability)
- If relevant certifications exist, use at least one as supporting evidence
- If relevant projects are provided (GitHub or manual), use one concrete project detail when it strengthens fit
- Certifications/projects below are pre-filtered for relevance. Do NOT mention unrelated ones.
- Avoid repetition and generic claims
- NEVER use these phrases:
  - "I am writing to express my interest"
  - "I believe I would be a great fit"
  - "I am passionate about"
  - "I'm excited"
  - "I am excited"
- Use specific, outcome-oriented language instead of praise-heavy language
- Never invent certifications or credentials that are not provided`

    const jobContext = jobDescription
      ? `\nTARGET ROLE CONTEXT:\nJob URL: ${jobUrl || 'Not provided'}\nJob description:\n${jobDescription}\n\nWhen role requirements are explicit, align the letter to core role requirements with direct evidence.\nAvoid over-emphasizing non-core constraints like language/location/visa logistics unless truly essential.\n`
      : ''

    const userPrompt = `Write a cover letter using this information:

CANDIDATE PROFILE:
Name: ${state.user_profile.full_name}
Title: ${state.user_profile.job_title}
Years of Experience: ${state.user_profile.years_of_experience}
Career Goal: ${state.user_profile.career_intent}
What makes them unique: ${trimText(state.user_profile.unique_value, 220)}
Proudest achievement: ${trimText(state.user_profile.proudest_achievement, 240)}
Relevant certifications: ${relevantCertifications.length > 0 ? relevantCertifications.join(', ') : 'None provided'}
GitHub profile: ${state.user_profile.github_url || 'None provided'}
Relevant manual projects:
${relevantManualProjects.length > 0 ? relevantManualProjects.map(project => `- ${project.name}: ${project.description}`).join('\n') : '- None provided'}
Relevant project highlights (GitHub + manual):
${relevantProjectHighlights.length > 0 ? relevantProjectHighlights.map(project => `- ${project}`).join('\n') : '- None provided'}
${state.user_profile.things_to_emphasize ? `Emphasize: ${trimText(state.user_profile.things_to_emphasize, 220)}` : ''}
${state.user_profile.things_to_downplay ? `Downplay: ${trimText(state.user_profile.things_to_downplay, 220)}` : ''}

COMPANY: ${state.company_research.company_name}
Industry: ${state.company_research.industry}
Mission: ${trimText(state.company_research.mission_and_values, 700)}
Culture keywords: ${cultureKeywords.join(', ')}
What they look for: ${trimText(state.company_research.what_they_look_for, 360)}
Recent context: ${recentNews.slice(0, 2).map(item => trimText(item, 180)).join('; ')}
Growth areas: ${growthAreas.join(', ')}
${jobContext}

NARRATIVE STRATEGY:
Arc: ${state.skill_matches.recommended_narrative_arc}
Key value prop: ${state.skill_matches.key_value_proposition}
Top skill matches to weave in:
${topMatches
  .filter(m => m.relevance === 'high')
  .slice(0, 3)
  .map(m => `- ${m.user_skill_or_experience} → ${m.company_need_it_addresses}: ${m.suggested_framing}`)
  .join('\n')}

PROOF POINTS TO PRIORITIZE (use at least 2):
${proofPoints.length > 0 ? proofPoints.map(point => `- ${point}`).join('\n') : '- Use the strongest concrete achievements available from the profile.'}

Bridge story to use:
${bridgeStories.slice(0, 1).map(b => `${b.experience}: ${b.narrative_angle}`).join('\n')}

Write EXACTLY 3 short paragraphs and keep it concise.

Paragraph goals:
1) Show you understand ${state.company_research.company_name} and immediately position the candidate's value.
2) Prove capability with concrete achievements and outcomes.
3) Explain how this background helps the role now (clear forward impact, not generic praise).

Self-check before final output:
- Is the letter too long or repetitive? If yes, tighten.
- Does it over-praise the company? If yes, reduce praise and increase candidate impact.
- Does it clearly show company understanding, past achievements, and future value? If not, revise.`

    let cover_letter = ''
    if (state.llm_provider === 'groq') {
      const response = await chatWithGroq(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        700,
        {
          models: groqWriterModels,
          label: 'letter_writing',
        }
      )
      cover_letter = response.text
    } else {
      const response = await withAnthropicModelFallback(async model => {
        const llm = new ChatAnthropic({
          model,
          maxTokens: 700,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
        })

        return llm.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(userPrompt),
        ], {
          metadata: {
            run_name: 'letter-writing',
            user_id: state.user_profile.id,
            company: state.company_name,
          },
        })
      }, {
        models: claudeWriterModels,
        label: 'letter_writing',
      })

      cover_letter = normalizeResponseText(response.content)
    }

    return { cover_letter }
  } catch (error) {
    if (isAnthropicRateLimitError(error) || isGroqRateLimitError(error)) {
      logWarn('llm_letter_writing_rate_limited', {
        user_id: state.user_profile.id,
        company: state.company_name,
        provider: state.llm_provider,
        error: serializeError(error),
      })
      return {
        error: 'Cover letter generation is temporarily rate-limited. Please retry in about 60 seconds.',
      }
    }

    logError('llm_letter_writing_failed', {
      user_id: state.user_profile.id,
      company: state.company_name,
      provider: state.llm_provider,
      error: serializeError(error),
    })
    return { error: `Failed to write letter: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}
