import { NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { coverLetterGraph } from '@/lib/agents/graph'
import type { Profile } from '@/types'
import { resolveLlmProvider } from '@/lib/llm/provider'
import { getGithubProjectHighlights } from '@/lib/github-projects'
import { logError, logInfo, logWarn, maskEmail, serializeError } from '@/lib/server-logger'

// Simple in-memory rate limiting (per user, 10 per hour)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

const DEFAULT_CLAUDE_COVER_LETTER_ALLOWED_EMAIL = 'meshari.albati@gmail.com'

type ManualProjectShape = {
  name: string
  description: string
  url?: string | null
}

function parseAllowedClaudeEmails(): string[] {
  const raw = process.env.CLAUDE_COVER_LETTER_ALLOWED_EMAILS || DEFAULT_CLAUDE_COVER_LETTER_ALLOWED_EMAIL
  return raw
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
}

function canUseClaudeForCoverLetter(email?: string | null): boolean {
  if (!email) return false
  return parseAllowedClaudeEmails().includes(email.trim().toLowerCase())
}

function trimText(value: string, max = 160): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized
}

function normalizeManualProjects(input: unknown): ManualProjectShape[] {
  if (!Array.isArray(input)) return []

  return input
    .map((project): ManualProjectShape | null => {
      if (!project || typeof project !== 'object') return null

      const shape = project as { name?: unknown, description?: unknown, url?: unknown }
      const name = typeof shape.name === 'string' ? shape.name.trim() : ''
      const description = typeof shape.description === 'string' ? shape.description.trim() : ''
      const url = typeof shape.url === 'string' ? shape.url.trim() : ''

      if (!name || !description) return null

      return {
        name,
        description,
        url: url || null,
      }
    })
    .filter((project): project is ManualProjectShape => Boolean(project))
    .slice(0, 6)
}

function buildManualProjectHighlights(manualProjects: ManualProjectShape[]): string[] {
  return manualProjects.map(project => {
    const name = trimText(project.name, 80)
    const description = trimText(project.description, 140)
    const url = project.url ? trimText(project.url, 80) : ''
    const base = `${name} | ${description}`
    return url ? `${base} | URL: ${url}` : base
  })
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const existing = rateLimitMap.get(userId)
  if (!existing || now > existing.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return true
  }
  if (existing.count >= 10) return false
  existing.count++
  return true
}

function createSSEStream(callback: (controller: ReadableStreamDefaultController) => Promise<void>) {
  const stream = new ReadableStream({
    async start(controller) {
      await callback(controller)
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

function sendEvent(controller: ReadableStreamDefaultController, event: string, data: object) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  controller.enqueue(new TextEncoder().encode(message))
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID()
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    logWarn('cover_letter_generation_unauthorized', { request_id: requestId })
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json()
  const companyName = typeof body?.company_name === 'string' ? body.company_name : ''
  const requestedProvider = resolveLlmProvider(body?.provider)
  const isClaudeAllowedForUser = canUseClaudeForCoverLetter(user.email)
  const llmProvider =
    requestedProvider === 'claude' && !isClaudeAllowedForUser
      ? 'groq'
      : requestedProvider
  const regenerate_id = typeof body?.regenerate_id === 'string' ? body.regenerate_id : undefined
  const normalizedCompanyName = companyName.trim()

  if (requestedProvider === 'claude' && llmProvider === 'groq') {
    logWarn('cover_letter_claude_restricted_user', {
      request_id: requestId,
      user_id: user.id,
      email: maskEmail(user.email),
      fallback_provider: 'groq',
    })
  }

  if (!normalizedCompanyName) {
    logWarn('cover_letter_generation_missing_company', {
      request_id: requestId,
      user_id: user.id,
      provider: llmProvider,
    })
    return new Response('Company name is required', { status: 400 })
  }

  if (!checkRateLimit(user.id)) {
    logWarn('cover_letter_generation_rate_limited', {
      request_id: requestId,
      user_id: user.id,
      company: normalizedCompanyName,
      provider: llmProvider,
    })
    return new Response('Rate limit exceeded. Please wait before generating more letters.', { status: 429 })
  }

  logInfo('cover_letter_generation_started', {
    request_id: requestId,
    user_id: user.id,
    company: normalizedCompanyName,
    provider: llmProvider,
    regenerate_id: regenerate_id || null,
  })

  return createSSEStream(async (controller) => {
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    let draftRecordId: string | null = null

    const cleanupDraft = async () => {
      if (!draftRecordId) return

      const recordId = draftRecordId
      draftRecordId = null
      const { error: cleanupError } = await adminClient
        .from('cover_letters')
        .delete()
        .eq('id', recordId)
        .eq('user_id', user.id)

      if (cleanupError) {
        logError('cover_letter_generation_cleanup_failed', {
          request_id: requestId,
          user_id: user.id,
          record_id: recordId,
          error: cleanupError,
        })
      }
    }

    try {
      // Fetch user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError || !profile) {
        logWarn('cover_letter_generation_profile_missing', {
          request_id: requestId,
          user_id: user.id,
          error: profileError || null,
        })
        sendEvent(controller, 'error', { message: 'Profile not found. Please complete your profile first.' })
        controller.close()
        return
      }

      const manualProjects = normalizeManualProjects(profile.manual_projects)
      const manualProjectHighlights = buildManualProjectHighlights(manualProjects)
      let githubProjectsSummary: string[] = []
      if (typeof profile.github_url === 'string' && profile.github_url.trim()) {
        const githubContext = await getGithubProjectHighlights(profile.github_url, {
          requestId,
          userId: user.id,
        })

        if (githubContext?.highlights?.length) {
          githubProjectsSummary = githubContext.highlights
          logInfo('cover_letter_github_projects_loaded', {
            request_id: requestId,
            user_id: user.id,
            username: githubContext.username,
            project_count: githubProjectsSummary.length,
          })
        } else {
          logWarn('cover_letter_github_projects_unavailable', {
            request_id: requestId,
            user_id: user.id,
            github_url: profile.github_url,
          })
        }
      }

      const projectHighlightsSummary = [
        ...manualProjectHighlights,
        ...githubProjectsSummary,
      ].slice(0, 10)

      if (manualProjects.length > 0) {
        logInfo('cover_letter_manual_projects_loaded', {
          request_id: requestId,
          user_id: user.id,
          project_count: manualProjects.length,
        })
      }

      // Check for cached company research (7-day TTL) — skip if regenerating fresh
      let cachedResearch = null
      if (!regenerate_id) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const { data: cached } = await adminClient
          .from('cover_letters')
          .select('company_research')
          .ilike('company_name', normalizedCompanyName)
          .not('company_research', 'is', null)
          .gte('created_at', sevenDaysAgo)
          .limit(1)
          .single()

        if (cached?.company_research) {
          cachedResearch = cached.company_research
        }
      }

      let version = 1
      if (regenerate_id) {
        const { data: previousVersionRow } = await supabase
          .from('cover_letters')
          .select('version')
          .eq('id', regenerate_id)
          .eq('user_id', user.id)
          .maybeSingle()
        if (previousVersionRow?.version) {
          version = previousVersionRow.version + 1
        }
      }

      const { data: newRecord, error: insertError } = await adminClient
        .from('cover_letters')
        .insert({
          user_id: user.id,
          company_name: normalizedCompanyName,
          cover_letter_text: '',
          version,
        })
        .select()
        .single()

      if (insertError || !newRecord) {
        logError('cover_letter_generation_record_create_failed', {
          request_id: requestId,
          user_id: user.id,
          company: normalizedCompanyName,
          error: insertError || null,
        })
        sendEvent(controller, 'error', { message: 'Failed to create record' })
        controller.close()
        return
      }

      draftRecordId = newRecord.id
      sendEvent(controller, 'cover_letter_id', { id: newRecord.id })

      // Step 1: Research (or use cache)
      sendEvent(controller, 'progress', { step: 'researching', message: `Researching ${normalizedCompanyName}...` })

      const initialState = {
        llm_provider: llmProvider,
        user_profile: {
          ...(profile as Profile),
          manual_projects: manualProjects,
          github_projects_summary: githubProjectsSummary,
          project_highlights_summary: projectHighlightsSummary,
        } as Profile,
        company_name: normalizedCompanyName,
        company_research: cachedResearch,
        skill_matches: null,
        cover_letter: '',
        error: null,
      }

      if (cachedResearch) {
        sendEvent(controller, 'progress', { step: 'researching', message: 'Using recent company research...' })
      }

      // Stream through the graph with progress updates
      const stream = await coverLetterGraph.stream(initialState, {
        streamMode: 'updates',
        configurable: {
          run_name: 'cover-letter-generation',
          metadata: { user_id: user.id, company: normalizedCompanyName, provider: llmProvider },
        },
      })

      let finalState = initialState as Record<string, unknown>

      for await (const update of stream) {
        const typedUpdate = update as Record<string, Record<string, unknown>>
        const nodeNames = Object.keys(typedUpdate)
        for (const nodeName of nodeNames) {
          const nodeUpdate = typedUpdate[nodeName]

          if (nodeUpdate.error) {
            logError('cover_letter_generation_node_failed', {
              request_id: requestId,
              user_id: user.id,
              company: normalizedCompanyName,
              provider: llmProvider,
              node: nodeName,
              node_error: nodeUpdate.error,
            })
            await cleanupDraft()
            sendEvent(controller, 'error', { message: nodeUpdate.error })
            controller.close()
            return
          }

          if (nodeName === 'research_company') {
            finalState = { ...finalState, ...nodeUpdate }
            sendEvent(controller, 'progress', { step: 'matching', message: 'Matching your skills to their needs...' })
          } else if (nodeName === 'match_skills') {
            finalState = { ...finalState, ...nodeUpdate }
            sendEvent(controller, 'progress', { step: 'writing', message: 'Writing your cover letter...' })
          } else if (nodeName === 'write_letter') {
            finalState = { ...finalState, ...nodeUpdate }
          }
        }
      }

      const finalCoverLetter = finalState.cover_letter as string
      const companyResearch = finalState.company_research
      const skillMatches = finalState.skill_matches

      if (!finalCoverLetter) {
        logError('cover_letter_generation_empty_output', {
          request_id: requestId,
          user_id: user.id,
          company: normalizedCompanyName,
          provider: llmProvider,
        })
        await cleanupDraft()
        sendEvent(controller, 'error', { message: 'Failed to generate cover letter' })
        controller.close()
        return
      }

      // Save final result
      const { error: saveError } = await adminClient
        .from('cover_letters')
        .update({
          cover_letter_text: finalCoverLetter,
          company_research: companyResearch,
          matched_skills: skillMatches,
        })
        .eq('id', newRecord.id)

      if (saveError) {
        logError('cover_letter_generation_save_failed', {
          request_id: requestId,
          user_id: user.id,
          record_id: newRecord.id,
          error: saveError,
        })
        await cleanupDraft()
        sendEvent(controller, 'error', { message: 'Failed to save generated cover letter' })
        controller.close()
        return
      }

      draftRecordId = null
      sendEvent(controller, 'done', {
        id: newRecord.id,
        cover_letter: finalCoverLetter,
        company_research: companyResearch,
        skill_matches: skillMatches,
      })

      logInfo('cover_letter_generation_completed', {
        request_id: requestId,
        user_id: user.id,
        record_id: newRecord.id,
        company: normalizedCompanyName,
        provider: llmProvider,
      })
      controller.close()
    } catch (error) {
      logError('cover_letter_generation_unhandled_error', {
        request_id: requestId,
        user_id: user.id,
        company: normalizedCompanyName,
        provider: llmProvider,
        error: serializeError(error),
      })
      await cleanupDraft()
      sendEvent(controller, 'error', {
        message: error instanceof Error ? error.message : 'Generation failed',
      })
      controller.close()
    }
  })
}
