import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ApplicationStatus } from '@/types'

const ALLOWED_APPLICATION_STATUSES: ApplicationStatus[] = [
  'generated',
  'applied',
  'interview',
  'accepted',
  'rejected',
]

function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && ALLOWED_APPLICATION_STATUSES.includes(value as ApplicationStatus)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('cover_letters')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const updates: { cover_letter_text?: string; application_status?: ApplicationStatus } = {}

  if ('cover_letter_text' in body) {
    const coverLetterText = (body as Record<string, unknown>).cover_letter_text
    if (typeof coverLetterText !== 'string') {
      return NextResponse.json({ error: 'cover_letter_text must be a string' }, { status: 400 })
    }
    updates.cover_letter_text = coverLetterText
  }

  if ('application_status' in body) {
    const applicationStatus = (body as Record<string, unknown>).application_status
    if (!isApplicationStatus(applicationStatus)) {
      return NextResponse.json({ error: 'Invalid application_status value' }, { status: 400 })
    }
    updates.application_status = applicationStatus
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('cover_letters')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('cover_letters')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
