import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'

type Check = { label: string; ok: boolean | null; detail?: string }

export default function FirebaseStatus() {
  const { user } = useAuth()
  const [checks, setChecks] = useState<Check[]>([
    { label: 'Auth session', ok: null },
    { label: 'Firestore connectivity', ok: null },
    { label: 'School settings readable', ok: null },
  ])
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true)
    const res: Check[] = [
      { label: 'Auth session', ok: !!user, detail: user ? `Signed in as ${user.email || user.uid}` : 'No user' },
      { label: 'Firestore connectivity', ok: null },
      { label: 'School settings readable', ok: null },
    ]

    try {
      // quick connectivity ping: read a known doc (or a harmless doc that may/may not exist)
      const pingRef = doc(db, '_meta', 'ping')
      await getDoc(pingRef) // existence doesn’t matter — errors mean connectivity / rules trouble
      res[1].ok = true
      res[1].detail = 'Connected'
    } catch (e: any) {
      res[1].ok = false
      res[1].detail = e?.message || 'Failed'
    }

    try {
      const sRef = doc(db, 'settings', 'school')
      const snap = await getDoc(sRef)
      if (snap.exists()) {
        const d = snap.data() as any
        res[2].ok = true
        res[2].detail = d?.name || d?.schoolName || 'settings/school exists'
      } else {
        // readable but not set yet is still a pass
        res[2].ok = true
        res[2].detail = 'settings/school not set (readable)'
      }
    } catch (e: any) {
      res[2].ok = false
      res[2].detail = e?.message || 'Failed to read'
    }

    setChecks(res)
    setLoading(false)
  }

  useEffect(() => { run() }, [user?.uid]) // re-check when auth changes

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-cyan-400">Firebase Status</h1>
        <button className="btn btn-secondary" onClick={run} disabled={loading}>
          {loading ? 'Checking…' : 'Re-check'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {checks.map((c, i) => (
          <div key={i} className="rounded-lg border p-4 bg-white/5">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{c.label}</div>
              {c.ok === null ? (
                <span className="pill">…</span>
              ) : c.ok ? (
                <span className="pill" style={{ color: '#22c55e' }}>OK</span>
              ) : (
                <span className="pill" style={{ color: '#ef4444' }}>Fail</span>
              )}
            </div>
            <div className="mt-2 text-sm opacity-80">{c.detail || '—'}</div>
          </div>
        ))}
      </div>

      <p className="text-xs opacity-70">
        This page only reads data (no writes). If “Firestore connectivity” fails, check your Firebase config,
        network, or Firestore rules. If “Auth session” is “No user”, sign in first.
      </p>
    </div>
  )
}
