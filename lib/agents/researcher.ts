import Anthropic from '@anthropic-ai/sdk'
import type { Message } from '@anthropic-ai/sdk/resources/messages'
import { z } from 'zod'
import type { CoverLetterState } from './state'
import type { CompanyResearch } from '@/types'
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
import { getTavilyCompanyContext } from '@/lib/llm/tavily'

const companyResearchSchema = z.object({
  company_name: z.string(),
  industry: z.string(),
  mission_and_values: z.string(),
  recent_news: z.array(z.string()),
  products_and_services: z.string(),
  tech_stack: z.array(z.string()),
  culture_keywords: z.array(z.string()),
  growth_areas: z.array(z.string()),
  challenges: z.array(z.string()),
  key_leadership: z.array(z.object({ name: z.string(), role: z.string() })),
  what_they_look_for: z.string(),
})

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

function getResearchPrompt(companyName: string, externalContext = ''): string {
  return `You are a company research specialist. Research "${companyName}" thoroughly and return ONLY a valid JSON object (no markdown, no explanation).

Search for and include:
1. Company mission and values
2. Recent news (last 6 months)
3. Products and services
4. Tech stack (if tech company)
5. Company culture keywords
6. Current growth areas
7. Challenges they face
8. Key leadership
9. What they typically look for in candidates

Return this exact JSON structure:
{
  "company_name": "",
  "industry": "",
  "mission_and_values": "",
  "recent_news": [""],
  "products_and_services": "",
  "tech_stack": [],
  "culture_keywords": [],
  "growth_areas": [""],
  "challenges": [""],
  "key_leadership": [{"name": "", "role": ""}],
  "what_they_look_for": ""
}

If external search context is included below, prioritize it and cite only facts present there.
${externalContext ? `\nEXTERNAL SEARCH CONTEXT:\n${externalContext}` : '\nNo external context was provided. Use your best available knowledge and keep uncertain claims conservative.'}`
}

export async function researchCompanyNode(
  state: CoverLetterState
): Promise<Partial<CoverLetterState>> {
  if (state.error) {
    return {}
  }

  if (state.company_research) {
    return { company_research: state.company_research }
  }

  try {
    let researchText = ''
    if (state.llm_provider === 'groq') {
      const groqResearchModels = getGroqStageModels('GROQ_RESEARCH_MODEL', 'GROQ_RESEARCH_MODELS')
      const externalContext = await getTavilyCompanyContext(state.company_name)
      const { text } = await chatWithGroq(
        [
          {
            role: 'system',
            content: 'You are a company research specialist. Return ONLY valid JSON.',
          },
          {
            role: 'user',
            content: getResearchPrompt(state.company_name, externalContext),
          },
        ],
        1700,
        { models: groqResearchModels }
      )
      researchText = text
    } else {
      const anthropic = getAnthropic()
      const researchModels = getStageAnthropicModels('ANTHROPIC_RESEARCH_MODEL', 'ANTHROPIC_RESEARCH_MODELS')
      const response = await withAnthropicModelFallback(
        model =>
          anthropic.messages.create({
            model,
            max_tokens: 2000,
            tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
            messages: [
              {
                role: 'user',
                content: getResearchPrompt(state.company_name),
              },
            ],
            metadata: {
              user_id: state.user_profile.id,
            },
          }) as Promise<Message>
      , { models: researchModels })

      for (const block of response.content) {
        if (block.type === 'text') {
          researchText = block.text
        }
      }

      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')
      if (toolUseBlocks.length > 0 && !researchText) {
        const messages: Anthropic.MessageParam[] = [
          {
            role: 'user',
            content: `Research "${state.company_name}" and return ONLY a valid JSON with company info.`,
          },
          {
            role: 'assistant',
            content: response.content,
          },
          {
            role: 'user',
            content: toolUseBlocks.map(block => ({
              type: 'tool_result' as const,
              tool_use_id: (block as Anthropic.ToolUseBlock).id,
              content: 'Search completed. Now synthesize the information into the required JSON format.',
            })),
          },
        ]

        const followUp = await withAnthropicModelFallback(
          model =>
            getAnthropic().messages.create({
              model,
              max_tokens: 1600,
              messages,
            }) as Promise<Message>
        , { models: researchModels })

        for (const block of followUp.content) {
          if (block.type === 'text') {
            researchText = block.text
            break
          }
        }
      }
    }

    const jsonText = researchText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = companyResearchSchema.safeParse(JSON.parse(jsonText))
    if (!parsed.success) {
      return { error: 'Failed to parse company research output into the required format.' }
    }
    const company_research: CompanyResearch = parsed.data

    return { company_research }
  } catch (error) {
    if (isAnthropicRateLimitError(error) || isGroqRateLimitError(error)) {
      return {
        error: `Research is temporarily rate-limited for ${state.company_name}. Please retry in about 60 seconds.`,
      }
    }

    console.error('Company research error:', error)
    return {
      error: `Failed to research ${state.company_name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
