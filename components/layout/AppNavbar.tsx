'use client'

import { useState } from 'react'
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

  const NavItem = ({ href, label, Icon }: { href: string; label: string; Icon: React.ElementType }) => {
    const active = pathname === href
    const [hovered, setHovered] = useState(false)

    return (
      <Link
        href={href}
        className="relative flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium transition-all duration-200"
        style={{
          color: active ? '#E5C07B' : hovered ? '#EDEDEF' : '#6A6A70',
          backgroundColor: active
            ? 'rgba(229, 192, 123, 0.1)'
            : hovered
            ? 'rgba(255,255,255,0.04)'
            : 'transparent',
          border: active ? '1px solid rgba(229, 192, 123, 0.22)' : '1px solid transparent',
          boxShadow: active ? '0 0 12px rgba(229,192,123,0.1), inset 0 1px 0 rgba(229,192,123,0.08)' : 'none',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="hidden sm:inline">{label}</span>
      </Link>
    )
  }

  const [signOutHovered, setSignOutHovered] = useState(false)

  return (
    <nav
      className="sticky top-0 z-50 border-b"
      style={{
        backgroundColor: 'rgba(10,10,11,0.82)',
        borderColor: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        animation: 'fade-in 0.35s ease forwards',
      }}
    >
      <div className="max-w-[1100px] mx-auto px-6 sm:px-8 h-14 flex items-center justify-between">
        <Link
          href="/dashboard"
          className="flex items-baseline gap-[2px] transition-opacity duration-200 hover:opacity-80"
        >
          <span className="font-serif text-[18px]" style={{ color: '#EDEDEF' }}>Cover</span>
          <span className="font-serif text-[18px]" style={{ color: '#E5C07B' }}>Me</span>
        </Link>

        <div className="flex items-center gap-1">
          <NavItem href="/dashboard" label="Dashboard" Icon={LayoutDashboard} />
          <NavItem href="/profile" label="Profile" Icon={User} />

          <div className="w-px h-4 mx-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />

          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium transition-all duration-200"
            style={{
              color: signOutHovered ? '#E06C75' : '#444448',
              backgroundColor: signOutHovered ? 'rgba(224,108,117,0.08)' : 'transparent',
              border: signOutHovered ? '1px solid rgba(224,108,117,0.18)' : '1px solid transparent',
            }}
            onMouseEnter={() => setSignOutHovered(true)}
            onMouseLeave={() => setSignOutHovered(false)}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </nav>
  )
}
