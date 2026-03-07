export type LLMProvider = 'claude' | 'groq'

export interface Profile {
  id: string
  full_name: string
  email: string
  phone: string | null
  linkedin_url: string | null
  location: string | null
  job_title: string
  years_of_experience: number
  skills: string[]
  education: Education[]
  work_experience: WorkExperience[]
  certifications: string[] | null
  languages: string[] | null
  preferred_tone: 'formal' | 'conversational' | 'confident' | 'balanced'
  career_intent: 'same_field' | 'career_change' | 'promotion' | 'freelance'
  unique_value: string
  proudest_achievement: string
  things_to_emphasize: string | null
  things_to_downplay: string | null
  cv_url: string | null
  raw_cv_text: string | null
  created_at: string
  updated_at: string
}

export interface Education {
  degree: string
  institution: string
  year: string
}

export interface WorkExperience {
  title: string
  company: string
  duration: string
  highlights: string[]
}

export interface CompanyResearch {
  company_name: string
  industry: string
  mission_and_values: string
  recent_news: string[]
  products_and_services: string
  tech_stack: string[]
  culture_keywords: string[]
  growth_areas: string[]
  challenges: string[]
  key_leadership: { name: string; role: string }[]
  what_they_look_for: string
}

export interface SkillMatch {
  user_skill_or_experience: string
  company_need_it_addresses: string
  relevance: 'high' | 'medium' | 'low'
  suggested_framing: string
}

export interface BridgeStory {
  experience: string
  connection_to_company: string
  narrative_angle: string
}

export interface SkillMatches {
  top_matches: SkillMatch[]
  bridge_stories: BridgeStory[]
  gaps_to_address: string[]
  recommended_narrative_arc: string
  key_value_proposition: string
}

export interface CoverLetter {
  id: string
  user_id: string
  company_name: string
  company_research: CompanyResearch | null
  matched_skills: SkillMatches | null
  cover_letter_text: string
  version: number
  created_at: string
}

export type GenerationStep = 'idle' | 'researching' | 'matching' | 'writing' | 'done' | 'error'

export interface GenerationState {
  step: GenerationStep
  message: string
  cover_letter_id?: string
  error?: string
}
