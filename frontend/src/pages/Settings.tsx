import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSchoolData } from '../contexts/SchoolDataContext'
import { getApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  previewPromotion,
  runPromotionWithSelection,
  rankPredictMap,
  type PromotionMap,
  type PromotionSelection,
} from '../lib/promotion'

type SchoolSettings = {
  schoolName: string
  currentYear: number
  currentTerm: 1|2|3
  notifyParents: boolean
  notifyTeachers: boolean
  backupsEnabled: boolean
  updatedAt?: any
}

/* ===== Backend helpers (token-auth) ===== */
const API_BASE =
  ((import.meta as any).env?.VITE_API_URL
    ? String((import.meta as any).env.VITE_API_URL).replace(/\/$/, '')
    : 'http://localhost:5000') + '/api'

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

const apiSettings = {
  get: () =>
    apiFetch<{ ok:boolean; data:SchoolSettings }>('/settings').then(r => r.data),
  save: (payload: SchoolSettings) =>
    apiFetch<{ ok:boolean }>('/settings', { method:'PUT', body: JSON.stringify(payload) }),
  queueBackup: (requestedByUid?: string) =>
    apiFetch<{ ok:boolean }>('/backups', { method:'POST', body: JSON.stringify({ requestedByUid }) }),
}

export default function Settings() {
  const { profile } = useAuth()
  const {
    classes, subjects, students, teachers, voteheads,
    getSchoolSettings,
    saveSchoolSettings,
    queueBackupJob,
  } = useSchoolData()

  const { projectId } = (getApp().options as { projectId?: string })
  const [s, setS] = useState<SchoolSettings>({
    schoolName: 'My School',
    currentYear: new Date().getFullYear(),
    currentTerm: 1,
    notifyParents: true,
    notifyTeachers: true,
    backupsEnabled: false,
  })

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        let data: any = null
        try {
          data = await apiSettings.get()
        } catch {}
        if (!data && getSchoolSettings) {
          data = await getSchoolSettings()
        }
        if (data) setS({ ...(data as any) })
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    try {
      await apiSettings.save({ ...s })
      alert('Settings saved')
    } catch {
      if (saveSchoolSettings) {
        await saveSchoolSettings({ ...s })
        alert('Settings saved')
      } else {
        alert('Save failed')
      }
    }
  }

  const runBackup = async () => {
    try {
      await apiSettings.queueBackup(profile?.uid)
      alert('Backup job queued')
    } catch {
      if (queueBackupJob) {
        await queueBackupJob(profile?.uid)
        alert('Backup job queued')
      } else {
        alert('Backup failed')
      }
    }
  }

  /* ====================== Year Rollover & Promotion ====================== */
  const [fromYear, setFromYear] = useState<number>(s.currentYear || new Date().getFullYear());
  const [toYear, setToYear] = useState<number>((s.currentYear || new Date().getFullYear()) + 1);
  const [classMap, setClassMap] = useState<PromotionMap>({});
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [promoting, setPromoting] = useState(false);

  const sortedClasses = useMemo(
    () => [...classes].sort((a:any,b:any)=>a.name.localeCompare(b.name, undefined, { numeric: true })),
    [classes]
  );
  const byId = useMemo(() => Object.fromEntries(sortedClasses.map((c:any)=>[c.id,c])), [sortedClasses]);

  const autoBuildMap = () => setClassMap(rankPredictMap(sortedClasses));
  
  const toggleFilterClass = (id: string) => {
    setSourceFilter(prev => (prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]));
  };

  const doPreview = async () => {
    if (sourceFilter.length === 0) {
      alert('Please select at least one class to include');
      return;
    }
    try {
      const p = await previewPromotion({
        fromYear, toYear, classMap,
        sourceFilter: sourceFilter.length ? sourceFilter : undefined
      });
      setPreview({ groups: p.groups, total: p.total });
    } catch (e:any) {
      alert(e?.message || 'Preview failed')
    }
  };

  const [selections, setSelections] = useState<Record<string, PromotionSelection>>({});

  useEffect(() => {
    if (!preview) return;
    const next: Record<string, PromotionSelection> = {};
    preview.groups.forEach((g: any) => {
      g.students.forEach((stu: any) => {
        next[stu.id] = {
          studentId: stu.id,
          sourceClassId: g.sourceClassId,
          targetClassId: g.targetClassId,
          archive: g.targetClassId === null ? true : false,
        };
      });
    });
    setSelections(next);
  }, [preview]);

  const setStudentTarget = (studentId: string, targetClassId: string | null) => {
    setSelections(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || { studentId, sourceClassId: '', targetClassId: null }),
        targetClassId,
        archive: targetClassId === null,
      },
    }));
  };

  const setStudentChecked = (studentId: string, checked: boolean) => {
    setSelections(prev => {
      const copy = { ...prev };
      if (!checked) delete copy[studentId];
      else if (!copy[studentId]) {
        copy[studentId] = { studentId, sourceClassId: '', targetClassId: null, archive: true };
      }
      return copy;
    });
  };

  const runSelectedPromotion = async () => {
    const list = Object.values(selections);
    if (!list.length) { alert('No students selected'); return; }
    const countArchive = list.filter(x => x.archive || !x.targetClassId).length;
    const countPromote = list.length - countArchive;
    const summary = [countPromote ? `${countPromote} promote` : '', countArchive ? `${countArchive} archive` : ''].filter(Boolean).join(', ');
    if (!window.confirm(`Proceed with ${summary} from ${fromYear} to ${toYear}?`)) return;
    try {
      setPromoting(true);
      const r = await runPromotionWithSelection({ fromYear, toYear, selections: list, requestedByUid: profile?.uid });
      alert(`Done: promoted ${r.promoted}, archived ${r.archived}.`);
      setPreview(null);
      setSelections({});
      setPromoting(false);
    } catch (e:any) {
      setPromoting(false);
      alert(e?.message || 'Promotion failed');
    }
  };

  const selectAllStudents = () => {
    if (!preview) return;
    const allSelections: Record<string, PromotionSelection> = {};
    preview.groups.forEach((g: any) => {
      g.students.forEach((stu: any) => {
        allSelections[stu.id] = {
          studentId: stu.id,
          sourceClassId: g.sourceClassId,
          targetClassId: g.targetClassId,
          archive: g.targetClassId === null ? true : false,
        };
      });
    });
    setSelections(allSelections);
  };

  const clearAllStudents = () => {
    setSelections({});
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Settings & Health</h1>

      {loading && <div className="text-sm opacity-70 text-gray-300">Loading settings…</div>}

      {/* ===== School Details ===== */}
      <section className="card p-4 bg-gray-800 border border-gray-700 rounded-lg">
        <h2 className="text-lg font-semibold mb-3 text-white">School Details</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input 
            className="rounded-md bg-gray-900 border border-gray-600 text-white px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
            value={s.schoolName} 
            onChange={e=>setS({...s, schoolName: e.target.value})} 
          />
          <input 
            type="number" 
            className="rounded-md bg-gray-900 border border-gray-600 text-white px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
            value={s.currentYear} 
            onChange={e=>setS({...s, currentYear: Number(e.target.value)})} 
          />
          <select 
            className="rounded-md bg-gray-900 border border-gray-600 text-white px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
            value={s.currentTerm} 
            onChange={e=>setS({...s, currentTerm: Number(e.target.value) as 1|2|3})}
          >
            <option value={1}>Term 1</option>
            <option value={2}>Term 2</option>
            <option value={3}>Term 3</option>
          </select>
        </div>
        <div className="mt-3">
          <button className="btn-primary rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 font-medium" onClick={save}>Save</button>
        </div>
      </section>

      {/* ===== Year Rollover & Promotion ===== */}
      <section className="card p-4 bg-gray-800 border border-gray-700 rounded-lg">
        <h2 className="text-lg font-semibold mb-3 text-white">Year Rollover &amp; Promotion</h2>
        <p className="text-sm opacity-80 mb-3 text-gray-300">
          Promote students to the next academic year. Select classes to include, configure promotion targets, and review before proceeding.
        </p>

        {/* Year Selection */}
        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">From Year</label>
            <input 
              type="number" 
              className="w-full rounded-lg bg-gray-900 border border-gray-600 text-white px-4 py-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-500" 
              value={fromYear} 
              onChange={e=>setFromYear(Number(e.target.value))} 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">To Year</label>
            <input 
              type="number" 
              className="w-full rounded-lg bg-gray-900 border border-gray-600 text-white px-4 py-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-500" 
              value={toYear} 
              onChange={e=>setToYear(Number(e.target.value))} 
            />
          </div>
          <div className="flex items-end">
            <button 
              className="w-full bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-lg font-medium border border-gray-600 transition-colors"
              onClick={autoBuildMap}
            >
              Auto Map Classes
            </button>
          </div>
        </div>

        {/* Class Selection */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-md font-semibold text-white">Select Classes to Include</h3>
            <div className="flex gap-2">
              <button
                type="button"
                className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded text-sm font-medium border border-gray-600"
                onClick={() => setSourceFilter(sortedClasses.map((c:any)=>c.id))}
              >
                Select all
              </button>
              <button
                type="button"
                className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded text-sm font-medium border border-gray-600"
                onClick={() => setSourceFilter([])}
              >
                Clear all
              </button>
            </div>
          </div>

          <div className="grid gap-3">
            {sortedClasses.map((c:any) => (
              <div key={c.id} className="flex items-center gap-4 p-4 rounded-lg border border-gray-700 bg-gray-750 hover:bg-gray-700 transition-colors">
                <div className="flex items-center">
                  <input
                    id={`include_${c.id}`}
                    type="checkbox"
                    className="h-5 w-5 rounded border-2 border-green-500 bg-transparent text-green-500 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-800 cursor-pointer"
                    checked={sourceFilter.includes(c.id)}
                    onChange={() => toggleFilterClass(c.id)}
                  />
                </div>
                <label
                  htmlFor={`include_${c.id}`}
                  className="flex-1 font-medium cursor-pointer select-none text-white text-lg"
                >
                  {c.name}
                </label>
                <div className="flex items-center gap-3 min-w-[300px]">
                  <span className="text-sm text-gray-400 whitespace-nowrap">Promote to:</span>
                  <select
                    className="flex-1 rounded-lg border border-gray-600 bg-gray-800 text-white px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    value={classMap[c.id] || ''}
                    onChange={e => setClassMap(prev => ({ ...prev, [c.id]: e.target.value || '' }))}
                  >
                    <option value="">— Archive —</option>
                    {sortedClasses.map((t:any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Preview Button */}
        <div className="flex justify-center">
          <button 
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={doPreview}
            disabled={sourceFilter.length === 0}
          >
            Generate Promotion Preview
          </button>
        </div>

        {/* Preview Results */}
        {preview && (
          <div className="mt-8 space-y-6">
            <div className="border-b border-gray-700 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white">Promotion Preview</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Review student promotions from {fromYear} to {toYear}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={selectAllStudents}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium border border-gray-600"
                  >
                    Select All
                  </button>
                  <button
                    onClick={clearAllStudents}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium border border-gray-600"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            </div>
            
            {/* Student List */}
            <div className="space-y-4">
              {preview.groups.map((g: any, gi: number) => (
                <div key={gi} className="rounded-lg border border-gray-700 overflow-hidden bg-gray-800">
                  {/* Class Header */}
                  <div className="px-6 py-4 bg-blue-900/30 border-b border-blue-800/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="text-lg font-semibold text-blue-300">
                          {byId[g.sourceClassId]?.name || g.sourceClassId}
                        </div>
                        <div className="text-blue-400 text-lg">→</div>
                        <div className="text-lg font-semibold text-blue-200">
                          {g.targetClassId ? (byId[g.targetClassId]?.name || g.targetClassId) : 'Archive'}
                        </div>
                      </div>
                      <div className="text-sm text-blue-300 bg-blue-900/50 px-3 py-1 rounded-full">
                        {g.students.length} student{g.students.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>

                  {/* Students Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-750">
                        <tr>
                          <th className="px-6 py-4 text-left w-12">
                            <input
                              type="checkbox"
                              className="h-5 w-5 rounded border-2 border-green-500 bg-transparent text-green-500 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-800 cursor-pointer"
                              checked={g.students.every((stu: any) => selections[stu.id])}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                g.students.forEach((stu: any) => setStudentChecked(stu.id, checked));
                              }}
                            />
                          </th>
                          <th className="px-6 py-4 text-left font-semibold text-gray-200 text-lg">Student Name</th>
                          <th className="px-6 py-4 text-left font-semibold text-gray-200 text-lg">Assessment No</th>
                          <th className="px-6 py-4 text-left font-semibold text-gray-200 text-lg">Promotion Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {g.students.map((stu: any) => {
                          const sel = selections[stu.id];
                          const checked = !!sel;
                          const targetId = sel?.targetClassId ?? g.targetClassId;
                          const isArchive = !targetId || sel?.archive;
                          
                          return (
                            <tr key={stu.id} className="hover:bg-gray-750/50 transition-colors">
                              <td className="px-6 py-4">
                                <input
                                  type="checkbox"
                                  className="h-5 w-5 rounded border-2 border-green-500 bg-transparent text-green-500 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-800 cursor-pointer"
                                  checked={checked}
                                  onChange={e => setStudentChecked(stu.id, e.target.checked)}
                                />
                              </td>
                              <td className="px-6 py-4">
                                <div className="font-medium text-white text-lg">{stu.name}</div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-gray-300 text-lg">{stu.assessmentNo || '—'}</div>
                              </td>
                              <td className="px-6 py-4">
                                <select
                                  className="w-full max-w-xs rounded-lg border border-gray-600 bg-gray-800 text-white px-4 py-3 text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                                  value={isArchive ? '' : String(targetId || '')}
                                  onChange={e => {
                                    const val = e.target.value || null;
                                    setStudentTarget(stu.id, val);
                                  }}
                                >
                                  <option value="" className="text-red-400 text-lg">— Archive Student —</option>
                                  {sortedClasses.map((t: any) => (
                                    <option key={t.id} value={t.id} className="text-lg">{t.name}</option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>

            {/* Action Bar */}
            <div className="bg-green-900/20 rounded-xl p-6 border border-green-800/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xl font-semibold text-green-300">
                    {Object.keys(selections).length} Students Selected
                  </div>
                  <div className="text-lg text-green-400 mt-2">
                    <span className="bg-green-900/50 px-3 py-1 rounded-lg mr-3">
                      {Object.values(selections).filter(s => !s.archive && s.targetClassId).length} to Promote
                    </span>
                    <span className="bg-red-900/50 px-3 py-1 rounded-lg">
                      {Object.values(selections).filter(s => s.archive || !s.targetClassId).length} to Archive
                    </span>
                  </div>
                </div>
                <button 
                  className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-xl font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 min-w-[200px] justify-center transition-colors" 
                  onClick={runSelectedPromotion} 
                  disabled={promoting || Object.keys(selections).length === 0}
                >
                  {promoting ? (
                    <>
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                      Processing...
                    </>
                  ) : (
                    `Run Promotion`
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ===== Data Counts ===== */}
      <section className="card p-4 bg-gray-800 border border-gray-700 rounded-lg">
        <h2 className="text-lg font-semibold mb-2 text-white">Data Counts</h2>
        <div className="text-sm grid gap-2 sm:grid-cols-3">
          <div className="pill bg-gray-750 text-gray-200 px-3 py-2 rounded-md">Students: {students.length}</div>
          <div className="pill bg-gray-750 text-gray-200 px-3 py-2 rounded-md">Teachers: {teachers.length}</div>
          <div className="pill bg-gray-750 text-gray-200 px-3 py-2 rounded-md">Classes: {classes.length}</div>
          <div className="pill bg-gray-750 text-gray-200 px-3 py-2 rounded-md">Subjects: {subjects.length}</div>
          <div className="pill bg-gray-750 text-gray-200 px-3 py-2 rounded-md">Voteheads: {voteheads.length}</div>
        </div>
      </section>
    </div>
  )
}