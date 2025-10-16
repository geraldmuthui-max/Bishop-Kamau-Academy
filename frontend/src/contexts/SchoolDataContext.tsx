// src/contexts/SchoolDataContext.tsx
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState
} from 'react';
import {
  collection, doc, getDoc, getDocs, onSnapshot, addDoc, setDoc,
  updateDoc, deleteDoc, writeBatch, type FirestoreError, type Unsubscribe
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';

const USE_BACKEND = (import.meta as any).env?.VITE_USE_BACKEND === 'true';

// -------------------- Backend HTTP helpers --------------------
const API_BASE =
  (import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
    : (import.meta.env.DEV ? 'http://localhost:4001' : '')
  ) + '/api';

async function withAuth<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { getAuth } = await import('firebase/auth');
  const token = await getAuth().currentUser?.getIdToken(true);
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `HTTP ${res.status}`);
  }
  const ct = res.headers.get('content-type') || '';
  return (ct.includes('application/json') ? await res.json() : null) as T;
}
const apiGet  = <T,>(path: string) => withAuth<T>(path, { method: 'GET' });
const apiPost = <T,>(path: string, body: any) =>
  withAuth<T>(path, { method: 'POST', body: JSON.stringify(body) });
const apiPatch = <T,>(path: string, body: any) =>
  withAuth<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const apiDelete = <T,>(path: string) => withAuth<T>(path, { method: 'DELETE' });

// -------------------- Backend list endpoints --------------------
async function listClasses() {
  try { const r = await apiGet<any>('/classes'); return r.ok ? r.data : []; }
  catch { return []; }
}
async function listVoteheads() {
  try { const r = await apiGet<any>('/voteheads'); return r.ok ? r.data : []; }
  catch { return []; }
}
async function listStudents() {
  try { const r = await apiGet<any>('/students'); return r.ok ? r.data : []; }
  catch { return []; }
}
async function listTeachers() {
  try { const r = await apiGet<any>('/teachers'); return r.ok ? r.data : []; }
  catch { return []; }
}
async function listSubjects() {
  try { const r = await apiGet<any>('/subjects'); return r.ok ? r.data : []; }
  catch { return []; }
}

// -------------------- Finance specific --------------------
async function getBalanceBackend(args: { learnerId: string; year: number; term: number }) {
  const qs = new URLSearchParams({ year: String(args.year), term: String(args.term) }).toString();
  try {
    const r = await apiGet<any>(`/finance/learner/${encodeURIComponent(args.learnerId)}/balance?${qs}`);
    return r.ok ? r.data : { totalDue: 0, totalPaid: 0, balance: 0, totals: { due: 0, paid: 0, balance: 0 }, perVotehead: {} };
  } catch {
    return { totalDue: 0, totalPaid: 0, balance: 0, totals: { due: 0, paid: 0, balance: 0 }, perVotehead: {} };
  }
}
async function assignClassFeesBackend(payload: {
  classId: string; year: number; term: number; lines: { voteheadId: string; amount: number }[];
}) {
  const r = await apiPost<any>('/finance/assign-class-fees', payload);
  return r.ok ? r.data : null;
}
async function recordPaymentBackend(payload: {
  studentId: string; method: 'cash'|'card'|'mpesa'; amount?: number; receiptNo?: string;
  items?: { voteheadId: string; amount: number }[]; year?: number; term?: number;
}) {
  const r = await apiPost<any>('/finance/record-payment', payload);
  return r.ok ? r.data : null;
}
async function addVoteheadBackend(name: string, code = '', defaultAmount = 0) {
  const r = await apiPost<any>('/voteheads', { name, code, defaultAmount });
  return r.ok ? r.data : null;
}

// -------------------- Types --------------------
export type Class   = { id: string; name: string; capacity?: number };
export type Subject = { id: string; name: string };
export type Votehead = { id: string; name: string; code?: string; defaultAmount?: number };
export type Student = { id: string; classId?: string; name?: string; [k: string]: any };
export type Teacher = { id: string; name?: string; status?: string; [k: string]: any };

// Balance cache types
type BalanceData = {
  totalDue: number;
  totalPaid: number;
  balance: number;
  perVotehead: Record<string, { due: number; paid: number; balance: number }>;
  totals: { due: number; paid: number; balance: number };
};

type BalanceCacheEntry = {
  data: BalanceData;
  timestamp: number;
};

type Ctx = {
  ready: boolean;
  currentYear: number;
  currentTerm: 1|2|3;

  classes: Class[];
  subjects: Subject[];
  voteheads: Votehead[];
  students: Student[];
  teachers: Teacher[];
  loading: boolean;
  error: FirestoreError | null;

  // CRUD
  addClass(arg: { name: string; capacity?: number } | string, capacity?: number): Promise<void>;
  updateClass(id: string, patch: { name?: string; capacity?: number } | string): Promise<void>;
  deleteClass(id: string): Promise<void>;

  addSubject(body: { name: string }): Promise<void>;
  updateSubject(id: string, patch: { name?: string }): Promise<void>;
  deleteSubject(id: string): Promise<void>;

  addTeacher(body: any): Promise<void>;
  updateTeacher(id: string, patch: any): Promise<void>;
  deleteTeacher(id: string): Promise<void>;

  addStudent(body: any): Promise<void>;
  updateStudent(id: string, body: any): Promise<void>;
  deleteStudent(id: string): Promise<void>;

  // Queries
  getStudentsByClass(classId: string): Student[];

  // Marks
  getTeacherAssignments(teacherId: string): Promise<{ id: string; assignments: { classId: string; subjectId: string }[] } | null>;
  saveTeacherAssignments(teacherId: string, body: { classIds: string[]; subjectIds: string[] }): Promise<void>;
  upsertMarksBatch(rows: any[]): Promise<void>;
  getMarksFor(filters: { year?: number; term?: number; classId?: string; subjectId?: string }): Promise<any[]>;

  // Finance with caching
  assignClassFees(args: { classId: string; distribution: Record<string, number>; year?: number; term?: number }): Promise<void>;
  recordPayment(args: { studentId: string; method: 'cash'|'mpesa'|'card'; items: { voteheadId: string; amount: number }[]; receiptNo?: string; year?: number; term?: number }): Promise<void>;
  getStudentBalance(args: { studentId: string; year?: number; term?: number }): Promise<BalanceData>;
  
  // Cache management
  invalidateBalanceCache(studentId?: string): void;
  preloadBalances(args: { year?: number; term?: number }): Promise<void>;
};

const SchoolDataContext = createContext<Ctx | null>(null);

// -------------------- Provider --------------------
export function SchoolDataProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();

  const [ready, setReady] = useState(false);
  const [classes,  setClasses]  = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [voteheads,setVoteheads]= useState<Votehead[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [currentTerm, setCurrentTerm] = useState<1|2|3>(1);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<FirestoreError | null>(null);

  // Balance cache: key = "studentId_year_term"
  const [balanceCache, setBalanceCache] = useState<Map<string, BalanceCacheEntry>>(new Map());

  useEffect(() => {
    let unsubs: Unsubscribe[] = [];
    let cancelled = false;

    async function loadViaBackend() {
      if (authLoading || !user) return;
      setLoading(true);
      try {
        const [cls, subs, vhs, studs, tchs] = await Promise.all([
          listClasses(), listSubjects(), listVoteheads(), listStudents(), listTeachers()
        ]);
        if (cancelled) return;
        setClasses(cls || []);
        setSubjects(subs || []);
        setVoteheads(vhs || []);
        setStudents(studs || []);
        setTeachers(tchs || []);

        unsubs.push(onSnapshot(doc(db, 'settings', 'school'), (d) => {
          if (d.exists()) {
            const sv = d.data() as any;
            if (sv.currentYear) setCurrentYear(Number(sv.currentYear));
            if (sv.currentTerm) setCurrentTerm(Number(sv.currentTerm) as 1|2|3);
          }
          setReady(true);
        }));
      } catch (e: any) {
        console.error('[SchoolData] backend load failed:', e?.message || e);
        setError(e as any);
      } finally {
        if (!cancelled) {
          const t = setTimeout(() => setLoading(false), 150);
          unsubs.push(() => clearTimeout(t));
        }
      }
    }

    async function loadViaFirestore() {
      setLoading(true);
      try {
        unsubs.push(onSnapshot(collection(db, 'classes'), (snap) => {
          setClasses(snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })));
        }));
        unsubs.push(onSnapshot(collection(db, 'subjects'), (snap) => {
          setSubjects(snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })));
        }));
        unsubs.push(onSnapshot(collection(db, 'finance_voteheads'), (snap) => {
          setVoteheads(snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })));
        }));
        unsubs.push(onSnapshot(collection(db, 'students'), (snap) => {
          setStudents(snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })));
        }));
        unsubs.push(onSnapshot(collection(db, 'teachers'), (snap) => {
          setTeachers(snap.docs.map(d => ({ id:d.id, ...(d.data() as any) })));
        }));
        unsubs.push(onSnapshot(doc(db, 'settings', 'school'), (d) => {
          if (d.exists()) {
            const sv = d.data() as any;
            if (sv.currentYear) setCurrentYear(Number(sv.currentYear));
            if (sv.currentTerm) setCurrentTerm(Number(sv.currentTerm) as 1|2|3);
          }
          setReady(true);
        }));
      } catch (e:any) {
        setError(e as any);
      } finally {
        const t = setTimeout(() => setLoading(false), 150);
        unsubs.push(() => clearTimeout(t));
      }
    }

    if (USE_BACKEND) loadViaBackend(); else loadViaFirestore();
    return () => { cancelled = true; unsubs.forEach(u => u && u()); };
  }, [USE_BACKEND, authLoading, user]);

  // -------------------- helpers --------------------
  const getStudentsByClass = useCallback((classId: string) => {
    return students.filter(s => String(s.classId) === String(classId));
  }, [students]);

  const resolveStudentRef = async (id: string) => {
    const sRef = doc(db, 'students', id);
    const sSnap = await getDoc(sRef);
    if (sSnap.exists()) return { col: 'students', ref: sRef };
    const lRef = doc(db, 'learners', id);
    const lSnap = await getDoc(lRef);
    if (lSnap.exists()) return { col: 'learners', ref: lRef };
    return { col: 'students', ref: sRef };
  };

  // -------------------- CACHE HELPERS --------------------
  const getCacheKey = (studentId: string, year: number, term: number) => 
    `${studentId}_${year}_${term}`;

  const invalidateBalanceCache = useCallback((studentId?: string) => {
    if (studentId) {
      // Invalidate all entries for this student
      setBalanceCache(prev => {
        const newCache = new Map(prev);
        for (const key of newCache.keys()) {
          if (key.startsWith(`${studentId}_`)) {
            newCache.delete(key);
          }
        }
        return newCache;
      });
    } else {
      // Clear entire cache
      setBalanceCache(new Map());
    }
  }, []);

  // Preload balances for all students (called on login/mount)
  const preloadBalances = useCallback(async (args: { year?: number; term?: number }) => {
    const year = args.year ?? currentYear;
    const term = args.term ?? currentTerm;

    if (!students || students.length === 0) return;

    console.log(`[Cache] Preloading balances for ${students.length} students...`);
    
    const promises = students.map(async (student) => {
      const cacheKey = getCacheKey(student.id, year, term);
      
      try {
        const data = await getBalanceBackend({ learnerId: student.id, year, term });
        setBalanceCache(prev => new Map(prev).set(cacheKey, {
          data: {
            totalDue: data.totalDue || 0,
            totalPaid: data.totalPaid || 0,
            balance: data.balance || 0,
            perVotehead: data.perVotehead || {},
            totals: data.totals || { due: 0, paid: 0, balance: 0 }
          },
          timestamp: Date.now()
        }));
      } catch (error) {
        console.error(`[Cache] Failed to preload balance for student ${student.id}:`, error);
      }
    });

    await Promise.all(promises);
    console.log(`[Cache] Preload complete. Cache size: ${balanceCache.size + students.length}`);
  }, [students, currentYear, currentTerm, balanceCache.size]);

  // -------------------- FINANCE --------------------
  const getStudentBalance = useCallback(async (args: { studentId: string; year?: number; term?: number }): Promise<BalanceData> => {
    const year = args.year ?? currentYear;
    const term = args.term ?? currentTerm;
    const cacheKey = getCacheKey(args.studentId, year, term);

    // Check cache first
    const cached = balanceCache.get(cacheKey);
    if (cached) {
      return cached.data;
    }

    if (USE_BACKEND) {
      const b = await getBalanceBackend({ learnerId: args.studentId, year, term });
      const data: BalanceData = {
        totalDue: b.totalDue || 0,
        totalPaid: b.totalPaid || 0,
        balance: b.balance || 0,
        perVotehead: b.perVotehead || {},
        totals: b.totals || { due: 0, paid: 0, balance: 0 }
      };
      
      // Store in cache
      setBalanceCache(prev => new Map(prev).set(cacheKey, {
        data,
        timestamp: Date.now()
      }));
      
      return data;
    } else {
      // Local compute from ledger
      const Y = year, T = term as 1|2|3;
      const onOrBefore = (y?: number, t?: number) =>
        Number(y ?? 0) < Y || (Number(y ?? 0) === Y && Number(t ?? 0) <= T);

      const ledSnap = await getDocs(collection(db, 'students', args.studentId, 'ledger'));
      const per: Record<string, { due: number; paid: number; balance: number }> = {};
      ledSnap.forEach(d => {
        const x = d.data() as any;
        const vh = String(x.voteheadId || 'unallocated');
        per[vh] ||= { due: 0, paid: 0, balance: 0 };
        if (x.type === 'fee' && onOrBefore(x.year, x.term)) per[vh].due += Number(x.amount || 0);
        if (x.type === 'payment' && onOrBefore(x.year, x.term)) per[vh].paid += Number(x.amount || 0);
        per[vh].balance = per[vh].due - per[vh].paid;
      });
      const totals = Object.values(per).reduce(
        (a, r) => ({ due: a.due + r.due, paid: a.paid + r.paid, balance: a.balance + r.balance }),
        { due: 0, paid: 0, balance: 0 }
      );
      
      const data: BalanceData = {
        totalDue: totals.due,
        totalPaid: totals.paid,
        balance: totals.balance,
        perVotehead: per,
        totals
      };
      
      // Store in cache
      setBalanceCache(prev => new Map(prev).set(cacheKey, {
        data,
        timestamp: Date.now()
      }));
      
      return data;
    }
  }, [USE_BACKEND, currentYear, currentTerm, balanceCache]);

  const assignClassFees = useCallback(async (args: { classId: string; distribution: Record<string, number>; year?: number; term?: number }) => {
    const year = args.year ?? currentYear;
    const term = args.term ?? currentTerm;
    if (USE_BACKEND) {
      const lines = Object.entries(args.distribution)
        .filter(([_, amount]) => Number(amount) > 0)
        .map(([voteheadId, amount]) => ({ voteheadId, amount: Number(amount) }));
      await assignClassFeesBackend({ classId: args.classId, year, term, lines });
    } else {
      const templateRef = doc(db, 'class_fee_templates', `${args.classId}_${year}_${term}`);
      await setDoc(templateRef, {
        classId: args.classId, year, term, distribution: args.distribution, updatedAt: Date.now()
      }, { merge: true });
    }
    
    // Invalidate cache for all students in this class
    const classStudents = getStudentsByClass(args.classId);
    classStudents.forEach(s => invalidateBalanceCache(s.id));
  }, [USE_BACKEND, currentYear, currentTerm, getStudentsByClass, invalidateBalanceCache]);

  const recordPayment = useCallback(async (args: {
    studentId: string; method: 'cash'|'mpesa'|'card';
    items: { voteheadId: string; amount: number }[]; receiptNo?: string; year?: number; term?: number
  }) => {
    const year = args.year ?? currentYear;
    const term = args.term ?? currentTerm;
    if (USE_BACKEND) {
      await recordPaymentBackend({ studentId: args.studentId, method: args.method, items: args.items, receiptNo: args.receiptNo, year, term });
    } else {
      const ref = collection(db, 'students', args.studentId, 'ledger');
      const batch = writeBatch(db);
      const createdAt = Date.now();
      for (const it of args.items) {
        if (!it || !it.amount) continue;
        const r = doc(ref);
        batch.set(r, {
          type: 'payment', learnerId: args.studentId, voteheadId: it.voteheadId, amount: Number(it.amount),
          method: args.method, receiptNo: args.receiptNo || null, year, term, createdAt
        });
      }
      await batch.commit();
    }
    
    // Invalidate cache for this student
    invalidateBalanceCache(args.studentId);
  }, [USE_BACKEND, currentYear, currentTerm, invalidateBalanceCache]);

  // -------------------- CLASSES --------------------
  const addClass = useCallback(async (arg: { name: string; capacity?: number } | string, cap?: number) => {
    const name = typeof arg === 'string' ? arg : arg?.name;
    const capacity = typeof arg === 'string' ? cap : arg?.capacity;
    if (!name) return;

    if (USE_BACKEND) {
      const r = await apiPost<any>('/classes', { name, ...(capacity ? { capacity } : {}) });
      const data = r?.data;
      if (data?.id) setClasses(prev => [...prev, data]);
    } else {
      const ref = await addDoc(collection(db, 'classes'), { name, ...(capacity ? { capacity } : {}) });
      setClasses(prev => [...prev, { id: ref.id, name, ...(capacity ? { capacity } : {}) }]);
    }
  }, [USE_BACKEND]);

  const updateClass = useCallback(async (id: string, patch: { name?: string; capacity?: number } | string) => {
    const body = typeof patch === 'string' ? { name: patch } : patch || {};
    if (USE_BACKEND) {
      if (body.name) {
        await apiPatch<any>(`/classes/${encodeURIComponent(id)}/rename`, { name: body.name });
      }
      if (typeof body.capacity === 'number') {
        await apiPatch<any>(`/classes/${encodeURIComponent(id)}/capacity`, { capacity: body.capacity });
      }
      setClasses(prev => prev.map(c => c.id === id ? { ...c, ...body } : c));
    } else {
      await updateDoc(doc(db, 'classes', id), { ...body, updatedAt: Date.now() });
      setClasses(prev => prev.map(c => c.id === id ? { ...c, ...body } : c));
    }
  }, [USE_BACKEND]);

  const deleteClass = useCallback(async (id: string) => {
    if (USE_BACKEND) {
      try {
        await apiDelete<any>(`/classes/${encodeURIComponent(id)}`);
      } catch {
        await deleteDoc(doc(db, 'classes', id));
      }
      setClasses(prev => prev.filter(c => c.id !== id));
    } else {
      await deleteDoc(doc(db, 'classes', id));
    }
  }, [USE_BACKEND]);

  // -------------------- SUBJECTS --------------------
  const addSubject = useCallback(async (body: { name: string }) => {
    if (!body?.name) return;
    if (USE_BACKEND) {
      const r = await apiPost<any>('/subjects', { name: body.name });
      const data = r?.data;
      if (data?.id) setSubjects(prev => [...prev, data]);
    } else {
      const ref = await addDoc(collection(db, 'subjects'), { name: body.name });
      setSubjects(prev => [...prev, { id: ref.id, name: body.name }]);
    }
  }, [USE_BACKEND]);

  const updateSubject = useCallback(async (id: string, patch: { name?: string }) => {
    const body = patch || {};
    await updateDoc(doc(db, 'subjects', id), { ...body, updatedAt: Date.now() });
    setSubjects(prev => prev.map(s => s.id === id ? { ...s, ...body } : s));
  }, []);

  const deleteSubject = useCallback(async (id: string) => {
    await deleteDoc(doc(db, 'subjects', id));
    setSubjects(prev => prev.filter(s => s.id !== id));
  }, []);

  // -------------------- TEACHERS --------------------
  const addTeacher = useCallback(async (body: any) => {
    if (USE_BACKEND) {
      const r = await apiPost<any>('/teachers', body);
      const data = r?.data;
      if (data?.id) setTeachers(prev => [...prev, data]);
    } else {
      const ref = await addDoc(collection(db, 'teachers'), body);
      setTeachers(prev => [...prev, { id: ref.id, ...body }]);
    }
  }, [USE_BACKEND]);

  const updateTeacher = useCallback(async (id: string, patch: any) => {
    const body = patch || {};
    await updateDoc(doc(db, 'teachers', id), { ...body, updatedAt: Date.now() });
    setTeachers(prev => prev.map(t => t.id === id ? { ...t, ...body } : t));
  }, []);

  const deleteTeacher = useCallback(async (id: string) => {
    await deleteDoc(doc(db, 'teachers', id));
    setTeachers(prev => prev.filter(t => t.id !== id));
  }, []);

  // -------------------- STUDENTS / LEARNERS --------------------
  const addStudent = useCallback(async (body: any) => {
    const ref = await addDoc(collection(db, 'students'), body);
    const row = { id: ref.id, ...body };
    setStudents(prev => [...prev, row]);
  }, []);

  const updateStudent = useCallback(async (id: string, body: any) => {
    const { ref } = await resolveStudentRef(id);
    await updateDoc(ref, { ...body, updatedAt: Date.now() });
    setStudents(prev => prev.map(s => s.id === id ? { ...s, ...body } : s));
  }, []);

  const deleteStudent = useCallback(async (id: string) => {
    const { ref } = await resolveStudentRef(id);
    await deleteDoc(ref);
    setStudents(prev => prev.filter(s => s.id !== id));
  }, []);

  // -------------------- Marks placeholders --------------------
  const getTeacherAssignments = useCallback(async (_teacherId: string) => {
    return null;
  }, []);
  const saveTeacherAssignments = useCallback(async (_teacherId: string, _body: { classIds: string[]; subjectIds: string[] }) => {
    /* wire as needed */
  }, []);
  const upsertMarksBatch = useCallback(async (_rows: any[]) => {
    /* wire as needed */
  }, []);
  const getMarksFor = useCallback(async (_filters: { year?: number; term?: number; classId?: string; subjectId?: string }) => {
    return [];
  }, []);

  // Auto-preload balances when students data is ready
  useEffect(() => {
    if (ready && students.length > 0 && balanceCache.size === 0) {
      preloadBalances({ year: currentYear, term: currentTerm });
    }
  }, [ready, students.length, currentYear, currentTerm, preloadBalances, balanceCache.size]);

  // -------------------- Value --------------------
  const value = useMemo<Ctx>(() => ({
    ready, currentYear, currentTerm,
    classes, subjects, voteheads, students, teachers,
    loading, error,

    addClass, updateClass, deleteClass,
    addSubject, updateSubject, deleteSubject,
    addTeacher, updateTeacher, deleteTeacher,
    addStudent, updateStudent, deleteStudent,

    getStudentsByClass,

    getTeacherAssignments, saveTeacherAssignments, upsertMarksBatch, getMarksFor,

    assignClassFees, recordPayment, getStudentBalance,
    invalidateBalanceCache, preloadBalances,
  }), [
    ready, currentYear, currentTerm, classes, subjects, voteheads, students, teachers,
    loading, error,

    addClass, updateClass, deleteClass,
    addSubject, updateSubject, deleteSubject,
    addTeacher, updateTeacher, deleteTeacher,
    addStudent, updateStudent, deleteStudent,

    getStudentsByClass,

    assignClassFees, recordPayment, getStudentBalance,
    invalidateBalanceCache, preloadBalances
  ]);

  return <SchoolDataContext.Provider value={value}>{children}</SchoolDataContext.Provider>;
}

export const useSchoolData = () => {
  const ctx = useContext(SchoolDataContext);
  if (!ctx) throw new Error('useSchoolData must be used within SchoolDataProvider');
  return ctx;
};