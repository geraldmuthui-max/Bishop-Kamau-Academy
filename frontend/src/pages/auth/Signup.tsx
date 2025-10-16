import { useState, useEffect, useRef } from 'react'
import { useAuth, Role } from '../../contexts/AuthContext'
import { useNavigate, Link } from 'react-router-dom'

export default function Signup() {
  const { signUp, user, profile } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<Role>('teacher')
  const nav = useNavigate()
  const particlesRef = useRef<HTMLDivElement>(null)

  // If already signed in & approved, go home
  useEffect(() => { if (user && profile?.approved) nav('/', { replace: true }) }, [user, profile, nav])

  useEffect(() => {
    const host = particlesRef.current
    if (!host) return
    let alive = true
    const mk = () => {
      if (!alive || !host) return
      const p = document.createElement('div')
      const v = Math.floor(Math.random()*3)
      p.className = `login-particle ${v===0?'alt1':v===1?'alt2':'alt3'}`
      p.style.left = `${Math.random()*100}%`; p.style.bottom='-10px'; p.style.animationDelay = `${Math.random()*5}s`
      host.appendChild(p); setTimeout(()=>p.remove(), 26000)
    }
    for (let i=0;i<40;i++) setTimeout(mk, i*220)
    const id = setInterval(mk, 900)
    return () => { alive=false; clearInterval(id); host.innerHTML='' }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await signUp(email.trim(), password, displayName.trim() || undefined, role)
      alert('Account created! Your access is pending admin approval. You can sign in once approved.')
      nav('/login', { replace: true })
    } catch (err: any) {
      alert(err?.message || 'Signup failed')
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg" aria-hidden />
      <div className="login-shapes" aria-hidden>
        <div className="login-shape s1" /><div className="login-shape s2" />
        <div className="login-shape s3" /><div className="login-shape s4" />
        <div className="login-shape s5" />
      </div>
      <div className="login-grid" aria-hidden /><div className="login-scan" aria-hidden />
      <div className="login-particles" ref={particlesRef} aria-hidden />

      <div className="relative z-10 min-h-screen grid place-items-center p-4">
        <form onSubmit={submit} className="login-card space-y-4">
          <div className="login-logo">PS</div>
          <h1 className="text-center text-3xl font-extrabold tracking-tight">Create account</h1>

          <div className="rounded-md bg-emerald-500/10 text-emerald-200 p-3 text-sm">
            Fill in your details. Your account will require admin approval before you can sign in.
          </div>

          <div>
            <label className="login-label">Display Name</label>
            <input className="login-input" value={displayName} onChange={e=>setDisplayName(e.target.value)} />
          </div>
          <div>
            <label className="login-label">Email</label>
            <input className="login-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
          </div>
          <div>
            <label className="login-label">Password</label>
            <input className="login-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          </div>

          <select className="login-input" value={role} onChange={e=>setRole(e.target.value as Role)}>
            <option value="teacher">Teacher</option>
            <option value="accounts">Accounts</option>
            <option value="parent">Parent</option>
            <option value="student">Student</option>
            <option value="admin">Admin</option>
          </select>

          <button className="login-btn" type="submit">Sign up</button>
          <div className="login-muted">Have an account? <Link to="/login">Sign in</Link></div>
        </form>
      </div>
    </div>
  )
}
