'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Copy, Download, RefreshCw, ThumbsUp, ThumbsDown,
  Building2, Target, Loader2, Edit3, Save, X,
  ChevronDown, ChevronUp
} from 'lucide-react'
import AppNavbar from '@/components/layout/AppNavbar'
import type { CoverLetter, CompanyResearch, LLMProvider, SkillMatches } from '@/types'
import { consumeSSE } from '@/lib/sse-client'
import ProviderPicker from '@/components/ui/provider-picker'

interface Props {
  coverLetter: CoverLetter
}

const GENERATION_PROVIDER_STORAGE_KEY = 'coverme.generation-provider'

function readStringField(data: unknown, key: string): string | null {
  if (!data || typeof data !== 'object') return null
  const value = (data as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

function ActionButton({
  onClick,
  children,
  disabled,
  variant = 'secondary',
}: {
  onClick?: () => void
  children: React.ReactNode
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'ghost'
}) {
  const [hovered, setHovered] = useState(false)

  const styles = {
    primary: {
      backgroundColor: hovered ? '#F0D08A' : '#E5C07B',
      color: '#0A0A0B',
      border: 'none',
    },
    secondary: {
      backgroundColor: hovered ? '#1A1A1F' : 'transparent',
      color: hovered ? '#EDEDEF' : '#8A8A8E',
      border: '1px solid #222228',
    },
    ghost: {
      backgroundColor: hovered ? '#1A1A1F' : 'transparent',
      color: hovered ? '#EDEDEF' : '#8A8A8E',
      border: 'none',
    },
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-8 px-3 rounded text-[13px] font-medium flex items-center gap-1.5 transition-all duration-150"
      style={{
        ...styles[variant],
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transform: hovered && !disabled ? 'translateY(-1px)' : 'translateY(0)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={e => (e.currentTarget.style.transform = 'translateY(0)')}
      onMouseUp={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
    >
      {children}
    </button>
  )
}

export default function GenerationView({ coverLetter }: Props) {
  const router = useRouter()
  const [llmProvider, setLlmProvider] = useState<LLMProvider>('groq')
  const [letter, setLetter] = useState(coverLetter.cover_letter_text)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(coverLetter.cover_letter_text)
  const [copied, setCopied] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [regenMessage, setRegenMessage] = useState('')
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)
  const [activeTab, setActiveTab] = useState<'research' | 'matches'>('research')

  const research = coverLetter.company_research as CompanyResearch | null
  const matches = coverLetter.matched_skills as SkillMatches | null

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

  async function handleCopy() {
    await navigator.clipboard.writeText(letter)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDownload() {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })

    const marginLeft = 25
    const marginRight = 25
    const marginTop = 30
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const usableWidth = pageWidth - marginLeft - marginRight
    const lineHeight = 7
    const date = new Date(coverLetter.created_at).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(120, 120, 120)
    doc.text(date, marginLeft, marginTop)

    doc.setFontSize(11)
    doc.setTextColor(30, 30, 30)
    doc.setFont('helvetica', 'normal')

    let y = marginTop + 14
    const paragraphs = letter.split('\n\n').filter(p => p.trim())

    for (const paragraph of paragraphs) {
      const lines = doc.splitTextToSize(paragraph.trim(), usableWidth)
      for (const line of lines) {
        if (y + lineHeight > pageHeight - 20) {
          doc.addPage()
          y = marginTop
        }
        doc.text(line, marginLeft, y)
        y += lineHeight
      }
      y += lineHeight * 0.6
    }

    const filename = `cover-letter-${coverLetter.company_name.replace(/\s+/g, '-').toLowerCase()}.pdf`
    doc.save(filename)
  }

  async function handleSaveEdit() {
    const res = await fetch(`/api/cover-letters/${coverLetter.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cover_letter_text: editText }),
    })
    if (res.ok) {
      setLetter(editText)
      setEditing(false)
    }
  }

  async function handleRegenerate() {
    setRegenerating(true)
    setRegenMessage(`Researching ${coverLetter.company_name}...`)

    try {
      const response = await fetch('/api/generate-cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: coverLetter.company_name,
          regenerate_id: coverLetter.id,
          provider: llmProvider,
        }),
      })

      let newId: string | null = null
      let navigated = false

      await consumeSSE(response, (eventType, data) => {
        if (eventType === 'cover_letter_id') {
          const id = readStringField(data, 'id')
          if (id) newId = id
          return
        }

        if (eventType === 'progress') {
          const message = readStringField(data, 'message')
          if (message) setRegenMessage(message)
          return
        }

        if (eventType === 'done') {
          const id = readStringField(data, 'id')
          if (id) {
            newId = id
            navigated = true
            router.push(`/generate/${id}`)
          }
        }
      })

      if (!newId) {
        throw new Error('Regeneration ended without a result')
      }

      if (!navigated) {
        router.push(`/generate/${newId}`)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Regeneration failed')
    } finally {
      setRegenerating(false)
      setRegenMessage('')
    }
  }

  return (
    <>
      <AppNavbar />
      <div className="min-h-screen" style={{ backgroundColor: '#0A0A0B' }}>
        <div className="max-w-[860px] mx-auto px-6 sm:px-8 py-10 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between animate-fade-up">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <button
                  className="h-8 px-3 rounded text-[13px] flex items-center gap-1.5 transition-colors"
                  style={{ color: '#555559', border: '1px solid #222228' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#8A8A8E')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#555559')}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              </Link>
              <div>
                <h1
                  className="font-serif text-[28px] leading-tight tracking-[-0.02em]"
                  style={{ color: '#EDEDEF' }}
                >
                  {coverLetter.company_name}
                </h1>
                <p className="font-mono text-[11px] mt-0.5" style={{ color: '#555559' }}>
                  {new Date(coverLetter.created_at).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric',
                  })} · v{coverLetter.version}
                </p>
              </div>
            </div>

            {/* Feedback */}
            <div className="flex items-center gap-2">
              <span className="text-[12px]" style={{ color: '#555559' }}>Helpful?</span>
              <button
                onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
                className="w-8 h-8 rounded border flex items-center justify-center transition-all duration-150"
                style={{
                  borderColor: feedback === 'up' ? 'rgba(126, 198, 153, 0.4)' : '#222228',
                  backgroundColor: feedback === 'up' ? 'rgba(126, 198, 153, 0.08)' : 'transparent',
                  color: feedback === 'up' ? '#7EC699' : '#555559',
                }}
              >
                <ThumbsUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
                className="w-8 h-8 rounded border flex items-center justify-center transition-all duration-150"
                style={{
                  borderColor: feedback === 'down' ? 'rgba(224, 108, 117, 0.4)' : '#222228',
                  backgroundColor: feedback === 'down' ? 'rgba(224, 108, 117, 0.08)' : 'transparent',
                  color: feedback === 'down' ? '#E06C75' : '#555559',
                }}
              >
                <ThumbsDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2 animate-fade-up" style={{ animationDelay: '0.05s', animationFillMode: 'both' }}>
            <ProviderPicker
              value={llmProvider}
              onChange={setLlmProvider}
              disabled={regenerating}
              allowClaude={false}
              lockedClaudeMessage="Sorry but it cost a lot ): "
            />
            <ActionButton onClick={handleCopy}>
              <Copy className="w-3.5 h-3.5" />
              {copied ? 'Copied!' : 'Copy'}
            </ActionButton>
            <ActionButton onClick={handleDownload}>
              <Download className="w-3.5 h-3.5" />
              Download PDF
            </ActionButton>
            <ActionButton
              onClick={() => { setEditing(true); setEditText(letter) }}
              disabled={editing}
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </ActionButton>
            <ActionButton onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {regenMessage || 'Regenerating...'}
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Regenerate
                </>
              )}
            </ActionButton>
          </div>

          {/* Cover Letter — the hero moment */}
          <div
            className="rounded-lg border overflow-hidden animate-fade-up"
            style={{
              backgroundColor: '#111113',
              borderColor: '#222228',
              animationDelay: '0.1s',
              animationFillMode: 'both',
            }}
          >
            {/* Letter header decoration */}
            <div
              className="px-8 py-4 border-b flex items-center justify-between"
              style={{ borderColor: '#1A1A1F' }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(229, 192, 123, 0.08)', border: '1px solid rgba(229, 192, 123, 0.15)' }}
                >
                  <Building2 className="w-3.5 h-3.5" style={{ color: '#E5C07B' }} />
                </div>
                <span className="font-mono text-[11px] tracking-wider uppercase" style={{ color: '#555559' }}>
                  Cover Letter · {coverLetter.company_name}
                </span>
              </div>
            </div>

            {/* Letter content */}
            <div className="px-8 py-8">
              {editing ? (
                <div className="space-y-4">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full min-h-[420px] text-[15px] leading-[1.9] resize-none rounded-lg p-4 outline-none transition-all duration-200 font-serif"
                    style={{
                      backgroundColor: '#0A0A0B',
                      border: '1px solid #222228',
                      color: '#EDEDEF',
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = '#E5C07B'
                      e.target.style.boxShadow = '0 0 0 2px rgba(229, 192, 123, 0.08)'
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = '#222228'
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditing(false)}
                      className="h-8 px-3 rounded text-[13px] border flex items-center gap-1.5 transition-colors"
                      style={{ borderColor: '#222228', color: '#8A8A8E' }}
                    >
                      <X className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      className="h-8 px-3 rounded text-[13px] font-medium flex items-center gap-1.5 transition-colors"
                      style={{ backgroundColor: '#E5C07B', color: '#0A0A0B' }}
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {letter.split('\n\n').map((paragraph, i) => (
                    <p
                      key={i}
                      className="font-serif text-[16px] leading-[1.9]"
                      style={{ color: '#EDEDEF' }}
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Research & Analysis drawer */}
          {(research || matches) && (
            <div
              className="rounded-lg border overflow-hidden animate-fade-up"
              style={{
                backgroundColor: '#111113',
                borderColor: '#222228',
                animationDelay: '0.15s',
                animationFillMode: 'both',
              }}
            >
              <button
                onClick={() => setShowAnalysis(!showAnalysis)}
                className="w-full px-6 py-4 flex items-center justify-between transition-colors"
                style={{ color: '#8A8A8E' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1A1A1F')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4" style={{ color: '#555559' }} />
                  <span className="font-mono text-[12px] tracking-wider uppercase" style={{ color: '#555559' }}>
                    Research & Analysis
                  </span>
                </div>
                {showAnalysis
                  ? <ChevronUp className="w-4 h-4" style={{ color: '#555559' }} />
                  : <ChevronDown className="w-4 h-4" style={{ color: '#555559' }} />
                }
              </button>

              {showAnalysis && (
                <div className="border-t" style={{ borderColor: '#1A1A1F' }}>
                  {/* Tab nav */}
                  {research && matches && (
                    <div className="flex border-b" style={{ borderColor: '#1A1A1F' }}>
                      {[
                        { key: 'research' as const, label: 'Company Research', Icon: Building2 },
                        { key: 'matches' as const, label: 'Skill Matches', Icon: Target },
                      ].map(({ key, label, Icon }) => (
                        <button
                          key={key}
                          onClick={() => setActiveTab(key)}
                          className="flex-1 px-4 py-3 text-[13px] font-medium flex items-center justify-center gap-2 transition-all duration-150 border-b-2"
                          style={{
                            borderColor: activeTab === key ? '#E5C07B' : 'transparent',
                            color: activeTab === key ? '#E5C07B' : '#555559',
                            backgroundColor: activeTab === key ? 'rgba(229, 192, 123, 0.04)' : 'transparent',
                          }}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Research panel */}
                  {(activeTab === 'research' || !matches) && research && (
                    <div className="p-6 space-y-5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] tracking-wider px-2 py-1 rounded border" style={{ color: '#8A8A8E', borderColor: '#222228' }}>
                          {research.industry}
                        </span>
                      </div>

                      {research.mission_and_values && (
                        <div>
                          <p className="font-mono text-[11px] tracking-wider uppercase mb-2" style={{ color: '#555559' }}>
                            Mission & Values
                          </p>
                          <p className="text-[14px] leading-[1.6]" style={{ color: '#8A8A8E' }}>
                            {research.mission_and_values}
                          </p>
                        </div>
                      )}

                      {research.culture_keywords?.length > 0 && (
                        <div>
                          <p className="font-mono text-[11px] tracking-wider uppercase mb-3" style={{ color: '#555559' }}>
                            Culture Signals
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {research.culture_keywords.map(k => (
                              <span
                                key={k}
                                className="text-[12px] px-2 py-0.5 rounded border"
                                style={{ color: '#8A8A8E', borderColor: '#222228', backgroundColor: '#1A1A1F' }}
                              >
                                {k}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {research.recent_news?.length > 0 && (
                        <div>
                          <p className="font-mono text-[11px] tracking-wider uppercase mb-3" style={{ color: '#555559' }}>
                            Recent News
                          </p>
                          <ul className="space-y-2">
                            {research.recent_news.slice(0, 3).map((news, i) => (
                              <li key={i} className="flex items-start gap-2 text-[13px]" style={{ color: '#8A8A8E' }}>
                                <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: '#E5C07B' }} />
                                {news}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {research.growth_areas?.length > 0 && (
                        <div>
                          <p className="font-mono text-[11px] tracking-wider uppercase mb-3" style={{ color: '#555559' }}>
                            Growth Areas
                          </p>
                          <ul className="space-y-2">
                            {research.growth_areas.map((area, i) => (
                              <li key={i} className="flex items-start gap-2 text-[13px]" style={{ color: '#8A8A8E' }}>
                                <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: '#E5C07B' }} />
                                {area}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Matches panel */}
                  {(activeTab === 'matches' || !research) && matches && (
                    <div className="p-6 space-y-5">
                      {matches.key_value_proposition && (
                        <div
                          className="p-4 rounded-lg border"
                          style={{
                            backgroundColor: 'rgba(229, 192, 123, 0.05)',
                            borderColor: 'rgba(229, 192, 123, 0.2)',
                          }}
                        >
                          <p className="font-mono text-[11px] tracking-wider uppercase mb-2" style={{ color: '#E5C07B' }}>
                            Your key value proposition
                          </p>
                          <p className="text-[14px] leading-[1.6]" style={{ color: '#EDEDEF' }}>
                            {matches.key_value_proposition}
                          </p>
                        </div>
                      )}

                      <div>
                        <p className="font-mono text-[11px] tracking-wider uppercase mb-3" style={{ color: '#555559' }}>
                          Top Skill Matches
                        </p>
                        <div className="space-y-2">
                          {matches.top_matches?.slice(0, 5).map((match, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-3 p-3 rounded border"
                              style={{ backgroundColor: '#1A1A1F', borderColor: '#222228' }}
                            >
                              <div
                                className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor:
                                    match.relevance === 'high' ? '#7EC699' :
                                    match.relevance === 'medium' ? '#E5C07B' : '#555559',
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium" style={{ color: '#EDEDEF' }}>
                                  {match.user_skill_or_experience}
                                </p>
                                <p className="text-[12px] mt-0.5" style={{ color: '#8A8A8E' }}>
                                  {match.company_need_it_addresses}
                                </p>
                                {match.suggested_framing && (
                                  <p className="text-[12px] mt-1 italic" style={{ color: '#E5C07B' }}>
                                    {match.suggested_framing}
                                  </p>
                                )}
                              </div>
                              <span
                                className="font-mono text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0"
                                style={{
                                  backgroundColor: match.relevance === 'high' ? 'rgba(126, 198, 153, 0.1)' : '#1A1A1F',
                                  color: match.relevance === 'high' ? '#7EC699' : '#555559',
                                  border: `1px solid ${match.relevance === 'high' ? 'rgba(126, 198, 153, 0.2)' : '#222228'}`,
                                }}
                              >
                                {match.relevance}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {matches.bridge_stories?.length > 0 && (
                        <div>
                          <p className="font-mono text-[11px] tracking-wider uppercase mb-3" style={{ color: '#555559' }}>
                            Bridge Stories
                          </p>
                          <div className="space-y-2">
                            {matches.bridge_stories.map((story, i) => (
                              <div
                                key={i}
                                className="p-3 rounded border"
                                style={{ backgroundColor: '#1A1A1F', borderColor: '#222228' }}
                              >
                                <p className="text-[13px] font-medium" style={{ color: '#EDEDEF' }}>
                                  {story.experience}
                                </p>
                                <p className="text-[12px] mt-1" style={{ color: '#8A8A8E' }}>
                                  {story.narrative_angle}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
