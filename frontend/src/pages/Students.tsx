import { useMemo, useState, useEffect } from 'react'
import Select from '../components/ui/Select'
import { useSchoolData } from '../contexts/SchoolDataContext'
import { db, storage } from '../lib/firebase'
import { collection, getDocs, query, where, doc, updateDoc, addDoc, setDoc } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { getAuth } from 'firebase/auth'
import { X, Printer, Edit3, Check, X as XIcon } from 'lucide-react'
import ImportStudents from './ImportStudents'

type TabKey = 'summary' | 'view' | 'add' | 'import' | 'report'
const TERMS = ['Term 1', 'Term 2', 'Term 3'] as const
const EXAMS = ['Opener', 'Mid Term', 'End Term'] as const

// ===== Backend helpers =====
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
    const txt = await res.text().catch(() => '')
    throw new Error(txt || `HTTP ${res.status}`)
  }
  const ct = res.headers.get('content-type') || ''
  return (ct.includes('application/json') ? res.json() : (null as any)) as T
}

const apiStudents = {
  list: (classId?: string) =>
    apiFetch<{ ok: boolean; data: any[] }>(`/students${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`)
      .then(r => r.data),
  get: (id: string) =>
    apiFetch<{ ok: boolean; data: any }>(`/students/${id}`).then(r => r.data),
  update: (id: string, body: any) =>
    apiFetch<{ ok: boolean; data: any }>(`/students/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      .then(r => r.data),
}

// ===== shared helpers =====
const safe = (v: any, dash = '—') => (v === undefined || v === null || v === '') ? dash : String(v)

function nameFromRecord(s: any) {
  const n = String(s?.name || '').trim()
  if (n) return n
  const first = String(s?.firstName || '').trim()
  const middle = String(s?.middleName || '').trim()
  const sur = String(s?.surname || '').trim()
  return [first, middle, sur].filter(Boolean).join(' ') || '—'
}

function splitName(full: string) {
  const parts = (full || '').trim().split(/\s+/)
  if (parts.length === 0) return { firstName: '', middleName: '', surname: '' }
  if (parts.length === 1) return { firstName: parts[0], middleName: '', surname: '' }
  if (parts.length === 2) return { firstName: parts[0], middleName: '', surname: parts[1] }
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(' '), surname: parts.at(-1) as string }
}

function inferRemark(score: any) {
  const n = Number(score)
  if (Number.isNaN(n)) return '—'
  if (n >= 80) return 'Exceeding'
  if (n >= 60) return 'Meeting'
  if (n >= 45) return 'Approaching'
  return 'Below'
}

function withTimeout<T>(p: Promise<T>, ms = 30000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Upload timed out')), ms)
    p.then(v => { clearTimeout(t); resolve(v) })
     .catch(e => { clearTimeout(t); reject(e) })
  })
}

async function uploadAndGetUrl(file: File | null, path: string) {
  if (!file) return null
  const ref = storageRef(storage, path)
  await withTimeout(uploadBytes(ref, file, { contentType: file.type || undefined }))
  return await withTimeout(getDownloadURL(ref), 15000)
}

/* ================= Details Modal ================= */
function StudentDetailsModal({
  open, onClose, student, onSave, classes, classOptions, year, term
}: {
  open: boolean
  onClose: () => void
  student: any | null
  onSave: (patch: any) => Promise<void>
  classes: { id: string; name: string }[]
  classOptions: { value: string; label: string }[]
  year: number
  term: number
}) {
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState<any>(student || {})
  
  useEffect(() => { 
    setForm(student || {}); 
    setEdit(false) 
  }, [student])
  
  if (!open || !student) return null

  const classNameFor = (id?: string) => classes.find(c => c.id === id)?.name || '—'
  const displayName = nameFromRecord(student)

  const Field = ({ label, name, type='text' }: {label:string; name:string; type?:string}) => (
    <div className="grid grid-cols-3 gap-3 items-center">
      <div className="text-sm opacity-70">{label}</div>
      <div className="col-span-2">
        {name === 'classId' ? (
          edit ? (
            <Select
              className="input bg-gray-100 text-gray-900 rounded-md"
              value={form?.classId ?? ''}
              onChange={(v) => setForm((f:any) => ({ ...f, classId: v }))}
              options={classOptions}
              placeholder="Select class"
            />
          ) : (
            <div className="text-sm">{classNameFor(student?.classId)}</div>
          )
        ) : name === 'name' ? (
          edit ? (
            <input
              className="input w-full"
              name="name"
              type={type}
              defaultValue={displayName}
              onChange={(e)=>setForm((f:any)=>({ ...f, __fullName:e.target.value }))}
            />
          ) : (
            <div className="text-sm">{displayName}</div>
          )
        ) : edit ? (
          <input
            className="input w-full"
            name={name}
            type={type}
            value={form?.[name] ?? ''}
            onChange={(e)=>setForm((f:any)=>({...f,[name]:e.target.value}))}
          />
        ) : (
          <div className="text-sm">{safe(student?.[name])}</div>
        )}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-gray-950 overflow-hidden shadow-2xl border border-white/10">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">{displayName} — Details ({year} T{term})</h3>
          <button className="btn btn-secondary p-2" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-8 max-h-[70vh] overflow-auto">
          <section>
            <h4 className="text-sm font-semibold opacity-80 mb-2">Student Information</h4>
            <div className="space-y-3">
              <Field label="Full Name" name="name" />
              <Field label="Class" name="classId" />
              <Field label="Assessment Number" name="assessmentNo" />
              <Field label="Gender" name="gender" />
              <Field label="Admission Date" name="admissionDate" type="date" />
              <Field label="Year of Birth" name="yearOfBirth" type="number" />
              <Field label="Birth Certificate Number" name="birthCertNo" />
              <Field label="Previous School" name="previousSchool" />
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold opacity-80 mb-2">Parent / Guardian</h4>
            <div className="space-y-3">
              <Field label="Parent Name" name="parentName" />
              <Field label="Parent Phone" name="parentPhone" />
              <Field label="Parent Email" name="parentEmail" type="email" />
              <Field label="Parent Area" name="parentArea" />
            </div>
          </section>
        </div>

        <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
          {!edit ? (
            <button className="btn btn-primary" onClick={()=>setEdit(true)}>Edit details</button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={()=>{ setForm(student); setEdit(false) }}>Cancel</button>
              <button className="btn btn-primary" onClick={async()=>{
                const patch: any = {}
                if (form?.classId !== student?.classId) patch.classId = form?.classId || ''

                const desiredFull = form.__fullName ?? nameFromRecord(student)
                const { firstName, middleName, surname } = splitName(desiredFull)
                if (firstName && firstName !== (student?.firstName || '')) patch.firstName = firstName
                if ((middleName ?? '') !== (student?.middleName || '')) patch.middleName = middleName ?? ''
                if (surname && surname !== (student?.surname || '')) patch.surname = surname

                if (Object.keys(patch).length === 0) { setEdit(false); return }
                
                // Save to enrollment history when class changes
                if (patch.classId) {
                  await setDoc(doc(db, 'student_enrollments', `${student.id}_${year}_${term}`), {
                    studentId: student.id,
                    classId: patch.classId,
                    year,
                    term,
                    updatedAt: Date.now()
                  }, { merge: true })
                }
                
                await onSave(patch)
                setEdit(false)
              }}>Save</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ===== Report viewer ===== */
function StudentReportView({
  subjects, student, year, term, exam,
}: {
  subjects: { id: string; name: string }[]
  student: any | null
  year: string
  term: string
  exam: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [marks, setMarks] = useState<any[]>([])

  useEffect(() => {
    let active = true
    async function load() {
      if (!student) return
      setLoading(true); setError(null)
      try {
        const qy = query(collection(db, 'marks'), where('studentId', '==', student.id))
        const snap = await getDocs(qy)
        const rows: any[] = []
        snap.forEach(d => rows.push({ id: d.id, ...(d.data() as any) }))
        if (active) setMarks(rows)
      } catch (e: any) {
        if (active) setError(e?.message || 'Failed to load marks')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [student?.id])

  const subjMap = useMemo(() => {
    const m: Record<string,string> = {}
    subjects.forEach(s => { m[s.id] = s.name })
    return m
  }, [subjects])

  const filtered = useMemo(() => {
    return marks.filter(m =>
      (!!student && m.studentId === student.id) &&
      (year === 'All' || String(m.year) === year) &&
      (term === 'All' || `Term ${m.term}` === term) &&
      (exam === 'All' || String(m.exam) === exam)
    )
  }, [marks, student?.id, year, term, exam])

  const grouped: Record<string, Record<string, Record<string, any[]>>> = {}
  filtered.forEach(m => {
    const y = String(m.year ?? 'Year ?')
    const t = `Term ${m.term ?? '?'}`
    const e = String(m.exam ?? 'Exam')
    ;(grouped[y] ||= {})[t] ||= {}
    ;(grouped[y][t][e] ||= []).push(m)
  })

  if (!student) return <div className="py-6 text-center opacity-70">Choose a student to view report.</div>
  if (error) return <div className="py-6 text-center text-red-300">{error}</div>
  if (loading) return <div className="py-6 text-center opacity-70">Loading…</div>
  if (Object.keys(grouped).length === 0) return <div className="py-6 text-center opacity-70">No marks found.</div>

  return (
    <div id="report-print" className="space-y-6 bg-white text-black rounded-md p-4">
      {Object.keys(grouped).sort().map(yr => (
        <div key={yr} className="mb-2 print:break-inside-avoid">
          <h4 className="text-sm font-semibold mb-2">{yr}</h4>
          {Object.keys(grouped[yr]).sort().map(tm => (
            <div key={tm} className="mb-4 overflow-hidden rounded border border-gray-300">
              <div className="px-3 py-2 text-xs uppercase tracking-wide bg-gray-100 text-black">{tm}</div>
              {Object.keys(grouped[yr][tm]).sort().map(ex => (
                <div key={ex}>
                  <div className="px-3 py-2 text-xs tracking-wide text-black/80">{ex}</div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr className="text-left">
                        <th className="px-3 py-2">Subject</th>
                        <th className="px-3 py-2">Score</th>
                        <th className="px-3 py-2">Remark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped[yr][tm][ex].map((m, i) => {
                        const r = (m as any).remark || inferRemark(m.score)
                        return (
                          <tr key={i} className="border-t border-gray-200">
                            <td className="px-3 py-2">{subjMap[m.subjectId] || m.subjectId}</td>
                            <td className="px-3 py-2">{safe(m.score)}</td>
                            <td className="px-3 py-2">{r}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))}
      </div>
      ))}
      <div className="text-xs text-black/70">
        Showing: {nameFromRecord(student)} — Year: {year} — Term: {term} — Exam: {exam}
      </div>
    </div>
  )
}

/* ------------------------------ MAIN PAGE ------------------------------ */
export default function Students() {
  const {
    classes, subjects, currentYear, currentTerm,
  } = useSchoolData()

  // ===== Backend students state =====
  const [studentsBE, setStudentsBE] = useState<any[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [errStudents, setErrStudents] = useState<string | null>(null)

  // Year/Term state
  const now = new Date().getFullYear()
  const years = [currentYear || now, (currentYear || now) + 1, (currentYear || now) + 2]
  const [uiYear, setUiYear] = useState<number>(currentYear || now)
  const [uiTerm, setUiTerm] = useState<1|2|3>(currentTerm || 1)

  // THE CRITICAL FIX: Load students based on enrollment records
  async function refreshStudents(classId?: string) {
    setLoadingStudents(true); setErrStudents(null)
    try {
      // Get enrollment records for the selected year/term
      const enrollmentSnap = await getDocs(
        query(collection(db, 'student_enrollments'),
          where('year', '==', uiYear),
          where('term', '==', uiTerm))
      )
      
      const enrollmentMap: Record<string, string> = {}
      const enrolledStudentIds: string[] = []

      enrollmentSnap.forEach(d => {
        const data = d.data()
        const sid = data.studentId as string | undefined
        const cid = data.classId as string | undefined
        if (sid && cid) {
          enrollmentMap[sid] = cid
          if (!enrolledStudentIds.includes(sid)) enrolledStudentIds.push(sid)
        }
      })

      console.log(`📊 Found ${enrolledStudentIds.length} enrollment records for ${uiYear} Term ${uiTerm}`)

      // If no enrollments for current year, auto-create them
      if (enrolledStudentIds.length === 0 && uiYear === currentYear) {
        console.log('⚠️ No enrollments found for current year. Auto-enrolling...')
        const allStudentsSnap = await getDocs(collection(db, 'students'))
        const allStudents = allStudentsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
        
        console.log(`Found ${allStudents.length} students. Creating enrollment records for all 3 terms...`)
        
        const batch: Promise<any>[] = []
        for (const student of allStudents) {
          const cid = String(student.classId || '')
          if (!cid) continue
          
          // Create enrollments for ALL 3 TERMS
          for (let t = 1; t <= 3; t++) {
            const enrollmentId = `${student.id}_${uiYear}_${t}`
            const enrollmentData = {
              studentId: student.id,
              classId: cid,
              year: uiYear,
              term: t,
              createdAt: Date.now()
            }
            batch.push(setDoc(doc(db, 'student_enrollments', enrollmentId), enrollmentData, { merge: true }))
          }
          
          enrollmentMap[student.id] = cid
          if (!enrolledStudentIds.includes(student.id)) enrolledStudentIds.push(student.id)
        }
        
        if (batch.length) {
          await Promise.all(batch)
          console.log(`✅ Created ${batch.length} enrollment records (${allStudents.length} students × 3 terms) for year ${uiYear}`)
        }
      }

      // Get all students data
      const allStudentsSnap = await getDocs(collection(db, 'students'))
      const allStudents = allStudentsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))

      // Merge enrollment data with student data
      const enrolledStudents = allStudents
        .filter(s => enrolledStudentIds.includes(s.id))
        .map(s => ({
          ...s,
          classId: enrollmentMap[s.id] || s.classId // Use enrollment class if available
        }))

      // Apply class filter if needed
      const filtered = classId
        ? enrolledStudents.filter(s => s.classId === classId)
        : enrolledStudents

      setStudentsBE(filtered)
      console.log(`✅ Loaded ${filtered.length} students for ${uiYear} Term ${uiTerm}`)
    } catch (e: any) {
      console.error('Error loading students:', e)
      setErrStudents(e?.message || 'Failed to load students')
      setStudentsBE([])
    } finally {
      setLoadingStudents(false)
    }
  }

  useEffect(() => { 
    refreshStudents() 
  }, [uiYear, uiTerm]) // Reload when year/term changes

  async function backendUpdateStudent(id: string, patch: any) {
    await apiStudents.update(id, patch)
    await refreshStudents()
  }

  const [active, setActive] = useState<TabKey>('summary')
  const TabBtn = (key: TabKey, label: string) => (
    <button
      key={key}
      className={`btn ${active === key ? 'btn-primary' : 'btn-secondary'}`}
      onClick={() => setActive(key)}
      role="tab"
      aria-selected={active === key}
    >
      {label}
    </button>
  )

  /* ---------- Add Student form ---------- */
  const [fullNameValue, setFullName] = useState('')
  const [classId, setClassId] = useState('')
  const [assessmentNo, setAssessmentNo] = useState('')
  const [gender, setGender] = useState<'Male' | 'Female' | ''>('')
  const [admissionDate, setAdmissionDate] = useState<string>('')
  const [yearOfBirth, setYearOfBirth] = useState<number | ''>('' as any)
  const [birthCertNo, setBirthCertNo] = useState('')
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [parentArea, setParentArea] = useState('')
  const [saving, setSaving] = useState(false)

  const [birthCertFile, setBirthCertFile] = useState<File | null>(null)
  const [passportPhotoFile, setPassportPhotoFile] = useState<File | null>(null)
  const [transferLetterFile, setTransferLetterFile] = useState<File | null>(null)
  const [previousSchool, setPreviousSchool] = useState('')

  const requiredMap = {
    'Full name': fullNameValue,
    'Class': classId,
    'Assessment Number': assessmentNo,
    'Gender': gender,
    'Admission Date': admissionDate,
    'Parent Name': parentName,
    'Parent Phone': parentPhone,
  }
  const missingFields = Object.entries(requiredMap)
    .filter(([, v]) => !String(v ?? '').trim())
    .map(([k]) => k)

  const onSaveStudent = async () => {
    if (missingFields.length > 0) {
      alert(`Please fill: ${missingFields.join(', ')}`)
      return
    }
    try {
      setSaving(true)
      
      // Create student in Firestore with year/term enrollment
      const { firstName, middleName, surname } = splitName(fullNameValue.trim())
      const studentData = {
        firstName, middleName, surname,
        name: fullNameValue.trim(),
        classId, assessmentNo, gender, admissionDate,
        yearOfBirth: yearOfBirth || null,
        birthCertNo, parentName, parentPhone, parentEmail, parentArea, previousSchool,
        createdAt: Date.now(),
        enrolledYear: uiYear,
        enrolledTerm: uiTerm
      }
      
      const studentRef = await addDoc(collection(db, 'students'), studentData)
      
      // Create enrollment history entries for ALL 3 TERMS
      for (let t = 1; t <= 3; t++) {
        await setDoc(doc(db, 'student_enrollments', `${studentRef.id}_${uiYear}_${t}`), {
          studentId: studentRef.id,
          classId,
          year: uiYear,
          term: t,
          createdAt: Date.now()
        })
      }
      
      alert(`Student added successfully for ${uiYear} (all terms)`)
      
      // Reset form
      setFullName(''); setClassId(''); setAssessmentNo(''); setGender(''); setAdmissionDate('')
      setYearOfBirth(''); setBirthCertNo(''); setParentName(''); setParentPhone('')
      setParentEmail(''); setParentArea(''); setPreviousSchool('')
      
      await refreshStudents()
    } catch (err: any) {
      const msg = String(err?.message || err || '')
      alert(`Failed to save student: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  const classOptions = useMemo(
    () => classes
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map(c => ({ value: c.id, label: c.name })),
    [classes]
  )

  /* ---------- View Students ---------- */
  const [filterClassId, setFilterClassId] = useState<string>('')
  const [showFew, setShowFew] = useState(true)

  useEffect(() => {
    if (!filterClassId) {
      refreshStudents()
    } else {
      refreshStudents(filterClassId)
    }
    setShowFew(true)
  }, [filterClassId, uiYear, uiTerm])

  const filteredStudents = useMemo(() => {
    return filterClassId
      ? studentsBE.filter(s => (s as any).classId === filterClassId)
      : studentsBE
  }, [studentsBE, filterClassId])

  const visibleStudents = showFew ? filteredStudents.slice(0, 5) : filteredStudents

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selected, setSelected] = useState<any | null>(null)
  function openDetails(s: any) { setSelected(s); setDetailsOpen(true) }

  /* ---------- Report Card state ---------- */
  const [reportClassId, setReportClassId] = useState('')
  const reportClassStudents = useMemo(
    () => (reportClassId ? studentsBE.filter(s => s.classId === reportClassId) : []),
    [reportClassId, studentsBE]
  )
  const [reportStudentId, setReportStudentId] = useState('')
  const [reportYear, setReportYear] = useState<string>('All')
  const [reportTerm, setReportTerm] = useState<string>('All')
  const [reportExam, setReportExam] = useState<string>('All')

  useEffect(() => {
    setReportYear(String(uiYear))
    setReportTerm(`Term ${uiTerm}`)
  }, [uiYear, uiTerm])

  const chosenStudent = useMemo(
    () => (reportStudentId ? studentsBE.find(s => s.id === reportStudentId) || null : null),
    [reportStudentId, studentsBE]
  )

  /* ---------- Summary visuals - ONLY CYAN AND YELLOW ---------- */
  const COLORS = ['#22d3ee', '#facc15'] // Only cyan and yellow
  const pickColor = (index: number) => COLORS[index % 2]
  
  const capacityPct = (count: number, max: number) =>
    Math.min(100, Math.round((count / Math.max(1, max)) * 100))

  const byClass = useMemo(() => {
    const map: Array<{ id: string; name: string; count: number; capacity: number }> = []
    classes.forEach(c => {
      const count = studentsBE.filter(s => s.classId === c.id).length
      const max = (c as any).capacity ?? 40
      map.push({ id: c.id, name: c.name, count, capacity: max })
    })
    return map.sort((a,b)=>a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [classes, studentsBE])

  const [editingCap, setEditingCap] = useState<string | null>(null)
  const [capValue, setCapValue] = useState<number>(40)
  const beginCapEdit = (cls: { id: string; capacity: number }) => {
    setEditingCap(cls.id)
    setCapValue(cls.capacity ?? 40)
  }
  const saveCap = async (id: string) => {
    await updateDoc(doc(db, 'classes', id), { capacity: Number(capValue || 0) })
    setEditingCap(null)
  }

  const printReportOnly = () => {
    const el = document.getElementById('report-print')
    if (!el) return
    const html = `
      <html>
        <head>
          <title>Report Card</title>
          <meta charset="utf-8" />
          <style>
            * { box-sizing: border-box; }
            body { background: white; color: black; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 16px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #e5e7eb; padding: 6px 8px; }
            thead th { background: #f3f4f6; }
            .titlebar { display:flex; align-items:center; justify-content:space-between; margin-bottom: 12px; }
          </style>
        </head>
        <body>
          <div class="titlebar">
            <div><strong>Report Card</strong></div>
            <div>Year: ${uiYear} • Term: ${uiTerm}</div>
          </div>
          ${el.innerHTML}
          <script>window.onload = function(){ window.print(); }</script>
        </body>
      </html>`
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    w.document.open(); w.document.write(html); w.document.close()
  }

  return (
    <div className="space-y-6">
      {/* Tabs + Year/Term */}
      <div className="card p-2 sticky top-16 z-20 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Students sections">
          {TabBtn('summary', 'Summary')}
          {TabBtn('view', 'View Students')}
          {TabBtn('add', 'Add New Student')}
          {TabBtn('import', 'Import from Excel')}
          {TabBtn('report', 'Report Card')}
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-xs opacity-70">Year</span>
              <select className="input w-[90px]" value={uiYear} onChange={e=>setUiYear(Number(e.target.value))}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs opacity-70">Term</span>
              <select className="input w-[90px]" value={uiTerm} onChange={e=>setUiTerm(Number(e.target.value) as 1|2|3)}>
                <option value={1}>Term 1</option>
                <option value={2}>Term 2</option>
                <option value={3}>Term 3</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Summary ===== */}
      {active === 'summary' && (
        <section className="card p-4">
          <h2 className="text-xl font-bold text-cyan-400 mb-1">Summary</h2>
          <p className="text-sm opacity-70 mb-3">Enrollment for {uiYear} • Term {uiTerm}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {byClass.map((c, idx) => {
              const pct = capacityPct(c.count, c.capacity ?? 40)
              const barColor = pickColor(idx)
              const editing = editingCap === c.id
              return (
                <div key={c.id} className="rounded-lg border p-4 bg-white/5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{c.name}</div>
                    {!editing ? (
                      <button className="btn btn-secondary btn-sm" onClick={()=>beginCapEdit(c)}>
                        <Edit3 size={14} className="mr-1" /> Edit Max
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <input
                          className="input w-20 h-8"
                          type="number"
                          min={1}
                          value={capValue}
                          onChange={e=>setCapValue(Number(e.target.value))}
                          aria-label="Class maximum"
                        />
                        <button className="btn btn-primary btn-sm" onClick={()=>saveCap(c.id)} title="Save">
                          <Check size={14} />
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={()=>setEditingCap(null)} title="Cancel">
                          <XIcon size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-1 text-sm opacity-70">
                    {c.count} / {c.capacity ?? 40} students
                  </div>

                  <div className="mt-3 h-3 rounded bg-black/30 overflow-hidden outline outline-1 outline-white/15">
                    <div
                      className="h-full"
                      style={{ width: `${pct}%`, background: barColor }}
                      title={`${pct}%`}
                    />
                  </div>
                  <div className="mt-1 text-xs opacity-70">Enrollment vs Maximum</div>
                </div>
              )
            })}
            {byClass.length === 0 && <div className="opacity-70">No classes yet.</div>}
          </div>
        </section>
      )}

      {/* ===== View Students ===== */}
      {active === 'view' && (
        <section className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-3">
            <h2 className="text-xl font-bold text-cyan-400 flex-1">View Students ({uiYear} T{uiTerm})</h2>
            <div className="w-60">
              <label className="block text-xs opacity-70 mb-1">Filter by Class</label>
              <Select
                className="input bg-gray-100 text-gray-900 rounded-md"
                value={filterClassId}
                onChange={setFilterClassId}
                options={[{ value: '', label: 'All' }, ...classOptions]}
                placeholder="All"
              />
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => setShowFew(v => !v)}
              title={showFew ? 'Show all students' : 'Show first 5'}
            >
              {showFew ? 'Show all' : 'Show first 5'}
            </button>
          </div>

          {errStudents && (
            <div className="px-4 py-2 text-sm text-red-300">{errStudents}</div>
          )}
          {loadingStudents && (
            <div className="px-4 py-2 text-sm opacity-70">Loading students…</div>
          )}

          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Class</th>
                <th className="px-4 py-2 text-left">Assessment #</th>
                <th className="px-4 py-2 text-left">Gender</th>
                <th className="px-4 py-2 text-left">Admission Date</th>
                <th className="px-4 py-2 text-left">Parent</th>
                <th className="px-4 py-2 text-left">Phone</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleStudents.map((s, i) => (
                <tr key={s.id} className={i % 2 === 0 ? 'bg-white/5 hover:bg-white/10' : 'hover:bg-white/10'}>
                  <td className="px-4 py-2">
                    <button className="text-cyan-400 hover:underline" onClick={()=>openDetails(s)}>{nameFromRecord(s)}</button>
                  </td>
                  <td className="px-4 py-2">{classes.find(c=>c.id===(s as any).classId)?.name || '-'}</td>
                  <td className="px-4 py-2">{(s as any).assessmentNo || '-'}</td>
                  <td className="px-4 py-2">{(s as any).gender || '-'}</td>
                  <td className="px-4 py-2">{(s as any).admissionDate || '-'}</td>
                  <td className="px-4 py-2">{(s as any).parentName || '-'}</td>
                  <td className="px-4 py-2">{(s as any).parentPhone || '-'}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button className="btn btn-secondary" onClick={()=>openDetails(s)}>View</button>
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          setActive('report')
                          setReportClassId((s as any).classId || '')
                          setReportStudentId(s.id)
                        }}
                      >
                        Report Card
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleStudents.length === 0 && !loadingStudents && (
                <tr>
                  <td className="px-4 py-8 text-center opacity-70" colSpan={8}>
                    No students to show for {uiYear} Term {uiTerm}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {/* ===== Add New Student ===== */}
      {active === 'add' && (
        <section className="card p-4">
          <h1 className="text-2xl font-bold text-cyan-400">Add New Student</h1>
          <p className="text-sm opacity-70 mt-1">Adding to {uiYear} • Term {uiTerm}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs opacity-70 mb-1">Full Name</label>
              <input className="input" value={fullNameValue} onChange={e=>setFullName(e.target.value)} />
            </div>

            <div>
              <label className="block text-xs opacity-70 mb-1">Class</label>
              <Select
                className="input bg-gray-100 text-gray-900 rounded-md"
                value={classId}
                onChange={setClassId}
                options={classOptions}
                placeholder="Select class"
              />
            </div>

            <div>
              <label className="block text-xs opacity-70 mb-1">Assessment Number</label>
              <input className="input" value={assessmentNo} onChange={e=>setAssessmentNo(e.target.value)} />
            </div>

            <div>
              <label className="block text-xs opacity-70 mb-1">Gender</label>
              <select className="input" value={gender} onChange={e=>setGender(e.target.value as any)}>
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>

            <div>
              <label className="block text-xs opacity-70 mb-1">Admission Date</label>
              <input className="input" type="date" value={admissionDate} onChange={e=>setAdmissionDate(e.target.value)} />
            </div>

            <div>
              <label className="block text-xs opacity-70 mb-1">Year of Birth (e.g., 2012)</label>
              <input className="input" type="number" value={yearOfBirth as any} onChange={e=>setYearOfBirth(e.target.value ? Number(e.target.value) : ('' as any))} />
            </div>

            <div>
              <label className="block text-xs opacity-70 mb-1">Birth Certificate Number</label>
              <input className="input" value={birthCertNo} onChange={e=>setBirthCertNo(e.target.value)} />
            </div>
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold opacity-80 mb-2">Parent / Guardian</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs opacity-70 mb-1">Parent Name</label>
                <input className="input" value={parentName} onChange={e=>setParentName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs opacity-70 mb-1">Parent Phone</label>
                <input className="input" value={parentPhone} onChange={e=>setParentPhone(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs opacity-70 mb-1">Parent Email</label>
                <input className="input" type="email" value={parentEmail} onChange={e=>setParentEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs opacity-70 mb-1">Parent Area / Location</label>
                <input className="input" value={parentArea} onChange={e=>setParentArea(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold opacity-80 mb-2">Additional Info (Optional)</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs opacity-70 mb-1">Previous School</label>
                <input className="input" value={previousSchool} onChange={e=>setPreviousSchool(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="mt-6">
            <button className="btn btn-primary ml-1" onClick={onSaveStudent} disabled={saving}>
              {saving ? 'Saving…' : `Save Student (${uiYear} All Terms)`}
            </button>
          </div>
        </section>
      )}

      {/* ===== Import from Excel ===== */}
      {active === 'import' && (
        <ImportStudents />
      )}

      {/* ===== Report Card ===== */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #report-print, #report-print * { visibility: visible !important; }
          #report-print { position: static !important; }
        }
      `}</style>

      {active === 'report' && (
        <section className="card p-4 space-y-4">
          <div className="flex items-center flex-col items-start gap-2">
            <h2 className="text-xl font-bold text-cyan-400 mt-8">Report Card</h2>
            <button className="btn btn-primary" onClick={printReportOnly}>
              <Printer size={12} className="mr-2" /> Print
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="block text-xs opacity-70 mb-1">Class</label>
              <Select
                className="input bg-gray-100 text-gray-900 rounded-md"
                value={reportClassId}
                onChange={(v)=>{ setReportClassId(v); setReportStudentId('') }}
                options={classOptions}
                placeholder="Select class"
              />
            </div>

            <div>
              <label className="block text-xs opacity-70 mb-1">Student</label>
              <Select
                className="input bg-gray-100 text-gray-900 rounded-md"
                value={reportStudentId}
                onChange={setReportStudentId}
                options={reportClassStudents.map(s => ({ value: s.id, label: nameFromRecord(s) }))}
                placeholder="Select student"
              />
            </div>

            <div>
              <label className="block text-xs opacity-70 mb-1">Year</label>
              <select className="input" value={reportYear} onChange={e=>setReportYear(e.target.value)}>
                {['All', ...years.map(String)].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs opacity-70 mb-1">Term</label>
              <select className="input" value={reportTerm} onChange={e=>setReportTerm(e.target.value)}>
                {['All', ...TERMS].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs opacity-70 mb-1">Exam</label>
              <select className="input" value={reportExam} onChange={e=>setReportExam(e.target.value)}>
                {['All', ...EXAMS].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <StudentReportView
            subjects={subjects}
            student={chosenStudent}
            year={reportYear}
            term={reportTerm}
            exam={reportExam}
          />
        </section>
      )}

      {/* Details Modal */}
      <StudentDetailsModal
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        student={selected}
        onSave={async (patch) => {
          if (!selected) return
          await backendUpdateStudent(selected.id, patch)
          setDetailsOpen(false)
        }}
        classes={classes}
        classOptions={classOptions}
        year={uiYear}
        term={uiTerm}
      />
    </div>
  )
}