import { useEffect, useMemo, useState } from 'react'
import { useSchoolData } from '../contexts/SchoolDataContext'
import { useAuth } from '../contexts/AuthContext'
import Select from '../components/ui/Select'
import * as XLSX from 'xlsx'
import { Users, BookOpen, School as SchoolIcon, Save, Gauge, Check } from 'lucide-react'
import { getAuth } from 'firebase/auth'

type ScoreMap = Record<string, string>
type RemarkMap = Record<string, string>
type TabKey = 'overview' | 'marks' | 'list' | 'add'

const EXAMS = [
  { value: 'Opener', label: 'Opener' },
  { value: 'Mid Term', label: 'Mid Term' },
  { value: 'End Term', label: 'End Term' },
]

// brand colours
const C = { cyan: '#22d3ee', yellow: '#facc15', magenta: '#f472b6' }

/* ===== Backend helpers (aligned to your ZIP) ===== */
const API_BASE =
  ((import.meta as any).env?.VITE_API_URL
    ? String((import.meta as any).env.VITE_API_URL).replace(/\/$/, '')
    : 'http://localhost:4001') + '/api'

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

const apiTeachers = {
  list: () => apiFetch<{ ok:boolean; data:any[] }>('/teachers').then(r => r.data || []),
  create: (payload: any) =>
    apiFetch<{ ok:boolean; data:any }>(
      '/teachers',
      { method: 'POST', body: JSON.stringify(payload) }
    ).then(r => r.data),
}

const apiAssignments = {
  getForTeacher: (teacherId: string) =>
    apiFetch<{ ok:boolean; data:{ classIds:string[]; subjectIds:string[] } }>(
      `/teachers/${encodeURIComponent(teacherId)}/assignments`
    ).then(r => r.data || { classIds: [], subjectIds: [] }),
  saveForTeacher: (teacherId: string, classIds: string[], subjectIds: string[]) =>
    apiFetch<{ ok:boolean }>(
      `/teachers/${encodeURIComponent(teacherId)}/assignments`,
      { method: 'PATCH', body: JSON.stringify({ classIds, subjectIds }) }
    ),
}

const apiMarks = {
  getFor: (params: { classId:string; subjectId:string; year:number; term:number; exam:string }) => {
    const q = new URLSearchParams({
      classId: params.classId,
      subjectId: params.subjectId,
      year: String(params.year),
      term: String(params.term),
      exam: params.exam,
    })
    return apiFetch<{ ok:boolean; data:any[] }>(`/marks?${q.toString()}`).then(r => r.data || [])
  },
  upsertBatch: (payload: {
    classId:string; subjectId:string; year:number; term:1|2|3; exam:string;
    entries: Record<string, { score:number; remark?:string }>; editorUserId?: string
  }) =>
    apiFetch<{ ok:boolean }>(
      '/marks/batch',
      { method: 'POST', body: JSON.stringify(payload) }
    ),
}

/* ----------------- UI bits ----------------- */
function Donut({ value, total = 100, size = 88, stroke = 10, color = C.cyan, label }:{
  value:number; total?:number; size?:number; stroke?:number; color?:string; label?:string
}) {
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, total ? value / total : 0))
  const dash = circumference * pct
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,.15)" strokeWidth={stroke} fill="none"/>
      <circle
        cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} strokeLinecap="round"
        fill="none" strokeDasharray={`${dash} ${circumference - dash}`} transform={`rotate(-90 ${size/2} ${size/2})`}
      />
      <text x="50%" y="48%" textAnchor="middle" fontSize="16" fontWeight={700} fill="#fff">{value}</text>
      {label && <text x="50%" y="66%" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.7)">{label}</text>}
    </svg>
  )
}

function GaugeMeter({ percent, size = 200, stroke = 12 }:{percent:number; size?:number; stroke?:number}) {
  const r = (size - stroke) / 2
  const cx = size/2, cy = size/2
  const start = Math.PI, end = 0
  const p = Math.max(0, Math.min(1, percent))
  const ang = start + (end - start) * p
  const x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang)
  const path = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`
  return (
    <svg width={size} height={size/2} viewBox={`0 0 ${size} ${size/2}`}>
      <path d={path} stroke="rgba(255,255,255,.12)" strokeWidth={stroke} fill="none" />
      <path d={path} stroke={C.cyan} strokeWidth={stroke} fill="none" strokeDasharray="140 200" />
      <path d={path} stroke={C.yellow} strokeWidth={stroke} fill="none" strokeDasharray="80 260" />
      <path d={path} stroke={C.magenta} strokeWidth={stroke} fill="none" strokeDasharray="40 300" />
      <line x1={cx} y1={cy} x2={x} y2={y} stroke="#fff" strokeWidth={3} />
      <circle cx={cx} cy={cy} r={4} fill="#fff" />
    </svg>
  )
}

/* your “good” checkbox look */
function CustomCheckbox({
  checked, onChange, label, id,
}: { checked:boolean; onChange:()=>void; label:string; id:string }) {
  return (
    <label htmlFor={id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors group">
      <div className="relative">
        <input type="checkbox" id={id} checked={checked} onChange={onChange} className="sr-only" />
        <div className={`w-5 h-5 border-2 rounded flex items-center justify-center transition-all ${
          checked ? 'bg-green-500 border-green-500' : 'border-gray-400 group-hover:border-green-400'
        }`}>
          {checked && <Check size={12} className="text-white" />}
        </div>
      </div>
      <span className="text-sm text-white flex-1">{label}</span>
    </label>
  )
}

/* ----------------- main ----------------- */
export default function Teachers() {
  const {
    teachers, /* kept for fallback */ classes, subjects, students, getStudentsByClass,
    /* context funcs retained but not used for backend write paths:
       upsertMarksBatch, getMarksFor, getTeacherAssignments, saveTeacherAssignments, addTeacher */
  } = useSchoolData()
  const { user } = useAuth()

  /* ===== Pull teachers from backend (read through backend) ===== */
  const [teachersBE, setTeachersBE] = useState<any[]>([])
  const [loadingTeachers, setLoadingTeachers] = useState(false)
  const [errTeachers, setErrTeachers] = useState<string | null>(null)
  const teachersView = teachersBE.length ? teachersBE : teachers

  const loadTeachers = async () => {
    setLoadingTeachers(true); setErrTeachers(null)
    try {
      const rows = await apiTeachers.list()
      setTeachersBE(Array.isArray(rows) ? rows : [])
    } catch (e: any) {
      setErrTeachers(e?.message || 'Failed to load teachers')
      setTeachersBE([])
    } finally {
      setLoadingTeachers(false)
    }
  }
  useEffect(() => { loadTeachers() }, [])

  const [tab, setTab] = useState<TabKey>('overview')
  const TabBtn = (key: TabKey, label: string) => (
    <button key={key} className={`btn ${tab === key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(key)} role="tab" aria-selected={tab === key}>
      {label}
    </button>
  )

  /* -------- Add New Teacher -------- */
  const [tName, setTName] = useState('')
  const [tDept, setTDept] = useState('')
  const [tQual, setTQual] = useState('')
  const [tSubs, setTSubs] = useState('')
  const [idNo, setIdNo] = useState('')
  const [nhif, setNhif] = useState('')
  const [nssf, setNssf] = useState('')
  const submitTeacher = async () => {
    if (!tName.trim()) return alert('Teacher name is required')
    const payload = {
      name: tName.trim(),
      department: tDept || undefined,
      status: 'active',
      qualifications: tQual ? tQual.split(',').map(s => s.trim()).filter(Boolean) : [],
      subjects: tSubs ? tSubs.split(',').map(s => s.trim()).filter(Boolean) : [],
      idNumber: idNo || undefined,
      nhifNumber: nhif || undefined,
      nssfNumber: nssf || undefined,
    } as any
    await apiTeachers.create(payload)
    setTName(''); setTDept(''); setTQual(''); setTSubs('')
    setIdNo(''); setNhif(''); setNssf('')
    await loadTeachers()
    alert('Saved')
  }

  /* -------- Assign Teacher (checkbox lists) -------- */
  const [assignTeacherId, setAssignTeacherId] = useState('')
  const [assignClassIds, setAssignClassIds] = useState<string[]>([])
  const [assignSubjectIds, setAssignSubjectIds] = useState<string[]>([])
  useEffect(() => {
    (async () => {
      if (!assignTeacherId) { setAssignClassIds([]); setAssignSubjectIds([]); return }
      const a = await apiAssignments.getForTeacher(assignTeacherId)
      setAssignClassIds(a.classIds || [])
      setAssignSubjectIds(a.subjectIds || [])
    })()
  }, [assignTeacherId])
  const toggleIn = (list: string[], id: string) =>
    list.includes(id) ? list.filter(x => x !== id) : [...list, id]
  const selectAllClasses  = () => setAssignClassIds(classes.map(c => c.id))
  const clearAllClasses   = () => setAssignClassIds([])
  const selectAllSubjects = () => setAssignSubjectIds(subjects.map(s => s.id))
  const clearAllSubjects  = () => setAssignSubjectIds([])
  const saveAssignment = async () => {
    if (!assignTeacherId) return alert('Select a teacher')
    await apiAssignments.saveForTeacher(assignTeacherId, assignClassIds, assignSubjectIds)
    alert('Assignments saved')
  }

  /* -------- Enter Marks (view/edit existing) -------- */
  const [classId, setClassId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [term, setTerm] = useState<number>(1)
  const [exam, setExam] = useState<string>('Opener')
  const classStudents = useMemo(() => (classId ? getStudentsByClass(classId) : []), [classId, students])
  const [scores, setScores] = useState<ScoreMap>({})
  const [remarks, setRemarks] = useState<RemarkMap>({})
  const [savingMarks, setSavingMarks] = useState(false)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(false)
  const classOptions = classes.map(c => ({ value: c.id, label: c.name }))
  const subjectOptions = subjects.map(s => ({ value: s.id, label: s.name }))

  useEffect(() => {
    const map: ScoreMap = {}; const rmap: RemarkMap = {}
    classStudents.forEach(s => { map[s.id] = ''; rmap[s.id] = '' })
    setScores(map); setRemarks(rmap)
  }, [classStudents.length]) // eslint-disable-line

  useEffect(() => {
    (async () => {
      if (!classId || !subjectId) return
      setLoadingExisting(true)
      const existing = await apiMarks.getFor({ classId, subjectId, year, term, exam })
      const map: ScoreMap = {}; const rmap: RemarkMap = {}
      classStudents.forEach(s => {
        const row = existing.find(m => m.studentId === s.id)
        map[s.id] = row ? String(row.score) : ''
        rmap[s.id] = row?.remark || ''
      })
      setScores(map); setRemarks(rmap); setLoadedOnce(true)
      setLoadingExisting(false)
    })()
  }, [classId, subjectId, year, term, exam, classStudents])

  const setScore   = (sid: string, raw: string) => setScores(p => ({ ...p, [sid]: raw.replace(/[^\d]/g, '') }))
  const setRemark  = (sid: string, v: string)    => setRemarks(p => ({ ...p, [sid]: v }))
  const saveMarks = async () => {
    if (!classId) return alert('Select class')
    if (!subjectId) return alert('Select subject')
    const entries: Record<string, { score: number; remark?: string }> = {}
    for (const sid of Object.keys(scores)) {
      const str = scores[sid]; if (!str) continue
      let v = Number(str); if (isNaN(v)) continue
      if (v < 0) v = 0; if (v > 100) v = 100
      const rk = remarks[sid] || undefined
      entries[sid] = { score: v, remark: rk }
    }
    if (!Object.keys(entries).length) return alert('Enter at least one score.')
    try {
      setSavingMarks(true)
      await apiMarks.upsertBatch({ classId, subjectId, year, term: term as 1|2|3, exam, entries, editorUserId: user?.uid || 'unknown' })
      alert('Marks saved!')
    } finally { setSavingMarks(false) }
  }

  /* -------- View Teachers + export/filter -------- */
  const [filterClass, setFilterClass] = useState<string>('')
  const [assignIndex, setAssignIndex] = useState<Record<string, string[]>>({})
  useEffect(() => {
    (async () => {
      const idx: Record<string, string[]> = {}
      for (const t of teachersView) {
        const a = await apiAssignments.getForTeacher(t.id)
        idx[t.id] = a.classIds || []
      }
      setAssignIndex(idx)
    })()
  }, [teachersView])
  const filteredTeachers = useMemo(
    () => (!filterClass ? teachersView : teachersView.filter((t:any) => assignIndex[t.id]?.includes(filterClass))),
    [teachersView, filterClass, assignIndex]
  )
  const exportTeachers = () => {
    const rows = filteredTeachers.map((t:any)=>({
      Name:t.name, Department:t.department||'', ID:t.idNumber||'', NHIF:t.nhifNumber||'',
      NSSF:t.nssfNumber||'', Qualifications:(t.qualifications||[]).join(', '),
      Subjects:(t.subjects||[]).join(', '), Status:t.status||'active',
    }))
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Teachers'); XLSX.writeFile(wb, 'teachers.xlsx')
  }

  /* -------- Overview metrics -------- */
  const totalTeachers = teachersView.length
  const totalSubjects = subjects.length
  const totalClasses  = classes.length
  const teachersWithClass = useMemo(() => teachersView.reduce((n:any,t:any)=> n + ((assignIndex[t.id]||[]).length>0 ? 1:0), 0), [teachersView, assignIndex])
  const assignedPct = totalTeachers ? teachersWithClass / totalTeachers : 0

  return (
    <div className="space-y-6">
      {/* Sticky nav */}
      <div className="card p-2 sticky top-16 z-30 backdrop-blur">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Teachers sections">
          {TabBtn('overview', 'Overview')}
          {TabBtn('marks', 'Enter Marks')}
          {TabBtn('list', 'View Teachers')}
          {TabBtn('add', 'Add New Teacher')}
        </div>
      </div>

      {/* spacer so charts never hide under the sticky header */}
      <div className="mt-6" />

      {/* ---------- Overview ---------- */}
      {tab === 'overview' && (
        <section className="space-y-6">
        <div className="px-1">
          <h1 className="text-2xl font-bold text-cyan-400 mt-14">School Overview</h1>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border p-4 bg-white/5 flex items-center gap-3">
              <div className="p-3 rounded-full" style={{ background: `${C.cyan}22` }}>
                <Users color={C.cyan} />
              </div>
              <div className="flex-1">
                <div className="text-sm opacity-70">Teachers</div>
                <div className="text-2xl font-semibold">{totalTeachers}</div>
              </div>
              <Donut value={totalTeachers} total={Math.max(1, totalTeachers)} color={C.cyan} label="total" />
            </div>

            <div className="rounded-xl border p-4 bg-white/5 flex items-center gap-3">
              <div className="p-3 rounded-full" style={{ background: `${C.yellow}22` }}>
                <BookOpen color={C.yellow} />
              </div>
              <div className="flex-1">
                <div className="text-sm opacity-70">Subjects</div>
                <div className="text-2xl font-semibold">{totalSubjects}</div>
              </div>
              <Donut value={totalSubjects} total={Math.max(1, totalSubjects)} color={C.yellow} label="subjects" />
            </div>

            <div className="rounded-xl border p-4 bg-white/5 flex items-center gap-3">
              <div className="p-3 rounded-full" style={{ background: `${C.magenta}22` }}>
                <SchoolIcon color={C.magenta} />
              </div>
              <div className="flex-1">
                <div className="text-sm opacity-70">Classes</div>
                <div className="text-2xl font-semibold">{totalClasses}</div>
              </div>
              <Donut value={totalClasses} total={Math.max(1, totalClasses)} color={C.magenta} label="classes" />
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Gauge size={18} />
              <h3 className="font-semibold">Teacher Assignment Coverage</h3>
            </div>
            <GaugeMeter percent={assignedPct} />
            <div className="text-sm opacity-75 mt-2">
              {teachersWithClass} of {totalTeachers || 0} teachers are assigned to at least one class.
            </div>
          </div>
        </section>
      )}

      {/* ---------- Enter Marks ---------- */}
      {tab === 'marks' && (
        <section className="card p-4 space-y-4">
          <h2 className="text-lg font-bold text-cyan-400 mt-6">Award Marks</h2>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div>
              <div className="text-xs opacity-70 mb-1">Class</div>
              <Select value={classId} onChange={setClassId} options={classOptions} placeholder="Select class" />
            </div>
            <div>
              <div className="text-xs opacity-70 mb-1">Subject</div>
              <Select value={subjectId} onChange={setSubjectId} options={subjectOptions} placeholder="Select subject" />
            </div>
            <div>
              <div className="text-xs opacity-70 mb-1">Year</div>
              <input type="number" className="input" value={year} onChange={e=>setYear(Number(e.target.value))} />
            </div>
            <div>
              <div className="text-xs opacity-70 mb-1">Term</div>
              <select className="input" value={term} onChange={e=>setTerm(Number(e.target.value))}>
                <option value={1}>Term 1</option>
                <option value={2}>Term 2</option>
                <option value={3}>Term 3</option>
              </select>
            </div>
            <div>
              <div className="text-xs opacity-70 mb-1">Exam</div>
              <Select value={exam} onChange={setExam} options={EXAMS} placeholder="Exam" />
            </div>
          </div>

          {classId && subjectId && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left">Student</th>
                    <th className="px-4 py-2 text-left">Score</th>
                    <th className="px-4 py-2 text-left">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {classStudents.map(s => (
                    <tr key={s.id} className="border-t">
                      <td className="px-4 py-2">{s.name}</td>
                      <td className="px-4 py-2">
                        <input
                          className="input w-28" inputMode="numeric" pattern="[0-9]*"
                          placeholder="0-100" value={scores[s.id] ?? ''} onChange={e => setScore(s.id, e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select className="input w-44" value={remarks[s.id] ?? ''} onChange={(e)=>setRemark(s.id, e.target.value)}>
                          <option value="">(auto)</option>
                          <option value="Exceeding">Exceeding</option>
                          <option value="Meeting">Meeting</option>
                          <option value="Approaching">Approaching</option>
                          <option value="Below">Below</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                  {classStudents.length === 0 && (
                    <tr><td className="px-4 py-6 text-center opacity-70" colSpan={3}>No students in this class yet.</td></tr>
                  )}
                </tbody>
              </table>

              {loadedOnce && loadingExisting && (
                <div className="py-3 text-sm opacity-70">Refreshing existing marks…</div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={savingMarks} onClick={saveMarks}>
              {savingMarks ? 'Saving…' : (<><Save size={16} className="mr-2" /> Save Marks</>)}
            </button>
            <button className="btn btn-primary" onClick={()=>{
              // re-trigger loader effect by mutating a dep (noop set) or just calling it:
              if (classId && subjectId) {
                (async ()=>{
                  setLoadingExisting(true)
                  await apiMarks.getFor({ classId, subjectId, year, term, exam }) // fetch to warm cache, UI already reflects effect
                  setLoadingExisting(false)
                })()
              }
            }}>Load Marks</button>
          </div>

          <div className="text-xs opacity-70">
            Every save records who edited and when, and keeps a before/after log on each mark row.
          </div>
        </section>
      )}

      {/* ---------- View Teachers ---------- */}
      {tab === 'list' && (
        <section className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-3">
            <h2 className="text-lg font-bold text-cyan-400 flex-1">Teachers</h2>
            <div className="w-60">
              <Select
                value={filterClass} onChange={setFilterClass}
                options={[{ value: '', label: 'View All' }, ...classOptions]} placeholder="Filter by class"
              />
            </div>
            <button className="btn btn-secondary" onClick={exportTeachers}>Export Excel</button>
          </div>

          {errTeachers && <div className="px-4 py-2 text-sm text-red-300">{errTeachers}</div>}
          {loadingTeachers && <div className="px-4 py-2 text-sm opacity-70">Loading teachers…</div>}

          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Department</th>
                <th className="px-4 py-2 text-left">ID</th>
                <th className="px-4 py-2 text-left">NHIF</th>
                <th className="px-4 py-2 text-left">NSSF</th>
                <th className="px-4 py-2 text-left">Qualifications</th>
                <th className="px-4 py-2 text-left">Subjects</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeachers.map((t:any) => (
                <tr key={t.id} className="border-t align-top">
                  <td className="px-4 py-2">{t.name}</td>
                  <td className="px-4 py-2">{t.department || '-'}</td>
                  <td className="px-4 py-2">{t.idNumber || '-'}</td>
                  <td className="px-4 py-2">{t.nhifNumber || '-'}</td>
                  <td className="px-4 py-2">{t.nssfNumber || '-'}</td>
                  <td className="px-4 py-2">{t.qualifications?.join(', ') || '-'}</td>
                  <td className="px-4 py-2">{t.subjects?.join(', ') || '-'}</td>
                  <td className="px-4 py-2 capitalize">{t.status || 'active'}</td>
                </tr>
              ))}
              {filteredTeachers.length === 0 && (
                <tr><td className="px-4 py-8 text-center opacity-70" colSpan={8}>No teachers match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {/* ---------- Add New Teacher + Assign ---------- */}
      {tab === 'add' && (
        <section className="space-y-6">
          <div className="card p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-bold text-cyan-400 mt-1">Add New Teacher</h2>
              <button className="btn btn-primary" onClick={submitTeacher}>+ Save</button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><div className="text-xs opacity-70 mb-1">Name</div><input className="input" value={tName} onChange={e=>setTName(e.target.value)} placeholder="e.g., Jane Wanjiku"/></div>
              <div><div className="text-xs opacity-70 mb-1">Department</div><input className="input" value={tDept} onChange={e=>setTDept(e.target.value)} placeholder="e.g., Sciences"/></div>
              <div><div className="text-xs opacity-70 mb-1">ID Number</div><input className="input" value={idNo} onChange={e=>setIdNo(e.target.value)} placeholder="National ID"/></div>
              <div><div className="text-xs opacity-70 mb-1">NHIF Number</div><input className="input" value={nhif} onChange={e=>setNhif(e.target.value)} placeholder="NHIF"/></div>
              <div><div className="text-xs opacity-70 mb-1">NSSF Number</div><input className="input" value={nssf} onChange={e=>setNssf(e.target.value)} placeholder="NSSF"/></div>
              <div><div className="text-xs opacity-70 mb-1">Qualifications</div><input className="input" value={tQual} onChange={e=>setTQual(e.target.value)} placeholder="comma: B.Ed, PGDE"/></div>
              <div><div className="text-xs opacity-70 mb-1">Subjects</div><input className="input" value={tSubs} onChange={e=>setTSubs(e.target.value)} placeholder="comma: Mathematics, Physics"/></div>
            </div>
          </div>

          {/* Assign area with CustomCheckboxes */}
          <div className="card p-4">
            <h3 className="text-lg font-semibold">Assign Teacher a Subject / Class</h3>

            <div className="grid gap-6 lg:grid-cols-3 mt-3">
              <div>
                <div className="text-sm font-medium text-gray-300 mb-2">Teacher</div>
                <Select value={assignTeacherId} onChange={setAssignTeacherId}
                        options={teachersView.map((t:any)=>({ value: t.id, label: t.name }))} placeholder="Select teacher" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-300">Classes ({assignClassIds.length} selected)</span>
                  <div className="flex gap-2">
                    <button className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded" onClick={selectAllClasses}>Select all</button>
                    <button className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded" onClick={clearAllClasses}>Clear</button>
                  </div>
                </div>
                <div className="max-h-64 overflow-auto rounded-lg border border-gray-600 bg-gray-800/30 p-2">
                  {classes.length ? (
                    <div className="space-y-1">
                      {classes.map(c => (
                        <CustomCheckbox
                          key={c.id}
                          id={`class-${c.id}`}
                          checked={assignClassIds.includes(c.id)}
                          onChange={() => setAssignClassIds(prev => toggleIn(prev, c.id))}
                          label={c.name}
                        />
                      ))}
                    </div>
                  ) : <div className="text-sm text-gray-400 p-4 text-center">No classes available</div>}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-300">Subjects ({assignSubjectIds.length} selected)</span>
                  <div className="flex gap-2">
                    <button className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded" onClick={selectAllSubjects}>Select all</button>
                    <button className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded" onClick={clearAllSubjects}>Clear</button>
                  </div>
                </div>
                <div className="max-h-64 overflow-auto rounded-lg border border-gray-600 bg-gray-800/30 p-2">
                  {subjects.length ? (
                    <div className="space-y-1">
                      {subjects.map(s => (
                        <CustomCheckbox
                          key={s.id}
                          id={`subject-${s.id}`}
                          checked={assignSubjectIds.includes(s.id)}
                          onChange={() => setAssignSubjectIds(prev => toggleIn(prev, s.id))}
                          label={s.name}
                        />
                      ))}
                    </div>
                  ) : <div className="text-sm text-gray-400 p-4 text-center">No subjects available</div>}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-700">
              <button className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
                      onClick={saveAssignment} disabled={!assignTeacherId}>
                Assign Teacher
              </button>
              <button className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium"
                      onClick={()=>{ setAssignTeacherId(''); setAssignClassIds([]); setAssignSubjectIds([]) }}>
                Cancel
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
