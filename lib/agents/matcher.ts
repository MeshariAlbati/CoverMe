import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { CoverLetterState } from './state'
import type { SkillMatches } from '@/types'

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

function getLLM() {
  return new ChatAnthropic({
    model: 'claude-sonnet-4-6-20250514',
    maxTokens: 4096,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  })
}

export async function matchSkillsNode(
  state: CoverLetterState
): Promise<Partial<CoverLetterState>> {
  if (state.error || !state.company_research) {
    return {}
  }

  try {
    const profileSummary = JSON.stringify({
      job_title: state.user_profile.job_title,
      years_of_experience: state.user_profile.years_of_experience,
      skills: state.user_profile.skills,
      work_experience: state.user_profile.work_experience,
      education: state.user_profile.education,
      career_intent: state.user_profile.career_intent,
      unique_value: state.user_profile.unique_value,
      proudest_achievement: state.user_profile.proudest_achievement,
      certifications: state.user_profile.certifications,
      languages: state.user_profile.languages,
    }, null, 2)

    const companyData = JSON.stringify(state.company_research, null, 2)

    const prompt = `CANDIDATE PROFILE:\n${profileSummary}\n\nCOMPANY RESEARCH:\n${companyData}\n\nAnalyze which of the candidate's skills, experiences, and achievements are most relevant to this company.\nConsider their career_intent (${state.user_profile.career_intent}) when framing the narrative.\n\nReturn this exact JSON structure with no markdown or explanation:\n{\n  "top_matches": [\n    {\n      "user_skill_or_experience": "",\n      "company_need_it_addresses": "",\n      "relevance": "high",\n      "suggested_framing": ""\n    }\n  ],\n  "bridge_stories": [\n    {\n      "experience": "",\n      "connection_to_company": "",\n      "narrative_angle": ""\n    }\n  ],\n  "gaps_to_address": [""],\n  "recommended_narrative_arc": "",\n  "key_value_proposition": ""\n}\n\nInclude 3-5 top_matches ranked by relevance (high/medium/low).\nInclude 1-2 bridge_stories connecting the candidate to the company even if not obvious.`

    const response = await getLLM().invoke([
      new SystemMessage(
        'You are an expert career strategist. Analyze the alignment between a candidate profile and a company. Return ONLY valid JSON with no markdown or explanation.'
      ),
      new HumanMessage(prompt),
    ], {
      metadata: {
        run_name: 'skill-matching',
        user_id: state.user_profile.id,
        company: state.company_name,
      },
    })

    const text = (response.content as string).replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = skillMatchesSchema.safeParse(JSON.parse(text))
    if (!parsed.success) {
      return { error: 'Skill matching output had an invalid format.' }
    }
    const skill_matches: SkillMatches = parsed.data
    return { skill_matches }
  } catch (error) {
    return { error: `Skill matching failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}
