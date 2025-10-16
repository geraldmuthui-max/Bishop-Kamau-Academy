// src/lib/api.ts - FIXED VERSION
import { getAuth, onAuthStateChanged, User } from 'firebase/auth'

const API_BASE =
  ((import.meta as any).env?.VITE_API_URL
    ? String((import.meta as any).env.VITE_API_URL).replace(/\/$/, '')
    : 'http://localhost:4001') + '/api'

/** Wait until a Firebase user exists, then return an ID token. */
async function waitForIdToken(): Promise<string> {
  const auth = getAuth()

  // 1) Already signed in?
  if (auth.currentUser) {
    return await auth.currentUser.getIdToken(/* forceRefresh */ true)
  }

  // 2) Wait for sign-in
  const token = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsub()
      reject(new Error('Auth timeout: user not signed in'))
    }, 15000)

    const unsub = onAuthStateChanged(
      auth,
      async (u: User | null) => {
        if (!u) return
        try {
          const t = await u.getIdToken(true)
          clearTimeout(timeout)
          unsub()
          resolve(t)
        } catch (e) {
          clearTimeout(timeout)
          unsub()
          reject(e as any)
        }
      },
      (err) => {
        clearTimeout(timeout)
        unsub()
        reject(err)
      }
    )
  })

  return token
}

/** Fetch wrapper that always includes a valid Authorization header. */
async function withAuth<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Ensure we have a token (handles the race where requests start before login completes)
  const token = await waitForIdToken()

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  })

  // If token was just invalidated, retry once with a fresh token
  if (res.status === 401) {
    const fresh = await getAuth().currentUser?.getIdToken(true).catch(() => null)
    if (fresh) {
      const retry = await fetch(`${API_BASE}${path}`, {
        ...init,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers || {}),
          Authorization: `Bearer ${fresh}`,
        },
      })
      if (!retry.ok) {
        const txt = await retry.text().catch(() => '')
        throw new Error(txt || `HTTP ${retry.status}`)
      }
      const ct = retry.headers.get('content-type') || ''
      return (ct.includes('application/json') ? retry.json() : (null as any)) as T
    }
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(txt || `HTTP ${res.status}`)
  }
  const ct = res.headers.get('content-type') || ''
  return (ct.includes('application/json') ? res.json() : (null as any)) as T
}

export const api = {
  // ---------- Lists (reads) ----------
  listClasses: () => withAuth<{ ok: boolean; data: any[] }>(`/classes`),
  listSubjects: () => withAuth<{ ok: boolean; data: any[] }>(`/subjects`),
  listVoteheads: () => withAuth<{ ok: boolean; data: any[] }>(`/voteheads`),
  listTeachers: () => withAuth<{ ok: boolean; data: any[] }>(`/teachers`),
  listStudents: () => withAuth<{ ok: boolean; data: any[] }>(`/students`),

  // ---------- Classes ----------
  createClass: (body: { name: string; capacity?: number }) =>
    withAuth<{ ok: boolean; data: any }>(`/classes`, { method: 'POST', body: JSON.stringify(body) }),
  renameClass: (id: string, body: { name: string }) =>
    withAuth<{ ok: boolean; data: any }>(`/classes/${encodeURIComponent(id)}/rename`, { method: 'PATCH', body: JSON.stringify(body) }),
  setClassCapacity: (id: string, body: { capacity: number }) =>
    withAuth<{ ok: boolean; data: any }>(`/classes/${encodeURIComponent(id)}/capacity`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteClass: (id: string) =>
    withAuth<{ ok: boolean }>(`/classes/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ---------- Students / Learners ----------
  createLearner: (body: any) =>
    withAuth<{ ok: boolean; data: any }>(`/students`, { method: 'POST', body: JSON.stringify(body) }),
  updateLearner: (id: string, body: any) =>
    withAuth<{ ok: boolean; data: any }>(`/students/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),

  // ---------- Subjects / Voteheads / Teachers ----------
  createSubject: (body: { name: string }) =>
    withAuth<{ ok: boolean; data: any }>(`/subjects`, { method: 'POST', body: JSON.stringify(body) }),
  createVotehead: (body: { name: string; code: string; defaultAmount: number }) =>
    withAuth<{ ok: boolean; data: any }>(`/voteheads`, { method: 'POST', body: JSON.stringify(body) }),
  createTeacher: (body: any) =>
    withAuth<{ ok: boolean; data: any }>(`/teachers`, { method: 'POST', body: JSON.stringify(body) }),

  // ---------- Teacher Assignments ----------
  getTeacherAssignments: (teacherId: string) =>
    withAuth<{ ok: boolean; data: any }>(`/teacher-assignments/${encodeURIComponent(teacherId)}`), // ✅ FIXED
  saveTeacherAssignments: (teacherId: string, body: { classIds: string[]; subjectIds: string[] }) =>
    withAuth<{ ok: boolean }>(`/teacher-assignments`, { method: 'POST', body: JSON.stringify({ teacherId, ...body }) }), // ✅ FIXED

  // ---------- Marks ----------
  upsertMarksBatch: (rows: any[]) =>
    withAuth<{ ok: boolean }>(`/marks/batch`, { method: 'POST', body: JSON.stringify({ rows }) }),
  getMarks: (filters: { year?: number; term?: number; classId?: string; subjectId?: string }) => {
    const qs = new URLSearchParams()
    if (filters.year != null) qs.set('year', String(filters.year))
    if (filters.term != null) qs.set('term', String(filters.term))
    if (filters.classId) qs.set('classId', String(filters.classId))
    if (filters.subjectId) qs.set('subjectId', String(filters.subjectId))
    return withAuth<{ ok: boolean; data: any[] }>(`/marks?${qs.toString()}`)
  },

  // ---------- Finance ---------- ✅ ALL FIXED
  assignClassFees: (body: { classId: string; distribution: Record<string, number>; year: number; term: 1 | 2 | 3 }) =>
    withAuth<{ ok: boolean; data: any }>(`/finance/assign-class-fees`, { method: 'POST', body: JSON.stringify(body) }), // ✅ FIXED
  recordPayment: (body: { studentId: string; method: 'cash' | 'mpesa' | 'card'; items: { voteheadId: string; amount: number }[]; receiptNo?: string; year?: number; term?: number }) =>
    withAuth<{ ok: boolean }>(`/fees/ledger`, { method: 'POST', body: JSON.stringify(body) }), // ✅ FIXED
  getStudentBalance: (p: { studentId: string; year?: number; term?: number }) => {
    const qs = new URLSearchParams()
    if (p.year != null) qs.set('year', String(p.year))
    if (p.term != null) qs.set('term', String(p.term))
    return withAuth<{ ok: boolean; data: any }>(
      `/finance/learner/${encodeURIComponent(p.studentId)}/balance?${qs.toString()}`
    )
  },
}