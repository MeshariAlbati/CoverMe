'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

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
      {/* Ambient glow */}
      <div
        className="absolute right-[10%] top-[20%] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(229,192,123,0.05) 0%, transparent 70%)',
        }}
      />

      <div className="max-w-[1100px] mx-auto w-full grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-16 items-center py-24">
        {/* Left: Headline + CTA */}
        <div>
          <p className="font-mono text-xs tracking-[0.12em] uppercase text-muted-foreground mb-8">
            AI Cover Letter Generator
          </p>
          <h1
            className="font-serif text-[52px] sm:text-[64px] leading-[1.1] tracking-[-0.02em] mb-6"
            style={{ color: '#EDEDEF' }}
          >
            {displayed}
            {!done && (
              <span
                className="inline-block w-[3px] h-[0.85em] ml-1 align-middle bg-primary"
                style={{ animation: 'typewriter-cursor 0.8s step-end infinite' }}
              />
            )}
            {done && showUnderline && (
              <></>
            )}
          </h1>
          {showUnderline && (
            <div
              className="h-px mb-8 origin-left"
              style={{
                background: 'linear-gradient(90deg, #E5C07B, transparent)',
                animation: 'amber-underline 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              }}
            />
          )}
          <p className="text-[17px] leading-[1.6] mb-10" style={{ color: '#8A8A8E' }}>
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
          className="rounded-lg border overflow-hidden"
          style={{ backgroundColor: '#111113', borderColor: '#222228' }}
        >
          {/* Card header - pipeline steps */}
          <div className="px-5 py-4 border-b" style={{ borderColor: '#222228' }}>
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
                      color: step.done ? '#7EC699' : step.active ? '#E5C07B' : '#555559',
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
                    color: line === '' ? 'transparent' : '#8A8A8E',
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

  return (
    <section className="py-24 px-6 sm:px-12 border-t" style={{ borderColor: '#222228' }}>
      <div className="max-w-[1100px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-16 items-start">
          <div>
            <p className="font-mono text-xs tracking-[0.12em] uppercase mb-4" style={{ color: '#555559' }}>
              How it works
            </p>
            <h2 className="font-serif text-[36px] leading-[1.15] tracking-[-0.02em]" style={{ color: '#EDEDEF' }}>
              Three steps.<br />One company name.
            </h2>
          </div>

          <div className="relative">
            {/* Vertical connecting line */}
            <div
              className="absolute left-[19px] top-6 bottom-6 w-px"
              style={{ backgroundColor: '#222228' }}
            />

            <div className="space-y-10">
              {steps.map((step, i) => (
                <div key={i} className="flex gap-6 relative animate-fade-up" style={{ animationDelay: `${i * 0.1}s`, animationFillMode: 'both' }}>
                  <div
                    className="w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 z-10"
                    style={{ backgroundColor: '#0A0A0B', borderColor: '#222228' }}
                  >
                    <span className="font-mono text-[11px] tracking-wider" style={{ color: '#E5C07B' }}>
                      {step.num}
                    </span>
                  </div>
                  <div className="pt-2">
                    <h3 className="font-semibold text-[16px] mb-2" style={{ color: '#EDEDEF' }}>
                      {step.title}
                    </h3>
                    <p className="text-[14px] leading-[1.6]" style={{ color: '#8A8A8E' }}>
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Differentiator() {
  return (
    <section className="py-24 px-6 sm:px-12 border-t" style={{ borderColor: '#222228' }}>
      <div className="max-w-[1100px] mx-auto">
        <h2
          className="font-serif text-[42px] sm:text-[52px] leading-[1.15] tracking-[-0.02em] mb-10 max-w-[700px]"
          style={{ color: '#EDEDEF' }}
        >
          Not another AI template generator.
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div className="space-y-5">
            <p className="text-[15px] leading-[1.7]" style={{ color: '#8A8A8E' }}>
              Most AI cover letter tools take your resume, take the job description, and produce a generic summary that sounds exactly like every other application. Hiring managers can tell.
            </p>
            <p className="text-[15px] leading-[1.7]" style={{ color: '#8A8A8E' }}>
              CoverMe runs a live research pass on the company before writing a single word. It looks at their mission, culture signals, growth areas, and recent news — then matches that against your actual skills and experience to find the most compelling angle.
            </p>
            <p className="text-[15px] leading-[1.7]" style={{ color: '#8A8A8E' }}>
              The result is a letter that references specific company details, connects your real achievements to their actual needs, and reads like something a thoughtful human wrote — because the AI had real information to work with.
            </p>
          </div>

          {/* Comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              className="rounded-lg border p-4"
              style={{ backgroundColor: '#111113', borderColor: '#222228' }}
            >
              <p className="font-mono text-[11px] tracking-wider uppercase mb-3" style={{ color: '#555559' }}>
                Generic AI
              </p>
              <div className="space-y-2">
                {[
                  '"I am excited about this opportunity..."',
                  '"My skills align perfectly with..."',
                  '"I am a fast learner who works well..."',
                  '"I look forward to discussing..."',
                ].map((line, i) => (
                  <p key={i} className="text-[12px] leading-[1.5] line-through" style={{ color: '#555559' }}>
                    {line}
                  </p>
                ))}
              </div>
            </div>

            <div
              className="rounded-lg border p-4"
              style={{ backgroundColor: '#111113', borderColor: '#E5C07B', borderWidth: '1px' }}
            >
              <p className="font-mono text-[11px] tracking-wider uppercase mb-3" style={{ color: '#E5C07B' }}>
                CoverMe
              </p>
              <div className="space-y-2">
                {[
                  '"Your Constitutional AI work is the most credible approach I\'ve seen..."',
                  '"My pipeline optimization at Stripe reduced latency by 34%..."',
                  '"Your recent Series C signals a scaling phase where I\'ve thrived..."',
                ].map((line, i) => (
                  <p key={i} className="text-[12px] leading-[1.5]" style={{ color: '#8A8A8E' }}>
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
  return (
    <section className="py-24 px-6 sm:px-12 border-t" style={{ borderColor: '#222228' }}>
      <div className="max-w-[1100px] mx-auto">
        <p className="text-[15px] mb-6" style={{ color: '#8A8A8E' }}>
          Ready to stop writing cover letters from scratch?
        </p>
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
    </section>
  )
}

export default function LandingPage() {
  return (
    <div style={{ backgroundColor: '#0A0A0B', minHeight: '100vh' }}>
      {/* Navbar */}
      <nav
        className="sticky top-0 z-50 border-b"
        style={{ backgroundColor: '#0A0A0B', borderColor: '#222228' }}
      >
        <div className="max-w-[1100px] mx-auto px-6 sm:px-12 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-baseline gap-[2px]">
            <span className="font-serif text-[26px]" style={{ color: '#EDEDEF' }}>Cover</span>
            <span className="font-serif text-[26px]" style={{ color: '#E5C07B' }}>Me</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/login" className="landing-outline-cta-btn" aria-label="Sign in">
              <span className="landing-outline-cta-text">
                Sign in
                <svg className="landing-outline-cta-icon" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </span>
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
        style={{ borderColor: '#222228' }}
      >
        <div className="max-w-[1100px] mx-auto flex items-center justify-between">
          <div className="flex items-baseline gap-[2px]">
            <span className="font-serif text-[16px]" style={{ color: '#EDEDEF' }}>Cover</span>
            <span className="font-serif text-[16px]" style={{ color: '#E5C07B' }}>Me</span>
          </div>
          <p className="font-mono text-[11px]" style={{ color: '#555559' }}>
            Created by Eng.Meshari • Contact: 0553323624
          </p>
        </div>
      </footer>
    </div>
  )
}
