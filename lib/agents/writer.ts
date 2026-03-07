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

const TONE_INSTRUCTIONS = {
  formal: 'Use professional, polished language. Maintain a formal register throughout. Avoid contractions.',
  conversational: 'Use warm, natural language. Contractions are fine. Sound like a real person writing a letter.',
  confident: 'Use assertive, direct language. Lead with impact. Show certainty without arrogance.',
  balanced: 'Balance professionalism with warmth. Confident but approachable.',
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

  try {
    const claudeWriterModels = getStageAnthropicModels('ANTHROPIC_WRITER_MODEL', 'ANTHROPIC_WRITER_MODELS')
    const groqWriterModels = getGroqStageModels('GROQ_WRITER_MODEL', 'GROQ_WRITER_MODELS')

    const systemPrompt = `You are an expert cover letter writer who crafts compelling, highly personalized cover letters.

TONE INSTRUCTIONS: ${TONE_INSTRUCTIONS[tone]}

CRITICAL RULES:
- NEVER start with "I am writing to express my interest" or any variation
- NEVER use "I believe I would be a great fit"
- NEVER use "I am passionate about" as an opener
- NEVER use generic filler phrases
- Make EVERY sentence earn its place
- Reference SPECIFIC company details from the research provided
- Sound human and authentic — not AI-generated
- Keep to 3-4 tight paragraphs
- Open with a compelling hook that connects the candidate to THIS specific company
- Close with enthusiasm and a clear call to action
- Do NOT include date, address headers, or sign-off — just the body paragraphs`

    const userPrompt = `Write a cover letter using this information:

CANDIDATE PROFILE:
Name: ${state.user_profile.full_name}
Title: ${state.user_profile.job_title}
Years of Experience: ${state.user_profile.years_of_experience}
Career Goal: ${state.user_profile.career_intent}
What makes them unique: ${trimText(state.user_profile.unique_value, 220)}
Proudest achievement: ${trimText(state.user_profile.proudest_achievement, 240)}
${state.user_profile.things_to_emphasize ? `Emphasize: ${trimText(state.user_profile.things_to_emphasize, 220)}` : ''}
${state.user_profile.things_to_downplay ? `Downplay: ${trimText(state.user_profile.things_to_downplay, 220)}` : ''}

COMPANY: ${state.company_research.company_name}
Industry: ${state.company_research.industry}
Mission: ${trimText(state.company_research.mission_and_values, 700)}
Culture keywords: ${cultureKeywords.join(', ')}
What they look for: ${trimText(state.company_research.what_they_look_for, 360)}
Recent context: ${recentNews.slice(0, 2).map(item => trimText(item, 180)).join('; ')}
Growth areas: ${growthAreas.join(', ')}

NARRATIVE STRATEGY:
Arc: ${state.skill_matches.recommended_narrative_arc}
Key value prop: ${state.skill_matches.key_value_proposition}
Top skill matches to weave in:
${topMatches
  .filter(m => m.relevance === 'high')
  .slice(0, 3)
  .map(m => `- ${m.user_skill_or_experience} → ${m.company_need_it_addresses}: ${m.suggested_framing}`)
  .join('\n')}

Bridge story to use:
${bridgeStories.slice(0, 1).map(b => `${b.experience}: ${b.narrative_angle}`).join('\n')}

Write 3-4 tight paragraphs. Make it compelling, specific, and unmistakably written for ${state.company_research.company_name}.`

    let cover_letter = ''
    if (state.llm_provider === 'groq') {
      const response = await chatWithGroq(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        900,
        { models: groqWriterModels }
      )
      cover_letter = response.text
    } else {
      const response = await withAnthropicModelFallback(async model => {
        const llm = new ChatAnthropic({
          model,
          maxTokens: 900,
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
      }, { models: claudeWriterModels })

      cover_letter = normalizeResponseText(response.content)
    }

    return { cover_letter }
  } catch (error) {
    if (isAnthropicRateLimitError(error) || isGroqRateLimitError(error)) {
      return {
        error: 'Cover letter generation is temporarily rate-limited. Please retry in about 60 seconds.',
      }
    }

    return { error: `Failed to write letter: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}
