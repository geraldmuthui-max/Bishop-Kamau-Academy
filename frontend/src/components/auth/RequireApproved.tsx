import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function RequireApproved({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  const loc = useLocation()

  if (loading) return <div style={{padding:16}}>Loading…</div>

  // Not signed in? Let your existing RequireAuth handle it, but safe-guard:
  if (!user) return <Navigate to="/login" replace state={{ from: loc }} />

  // Signed in but NOT approved → kick back to login with a flag
  if (profile && profile.approved === false) {
    return <Navigate to="/login" replace state={{ pending: true }} />
  }

  // Approved → allow access
  return <>{children}</>
}
