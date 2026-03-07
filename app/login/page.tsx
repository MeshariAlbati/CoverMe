'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginForm) {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
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
          Sign in
        </h1>
        <p className="text-[14px] mb-7" style={{ color: '#8A8A8E' }}>
          Continue to your account
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
            <label className="block text-[13px] font-medium" style={{ color: '#8A8A8E' }}>
              Email
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              {...register('email')}
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
            {errors.email && (
              <p className="text-[12px]" style={{ color: '#E06C75' }}>{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium" style={{ color: '#8A8A8E' }}>
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              {...register('password')}
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
            {errors.password && (
              <p className="text-[12px]" style={{ color: '#E06C75' }}>{errors.password.message}</p>
            )}
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
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <p className="text-[13px] text-center mt-6" style={{ color: '#555559' }}>
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="transition-colors"
            style={{ color: '#E5C07B' }}
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
