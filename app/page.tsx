'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import DarkVeil from '@/components/DarkVeil'

const TYPEWRITER_TEXT = 'Your next cover letter writes itself.'
const MOCK_LETTER_LINES = [
  'Dear Hiring Team at Anthropic,',
  '',
  "I'm Meshari, an AI Engineer at Etlaq and Vice President of the CCSIT Club. Having followed Anthropic's work on Constitutional AI since its inception, I believe the alignment-first approach to model development represents the most credible path toward beneficial AGI — and I want to be part of building it.",
  '',
  "At Etlaq, I design and ship AI-powered products end to end — from model integration to user-facing interfaces. Leading technical initiatives at CCSIT has sharpened my ability to align engineers around a shared vision, the same quality I admire in how your teams approach capability research.",
  '',
  "What draws me specifically to Anthropic is your commitment to publishing what you learn openly. I'd love to contribute to work that is honest about what it doesn't know.",
]

function TypewriterHero() {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const [showUnderline, setShowUnderline] = useState(false)
  const [letterLines, setLetterLines] = useState<number[]>([])
  const indexRef = useRef(0)

  useEffect(() => {
    const interval = setInterval(() => {
      if (indexRef.current < TYPEWRITER_TEXT.length) {
        setDisplayed(TYPEWRITER_TEXT.slice(0, indexRef.current + 1))
        indexRef.current++
      } else {
        clearInterval(interval)
        setDone(true)
        setTimeout(() => setShowUnderline(true), 150)
        setTimeout(() => {
          MOCK_LETTER_LINES.forEach((_, i) => {
            setTimeout(() => setLetterLines(prev => [...prev, i]), i * 180)
          })
        }, 400)
      }
    }, 38)
    return () => clearInterval(interval)
  }, [])

  return (
    <section className="min-h-screen flex items-center px-6 sm:px-12 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-80" aria-hidden="true">
        <DarkVeil
          hueShift={-150}
          noiseIntensity={0}
          scanlineIntensity={0}
          speed={0.5}
          scanlineFrequency={0}
          warpAmount={0}
          resolutionScale={1}
        />
      </div>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(10,10,11,0.32) 0%, rgba(10,10,11,0.58) 100%)',
        }}
      />

      {/* Ambient glows */}
      <div
        className="absolute right-[8%] top-[18%] w-[600px] h-[600px] rounded-full pointer-events-none z-10"
        style={{ background: 'radial-gradient(circle, rgba(229,192,123,0.06) 0%, transparent 68%)' }}
      />
      <div
        className="absolute left-[2%] bottom-[10%] w-[420px] h-[420px] rounded-full pointer-events-none z-10"
        style={{ background: 'radial-gradient(circle, rgba(97,175,239,0.03) 0%, transparent 70%)' }}
      />

      <div className="relative z-20 max-w-[1100px] mx-auto w-full grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-16 items-center py-24">
        {/* Left: Headline + CTA */}
        <div>
          <p
            className="font-mono text-xs tracking-[0.14em] uppercase mb-8"
            style={{
              background: 'linear-gradient(90deg, #E5C07B 0%, rgba(229,192,123,0.55) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            AI Cover Letter Generator
          </p>
          <h1
            className="font-serif text-[52px] sm:text-[64px] leading-[1.08] tracking-[-0.015em] mb-6 antialiased"
            style={{
              color: '#EDEDEF',
              textRendering: 'optimizeLegibility',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
            }}
          >
            {displayed}
            {!done && (
              <span
                className="inline-block w-[3px] h-[0.85em] ml-1 align-middle bg-primary"
                style={{ animation: 'typewriter-cursor 0.8s step-end infinite' }}
              />
            )}
          </h1>
          {showUnderline && (
            <div
              className="h-[2px] max-w-[620px] mb-8 origin-left rounded-full"
              style={{
                background: 'linear-gradient(90deg, rgba(229, 192, 123, 0.95) 0%, rgba(229, 192, 123, 0.45) 58%, rgba(229, 192, 123, 0) 100%)',
                boxShadow: '0 0 14px rgba(229, 192, 123, 0.22)',
                animation: 'amber-underline 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
                transformOrigin: 'left center',
                willChange: 'transform, opacity, filter',
              }}
            />
          )}
          <p className="text-[17px] leading-[1.65] mb-10" style={{ color: '#6A6A70' }}>
            Enter a company name. Get a letter that actually sounds like you.
          </p>
          <Link href="/signup" className="landing-cta-btn" aria-label="Get started">
            <i className="landing-cta-shimmer" />
            <span className="landing-cta-text">
              Get started
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14m-7-7 7 7-7 7" />
              </svg>
            </span>
          </Link>
        </div>

        {/* Right: Mock generation card */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{
            backgroundColor: '#111113',
            borderColor: 'rgba(229, 192, 123, 0.18)',
            boxShadow: '0 0 0 1px rgba(229,192,123,0.05), 0 12px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(229,192,123,0.06)',
          }}
        >
          {/* Card header - pipeline steps */}
          <div className="px-5 py-4 border-b" style={{ borderColor: '#1E1E23' }}>
            <div className="space-y-2.5">
              {[
                { label: 'Researching Anthropic', done: letterLines.length > 0, active: letterLines.length === 0 && done },
                { label: 'Matching your skills', done: letterLines.length >= 3, active: letterLines.length > 0 && letterLines.length < 3 },
                { label: 'Crafting your letter', done: false, active: letterLines.length >= 3 },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div
                    className="w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-all duration-500"
                    style={{
                      borderColor: step.done ? '#7EC699' : step.active ? '#E5C07B' : '#333338',
                      backgroundColor: step.done ? 'rgba(126,198,153,0.1)' : step.active ? 'rgba(229,192,123,0.08)' : 'transparent',
                      boxShadow: step.active ? '0 0 8px rgba(229,192,123,0.2)' : 'none',
                    }}
                  >
                    {step.done && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3 5.5L6.5 2" stroke="#7EC699" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    {step.active && (
                      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#E5C07B' }} />
                    )}
                  </div>
                  <span
                    className="font-mono text-[11px] transition-colors duration-500"
                    style={{
                      color: step.done ? '#7EC699' : step.active ? '#E5C07B' : '#444448',
                    }}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Letter content */}
          <div className="p-5 min-h-[240px]">
            <div className="space-y-2">
              {MOCK_LETTER_LINES.map((line, i) => (
                <p
                  key={i}
                  className="font-serif text-[13px] leading-[1.7]"
                  style={{
                    color: line === '' ? 'transparent' : '#7A7A80',
                    opacity: letterLines.includes(i) ? 1 : 0,
                    transform: letterLines.includes(i) ? 'translateY(0)' : 'translateY(10px)',
                    filter: letterLines.includes(i) ? 'blur(0px)' : 'blur(3px)',
                    minHeight: line === '' ? '8px' : 'auto',
                    transition: 'opacity 700ms cubic-bezier(0.16, 1, 0.3, 1), transform 700ms cubic-bezier(0.16, 1, 0.3, 1), filter 600ms cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                >
                  {line || '\u00A0'}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    {
      num: '01',
      title: 'Upload your CV once',
      desc: 'Our AI extracts your skills, experience, and achievements. You review, edit, and save. Done — you never manually enter anything again.',
    },
    {
      num: '02',
      title: 'Enter any company name',
      desc: 'Type the company. Our research agent goes to work — finding their mission, culture signals, recent news, and what they look for in candidates.',
    },
    {
      num: '03',
      title: 'Get a tailored letter in 5 seconds',
      desc: 'The writer agent synthesizes everything into a letter that references real company details and frames your specific experience toward their specific needs.',
    },
  ]

  const sectionRef = useRef<HTMLElement | null>(null)
  const [revealedCount, setRevealedCount] = useState(0)
  const [visibleLeft, setVisibleLeft] = useState(false)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    let revealInterval: ReturnType<typeof setInterval> | undefined

    const stopReveal = () => {
      if (revealInterval) {
        clearInterval(revealInterval)
        revealInterval = undefined
      }
    }

    const startReveal = () => {
      if (revealInterval) return
      setVisibleLeft(true)
      setRevealedCount((current) => (current === 0 ? 1 : current))
      revealInterval = setInterval(() => {
        setRevealedCount((current) => {
          if (current >= steps.length) {
            stopReveal()
            return current
          }
          return current + 1
        })
      }, 260)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (!entry) return

        if (entry.isIntersecting) {
          startReveal()
          return
        }

        stopReveal()
        if (entry.boundingClientRect.top > 0) {
          setRevealedCount(0)
          setVisibleLeft(false)
        }
      },
      { threshold: 0.35 }
    )

    observer.observe(section)
    return () => {
      observer.disconnect()
      stopReveal()
    }
  }, [steps.length])

  return (
    <section ref={sectionRef} className="py-28 px-6 sm:px-12 border-t" style={{ borderColor: '#1E1E23' }}>
      <div className="max-w-[1100px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-16 items-start">
          <div
            style={{
              opacity: visibleLeft ? 1 : 0,
              transform: visibleLeft ? 'translateY(0)' : 'translateY(20px)',
              transition: 'opacity 600ms cubic-bezier(0.16, 1, 0.3, 1), transform 600ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <p className="font-mono text-xs tracking-[0.14em] uppercase mb-4" style={{ color: '#444448' }}>
              How it works
            </p>
            <h2
              className="font-serif text-[38px] leading-[1.15] tracking-[-0.02em]"
              style={{
                background: 'linear-gradient(135deg, #EDEDEF 55%, #E5C07B 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Three steps.<br />One company name.
            </h2>
          </div>

          <div className="relative">
            {/* Vertical connecting line */}
            <div
              className="absolute left-[19px] top-6 bottom-6 w-px"
              style={{ background: 'linear-gradient(180deg, #222228 0%, rgba(34,34,40,0.2) 100%)' }}
            />

            <div className="space-y-10">
              {steps.map((step, i) => {
                const isVisible = i < revealedCount
                return (
                  <div
                    key={i}
                    className="flex gap-6 relative group"
                    style={{
                      opacity: isVisible ? 1 : 0,
                      transform: isVisible ? 'translateY(0)' : 'translateY(18px)',
                      filter: isVisible ? 'blur(0px)' : 'blur(3px)',
                      transition: 'opacity 600ms cubic-bezier(0.16, 1, 0.3, 1), transform 600ms cubic-bezier(0.16, 1, 0.3, 1), filter 500ms cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 z-10 transition-all duration-300 group-hover:border-[rgba(229,192,123,0.35)] group-hover:shadow-[0_0_16px_rgba(229,192,123,0.12)]"
                      style={{ backgroundColor: '#0A0A0B', borderColor: '#222228' }}
                    >
                      <span className="font-mono text-[11px] tracking-wider" style={{ color: '#E5C07B' }}>
                        {step.num}
                      </span>
                    </div>
                    <div className="pt-2">
                      <h3 className="font-semibold text-[16px] mb-2 tracking-[-0.01em]" style={{ color: '#EDEDEF' }}>
                        {step.title}
                      </h3>
                      <p className="text-[14px] leading-[1.65]" style={{ color: '#6A6A70' }}>
                        {step.desc}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Differentiator() {
  const [visible, setVisible] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const triggered = useRef(false)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !triggered.current) {
          triggered.current = true
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={sectionRef} className="py-28 px-6 sm:px-12 border-t" style={{ borderColor: '#1E1E23' }}>
      <div className="max-w-[1100px] mx-auto">
        <h2
          className="font-serif text-[42px] sm:text-[52px] leading-[1.15] tracking-[-0.02em] mb-12 max-w-[700px]"
          style={{
            background: 'linear-gradient(130deg, #EDEDEF 60%, #E5C07B 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(20px)',
            transition: 'opacity 650ms cubic-bezier(0.16, 1, 0.3, 1), transform 650ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          Not another AI template generator.
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div
            className="space-y-5"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(20px)',
              transition: 'opacity 650ms cubic-bezier(0.16, 1, 0.3, 1) 100ms, transform 650ms cubic-bezier(0.16, 1, 0.3, 1) 100ms',
            }}
          >
            <p className="text-[15px] leading-[1.75]" style={{ color: '#6A6A70' }}>
              Most AI cover letter tools take your resume, take the job description, and produce a generic summary that sounds exactly like every other application. Hiring managers can tell.
            </p>
            <p className="text-[15px] leading-[1.75]" style={{ color: '#6A6A70' }}>
              CoverMe runs a live research pass on the company before writing a single word. It looks at their mission, culture signals, growth areas, and recent news — then matches that against your actual skills and experience to find the most compelling angle.
            </p>
            <p className="text-[15px] leading-[1.75]" style={{ color: '#6A6A70' }}>
              The result is a letter that references specific company details, connects your real achievements to their actual needs, and reads like something a thoughtful human wrote — because the AI had real information to work with.
            </p>
          </div>

          {/* Comparison */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(20px)',
              transition: 'opacity 650ms cubic-bezier(0.16, 1, 0.3, 1) 200ms, transform 650ms cubic-bezier(0.16, 1, 0.3, 1) 200ms',
            }}
          >
            <div
              className="rounded-xl border p-5"
              style={{
                backgroundColor: '#111113',
                borderColor: '#222228',
                boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
              }}
            >
              <p className="font-mono text-[11px] tracking-[0.12em] uppercase mb-4" style={{ color: '#444448' }}>
                Generic AI
              </p>
              <div className="space-y-2.5">
                {[
                  '"I am excited about this opportunity..."',
                  '"My skills align perfectly with..."',
                  '"I am a fast learner who works well..."',
                  '"I look forward to discussing..."',
                ].map((line, i) => (
                  <p key={i} className="text-[12px] leading-[1.55] line-through" style={{ color: '#3D3D42' }}>
                    {line}
                  </p>
                ))}
              </div>
            </div>

            <div
              className="rounded-xl border p-5"
              style={{
                backgroundColor: '#111113',
                borderColor: 'rgba(229,192,123,0.25)',
                boxShadow: '0 0 0 1px rgba(229,192,123,0.06), 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(229,192,123,0.06)',
              }}
            >
              <p className="font-mono text-[11px] tracking-[0.12em] uppercase mb-4" style={{ color: '#E5C07B' }}>
                CoverMe
              </p>
              <div className="space-y-2.5">
                {[
                  '"Your Constitutional AI work is the most credible approach I\'ve seen..."',
                  '"My pipeline optimization at Stripe reduced latency by 34%..."',
                  '"Your recent Series C signals a scaling phase where I\'ve thrived..."',
                ].map((line, i) => (
                  <p key={i} className="text-[12px] leading-[1.55]" style={{ color: '#8A8A8E' }}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function FinalCTA() {
  const [visible, setVisible] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const triggered = useRef(false)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !triggered.current) {
          triggered.current = true
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.2 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={sectionRef} className="py-28 px-6 sm:px-12 border-t" style={{ borderColor: '#1E1E23' }}>
      <div className="max-w-[1100px] mx-auto">
        <p
          className="text-[15px] mb-3 font-mono tracking-[0.08em] uppercase"
          style={{
            color: '#444448',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 600ms cubic-bezier(0.16, 1, 0.3, 1), transform 600ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          Ready?
        </p>
        <h2
          className="font-serif text-[36px] sm:text-[44px] leading-[1.15] tracking-[-0.02em] mb-10 max-w-[560px]"
          style={{
            background: 'linear-gradient(130deg, #EDEDEF 55%, #E5C07B 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 600ms cubic-bezier(0.16, 1, 0.3, 1) 80ms, transform 600ms cubic-bezier(0.16, 1, 0.3, 1) 80ms',
          }}
        >
          Stop writing cover letters from scratch.
        </h2>
        <div
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 600ms cubic-bezier(0.16, 1, 0.3, 1) 160ms, transform 600ms cubic-bezier(0.16, 1, 0.3, 1) 160ms',
          }}
        >
          <Link href="/signup" className="landing-gradient-lift-btn" aria-label="Create your free account">
            <span className="landing-gradient-lift-btn__inner">
              Create your free account
              <svg className="landing-gradient-lift-btn__icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </span>
          </Link>
        </div>
      </div>
    </section>
  )
}

export default function LandingPage() {
  return (
    <div style={{
      backgroundColor: '#0A0A0B',
      minHeight: '100vh',
      backgroundImage: [
        'radial-gradient(ellipse 70% 40% at 50% 28%, rgba(229,192,123,0.07) 0%, transparent 65%)',
        'radial-gradient(ellipse 50% 30% at 75% 65%, rgba(97,175,239,0.04) 0%, transparent 60%)',
      ].join(', '),
    }}>
      {/* Navbar */}
      <nav
        className="sticky top-0 z-50 border-b backdrop-blur-md"
        style={{ backgroundColor: 'rgba(10,10,11,0.85)', borderColor: '#1E1E23' }}
      >
        <div className="max-w-[1100px] mx-auto px-6 sm:px-12 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-baseline gap-[2px]">
            <span className="font-serif text-[26px]" style={{ color: '#EDEDEF' }}>Cover</span>
            <span className="font-serif text-[26px]" style={{ color: '#E5C07B' }}>Me</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/login"
              className="text-[13px] font-medium transition-colors duration-200"
              style={{ color: '#6A6A70' }}
              onMouseEnter={e => {
                (e.target as HTMLElement).style.color = '#EDEDEF'
              }}
              onMouseLeave={e => {
                (e.target as HTMLElement).style.color = '#6A6A70'
              }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      <TypewriterHero />
      <HowItWorks />
      <Differentiator />
      <FinalCTA />

      <footer
        className="border-t px-6 sm:px-12 py-8"
        style={{ borderColor: '#1E1E23' }}
      >
        <div className="max-w-[1100px] mx-auto flex items-center justify-between">
          <div className="flex items-baseline gap-[2px]">
            <span className="font-serif text-[16px]" style={{ color: '#EDEDEF' }}>Cover</span>
            <span className="font-serif text-[16px]" style={{ color: '#E5C07B' }}>Me</span>
          </div>
          <p className="font-mono text-[11px]" style={{ color: '#444448' }}>
            Created by Eng.Meshari • Contact: 0553323624
          </p>
        </div>
      </footer>
    </div>
  )
}
