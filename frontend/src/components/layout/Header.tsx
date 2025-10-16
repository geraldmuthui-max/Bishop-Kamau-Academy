// src/components/layout/Header.tsx
import { Bell } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import { useAuth } from '../../contexts/AuthContext'
import { Link, useNavigate } from 'react-router-dom'

export default function Header() {
  const { user, profile, signOutApp } = useAuth()
  const nav = useNavigate()
  const onLogout = async () => { await signOutApp(); nav('/login', { replace: true }) }

  const label =
    profile?.displayName?.trim() ||
    (profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : 'User')

  return (
    <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
      {/* Left: School name only */}
      <Link to="/" className="shrink-0 select-none" title="Bishop Dr. Kamau Academy">
        <div className="brand-title text-balance">Bishop Dr. Kamau Academy</div>
      </Link>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <button className="btn-ghost h-10 w-10 rounded-full" title="Notifications">
          <Bell className="h-5 w-5" />
        </button>
        <ThemeToggle />

        {user ? (
          <>
            <span className="btn btn-identity">{label}</span>
            <Link to="/" className="btn btn-gradient btn-dashboard">Dashboard</Link>
            <button className="btn btn-gradient btn-logout" onClick={onLogout}>Log out</button>
          </>
        ) : (
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        )}
      </div>
    </div>
  )
}
