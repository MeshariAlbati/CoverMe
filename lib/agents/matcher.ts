import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { CoverLetterState } from './state'
import type { SkillMatches } from '@/types'
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
import { parseJsonFromModelText } from '@/lib/llm/json'
import { logError, logWarn, serializeError } from '@/lib/server-logger'

const skillMatchSchema = z.object({
  user_skill_or_experience: z.string(),
  company_need_it_addresses: z.string(),
  relevance: z.enum(['high', 'medium', 'low']),
  suggested_framing: z.string(),
})

const bridgeStorySchema = z.object({
  experience: z.string(),
  connection_to_company: z.string(),
  narrative_angle: z.string(),
})

const skillMatchesSchema = z.object({
  top_matches: z.array(skillMatchSchema),
  bridge_stories: z.array(bridgeStorySchema),
  gaps_to_address: z.array(z.string()),
  recommended_narrative_arc: z.string(),
  key_value_proposition: z.string(),
})

function trimText(value: unknown, max = 280): string {
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

export async function matchSkillsNode(
  state: CoverLetterState
): Promise<Partial<CoverLetterState>> {
  if (state.error || !state.company_research) {
    return {}
  }

  try {
    const claudeMatcherModels = getStageAnthropicModels('ANTHROPIC_MATCHER_MODEL', 'ANTHROPIC_MATCHER_MODELS')
    const groqMatcherModels = getGroqStageModels('GROQ_MATCHER_MODEL', 'GROQ_MATCHER_MODELS')

    const compactProfile = {
      job_title: state.user_profile.job_title,
      years_of_experience: state.user_profile.years_of_experience,
      skills: (state.user_profile.skills || []).slice(0, 25),
      work_experience: (state.user_profile.work_experience || []).slice(0, 4).map(exp => ({
        title: exp.title,
        company: exp.company,
        duration: trimText(exp.duration, 60),
        highlights: (exp.highlights || []).slice(0, 3).map(h => trimText(h, 160)),
      })),
      education: (state.user_profile.education || []).slice(0, 3),
      career_intent: state.user_profile.career_intent,
      unique_value: trimText(state.user_profile.unique_value, 220),
      proudest_achievement: trimText(state.user_profile.proudest_achievement, 240),
      certifications: (state.user_profile.certifications || []).slice(0, 8),
      languages: (state.user_profile.languages || []).slice(0, 8),
    }
    const profileSummary = JSON.stringify(compactProfile, null, 2)

    const compactCompany = {
      company_name: state.company_research.company_name,
      industry: state.company_research.industry,
      mission_and_values: trimText(state.company_research.mission_and_values, 800),
      recent_news: (state.company_research.recent_news || []).slice(0, 4).map(item => trimText(item, 200)),
      products_and_services: trimText(state.company_research.products_and_services, 700),
      tech_stack: (state.company_research.tech_stack || []).slice(0, 20),
      culture_keywords: (state.company_research.culture_keywords || []).slice(0, 12),
      growth_areas: (state.company_research.growth_areas || []).slice(0, 6).map(item => trimText(item, 140)),
      challenges: (state.company_research.challenges || []).slice(0, 6).map(item => trimText(item, 140)),
      key_leadership: (state.company_research.key_leadership || []).slice(0, 6),
      what_they_look_for: trimText(state.company_research.what_they_look_for, 500),
    }
    const companyData = JSON.stringify(compactCompany, null, 2)

    const prompt = `CANDIDATE PROFILE:\n${profileSummary}\n\nCOMPANY RESEARCH:\n${companyData}\n\nAnalyze which of the candidate's skills, experiences, and achievements are most relevant to this company.\nConsider their career_intent (${state.user_profile.career_intent}) when framing the narrative.\n\nReturn this exact JSON structure with no markdown or explanation:\n{\n  "top_matches": [\n    {\n      "user_skill_or_experience": "",\n      "company_need_it_addresses": "",\n      "relevance": "high",\n      "suggested_framing": ""\n    }\n  ],\n  "bridge_stories": [\n    {\n      "experience": "",\n      "connection_to_company": "",\n      "narrative_angle": ""\n    }\n  ],\n  "gaps_to_address": [""],\n  "recommended_narrative_arc": "",\n  "key_value_proposition": ""\n}\n\nInclude 3-5 top_matches ranked by relevance (high/medium/low).\nInclude 1-2 bridge_stories connecting the candidate to the company even if not obvious.`

    const systemPrompt =
      'You are an expert career strategist. Analyze the alignment between a candidate profile and a company. Return ONLY valid JSON with no markdown or explanation.'

    let rawText = ''
    if (state.llm_provider === 'groq') {
      const { text } = await chatWithGroq(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        1200,
        {
          models: groqMatcherModels,
          label: 'skill_matching',
        }
      )
      rawText = text
    } else {
      const response = await withAnthropicModelFallback(async model => {
        const llm = new ChatAnthropic({
          model,
          maxTokens: 1400,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
        })

        return llm.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(prompt),
        ], {
          metadata: {
            run_name: 'skill-matching',
            user_id: state.user_profile.id,
            company: state.company_name,
          },
        })
      }, {
        models: claudeMatcherModels,
        label: 'skill_matching',
      })

      rawText = normalizeResponseText(response.content)
    }

    let parsedJson: unknown
    try {
      parsedJson = parseJsonFromModelText(rawText)
    } catch (error) {
      logError('llm_skill_matching_parse_failed', {
        user_id: state.user_profile.id,
        company: state.company_name,
        provider: state.llm_provider,
        error: serializeError(error),
      })
      return { error: 'Skill matching output had an invalid format.' }
    }

    const parsed = skillMatchesSchema.safeParse(parsedJson)
    if (!parsed.success) {
      logError('llm_skill_matching_schema_validation_failed', {
        user_id: state.user_profile.id,
        company: state.company_name,
        provider: state.llm_provider,
      })
      return { error: 'Skill matching output had an invalid format.' }
    }
    const skill_matches: SkillMatches = parsed.data
    return { skill_matches }
  } catch (error) {
    if (isAnthropicRateLimitError(error) || isGroqRateLimitError(error)) {
      logWarn('llm_skill_matching_rate_limited', {
        user_id: state.user_profile.id,
        company: state.company_name,
        provider: state.llm_provider,
        error: serializeError(error),
      })
      return {
        error: 'Skill matching is temporarily rate-limited. Please retry in about 60 seconds.',
      }
    }

    logError('llm_skill_matching_failed', {
      user_id: state.user_profile.id,
      company: state.company_name,
      provider: state.llm_provider,
      error: serializeError(error),
    })
    return { error: `Skill matching failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}
