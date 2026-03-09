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
  index = 0,
  visible = true,
}: {
  label: string
  value: string
  helper?: string
  index?: number
  visible?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className="rounded-lg border p-4 transition-all duration-300"
      style={{
        backgroundColor: hovered ? '#161619' : '#111113',
        borderColor: hovered ? 'rgba(229, 192, 123, 0.18)' : '#222228',
        boxShadow: hovered ? '0 0 18px rgba(229, 192, 123, 0.06), 0 4px 16px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.2)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: `opacity 500ms cubic-bezier(0.16,1,0.3,1) ${index * 60}ms, transform 500ms cubic-bezier(0.16,1,0.3,1) ${index * 60}ms, background-color 200ms, border-color 200ms, box-shadow 200ms`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <p className="font-mono text-[11px] tracking-wider uppercase" style={{ color: '#555559' }}>
        {label}
      </p>
      <p className="text-[26px] leading-none mt-2 font-serif" style={{ color: '#EDEDEF' }}>
        {value}
      </p>
      {helper && (
        <p className="text-[11px] mt-1.5" style={{ color: '#3D3D42' }}>
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
  const [statsMounted, setStatsMounted] = useState(false)
  const [celebration, setCelebration] = useState<{ company: string; key: number } | null>(null)
  const [rejection, setRejection] = useState<{ company: string; key: number } | null>(null)
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
    const t = setTimeout(() => setStatsMounted(true), 120)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!celebration) return
    const t = setTimeout(() => setCelebration(null), 4600)
    return () => clearTimeout(t)
  }, [celebration])

  useEffect(() => {
    if (!rejection) return
    const t = setTimeout(() => setRejection(null), 5600)
    return () => clearTimeout(t)
  }, [rejection])

  useEffect(() => {
    if (!rejection) return
    document.body.style.filter = 'grayscale(0.92) brightness(0.82)'
    document.body.style.transition = 'filter 0.4s ease'
    const t1 = setTimeout(() => {
      document.body.style.filter = 'grayscale(0) brightness(1)'
      document.body.style.transition = 'filter 2s ease'
    }, 1400)
    const t2 = setTimeout(() => {
      document.body.style.filter = ''
      document.body.style.transition = ''
    }, 3600)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      document.body.style.filter = ''
      document.body.style.transition = ''
    }
  }, [rejection])

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

  async function handleGenerate(e: React.SyntheticEvent<HTMLFormElement>) {
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

      if (status === 'accepted') {
        setCelebration({ company: current.company_name, key: Date.now() })
      } else if (status === 'rejected') {
        setRejection({ company: current.company_name, key: Date.now() })
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
      {celebration && (
        <div key={celebration.key}>
          {/* Screen flash */}
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 9997, pointerEvents: 'none',
              backgroundColor: 'rgba(229, 192, 123, 0.09)',
              animation: 'accepted-flash 0.8s ease-out forwards',
            }}
          />
          {/* Confetti canvas */}
          <ConfettiBurst />
          {/* Toast */}
          <div
            style={{
              position: 'fixed', top: '28px', left: '50%',
              zIndex: 10000, pointerEvents: 'none',
              animation: 'accepted-toast-anim 4.6s ease forwards',
              backgroundColor: '#111113',
              border: '1px solid rgba(229, 192, 123, 0.5)',
              borderRadius: '12px',
              padding: '14px 22px',
              display: 'flex', alignItems: 'center', gap: '10px',
              boxShadow: '0 0 40px rgba(229,192,123,0.22), 0 0 80px rgba(229,192,123,0.08), 0 8px 32px rgba(0,0,0,0.55)',
              fontSize: '14px', fontWeight: 500, color: '#EDEDEF',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: '20px' }}>🎉</span>
            <span>
              Congratulations!{' '}
              <strong style={{ color: '#E5C07B' }}>{celebration.company}</strong>{' '}
              wants you!
            </span>
          </div>
        </div>
      )}
      {rejection && (
        <div key={rejection.key}>
          {/* Edge vignette */}
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 9997, pointerEvents: 'none',
              background: 'radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.88) 100%)',
              animation: 'rejected-vignette 3.5s ease forwards',
            }}
          />
          {/* Toast */}
          <div
            style={{
              position: 'fixed', top: '28px', left: '50%',
              zIndex: 10000, pointerEvents: 'none',
              animation: 'rejected-toast-anim 7s ease forwards',
              backgroundColor: '#111113',
              border: '1px solid rgba(224, 108, 117, 0.35)',
              borderRadius: '12px',
              padding: '14px 22px',
              display: 'flex', alignItems: 'center', gap: '10px',
              boxShadow: '0 0 30px rgba(224,108,117,0.12), 0 0 60px rgba(224,108,117,0.05), 0 8px 32px rgba(0,0,0,0.55)',
              fontSize: '14px', fontWeight: 500, color: '#EDEDEF',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: '20px' }}>💪</span>
            <span>Keep going — the right opportunity is coming!</span>
          </div>
        </div>
      )}
      <AppNavbar />
      <div
        className="min-h-screen"
        style={{
          backgroundColor: '#0A0A0B',
          backgroundImage: 'radial-gradient(ellipse 70% 35% at 50% 0%, rgba(229,192,123,0.045) 0%, transparent 65%), radial-gradient(ellipse 40% 20% at 80% 80%, rgba(97,175,239,0.025) 0%, transparent 60%)',
          position: 'relative',
        }}
      >
        {/* Decorative background rings */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
          {/* Ring 1 — large gold, top-left */}
          <div style={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%', border: '1px solid rgba(229,192,123,0.18)', boxShadow: '0 0 18px rgba(229,192,123,0.05)', top: '8%', left: '5%', filter: 'blur(1px)', animation: 'ring-float-1 32s ease-in-out infinite', animationDelay: '0s' }} />
          {/* Ring 2 — medium purple, top-right */}
          <div style={{ position: 'absolute', width: 160, height: 160, borderRadius: '50%', border: '1px solid rgba(180,120,220,0.16)', boxShadow: '0 0 14px rgba(180,120,220,0.04)', top: '16%', right: '8%', filter: 'blur(0.5px)', animation: 'ring-float-2 26s ease-in-out infinite', animationDelay: '-4s' }} />
          {/* Ring 3 — large gold, mid-right, atmospheric */}
          <div style={{ position: 'absolute', width: 420, height: 420, borderRadius: '50%', border: '1px solid rgba(229,192,123,0.10)', boxShadow: '0 0 24px rgba(229,192,123,0.03)', top: '36%', right: '-4%', filter: 'blur(2px)', animation: 'ring-float-3 50s ease-in-out infinite', animationDelay: '-12s' }} />
          {/* Ring 4 — small purple, mid-left, rotating */}
          <div style={{ position: 'absolute', width: 110, height: 110, borderRadius: '50%', border: '1px solid rgba(180,120,220,0.20)', top: '60%', left: '14%', animation: 'ring-float-4 22s ease-in-out infinite', animationDelay: '-6s' }} />
          {/* Ring 5 — medium gold, bottom-center */}
          <div style={{ position: 'absolute', width: 245, height: 245, borderRadius: '50%', border: '1px solid rgba(229,192,123,0.14)', boxShadow: '0 0 16px rgba(229,192,123,0.04)', bottom: '10%', left: '28%', filter: 'blur(1px)', animation: 'ring-float-5 38s ease-in-out infinite', animationDelay: '-15s' }} />
          {/* Ring 6 — medium purple, top-center */}
          <div style={{ position: 'absolute', width: 190, height: 190, borderRadius: '50%', border: '1px solid rgba(180,120,220,0.13)', top: '3%', left: '44%', filter: 'blur(0.5px)', animation: 'ring-float-1 30s ease-in-out infinite', animationDelay: '-9s' }} />
          {/* Ring 7 — extra large gold, mid-center, deep atmospheric */}
          <div style={{ position: 'absolute', width: 360, height: 360, borderRadius: '50%', border: '1px solid rgba(229,192,123,0.09)', boxShadow: '0 0 30px rgba(229,192,123,0.03)', top: '28%', left: '20%', filter: 'blur(2.5px)', animation: 'ring-float-6 56s ease-in-out infinite', animationDelay: '-20s' }} />
          {/* Ring 8 — small gold, bottom-right */}
          <div style={{ position: 'absolute', width: 125, height: 125, borderRadius: '50%', border: '1px solid rgba(229,192,123,0.19)', bottom: '4%', right: '10%', animation: 'ring-float-2 21s ease-in-out infinite', animationDelay: '-7s' }} />
          {/* Ring 9 — tiny purple, lower-right */}
          <div style={{ position: 'absolute', width: 88, height: 88, borderRadius: '50%', border: '1px solid rgba(180,120,220,0.18)', top: '76%', right: '24%', animation: 'ring-float-5 19s ease-in-out infinite', animationDelay: '-3s' }} />
        </div>

        <div className="max-w-[1100px] mx-auto px-6 sm:px-8 py-10 space-y-10" style={{ position: 'relative', zIndex: 1 }}>

          <div className="animate-fade-up">
            <h1
              className="font-serif text-[34px] leading-tight tracking-[-0.02em] mb-1"
              style={{
                background: 'linear-gradient(130deg, #EDEDEF 55%, #E5C07B 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 0 24px rgba(229, 192, 123, 0.18))',
              }}
            >
              {profile?.full_name ? `${profile.full_name.split(' ')[0]}'s workspace` : 'Dashboard'}
            </h1>
            <p className="text-[14px]" style={{ color: '#4A4A50' }}>
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
            className="rounded-xl border p-7 animate-fade-up"
            style={{
              backgroundColor: '#111113',
              borderColor: 'rgba(229, 192, 123, 0.2)',
              boxShadow: '0 0 0 1px rgba(229,192,123,0.06), 0 8px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(229,192,123,0.06)',
              animationDelay: '0.05s',
              animationFillMode: 'both',
            }}
          >
            <p className="text-[11px] font-mono tracking-[0.12em] uppercase mb-5" style={{ color: '#555559' }}>
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
                className="landing-cta-btn sm:w-auto w-full"
                style={{
                  opacity: (generating || !companyName.trim() || profileIncomplete) ? 0.5 : 1,
                  cursor: (generating || !companyName.trim() || profileIncomplete) ? 'not-allowed' : 'pointer',
                }}
              >
                <i className="landing-cta-shimmer" />
                <span className="landing-cta-text">
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
                </span>
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
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-[17px] font-semibold tracking-[-0.01em]" style={{ color: '#EDEDEF' }}>
                  Application Tracking
                </h2>
                <p className="text-[12px] mt-0.5" style={{ color: '#3D3D42' }}>
                  Monitor your application pipeline
                </p>
              </div>
              <span
                className="font-mono text-[12px] px-2.5 py-1 rounded-md border"
                style={{ color: '#555559', borderColor: '#222228', backgroundColor: '#111113' }}
              >
                {coverLetters.length} {coverLetters.length === 1 ? 'letter' : 'letters'}
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
              <StatCard label="Total" value={String(coverLetters.length)} index={0} visible={statsMounted} />
              <StatCard label="Applied" value={String(analytics.counts.applied)} index={1} visible={statsMounted} />
              <StatCard label="Interviews" value={String(analytics.counts.interview)} index={2} visible={statsMounted} />
              <StatCard label="Accepted" value={String(analytics.counts.accepted)} index={3} visible={statsMounted} />
              <StatCard label="Interview Rate" value={analytics.interviewRate} helper="From submitted" index={4} visible={statsMounted} />
              <StatCard label="Acceptance Rate" value={analytics.acceptanceRate} helper="From submitted" index={5} visible={statsMounted} />
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
                className="rounded-xl border overflow-hidden"
                style={{
                  backgroundColor: '#111113',
                  borderColor: '#222228',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
                }}
              >
                <div
                  className="hidden md:grid grid-cols-[1.15fr_2fr_1fr_0.9fr_0.9fr] gap-4 px-5 py-3 border-b"
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

function ConfettiBurst() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = W
    canvas.height = H

    const COLORS = ['#E5C07B', '#FFD700', '#7EC699', '#61AFEF', '#C678DD', '#FFFFFF', '#E06C75', '#FFC0CB', '#98FB98']
    const particles = Array.from({ length: 140 }, () => ({
      x: Math.random() * W,
      y: Math.random() * -H * 0.6 - 10,
      vx: (Math.random() - 0.5) * 5.5,
      vy: Math.random() * 3.5 + 1.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      w: Math.random() * 10 + 4,
      h: Math.random() * 4 + 2,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.16,
      alpha: 1,
    }))

    const start = performance.now()
    let raf: number

    const tick = (now: number) => {
      const t = now - start
      ctx.clearRect(0, 0, W, H)
      let alive = false

      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.07
        p.rot += p.rotV
        if (t > 2800) p.alpha = Math.max(0, p.alpha - 0.018)
        if (p.y < H + 30 && p.alpha > 0) alive = true

        ctx.save()
        ctx.globalAlpha = p.alpha
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }

      if (alive && t < 4600) {
        raf = requestAnimationFrame(tick)
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9998 }}
    />
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
      className="px-5 py-4 border-t cursor-pointer"
      style={{
        borderColor: '#1A1A1F',
        animation: `card-enter 0.35s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.04}s both`,
        transition: 'background-color 180ms ease, box-shadow 180ms ease',
      }}
      onClick={() => router.push(`/generate/${coverLetter.id}`)}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#15151A'
        e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(229,192,123,0.06)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent'
        e.currentTarget.style.boxShadow = 'none'
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
              animation: status === 'accepted'
                ? 'accepted-badge-pulse 2.5s ease-in-out infinite'
                : status === 'rejected'
                ? 'rejected-badge-pulse 2.5s ease-in-out infinite'
                : 'none',
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
