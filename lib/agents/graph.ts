import { StateGraph, END } from '@langchain/langgraph'
import { CoverLetterStateAnnotation } from './state'
import { researchCompanyNode } from './researcher'
import { matchSkillsNode } from './matcher'
import { writeLetterNode } from './writer'

// Set up LangSmith tracing env if not already set
if (process.env.LANGCHAIN_API_KEY) {
  process.env.LANGCHAIN_TRACING_V2 = 'true'
  process.env.LANGCHAIN_PROJECT = process.env.LANGCHAIN_PROJECT || 'cover-letter-generator'
}

function shouldContinueAfterResearch(state: typeof CoverLetterStateAnnotation.State) {
  if (state.error) return 'end'
  return 'match_skills'
}

function shouldContinueAfterMatching(state: typeof CoverLetterStateAnnotation.State) {
  if (state.error) return 'end'
  return 'write_letter'
}

const workflow = new StateGraph(CoverLetterStateAnnotation)
  .addNode('research_company', researchCompanyNode)
  .addNode('match_skills', matchSkillsNode)
  .addNode('write_letter', writeLetterNode)
  .addEdge('__start__', 'research_company')
  .addConditionalEdges('research_company', shouldContinueAfterResearch, {
    match_skills: 'match_skills',
    end: END,
  })
  .addConditionalEdges('match_skills', shouldContinueAfterMatching, {
    write_letter: 'write_letter',
    end: END,
  })
  .addEdge('write_letter', END)

export const coverLetterGraph = workflow.compile()
