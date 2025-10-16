import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Link, useLocation, useNavigate } from 'react-router-dom'

export default function Login() {
  const { signIn, user, profile } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const nav = useNavigate()
  const location = useLocation()
  const particlesRef = useRef<HTMLDivElement>(null)

  // Only redirect to app if APPROVED
  useEffect(() => {
    if (user && profile?.approved) nav('/', { replace: true })
  }, [user, profile?.approved, nav])

  // If redirected back due to pending approval, show a banner
  useEffect(() => {
    if ((location.state as any)?.pending) {
      setBanner('Your account is awaiting admin approval. You will be able to sign in once approved.')
    }
  }, [location.state])

  // Particles (unchanged)
  useEffect(() => {
    const host = particlesRef.current
    if (!host) return
    let alive = true
    const createParticle = () => {
      if (!alive || !host) return
      const p = document.createElement('div')
      const variant = Math.floor(Math.random() * 3)
      p.className = `login-particle ${variant === 0 ? 'alt1' : variant === 1 ? 'alt2' : 'alt3'}`
      p.style.left = `${Math.random() * 100}%`
      p.style.bottom = `-10px`
      p.style.animationDelay = `${Math.random() * 5}s`
      host.appendChild(p)
      setTimeout(() => p.remove(), 26000)
    }
    for (let i = 0; i < 50; i++) setTimeout(createParticle, i * 200)
    const id = setInterval(createParticle, 800)
    return () => { alive = false; clearInterval(id); host.innerHTML = '' }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBanner(null)
    try {
      setLoading(true)
      await signIn(email.trim(), password)
      // If approved, AuthContext will keep you signed in;
      // the useEffect above will navigate to "/".
      // If NOT approved, signIn throws and we show a friendly message below.
    } catch (e: any) {
      if (e?.code === 'auth/unapproved') {
        setBanner('Your account is awaiting admin approval. You will be able to sign in once approved.')
      } else {
        setBanner(e?.message || 'Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg" aria-hidden />
      <div className="login-shapes" aria-hidden>
        <div className="login-shape s1" />
        <div className="login-shape s2" />
        <div className="login-shape s3" />
        <div className="login-shape s4" />
        <div className="login-shape s5" />
      </div>
      <div className="login-grid" aria-hidden />
      <div className="login-scan" aria-hidden />
      <div className="login-particles" ref={particlesRef} aria-hidden />

      <div className="relative z-10 min-h-screen grid place-items-center p-4">
        <form onSubmit={submit} className="login-card">
          <div className="login-logo">PS</div>
          <div className="text-center">
            <div className="text-3xl font-extrabold tracking-tight mb-1">SystemTeck</div>
            <div className="text-2x1 font-extrabold tracking-tight mb-1">School System</div>
            <div className="login-muted mb-4">Sign in to continue</div>
          </div>

          {banner && (
            <div className="rounded-md bg-yellow-500/10 text-yellow-200 p-3 text-sm mb-4">
              {banner}
            </div>
          )}

          <div className="login-field">
            <label className="login-label">Email</label>
            <input
              className="login-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="login-field">
            <label className="login-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="login-input"
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="login-showpw"
                onClick={() => setShowPw(s => !s)}
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="login-muted mt-5">
            No account? <Link to="/signup">Create one</Link>
          </div>

          <div className="login-foot mt-3">
            © {new Date().getFullYear()} SystemTeck • Secure login
          </div>
        </form>
      </div>
    </div>
  )
}
