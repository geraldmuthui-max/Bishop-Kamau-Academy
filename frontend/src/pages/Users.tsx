import { useEffect, useMemo, useState } from 'react'
import { Trash2, CheckCircle2, XCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../lib/firebase'
import { doc, deleteDoc, updateDoc } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

type BackendRole = 'admin' | 'teacher' | 'parent' | 'staff'

/** ========= Backend helpers (from your backend ZIP) ========= */
const API_BASE =
  ((import.meta as any).env?.VITE_API_URL
    ? String((import.meta as any).env.VITE_API_URL).replace(/\/$/, '')
    : 'http://localhost:4000') + '/api'

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAuth().currentUser?.getIdToken?.(true)
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(msg || `HTTP ${res.status}`)
  }
  const ct = res.headers.get('content-type') || ''
  return (ct.includes('application/json') ? res.json() : (null as any)) as T
}

const apiUsers = {
  // admin only
  list: () => apiFetch<{ ok:boolean; data:any[] }>('/users').then(r => r.data || []),
  create: (payload: { email:string; password:string; displayName:string; role:BackendRole }) =>
    apiFetch<{ ok:boolean; data:{ uid:string } }>('/users', { method:'POST', body: JSON.stringify(payload) }),
  setRole: (uid:string, role: BackendRole) =>
    apiFetch<{ ok:boolean }>('/users/' + encodeURIComponent(uid) + '/role', {
      method:'PATCH',
      body: JSON.stringify({ role }),
    }),
  setPassword: (uid:string, password:string) =>
    apiFetch<{ ok:boolean }>('/users/' + encodeURIComponent(uid) + '/password', {
      method:'PATCH',
      body: JSON.stringify({ password }),
    }),
}

/** ========= Page ========= */
export default function Users() {
  // We still use useAuth for current profile & gating, but READ the list from backend.
  const { profile } = useAuth()

  if (profile?.role !== 'admin') {
    return <div className="p-6">Only admins can view this page.</div>
  }

  // Backend user list (replaces the context list for reading)
  const [usersBE, setUsersBE] = useState<any[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [errList, setErrList] = useState<string | null>(null)
  const refreshUsers = async () => {
    setLoadingList(true); setErrList(null)
    try {
      const rows = await apiUsers.list()
      setUsersBE(Array.isArray(rows) ? rows : [])
    } catch (e:any) {
      setErrList(e?.message || 'Failed to load users')
      setUsersBE([])
    } finally {
      setLoadingList(false)
    }
  }
  useEffect(() => { refreshUsers() }, [])

  // Create user
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<BackendRole>('teacher')
  const [busyCreate, setBusyCreate] = useState(false)

  // Row actions
  const [busyRoleFor, setBusyRoleFor] = useState<string | null>(null)
  const [busyDeleteFor, setBusyDeleteFor] = useState<string | null>(null)
  const [busyApproveFor, setBusyApproveFor] = useState<string | null>(null)

  const createUserInline = async () => {
    if (!email || !password) return alert('Email & password required')
    if (!displayName.trim()) return alert('Display name is required')
    try {
      setBusyCreate(true)
      const payload = {
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        role,
      }
      const res = await apiUsers.create(payload)
      setDisplayName(''); setEmail(''); setPassword(''); setRole('teacher')
      await refreshUsers()
      alert(`User created (${res?.data?.uid || 'ok'}). They can now sign in.`)
    } catch (e: any) {
      alert(e?.message || 'Create user failed')
    } finally {
      setBusyCreate(false)
    }
  }

  const setRoleFor = async (row: any, r: BackendRole) => {
    const uid = String(row?.uid ?? '').trim()
    if (!uid) { alert('Missing user id for this row.'); return }
    try {
      setBusyRoleFor(uid)
      await apiUsers.setRole(uid, r)
      await refreshUsers()
    } catch (e: any) {
      alert(e?.message || 'Update role failed')
    } finally {
      setBusyRoleFor(null)
    }
  }

  // Approve remains Firestore (no approve route in backend)
  const approveUser = async (uid: string) => {
    try {
      setBusyApproveFor(uid)
      await updateDoc(doc(db, 'users', uid), { approved: true })
      await refreshUsers() // keep table in sync where possible
    } catch (e: any) {
      alert(e?.message || 'Approve failed')
    } finally {
      setBusyApproveFor(null)
    }
  }

  // Delete remains Firestore-only (backend has no delete route; this does NOT remove Auth user)
  const deleteUserRow = async (uidRaw: unknown, email?: string) => {
    const uid = typeof uidRaw === 'string' ? uidRaw.trim() : String(uidRaw ?? '').trim()
    if (!uid) { alert('Missing user id for this row.'); return }
    if (profile?.uid === uid) { alert('You cannot delete your own admin record while signed in.'); return }

    const label = email || uid
    const typed = window.prompt(`Type DELETE to permanently remove this user record:\n${label}`)
    if (typed === null) return
    if (typed.trim().toUpperCase() !== 'DELETE') { alert('Deletion cancelled.'); return }

    try {
      setBusyDeleteFor(uid)
      await deleteDoc(doc(db, 'users', uid))
      await refreshUsers()
      alert('User record deleted.')
    } catch (e: any) {
      alert(e?.message || 'Delete failed')
    } finally {
      setBusyDeleteFor(null)
    }
  }

  // Split backend list into pending vs approved using same flags if present
  const pending = usersBE.filter(u => u.approved === false)
  const approved = usersBE.filter(u => u.approved !== false)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Users (Admin)</h1>

      {/* Create new user (via backend) */}
      <section className="card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create New User</h2>
          <button className="btn-primary rounded-lg disabled:opacity-60" onClick={createUserInline} disabled={busyCreate}>
            {busyCreate ? 'Creating…' : '+ Create User + '}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-4 mt-3">
          <input className="rounded-md bg-muted px-3 py-2" placeholder="Display Name" value={displayName} onChange={e=>setDisplayName(e.target.value)} />
          <input className="rounded-md bg-muted px-3 py-2" placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="rounded-md bg-muted px-3 py-2" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          <select className="rounded-md bg-muted px-3 py-2" value={role} onChange={e=>setRole(e.target.value as BackendRole)}>
            {/* Roles aligned with backend validators */}
            <option value="teacher">Teacher</option>
            <option value="admin">Admin</option>
            <option value="parent">Parent</option>
            <option value="staff">Staff</option>
          </select>
        </div>

        <p className="text-xs opacity-70 mt-2">
          Tip: Creating a user here won’t log you out. The new user can sign in immediately.
        </p>
      </section>

      {/* Pending approvals (Firestore flag) */}
      <section className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pending Approvals</h2>
          <div className="text-sm opacity-70">Waiting: {pending.length}</div>
        </div>

        {errList && <div className="px-4 py-2 text-sm text-red-300">{errList}</div>}
        {loadingList && <div className="px-4 py-2 text-sm opacity-70">Loading users…</div>}

        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">UID</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pending.map(u => (
              <tr key={u.uid} className="border-t">
                <td className="px-4 py-2">{u.displayName || '-'}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2 capitalize">{u.role}</td>
                <td className="px-4 py-2">{u.uid}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <button
                      className="p-1.5 bg-transparent text-white hover:opacity-80 disabled:opacity-60"
                      title="Approve"
                      onClick={() => approveUser(u.uid)}
                      disabled={busyApproveFor === u.uid}
                    >
                      <CheckCircle2 className="h-5 w-5" />
                    </button>
                    <button
                      className="p-1.5 bg-transparent text-white hover:opacity-80 disabled:opacity-60"
                      title="Reject & delete record"
                      onClick={() => deleteUserRow(u.uid, u.email)}
                      disabled={busyDeleteFor === u.uid}
                    >
                      <XCircle className="h-5 w-5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr><td className="px-4 py-8 text-center opacity-70" colSpan={5}>No pending signups.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Approved users */}
      <section className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="text-lg font-semibold">All Users</h2>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">UID</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {approved.map(u => (
              <tr key={u.uid} className="border-t">
                <td className="px-4 py-2">{u.displayName || '-'}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2 capitalize">{u.role}</td>
                <td className="px-4 py-2">{u.uid}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <select
                      className="rounded-md bg-muted px-2 py-1"
                      value={u.role as BackendRole}
                      onChange={e => setRoleFor(u, e.target.value as BackendRole)}
                      disabled={!!busyRoleFor}
                      title="Change role"
                    >
                      {/* Only roles your backend accepts */}
                      <option value="teacher">Teacher</option>
                      <option value="admin">Admin</option>
                      <option value="parent">Parent</option>
                      <option value="staff">Staff</option>
                    </select>
                    <button
                      className="p-1.5 bg-transparent text-white hover:opacity-80 active:opacity-70 disabled:opacity-60 focus:outline-none"
                      title="Delete user record (Firestore only)"
                      onClick={() => deleteUserRow(u?.uid ?? '', u?.email ?? undefined)}
                      disabled={busyDeleteFor === u.uid || busyRoleFor === u.uid}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {approved.length === 0 && (
              <tr><td className="px-4 py-8 text-center opacity-70" colSpan={5}>No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
