'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { LLMProvider } from '@/types'

type ProviderPickerProps = {
  value: LLMProvider
  onChange: (provider: LLMProvider) => void
  disabled?: boolean
  allowClaude?: boolean
  lockedClaudeMessage?: string
}

const PROVIDERS: Array<{
  id: LLMProvider
  label: string
  logo: string
  accent: string
  bgTint: string
}> = [
  {
    id: 'claude',
    label: 'Claude',
    logo: '/logos/claude.svg',
    accent: '#E5C07B',
    bgTint: 'rgba(229, 192, 123, 0.1)',
  },
  {
    id: 'groq',
    label: 'Groq',
    logo: '/logos/groq.svg',
    accent: '#7EC699',
    bgTint: 'rgba(126, 198, 153, 0.1)',
  },
]

export default function ProviderPicker({
  value,
  onChange,
  disabled = false,
  allowClaude = true,
  lockedClaudeMessage = 'Sorry but it cost a lot ): ',
}: ProviderPickerProps) {
  const [hint, setHint] = useState('')

  function selectProvider(provider: LLMProvider) {
    if (disabled) return

    if (provider === 'claude' && !allowClaude) {
      setHint(lockedClaudeMessage)
      return
    }

    setHint('')
    onChange(provider)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {PROVIDERS.map(provider => {
          const isLocked = provider.id === 'claude' && !allowClaude
          const isActive = value === provider.id && !isLocked

          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => selectProvider(provider.id)}
              disabled={disabled}
              className="h-8 px-2.5 rounded border text-[12px] font-medium flex items-center gap-2 transition-all duration-150"
              style={{
                borderColor: isActive ? provider.accent : '#222228',
                backgroundColor: isActive ? provider.bgTint : '#1A1A1F',
                color: isActive ? '#EDEDEF' : '#8A8A8E',
                opacity: disabled ? 0.5 : isLocked ? 0.65 : 1,
                cursor: disabled ? 'not-allowed' : isLocked ? 'not-allowed' : 'pointer',
              }}
              title={isLocked ? lockedClaudeMessage : provider.label}
            >
              <Image
                src={provider.logo}
                alt={`${provider.label} logo`}
                width={14}
                height={14}
                className="w-3.5 h-3.5"
                draggable={false}
              />
              <span>{provider.label}</span>
              {isLocked && (
                <span className="font-mono text-[10px]" style={{ color: '#555559' }}>
                  locked
                </span>
              )}
            </button>
          )
        })}
      </div>
      {hint && (
        <p className="text-[12px] font-medium" style={{ color: '#E5C07B' }}>
          {hint}
        </p>
      )}
    </div>
  )
}
