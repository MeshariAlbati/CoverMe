import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { CoverLetterState } from './state'

function getLLM() {
  return new ChatAnthropic({
    model: 'claude-sonnet-4-6-20250514',
    maxTokens: 2048,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  })
}

const TONE_INSTRUCTIONS = {
  formal: 'Use professional, polished language. Maintain a formal register throughout. Avoid contractions.',
  conversational: 'Use warm, natural language. Contractions are fine. Sound like a real person writing a letter.',
  confident: 'Use assertive, direct language. Lead with impact. Show certainty without arrogance.',
  balanced: 'Balance professionalism with warmth. Confident but approachable.',
}

export async function writeLetterNode(
  state: CoverLetterState
): Promise<Partial<CoverLetterState>> {
  if (state.error || !state.company_research || !state.skill_matches) {
    return {}
  }

  const tone = state.user_profile.preferred_tone || 'balanced'

  try {
    const response = await getLLM().invoke([
      new SystemMessage(`You are an expert cover letter writer who crafts compelling, highly personalized cover letters.

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
- Do NOT include date, address headers, or sign-off — just the body paragraphs`),
      new HumanMessage(`Write a cover letter using this information:

CANDIDATE PROFILE:
Name: ${state.user_profile.full_name}
Title: ${state.user_profile.job_title}
Years of Experience: ${state.user_profile.years_of_experience}
Career Goal: ${state.user_profile.career_intent}
What makes them unique: ${state.user_profile.unique_value}
Proudest achievement: ${state.user_profile.proudest_achievement}
${state.user_profile.things_to_emphasize ? `Emphasize: ${state.user_profile.things_to_emphasize}` : ''}
${state.user_profile.things_to_downplay ? `Downplay: ${state.user_profile.things_to_downplay}` : ''}

COMPANY: ${state.company_research.company_name}
Industry: ${state.company_research.industry}
Mission: ${state.company_research.mission_and_values}
Culture keywords: ${state.company_research.culture_keywords.join(', ')}
What they look for: ${state.company_research.what_they_look_for}
Recent context: ${state.company_research.recent_news.slice(0, 2).join('; ')}
Growth areas: ${state.company_research.growth_areas.join(', ')}

NARRATIVE STRATEGY:
Arc: ${state.skill_matches.recommended_narrative_arc}
Key value prop: ${state.skill_matches.key_value_proposition}
Top skill matches to weave in:
${state.skill_matches.top_matches
  .filter(m => m.relevance === 'high')
  .slice(0, 3)
  .map(m => `- ${m.user_skill_or_experience} → ${m.company_need_it_addresses}: ${m.suggested_framing}`)
  .join('\n')}

Bridge story to use:
${state.skill_matches.bridge_stories.slice(0, 1).map(b => `${b.experience}: ${b.narrative_angle}`).join('\n')}

Write 3-4 tight paragraphs. Make it compelling, specific, and unmistakably written for ${state.company_research.company_name}.`),
    ], {
      metadata: {
        run_name: 'letter-writing',
        user_id: state.user_profile.id,
        company: state.company_name,
      },
    })

    const cover_letter = response.content as string
    return { cover_letter }
  } catch (error) {
    return { error: `Failed to write letter: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}
