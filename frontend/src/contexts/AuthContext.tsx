// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { auth } from '../lib/firebase'
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  User,
  setPersistence,
  browserLocalPersistence, // 👈 CHANGED THIS
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  limit,
  orderBy
} from 'firebase/firestore'
import { db } from '../lib/firebase'

export type Role = 'admin' | 'teacher' | 'accounts' | 'parent' | 'student'

export type UserProfile = {
  id: string
  uid?: string
  email?: string
  emailLower?: string
  displayName?: string
  role?: Role
  approved?: boolean
  createdAt?: number
}

type AuthCtx = {
  user: User | null
  profile: UserProfile | null
  users: UserProfile[]
  loading: boolean
  signUp: (email: string, password: string, displayName?: string, role?: Role) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOutApp: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updateUserRole: (uid: string, role: Role, approved?: boolean) => Promise<void>
  createUserAsAdmin: (email: string, password: string, displayName?: string, role?: Role, approved?: boolean) => Promise<string>
}

const Ctx = createContext<AuthCtx | null>(null)

function normalizeApproved(v: any): boolean {
  if (v === true) return true
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    return s === 'true' || s === '1' || s === 'yes'
  }
  if (typeof v === 'number') return v === 1
  return false
}

async function fetchProfileDocForUser(u: User) {
  // 1) try users/{uid}
  const directRef = doc(db, 'users', u.uid)
  let snap = await getDoc(directRef)
  if (snap.exists()) return { id: snap.id, data: snap.data() as any }

  // 2) try where uid == u.uid
  let q1 = query(collection(db, 'users'), where('uid', '==', u.uid), limit(1))
  let s1 = await getDocs(q1)
  if (!s1.empty) {
    const d = s1.docs[0]
    return { id: d.id, data: d.data() as any }
  }

  // 3) try emailLower == email.toLowerCase()
  const email = (u.email || '').trim()
  const emailLower = email.toLowerCase()
  if (emailLower) {
    let q2 = query(collection(db, 'users'), where('emailLower', '==', emailLower), limit(1))
    let s2 = await getDocs(q2)
    if (!s2.empty) {
      const d = s2.docs[0]
      return { id: d.id, data: d.data() as any }
    }

    // 4) last resort: email == email (case-sensitive)
    let q3 = query(collection(db, 'users'), where('email', '==', email), limit(1))
    let s3 = await getDocs(q3)
    if (!s3.empty) {
      const d = s3.docs[0]
      return { id: d.id, data: d.data() as any }
    }
  }

  return null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)

  // 👇 FIXED: Use browserLocalPersistence instead of inMemoryPersistence
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.error('Failed to set persistence:', error)
    })
  }, [])

  const loadUsers = async () => {
    try {
      const qy = query(collection(db, 'users'), orderBy('email'))
      const snap = await getDocs(qy)
      const list: UserProfile[] = []
      snap.forEach(d => list.push({ id: d.id, ...(d.data() as any) }))
      setUsers(list)
    } catch { /* optional */ }
  }

  useEffect(() => {
    const off = onAuthStateChanged(auth, async (u) => {
      try {
        setUser(u)
        if (!u) {
          setProfile(null)
          setLoading(false)
          return
        }

        let found = await fetchProfileDocForUser(u)
        if (!found) {
          // Create minimal profile (do NOT auto-approve)
          const payload: any = {
            uid: u.uid,
            email: u.email || '',
            emailLower: (u.email || '').toLowerCase(),
            displayName: u.displayName || '',
            role: 'teacher',
            approved: false,
            createdAt: Date.now(),
          }
          await setDoc(doc(db, 'users', u.uid), payload, { merge: true })
          found = { id: u.uid, data: payload }
        }

        const data = found.data
        const approved = normalizeApproved(data.approved)
        const role: Role | undefined = data.role
        const isAdmin = role === 'admin'

        setProfile({
          id: found.id,
          ...data,
          approved: isAdmin ? true : approved, // admin bypass
        })

        await loadUsers()
      } finally {
        setLoading(false)
      }
    })
    return () => off()
  }, [])

  async function signUp(email: string, password: string, displayName?: string, role: Role = 'teacher') {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    const uid = cred.user.uid
    await setDoc(doc(db, 'users', uid), {
      uid,
      email,
      emailLower: email.toLowerCase(),
      displayName: displayName || '',
      role,
      approved: false,
      createdAt: Date.now(),
    }, { merge: true })
  }

  async function signIn(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    const u = cred.user

    let found = await fetchProfileDocForUser(u)
    if (!found) {
      // create a basic profile and block until approved (except admin, which we can't know yet)
      const payload: any = {
        uid: u.uid,
        email: u.email || email,
        emailLower: (u.email || email).toLowerCase(),
        displayName: u.displayName || '',
        role: 'teacher',
        approved: false,
        createdAt: Date.now(),
      }
      await setDoc(doc(db, 'users', u.uid), payload, { merge: true })
      const err: any = new Error('Account pending approval')
      err.code = 'auth/unapproved'
      throw err
    }

    const data = found.data
    const role: Role | undefined = data.role
    const isAdmin = role === 'admin'
    const isApproved = normalizeApproved(data.approved)

    if (!isAdmin && !isApproved) {
      const err: any = new Error('Account pending approval')
      err.code = 'auth/unapproved'
      throw err
    }
    // If admin or approved, Login.tsx will route after profile loads.
  }

  function signOutApp() {
    return signOut(auth)
  }

  function resetPassword(email: string) {
    return sendPasswordResetEmail(auth, email)
  }

  async function updateUserRole(uid: string, role: Role, approved?: boolean) {
    const payload: any = { role }
    if (typeof approved !== 'undefined') payload.approved = approved
    await updateDoc(doc(db, 'users', uid), payload)
    await loadUsers()
  }

  // Firestore-only helper for your Users page (does not create auth user)
  async function createUserAsAdmin(email: string, _password: string, displayName?: string, role: Role = 'teacher', approved: boolean = false) {
    const dummyId = `pending-${Date.now()}`
    await setDoc(doc(db, 'users', dummyId), {
      email,
      emailLower: email.toLowerCase(),
      displayName: displayName || '',
      role,
      approved,
      createdAt: Date.now(),
    })
    await loadUsers()
    return dummyId
  }

  const value = useMemo(() => ({
    user, profile, users, loading,
    signUp, signIn, signOutApp, resetPassword,
    updateUserRole, createUserAsAdmin,
  }), [user, profile, users, loading])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export { Role }