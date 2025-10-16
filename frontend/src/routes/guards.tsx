// src/routes/guards.tsx
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/** Must be signed in (profile approval handled elsewhere) */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div style={{padding:16}}>Loading…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: loc }} />
  return <>{children}</>
}

/** If signed in AND approved, bounce away from public pages (login/signup) */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div style={{padding:16}}>Loading…</div>
  if (user && profile?.approved) {
    const dest = (loc.state as any)?.from?.pathname || '/'
    return <Navigate to={dest} replace />
  }
  return <>{children}</>
}
