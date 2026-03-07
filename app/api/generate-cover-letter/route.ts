import { NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { coverLetterGraph } from '@/lib/agents/graph'
import type { Profile } from '@/types'

// Simple in-memory rate limiting (per user, 10 per hour)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

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
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json()
  const companyName = typeof body?.company_name === 'string' ? body.company_name : ''
  const regenerate_id = typeof body?.regenerate_id === 'string' ? body.regenerate_id : undefined
  const normalizedCompanyName = companyName.trim()

  if (!normalizedCompanyName) {
    return new Response('Company name is required', { status: 400 })
  }

  if (!checkRateLimit(user.id)) {
    return new Response('Rate limit exceeded. Please wait before generating more letters.', { status: 429 })
  }

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
        console.error('Failed to cleanup draft cover letter:', cleanupError)
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
        sendEvent(controller, 'error', { message: 'Profile not found. Please complete your profile first.' })
        controller.close()
        return
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
        sendEvent(controller, 'error', { message: 'Failed to create record' })
        controller.close()
        return
      }

      draftRecordId = newRecord.id
      sendEvent(controller, 'cover_letter_id', { id: newRecord.id })

      // Step 1: Research (or use cache)
      sendEvent(controller, 'progress', { step: 'researching', message: `Researching ${normalizedCompanyName}...` })

      const initialState = {
        user_profile: profile as Profile,
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
          metadata: { user_id: user.id, company: normalizedCompanyName },
        },
      })

      let finalState = initialState as Record<string, unknown>

      for await (const update of stream) {
        const typedUpdate = update as Record<string, Record<string, unknown>>
        const nodeNames = Object.keys(typedUpdate)
        for (const nodeName of nodeNames) {
          const nodeUpdate = typedUpdate[nodeName]

          if (nodeUpdate.error) {
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

      controller.close()
    } catch (error) {
      console.error('Generation error:', error)
      await cleanupDraft()
      sendEvent(controller, 'error', {
        message: error instanceof Error ? error.message : 'Generation failed',
      })
      controller.close()
    }
  })
}
