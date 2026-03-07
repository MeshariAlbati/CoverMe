import { Annotation } from '@langchain/langgraph'
import type { Profile, CompanyResearch, SkillMatches } from '@/types'

export const CoverLetterStateAnnotation = Annotation.Root({
  user_profile: Annotation<Profile>(),
  company_name: Annotation<string>(),
  company_research: Annotation<CompanyResearch | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),
  skill_matches: Annotation<SkillMatches | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),
  cover_letter: Annotation<string>({
    default: () => '',
    reducer: (_, next) => next,
  }),
  error: Annotation<string | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),
})

export type CoverLetterState = typeof CoverLetterStateAnnotation.State
