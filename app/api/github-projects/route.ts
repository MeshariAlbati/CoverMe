import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGithubProjects } from '@/lib/github-projects'
import { logError, logWarn, serializeError } from '@/lib/server-logger'

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID()

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json() as { github_url?: string }
    const githubUrl = typeof body.github_url === 'string' ? body.github_url.trim() : ''
    if (!githubUrl) {
      return NextResponse.json({ error: 'GitHub URL is required' }, { status: 400 })
    }

    const result = await getGithubProjects(githubUrl, {
      requestId,
      userId: user.id,
    })

    if (!result) {
      logWarn('github_projects_import_failed', {
        request_id: requestId,
        user_id: user.id,
        github_url: githubUrl,
      })
      return NextResponse.json({ error: 'Unable to fetch projects from this GitHub URL' }, { status: 400 })
    }

    return NextResponse.json({
      username: result.username,
      projects: result.projects,
    })
  } catch (error) {
    logError('github_projects_import_unhandled_error', {
      request_id: requestId,
      error: serializeError(error),
    })
    return NextResponse.json({ error: 'Failed to fetch GitHub projects' }, { status: 500 })
  }
}
