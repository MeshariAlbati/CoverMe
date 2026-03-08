'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { getBaseUrlForClient } from '@/lib/site-url'
import { Loader2, CheckCircle2 } from 'lucide-react'

const signupSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type SignupForm = z.infer<typeof signupSchema>

function FormInput({
  type,
  placeholder,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <div className="space-y-1.5">
      <input
        type={type}
        placeholder={placeholder}
        {...props}
        className="w-full h-10 px-3 rounded text-[14px] outline-none transition-all duration-200"
        style={{
          backgroundColor: '#1A1A1F',
          border: '1px solid #222228',
          color: '#EDEDEF',
        }}
        onFocus={e => {
          e.target.style.borderColor = '#E5C07B'
          e.target.style.boxShadow = '0 0 0 2px rgba(229, 192, 123, 0.1)'
        }}
        onBlur={e => {
          e.target.style.borderColor = '#222228'
          e.target.style.boxShadow = 'none'
        }}
      />
      {error && (
        <p className="text-[12px]" style={{ color: '#E06C75' }}>{error}</p>
      )}
    </div>
  )
}

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, formState: { errors } } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema) as any,
  })

  async function onSubmit(data: SignupForm) {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: `${getBaseUrlForClient()}/auth/callback`,
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ backgroundColor: '#0A0A0B' }}
      >
        <div
          className="w-full max-w-[400px] rounded-lg border p-10 text-center"
          style={{ backgroundColor: '#111113', borderColor: '#222228' }}
        >
          <CheckCircle2 className="w-12 h-12 mx-auto mb-5" style={{ color: '#7EC699' }} />
          <h2 className="text-[20px] font-semibold mb-2" style={{ color: '#EDEDEF' }}>
            Check your email
          </h2>
          <p className="text-[14px] leading-[1.6] mb-7" style={{ color: '#8A8A8E' }}>
            We sent a confirmation link to your email. Click it to activate your account.
          </p>
          <Link
            href="/login"
            className="inline-block w-full h-10 rounded text-[14px] font-medium transition-colors text-center leading-10"
            style={{
              border: '1px solid #222228',
              color: '#8A8A8E',
            }}
          >
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: '#0A0A0B' }}
    >
      {/* Logo */}
      <Link href="/" className="flex items-baseline gap-[2px] mb-10">
        <span className="font-serif text-[24px]" style={{ color: '#EDEDEF' }}>Cover</span>
        <span className="font-serif text-[24px]" style={{ color: '#E5C07B' }}>Me</span>
      </Link>

      {/* Card */}
      <div
        className="w-full max-w-[400px] rounded-lg border p-8"
        style={{ backgroundColor: '#111113', borderColor: '#222228' }}
      >
        <h1 className="text-[22px] font-semibold mb-1" style={{ color: '#EDEDEF' }}>
          Create an account
        </h1>
        <p className="text-[14px] mb-7" style={{ color: '#8A8A8E' }}>
          Start generating tailored cover letters
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div
              className="p-3 rounded text-[13px] border"
              style={{
                backgroundColor: 'rgba(224, 108, 117, 0.08)',
                borderColor: 'rgba(224, 108, 117, 0.3)',
                color: '#E06C75',
              }}
            >
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium" style={{ color: '#8A8A8E' }}>Email</label>
            <FormInput
              type="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              {...register('email')}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium" style={{ color: '#8A8A8E' }}>Password</label>
            <FormInput
              type="password"
              placeholder="Min 8 characters"
              error={errors.password?.message}
              {...register('password')}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium" style={{ color: '#8A8A8E' }}>Confirm password</label>
            <FormInput
              type="password"
              placeholder="••••••••"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded text-[14px] font-medium transition-all duration-200 mt-2 flex items-center justify-center gap-2"
            style={{
              backgroundColor: '#E5C07B',
              color: '#0A0A0B',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={e => {
              if (!loading) (e.currentTarget as HTMLElement).style.backgroundColor = '#F0D08A'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.backgroundColor = '#E5C07B'
            }}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating account...
              </>
            ) : (
              'Create account'
            )}
          </button>
        </form>

        <p className="text-[13px] text-center mt-6" style={{ color: '#555559' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: '#E5C07B' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
