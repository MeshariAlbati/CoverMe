'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LayoutDashboard, User, LogOut } from 'lucide-react'

export default function AppNavbar() {
  const router = useRouter()
  const pathname = usePathname()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const navItem = (href: string, label: string, Icon: React.ElementType) => {
    const active = pathname === href
    return (
      <Link
        href={href}
        className="flex items-center gap-1.5 h-8 px-3 rounded text-[13px] font-medium transition-colors duration-150"
        style={{
          color: active ? '#E5C07B' : '#8A8A8E',
          backgroundColor: active ? 'rgba(229, 192, 123, 0.08)' : 'transparent',
        }}
      >
        <Icon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{label}</span>
      </Link>
    )
  }

  return (
    <nav
      className="sticky top-0 z-50 border-b"
      style={{ backgroundColor: '#0A0A0B', borderColor: '#222228' }}
    >
      <div className="max-w-[1100px] mx-auto px-6 sm:px-8 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-baseline gap-[2px]">
          <span className="font-serif text-[18px]" style={{ color: '#EDEDEF' }}>Cover</span>
          <span className="font-serif text-[18px]" style={{ color: '#E5C07B' }}>Me</span>
        </Link>

        <div className="flex items-center gap-1">
          {navItem('/dashboard', 'Dashboard', LayoutDashboard)}
          {navItem('/profile', 'Profile', User)}

          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 h-8 px-3 rounded text-[13px] font-medium transition-colors duration-150 ml-1"
            style={{ color: '#555559' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#8A8A8E')}
            onMouseLeave={e => (e.currentTarget.style.color = '#555559')}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </nav>
  )
}
