import Anthropic from '@anthropic-ai/sdk'
import type { Message } from '@anthropic-ai/sdk/resources/messages'
import type { CoverLetterState } from './state'
import type { CompanyResearch } from '@/types'

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

export async function researchCompanyNode(
  state: CoverLetterState
): Promise<Partial<CoverLetterState>> {
  try {
    const anthropic = getAnthropic()
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 4096,
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      messages: [
        {
          role: 'user',
          content: `You are a company research specialist. Research "${state.company_name}" thoroughly and return ONLY a valid JSON object (no markdown, no explanation).

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
}`,
        },
      ],
      metadata: {
        user_id: state.user_profile.id,
      },
    }) as Message

    // Find the final text response
    let researchText = ''
    for (const block of response.content) {
      if (block.type === 'text') {
        researchText = block.text
      }
    }

    // Handle tool_use blocks by getting final answer via follow-up if needed
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

      const followUp = await getAnthropic().messages.create({
        model: 'claude-sonnet-4-6-20250514',
        max_tokens: 4096,
        messages,
      }) as Message

      for (const block of followUp.content) {
        if (block.type === 'text') {
          researchText = block.text
          break
        }
      }
    }

    const jsonText = researchText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    const company_research: CompanyResearch = JSON.parse(jsonText)

    return { company_research }
  } catch (error) {
    console.error('Company research error:', error)
    return {
      error: `Failed to research ${state.company_name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
