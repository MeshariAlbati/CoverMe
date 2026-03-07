'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Building2, ArrowRight, Calendar, Loader2, Trash2, Eye,
  FileText, User, AlertCircle, CheckCircle2
} from 'lucide-react'
import AppNavbar from '@/components/layout/AppNavbar'
import type { CoverLetter, LLMProvider } from '@/types'
import { consumeSSE } from '@/lib/sse-client'
import ProviderPicker from '@/components/ui/provider-picker'

interface Props {
  profile: { full_name: string; job_title: string; cv_url: string | null } | null
  initialCoverLetters: CoverLetter[]
}

const GENERATION_PROVIDER_STORAGE_KEY = 'coverme.generation-provider'

function readStringField(data: unknown, key: string): string | null {
  if (!data || typeof data !== 'object') return null
  const value = (data as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
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
      {/* Status indicator */}
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

      {/* Content */}
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

        {/* Active scanning animation */}
        {state === 'active' && (
          <div className="mt-2 h-px relative overflow-hidden rounded" style={{ backgroundColor: '#1A1A1F' }}>
            <div className="scan-line" />
          </div>
        )}
      </div>
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
  const [coverLetters, setCoverLetters] = useState<CoverLetter[]>(initialCoverLetters)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const profileIncomplete = !profile?.full_name || !profile?.job_title
  const steps = generating ? getStepStates(generatingMessage) : null

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
    await fetch(`/api/cover-letters/${id}`, { method: 'DELETE' })
    setCoverLetters(prev => prev.filter(cl => cl.id !== id))
  }

  return (
    <>
      <AppNavbar />
      <div
        className="min-h-screen"
        style={{ backgroundColor: '#0A0A0B' }}
      >
        <div className="max-w-[1100px] mx-auto px-6 sm:px-8 py-10 space-y-10">

          {/* Header */}
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

          {/* Profile incomplete warning */}
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

          {/* Generate form */}
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
            <form onSubmit={handleGenerate} className="flex gap-3">
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
                onFocus={e => {
                  if (!generating && !profileIncomplete) {
                    e.target.style.borderColor = '#E5C07B'
                    e.target.style.boxShadow = '0 0 0 2px rgba(229, 192, 123, 0.08)'
                  }
                }}
                onBlur={e => {
                  e.target.style.borderColor = '#222228'
                  e.target.style.boxShadow = 'none'
                }}
              />
              <button
                type="submit"
                disabled={generating || !companyName.trim() || profileIncomplete}
                className="h-10 px-5 rounded text-[14px] font-medium transition-all duration-200 flex items-center gap-2 whitespace-nowrap"
                style={{
                  backgroundColor: '#E5C07B',
                  color: '#0A0A0B',
                  opacity: (generating || !companyName.trim() || profileIncomplete) ? 0.5 : 1,
                  cursor: (generating || !companyName.trim() || profileIncomplete) ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget
                  if (!el.disabled) el.style.backgroundColor = '#F0D08A'
                }}
                onMouseLeave={e => {
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

            {/* Pipeline visualization */}
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

          {/* Cover Letters */}
          <div className="animate-fade-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[16px] font-semibold" style={{ color: '#EDEDEF' }}>
                Your Letters
              </h2>
              <span
                className="font-mono text-[12px] px-2 py-0.5 rounded border"
                style={{ color: '#555559', borderColor: '#222228', backgroundColor: '#111113' }}
              >
                {coverLetters.length}
              </span>
            </div>

            {coverLetters.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {coverLetters.map((cl, i) => (
                  <CoverLetterCard
                    key={cl.id}
                    coverLetter={cl}
                    onDelete={handleDelete}
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

function CoverLetterCard({
  coverLetter,
  onDelete,
  index,
}: {
  coverLetter: CoverLetter
  onDelete: (id: string, e: React.MouseEvent) => void
  index: number
}) {
  const router = useRouter()
  const [hovered, setHovered] = useState(false)
  const preview = coverLetter.cover_letter_text?.slice(0, 110) + '...'
  const date = new Date(coverLetter.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div
      className="rounded-lg border cursor-pointer transition-all duration-200"
      style={{
        backgroundColor: '#111113',
        borderColor: hovered ? '#333338' : '#222228',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.3)' : 'none',
        animation: `card-enter 0.35s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.05}s both`,
      }}
      onClick={() => router.push(`/generate/${coverLetter.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(229, 192, 123, 0.08)', border: '1px solid rgba(229, 192, 123, 0.15)' }}
            >
              <Building2 className="w-4 h-4" style={{ color: '#E5C07B' }} />
            </div>
            <div>
              <p className="font-serif text-[15px] leading-tight" style={{ color: '#EDEDEF' }}>
                {coverLetter.company_name}
              </p>
              <p className="font-mono text-[11px] flex items-center gap-1 mt-0.5" style={{ color: '#555559' }}>
                <Calendar className="w-3 h-3" />
                {date}
              </p>
            </div>
          </div>
          <button
            onClick={(e) => onDelete(coverLetter.id, e)}
            className="w-6 h-6 flex items-center justify-center rounded transition-all duration-150"
            style={{
              color: '#555559',
              opacity: hovered ? 1 : 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#E06C75')}
            onMouseLeave={e => (e.currentTarget.style.color = '#555559')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Preview */}
        {coverLetter.cover_letter_text && (
          <p className="text-[12px] leading-[1.6] line-clamp-3 mb-3" style={{ color: '#555559' }}>
            {preview}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: '#1A1A1F' }}>
          <span
            className="font-mono text-[11px] px-1.5 py-0.5 rounded border"
            style={{ color: '#555559', borderColor: '#222228' }}
          >
            v{coverLetter.version}
          </span>
          <span
            className="text-[12px] flex items-center gap-1 transition-opacity duration-150"
            style={{ color: '#E5C07B', opacity: hovered ? 1 : 0 }}
          >
            <Eye className="w-3 h-3" />
            View
          </span>
        </div>
      </div>
    </div>
  )
}
