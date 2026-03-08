'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Building2,
  ArrowRight,
  Calendar,
  Loader2,
  Trash2,
  Eye,
  FileText,
  User,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import AppNavbar from '@/components/layout/AppNavbar'
import type { ApplicationStatus, CoverLetter, LLMProvider } from '@/types'
import { consumeSSE } from '@/lib/sse-client'
import ProviderPicker from '@/components/ui/provider-picker'

interface Props {
  profile: { full_name: string; job_title: string; cv_url: string | null } | null
  initialCoverLetters: CoverLetter[]
}

const GENERATION_PROVIDER_STORAGE_KEY = 'coverme.generation-provider'

const APPLICATION_STATUSES: ApplicationStatus[] = [
  'generated',
  'applied',
  'interview',
  'accepted',
  'rejected',
]

const APPLICATION_STATUS_META: Record<ApplicationStatus, {
  label: string
  textColor: string
  borderColor: string
  backgroundColor: string
}> = {
  generated: {
    label: 'Generated',
    textColor: '#8A8A8E',
    borderColor: '#333338',
    backgroundColor: '#1A1A1F',
  },
  applied: {
    label: 'Applied',
    textColor: '#E5C07B',
    borderColor: 'rgba(229, 192, 123, 0.3)',
    backgroundColor: 'rgba(229, 192, 123, 0.08)',
  },
  interview: {
    label: 'Interview',
    textColor: '#61AFEF',
    borderColor: 'rgba(97, 175, 239, 0.3)',
    backgroundColor: 'rgba(97, 175, 239, 0.08)',
  },
  accepted: {
    label: 'Accepted',
    textColor: '#7EC699',
    borderColor: 'rgba(126, 198, 153, 0.3)',
    backgroundColor: 'rgba(126, 198, 153, 0.1)',
  },
  rejected: {
    label: 'Rejected',
    textColor: '#E06C75',
    borderColor: 'rgba(224, 108, 117, 0.3)',
    backgroundColor: 'rgba(224, 108, 117, 0.08)',
  },
}

function readStringField(data: unknown, key: string): string | null {
  if (!data || typeof data !== 'object') return null
  const value = (data as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

function normalizeApplicationStatus(value: unknown): ApplicationStatus {
  if (value === 'generated' || value === 'applied' || value === 'interview' || value === 'accepted' || value === 'rejected') {
    return value
  }
  return 'generated'
}

function normalizeCoverLetters(letters: CoverLetter[]): CoverLetter[] {
  return letters.map((letter) => ({
    ...letter,
    application_status: normalizeApplicationStatus((letter as Partial<CoverLetter>).application_status),
  }))
}

function toPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0%'
  return `${Math.round((numerator / denominator) * 100)}%`
}

type StepState = 'pending' | 'active' | 'done'

interface GenerationStepState {
  research: StepState
  matching: StepState
  writing: StepState
}

function getStepStates(message: string): GenerationStepState {
  const msg = message.toLowerCase()
  if (msg.includes('writing') || msg.includes('crafting')) {
    return { research: 'done', matching: 'done', writing: 'active' }
  }
  if (msg.includes('matching') || msg.includes('analyzing')) {
    return { research: 'done', matching: 'active', writing: 'pending' }
  }
  if (msg.includes('researching') || msg.includes('recent') || msg.includes('company')) {
    return { research: 'active', matching: 'pending', writing: 'pending' }
  }
  return { research: 'active', matching: 'pending', writing: 'pending' }
}

function PipelineStep({ label, description, state }: {
  label: string
  description: string
  state: StepState
}) {
  return (
    <div
      className="flex items-start gap-4 p-4 rounded-lg border transition-all duration-300"
      style={{
        backgroundColor: state === 'active' ? 'rgba(229, 192, 123, 0.05)' : '#111113',
        borderColor: state === 'active' ? 'rgba(229, 192, 123, 0.3)' : state === 'done' ? 'rgba(126, 198, 153, 0.2)' : '#222228',
        borderLeftWidth: state === 'active' ? '2px' : '1px',
        borderLeftColor: state === 'active' ? '#E5C07B' : state === 'done' ? '#7EC699' : '#222228',
      }}
    >
      <div className="mt-0.5 flex-shrink-0">
        {state === 'done' ? (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(126, 198, 153, 0.15)', border: '1px solid rgba(126, 198, 153, 0.4)' }}
          >
            <CheckCircle2 className="w-3 h-3" style={{ color: '#7EC699' }} />
          </div>
        ) : state === 'active' ? (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(229, 192, 123, 0.1)', border: '1px solid rgba(229, 192, 123, 0.4)' }}
          >
            <Loader2 className="w-3 h-3 animate-spin" style={{ color: '#E5C07B' }} />
          </div>
        ) : (
          <div
            className="w-5 h-5 rounded-full"
            style={{ border: '1px dashed #333338' }}
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p
          className="font-mono text-[12px] font-medium tracking-wide transition-colors duration-300"
          style={{
            color: state === 'done' ? '#7EC699' : state === 'active' ? '#E5C07B' : '#555559',
          }}
        >
          {label}
        </p>
        <p className="text-[12px] mt-0.5 transition-opacity duration-300" style={{ color: '#555559', opacity: state === 'pending' ? 0.5 : 1 }}>
          {description}
        </p>

        {state === 'active' && (
          <div className="mt-2 h-px relative overflow-hidden rounded" style={{ backgroundColor: '#1A1A1F' }}>
            <div className="scan-line" />
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper?: string
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ backgroundColor: '#111113', borderColor: '#222228' }}
    >
      <p className="font-mono text-[11px] tracking-wider uppercase" style={{ color: '#555559' }}>
        {label}
      </p>
      <p className="text-[24px] leading-none mt-2 font-serif" style={{ color: '#EDEDEF' }}>
        {value}
      </p>
      {helper && (
        <p className="text-[12px] mt-1" style={{ color: '#555559' }}>
          {helper}
        </p>
      )}
    </div>
  )
}

export default function DashboardClient({ profile, initialCoverLetters }: Props) {
  const router = useRouter()
  const [companyName, setCompanyName] = useState('')
  const [llmProvider, setLlmProvider] = useState<LLMProvider>('groq')
  const [generating, setGenerating] = useState(false)
  const [generatingMessage, setGeneratingMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [coverLetters, setCoverLetters] = useState<CoverLetter[]>(normalizeCoverLetters(initialCoverLetters))
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const profileIncomplete = !profile?.full_name || !profile?.job_title
  const steps = generating ? getStepStates(generatingMessage) : null

  const analytics = useMemo(() => {
    const counts: Record<ApplicationStatus, number> = {
      generated: 0,
      applied: 0,
      interview: 0,
      accepted: 0,
      rejected: 0,
    }

    for (const letter of coverLetters) {
      counts[normalizeApplicationStatus(letter.application_status)] += 1
    }

    const submitted = coverLetters.length - counts.generated
    const interviewQualified = counts.interview + counts.accepted

    return {
      counts,
      submitted,
      interviewQualified,
      interviewRate: toPercent(interviewQualified, submitted),
      acceptanceRate: toPercent(counts.accepted, submitted),
    }
  }, [coverLetters])

  useEffect(() => {
    const stored = window.localStorage.getItem(GENERATION_PROVIDER_STORAGE_KEY)
    if (stored === 'groq') {
      setLlmProvider('groq')
    } else if (stored === 'claude') {
      setLlmProvider('groq')
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(GENERATION_PROVIDER_STORAGE_KEY, llmProvider)
  }, [llmProvider])

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!companyName.trim()) return

    setGenerating(true)
    setError(null)
    setGeneratingMessage(`Researching ${companyName}...`)

    abortRef.current = new AbortController()

    try {
      const response = await fetch('/api/generate-cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: companyName, provider: llmProvider }),
        signal: abortRef.current.signal,
      })

      let coverId: string | null = null
      let navigated = false

      await consumeSSE(response, (eventType, data) => {
        if (eventType === 'cover_letter_id') {
          const id = readStringField(data, 'id')
          if (id) coverId = id
          return
        }

        if (eventType === 'progress') {
          const message = readStringField(data, 'message')
          if (message) setGeneratingMessage(message)
          return
        }

        if (eventType === 'done') {
          const id = readStringField(data, 'id')
          if (id) {
            coverId = id
            navigated = true
            router.push(`/generate/${id}`)
          }
        }
      })

      if (!coverId) {
        throw new Error('Generation ended without a result')
      }

      if (!navigated) {
        router.push(`/generate/${coverId}`)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Generation failed')
        setGenerating(false)
        setGeneratingMessage('')
      }
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this cover letter?')) return

    const res = await fetch(`/api/cover-letters/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      setError('Failed to delete cover letter')
      return
    }

    setCoverLetters((prev) => prev.filter((cl) => cl.id !== id))
  }

  async function handleStatusChange(id: string, status: ApplicationStatus) {
    const current = coverLetters.find((cl) => cl.id === id)
    if (!current || current.application_status === status) return

    const previousStatus = current.application_status
    setError(null)
    setStatusUpdatingId(id)
    setCoverLetters((prev) => prev.map((cl) => {
      if (cl.id !== id) return cl
      return { ...cl, application_status: status }
    }))

    try {
      const res = await fetch(`/api/cover-letters/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_status: status }),
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        throw new Error((payload as { error?: string } | null)?.error || 'Failed to update status')
      }
    } catch (err) {
      setCoverLetters((prev) => prev.map((cl) => {
        if (cl.id !== id) return cl
        return { ...cl, application_status: previousStatus }
      }))
      setError(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setStatusUpdatingId((prev) => (prev === id ? null : prev))
    }
  }

  return (
    <>
      <AppNavbar />
      <div
        className="min-h-screen"
        style={{ backgroundColor: '#0A0A0B' }}
      >
        <div className="max-w-[1100px] mx-auto px-6 sm:px-8 py-10 space-y-10">

          <div className="animate-fade-up">
            <h1
              className="font-serif text-[32px] leading-tight tracking-[-0.02em] mb-1"
              style={{ color: '#EDEDEF' }}
            >
              {profile?.full_name ? `${profile.full_name.split(' ')[0]}'s workspace` : 'Dashboard'}
            </h1>
            <p className="text-[14px]" style={{ color: '#555559' }}>
              Generate a cover letter for any company below
            </p>
          </div>

          {profileIncomplete && (
            <div
              className="flex items-start gap-3 p-4 rounded-lg border animate-fade-up"
              style={{
                backgroundColor: 'rgba(229, 192, 123, 0.05)',
                borderColor: 'rgba(229, 192, 123, 0.2)',
              }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#E5C07B' }} />
              <div className="flex-1">
                <p className="text-[13px] font-medium mb-0.5" style={{ color: '#E5C07B' }}>
                  Complete your profile first
                </p>
                <p className="text-[13px]" style={{ color: '#8A8A8E' }}>
                  Upload your CV and fill in your details to generate cover letters.
                </p>
              </div>
              <Link href="/profile">
                <button
                  className="h-7 px-3 rounded text-[12px] font-medium border transition-colors flex items-center gap-1.5"
                  style={{ borderColor: 'rgba(229, 192, 123, 0.3)', color: '#E5C07B' }}
                >
                  <User className="w-3 h-3" />
                  Set up profile
                </button>
              </Link>
            </div>
          )}

          <div
            className="rounded-lg border p-6 animate-fade-up"
            style={{ backgroundColor: '#111113', borderColor: '#222228', animationDelay: '0.05s', animationFillMode: 'both' }}
          >
            <p className="text-[12px] font-mono tracking-wider uppercase mb-4" style={{ color: '#555559' }}>
              New cover letter
            </p>
            <div className="mb-4 flex items-center gap-3">
              <label className="text-[12px] font-mono tracking-wider uppercase" style={{ color: '#555559' }}>
                AI Provider
              </label>
              <ProviderPicker
                value={llmProvider}
                onChange={setLlmProvider}
                disabled={generating}
                allowClaude={false}
                lockedClaudeMessage="Sorry but it cost a lot ): "
              />
            </div>
            <form onSubmit={handleGenerate} className="flex flex-col sm:flex-row gap-3">
              <input
                ref={inputRef}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Enter company name (e.g. Stripe, Notion, Anthropic)"
                disabled={generating || profileIncomplete}
                className="flex-1 h-10 px-4 rounded text-[14px] outline-none transition-all duration-200"
                style={{
                  backgroundColor: '#1A1A1F',
                  border: '1px solid #222228',
                  color: '#EDEDEF',
                  opacity: (generating || profileIncomplete) ? 0.5 : 1,
                  cursor: (generating || profileIncomplete) ? 'not-allowed' : 'text',
                }}
                onFocus={(e) => {
                  if (!generating && !profileIncomplete) {
                    e.target.style.borderColor = '#E5C07B'
                    e.target.style.boxShadow = '0 0 0 2px rgba(229, 192, 123, 0.08)'
                  }
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#222228'
                  e.target.style.boxShadow = 'none'
                }}
              />
              <button
                type="submit"
                disabled={generating || !companyName.trim() || profileIncomplete}
                className="h-10 px-5 rounded text-[14px] font-medium transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap sm:w-auto w-full"
                style={{
                  backgroundColor: '#E5C07B',
                  color: '#0A0A0B',
                  opacity: (generating || !companyName.trim() || profileIncomplete) ? 0.5 : 1,
                  cursor: (generating || !companyName.trim() || profileIncomplete) ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget
                  if (!el.disabled) el.style.backgroundColor = '#F0D08A'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#E5C07B'
                }}
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating
                  </>
                ) : (
                  <>
                    Generate
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {error && (
              <p className="text-[13px] mt-3 flex items-center gap-2" style={{ color: '#E06C75' }}>
                <AlertCircle className="w-3.5 h-3.5" />
                {error}
              </p>
            )}

            {generating && steps && (
              <div className="mt-5 space-y-2">
                <PipelineStep
                  label="Researching company"
                  description={`Finding culture signals, mission, and recent news for ${companyName}`}
                  state={steps.research}
                />
                <PipelineStep
                  label="Matching your skills"
                  description="Identifying the strongest angles between your experience and their needs"
                  state={steps.matching}
                />
                <PipelineStep
                  label="Writing your letter"
                  description="Crafting a tailored letter that references real company details"
                  state={steps.writing}
                />
              </div>
            )}
          </div>

          <div className="animate-fade-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[16px] font-semibold" style={{ color: '#EDEDEF' }}>
                Application Tracking
              </h2>
              <span
                className="font-mono text-[12px] px-2 py-0.5 rounded border"
                style={{ color: '#555559', borderColor: '#222228', backgroundColor: '#111113' }}
              >
                {coverLetters.length}
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
              <StatCard label="Total Letters" value={String(coverLetters.length)} />
              <StatCard label="Applied" value={String(analytics.counts.applied)} />
              <StatCard label="Interviews" value={String(analytics.counts.interview)} />
              <StatCard label="Accepted" value={String(analytics.counts.accepted)} />
              <StatCard label="Interview Rate" value={analytics.interviewRate} helper="Interviews from submitted" />
              <StatCard label="Acceptance Rate" value={analytics.acceptanceRate} helper="Accepted from submitted" />
            </div>

            {coverLetters.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center rounded-lg border" style={{ backgroundColor: '#111113', borderColor: '#222228' }}>
                <div
                  className="w-12 h-12 rounded-lg border flex items-center justify-center mb-4"
                  style={{ backgroundColor: '#111113', borderColor: '#222228' }}
                >
                  <FileText className="w-5 h-5" style={{ color: '#333338' }} />
                </div>
                <p className="text-[15px] font-medium mb-1" style={{ color: '#555559' }}>
                  Generate your first cover letter
                </p>
                <p className="text-[13px]" style={{ color: '#333338' }}>
                  Enter a company name above to get started
                </p>
              </div>
            ) : (
              <div
                className="rounded-lg border overflow-hidden"
                style={{ backgroundColor: '#111113', borderColor: '#222228' }}
              >
                <div
                  className="hidden md:grid grid-cols-[1.15fr_2fr_1fr_0.9fr_0.9fr] gap-4 px-4 py-3 border-b"
                  style={{ borderColor: '#222228' }}
                >
                  <p className="font-mono text-[11px] uppercase tracking-wider" style={{ color: '#555559' }}>Company</p>
                  <p className="font-mono text-[11px] uppercase tracking-wider" style={{ color: '#555559' }}>Cover Letter</p>
                  <p className="font-mono text-[11px] uppercase tracking-wider" style={{ color: '#555559' }}>Status</p>
                  <p className="font-mono text-[11px] uppercase tracking-wider" style={{ color: '#555559' }}>Created</p>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-right" style={{ color: '#555559' }}>Actions</p>
                </div>

                {coverLetters.map((coverLetter, i) => (
                  <CoverLetterRow
                    key={coverLetter.id}
                    coverLetter={coverLetter}
                    onDelete={handleDelete}
                    onStatusChange={handleStatusChange}
                    statusUpdating={statusUpdatingId === coverLetter.id}
                    index={i}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function CoverLetterRow({
  coverLetter,
  onDelete,
  onStatusChange,
  statusUpdating,
  index,
}: {
  coverLetter: CoverLetter
  onDelete: (id: string, e: React.MouseEvent) => void
  onStatusChange: (id: string, status: ApplicationStatus) => void
  statusUpdating: boolean
  index: number
}) {
  const router = useRouter()
  const preview = coverLetter.cover_letter_text?.trim()
    ? coverLetter.cover_letter_text.slice(0, 180)
    : 'No cover letter text yet.'
  const date = new Date(coverLetter.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
  const status = normalizeApplicationStatus(coverLetter.application_status)
  const statusMeta = APPLICATION_STATUS_META[status]

  return (
    <div
      className="px-4 py-4 border-t transition-colors cursor-pointer"
      style={{
        borderColor: '#1A1A1F',
        animation: `card-enter 0.35s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.04}s both`,
      }}
      onClick={() => router.push(`/generate/${coverLetter.id}`)}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#151518'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-[1.15fr_2fr_1fr_0.9fr_0.9fr] gap-3 md:gap-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(229, 192, 123, 0.08)', border: '1px solid rgba(229, 192, 123, 0.15)' }}
          >
            <Building2 className="w-4 h-4" style={{ color: '#E5C07B' }} />
          </div>
          <div className="min-w-0">
            <p className="font-serif text-[15px] leading-tight truncate" style={{ color: '#EDEDEF' }}>
              {coverLetter.company_name}
            </p>
            <p className="font-mono text-[11px] mt-0.5" style={{ color: '#555559' }}>
              v{coverLetter.version}
            </p>
          </div>
        </div>

        <p className="text-[12px] leading-[1.6] line-clamp-2" style={{ color: '#8A8A8E' }}>
          {preview}
        </p>

        <div
          className="flex items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <select
            value={status}
            disabled={statusUpdating}
            onChange={(e) => onStatusChange(coverLetter.id, e.target.value as ApplicationStatus)}
            className="h-8 w-full rounded px-2 text-[12px] border outline-none"
            style={{
              color: statusMeta.textColor,
              borderColor: statusMeta.borderColor,
              backgroundColor: statusMeta.backgroundColor,
              cursor: statusUpdating ? 'not-allowed' : 'pointer',
              opacity: statusUpdating ? 0.6 : 1,
            }}
          >
            {APPLICATION_STATUSES.map((value) => (
              <option key={value} value={value} style={{ color: '#EDEDEF', backgroundColor: '#111113' }}>
                {APPLICATION_STATUS_META[value].label}
              </option>
            ))}
          </select>
        </div>

        <p className="font-mono text-[11px] flex items-center gap-1" style={{ color: '#555559' }}>
          <Calendar className="w-3 h-3" />
          {date}
        </p>

        <div
          className="flex items-center justify-end gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => router.push(`/generate/${coverLetter.id}`)}
            className="h-7 px-2.5 rounded text-[12px] border flex items-center gap-1.5 transition-colors"
            style={{ borderColor: '#222228', color: '#E5C07B' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1A1A1F'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <Eye className="w-3 h-3" />
            View
          </button>
          <button
            onClick={(e) => onDelete(coverLetter.id, e)}
            className="w-7 h-7 flex items-center justify-center rounded transition-all duration-150"
            style={{ color: '#555559' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#E06C75'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#555559'
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
