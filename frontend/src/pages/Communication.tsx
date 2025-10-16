import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSchoolData } from '../contexts/SchoolDataContext'
import { getAuth } from 'firebase/auth'

/* =========================
   Internal messages
========================= */
type Msg = {
  id: string
  type: 'announcement' | 'direct'
  toUserId?: string
  body: string
  templateId?: string
  createdBy: string
  createdAt: any
}
type Template = { id: string; name: string; body: string }

/* =========================
   SMS outbox queue
========================= */
type SmsRow = {
  to: string
  studentId?: string | null
  classId?: string | null
  body: string
  provider: 'safaricom' | 'mock'
  status: 'queued' | 'sent' | 'failed'
  meta?: {
    year?: number
    term?: number
    balance?: number
    studentName?: string
    className?: string
  }
  createdBy: string
  createdAt: any
}

/* ===== Backend helpers (token-auth) ===== */
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

const apiComm = {
  // Messages
  listAnnouncements: () =>
    apiFetch<{ ok: boolean; data: Msg[] }>('/messages?type=announcement').then(r => r.data),
  listDirectFor: (uid: string) =>
    apiFetch<{ ok: boolean; data: Msg[] }>(`/messages?type=direct&toUserId=${encodeURIComponent(uid)}`).then(r => r.data),
  sendMessage: (payload: Omit<Msg, 'id' | 'createdAt'>) =>
    apiFetch<{ ok: boolean; data: any }>('/messages', { method: 'POST', body: JSON.stringify(payload) }),

  // Templates
  listTemplates: () =>
    apiFetch<{ ok: boolean; data: Template[] }>('/templates').then(r => r.data),
  addTemplate: (tpl: { name: string; body: string }) =>
    apiFetch<{ ok: boolean; data: Template }>('/templates', { method: 'POST', body: JSON.stringify(tpl) }),

  // SMS queue
  queueSms: (row: Omit<SmsRow, 'createdAt'>) =>
    apiFetch<{ ok: boolean }>('/sms/queue', { method: 'POST', body: JSON.stringify(row) }),
}

export default function Communication() {
  const { users, profile } = useAuth()
  const {
    classes, students, currentYear, currentTerm, getStudentBalance,
    // Prefer using these if your context wires to backend live; we fall back to REST if absent.
    subscribeAnnouncements,     // (cb: (msgs: Msg[]) => void) => Unsubscribe
    subscribeDirectMessages,    // (uid: string, cb: (msgs: Msg[]) => void) => Unsubscribe
    subscribeMessageTemplates,  // (cb: (tpls: Template[]) => void) => Unsubscribe
    sendMessage,                // (payload: Omit<Msg, 'id'|'createdAt'>) => Promise<void>
    addMessageTemplate,         // (tpl: {name:string; body:string}) => Promise<void>
    queueSms,                   // (row: Omit<SmsRow,'createdAt'|'status'> & { status?: SmsRow['status'] }) => Promise<void>
  } = useSchoolData()

  /* ---------------- Tabs ---------------- */
  type Tab = 'messages' | 'sms'
  const [tab, setTab] = useState<Tab>('sms') // open on SMS as per your screenshot

  /* ---------------- Internal messages ---------------- */
  const [messages, setMessages] = useState<Msg[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [mode, setMode] = useState<'announcement'|'direct'>('announcement')
  const [toUserId, setToUserId] = useState('')
  const [body, setBody] = useState('')
  const [templateId, setTemplateId] = useState('')

  // Subscriptions or backend polling fallback (keeps your existing structure)
  useEffect(() => {
    const unsubs: Array<() => void> = []
    let pollTimer: number | undefined
    let pollTimer2: number | undefined

    const mergeAndSort = (anns: Msg[], directs: Msg[]) =>
      [...anns, ...directs].sort((a, b) => toUnix(b.createdAt) - toUnix(a.createdAt))

    if (subscribeAnnouncements && subscribeDirectMessages && profile?.uid) {
      // Live subscriptions via context (backend-aligned)
      const u1 = subscribeAnnouncements((rows) => {
        setMessages(prev => mergeAndSort(rows, prev.filter(m => m.type === 'direct')))
      })
      const u2 = subscribeDirectMessages(profile.uid, (rows) => {
        setMessages(prev => mergeAndSort(prev.filter(m => m.type === 'announcement'), rows))
      })
      unsubs.push(u1, u2)
    } else {
      // Fallback: simple polling to backend REST every 10s
      const tick = async () => {
        try {
          const [anns, directs] = await Promise.all([
            apiComm.listAnnouncements().catch(() => []),
            profile?.uid ? apiComm.listDirectFor(profile.uid).catch(() => []) : Promise.resolve([]),
          ])
          setMessages(mergeAndSort(anns as Msg[], directs as Msg[]))
        } catch {
          // ignore transient errors
        }
      }
      tick()
      pollTimer = window.setInterval(tick, 10000) as unknown as number
    }

    // Templates: subscribe or REST polling (15s)
    if (subscribeMessageTemplates) {
      const unsub = subscribeMessageTemplates((rows) => setTemplates(rows))
      unsubs.push(unsub)
    } else {
      const loadTemplates = async () => {
        try { setTemplates(await apiComm.listTemplates()) } catch {}
      }
      loadTemplates()
      pollTimer2 = window.setInterval(loadTemplates, 15000) as unknown as number
    }

    return () => {
      unsubs.forEach(fn => fn?.())
      if (pollTimer) clearInterval(pollTimer)
      if (pollTimer2) clearInterval(pollTimer2)
    }
  }, [profile?.uid, subscribeAnnouncements, subscribeDirectMessages, subscribeMessageTemplates])

  useEffect(() => {
    if (!templateId) return
    const t = templates.find(t => t.id === templateId)
    if (t) setBody(t.body)
  }, [templateId, templates])

  const sendInternal = async () => {
    if (!profile) return alert('Sign in to send messages')
    if (!body.trim()) return alert('Message body required')
    if (mode === 'direct' && !toUserId) return alert('Pick a recipient')

    try {
      const payload: Omit<Msg, 'id'|'createdAt'> = {
        type: mode,
        toUserId: mode === 'direct' ? toUserId : undefined,
        body: body.trim(),
        templateId: templateId || undefined,
        createdBy: profile.uid,
        createdAt: Date.now(), // backend may overwrite
      }
      if (sendMessage) {
        await sendMessage(payload as any)
      } else {
        await apiComm.sendMessage(payload)
      }
      setBody(''); setTemplateId(''); if (mode==='direct') setToUserId('')
      alert('Message sent')
    } catch (e: any) {
      alert(e?.message || 'Send failed')
    }
  }

  const userName = (uid?: string) =>
    users.find(u=>u.uid===uid)?.displayName || users.find(u=>u.uid===uid)?.email || uid || '-'

  /* ---------------- SMS ---------------- */
  type SmsMode = 'byClass' | 'byBalance'
  const [smsMode, setSmsMode] = useState<SmsMode>('byClass')
  const [smsBody, setSmsBody] = useState('')
  const [smsTemplateId, setSmsTemplateId] = useState('')
  const [year, setYear] = useState<number>(currentYear)
  const [term, setTerm] = useState<number>(currentTerm)
  const [classId, setClassId] = useState<string>('')              // optional filter
  const [balanceGte, setBalanceGte] = useState<string>('0')       // for byBalance
  const [loadingPool, setLoadingPool] = useState(false)

  // pool = all rows currently in scope; selected = chosen for SMS
  const [pool, setPool] = useState<Array<{ studentId: string; name: string; classId?: string; className?: string; parentPhone?: string; balance?: number }>>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  const classOptions = useMemo(() => classes.map(c => ({ value: c.id, label: c.name })), [classes])
  const classNameOf = (id?: string) => classes.find(c => c.id === id)?.name || '—'

  // student MultiSelect (tokens) needs a simple list of options:
  const studentOptions = useMemo(() => pool.map(p => ({ value: p.studentId, label: `${p.name} — ${p.className || ''}` })), [pool])

  const applyTemplateToBody = (id: string, isSms: boolean) => {
    const t = templates.find(t => t.id === id)
    if (!t) return
    if (isSms) setSmsBody(t.body)
    else setBody(t.body)
  }

  const loadTargets = async () => {
    setLoadingPool(true)
    try {
      if (smsMode === 'byClass') {
        if (!classId) { alert('Select a class'); return }
        const sts = students.filter(s => s.classId === classId)
        const rows = sts.map(s => ({
          studentId: s.id,
          name: s.name,
          classId: s.classId,
          className: classNameOf(s.classId),
          parentPhone: (s as any).parentPhone || '',
        }))
        setPool(rows)
        setSelected(Object.fromEntries(rows.map(r => [r.studentId, true])))
      } else {
        const group = classId ? students.filter(s => s.classId === classId) : students
        const rows: typeof pool = []
        const min = Number(balanceGte || 0)
        for (const s of group) {
          const bal = await getStudentBalance({ studentId: s.id, year, term })
          const totalBal = Number(bal.totals.balance || 0)
          if (totalBal >= min) {
            rows.push({
              studentId: s.id,
              name: s.name,
              classId: s.classId,
              className: classNameOf(s.classId),
              parentPhone: (s as any).parentPhone || '',
              balance: totalBal,
            })
          }
        }
        setPool(rows)
        setSelected(Object.fromEntries(rows.map(r => [r.studentId, true])))
      }
    } finally {
      setLoadingPool(false)
    }
  }

  // ------- selection helpers -------
  const setSelectedMany = (ids: string[], on: boolean) => {
    if (ids.length === 0) return
    setSelected(prev => ({ ...prev, ...Object.fromEntries(ids.map(id => [id, on])) }))
  }
  const toggleOne = (sid: string, on: boolean) => setSelected(prev => ({ ...prev, [sid]: on }))
  const allChecked = useMemo(() => pool.length > 0 && pool.every(p => selected[p.studentId]), [pool, selected])
  const toggleAll = (on: boolean) => setSelected(Object.fromEntries(pool.map(p => [p.studentId, on])))

  // ------- phone format helpers -------
  const validMsisdn = (s?: string) => {
    if (!s) return false
    const t = s.replace(/\s+/g, '')
    return /^(\+?2547\d{8}|07\d{8})$/.test(t)
  }
  const normalizeMsisdn = (s: string) => {
    const t = s.replace(/\s+/g, '')
    if (t.startsWith('+254')) return t.slice(1)
    if (t.startsWith('07')) return '254' + t.slice(1)
    return t
  }

  const queueSmsMany = async () => {
    if (!profile) return alert('Sign in to send SMS')
    const msg = smsBody.trim()
    if (!msg) return alert('Enter message text')

    const chosen = pool.filter(p => selected[p.studentId])
    if (chosen.length === 0) return alert('Select at least one student')

    const bad = chosen.filter(p => !validMsisdn(p.parentPhone))
    if (bad.length) {
      const first = bad[0]
      return alert(`Missing/invalid phone for ${first.name} (${first.className}). Edit the student to add a valid parent number.`)
    }

    try {
      let n = 0
      for (const r of chosen) {
        const to = normalizeMsisdn(r.parentPhone!)
        const docPayload: Omit<SmsRow,'createdAt'> = {
          to,
          studentId: r.studentId,
          classId: r.classId || null,
          body: msg,
          provider: 'safaricom',
          status: 'queued',
          meta: { year, term, balance: r.balance, studentName: r.name, className: r.className },
          createdBy: profile.uid,
        }
        if (queueSms) {
          await queueSms(docPayload as any)
        } else {
          await apiComm.queueSms(docPayload as any)
        }
        n++
      }
      alert(`Queued ${n} SMS message(s).`)
      setSmsBody('')
    } catch (e: any) {
      alert(e?.message || 'Queue SMS failed')
    }
  }

  /* ==========================================
     UI
  ========================================== */
  return (
    <div className="space-y-6">
      {/* OPAQUE sticky tabs (no ghosting behind) */}
      <div className="sticky top-24 z-40 mb-4">
        <div className="card p-2" style={{ background: '#0b0b0b', boxShadow: '0 10px 30px rgba(0,0,0,.35)' }}>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Communication sections">
            <button className={`btn ${tab==='messages'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('messages')}>Internal Messages</button>
            <button className={`btn ${tab==='sms'?'btn-primary':'btn-secondary'}`} onClick={()=>setTab('sms')}>SMS</button>
          </div>
        </div>
      </div>

      {/* ====== MESSAGES ====== */}
      {tab === 'messages' && (
        <>
          <h1 className="text-2xl font-semibold mt-2">Communication Hub</h1>

          {/* Compose */}
          <section className="card p-4">
            <div className="grid gap-3 sm:grid-cols-5">
              <select className="input" value={mode} onChange={e=>setMode(e.target.value as any)}>
                <option value="announcement">School-wide announcement</option>
                <option value="direct">Private message</option>
              </select>

              {mode === 'direct' && (
                <select className="input" value={toUserId} onChange={e=>setToUserId(e.target.value)} style={{ colorScheme: 'dark' as any }}>
                  <option value="">Select recipient</option>
                  {users.map(u => <option key={u.uid} value={u.uid}>{u.displayName || u.email}</option>)}
                </select>
              )}

              <select className="input" value={templateId} onChange={e=>{ setTemplateId(e.target.value); applyTemplateToBody(e.target.value, false) }}>
                <option value="">(Optional) Template</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>

              <input className="input sm:col-span-2" placeholder="Write message..." value={body} onChange={e=>setBody(e.target.value)} />
            </div>

            <div className="mt-3">
              <button className="btn btn-primary" onClick={sendInternal}>Send</button>
            </div>
          </section>

          {/* Feed */}
          <section className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b"><h2 className="text-lg font-semibold">Latest Messages</h2></div>
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">To</th>
                  <th className="px-4 py-2 text-left">Message</th>
                  <th className="px-4 py-2 text-left">By</th>
                  <th className="px-4 py-2 text-left">When</th>
                </tr>
              </thead>
              <tbody>
                {messages.map(m => (
                  <tr key={m.id} className="border-top">
                    <td className="px-4 py-2 capitalize">{m.type}</td>
                    <td className="px-4 py-2">{m.type==='direct' ? userName(m.toUserId) : 'Everyone'}</td>
                    <td className="px-4 py-2">{m.body}</td>
                    <td className="px-4 py-2">{userName(m.createdBy)}</td>
                    <td className="px-4 py-2">{formatWhen(m.createdAt)}</td>
                  </tr>
                ))}
                {messages.length===0 && <tr><td className="px-4 py-8 text-center opacity-70" colSpan={5}>No messages yet.</td></tr>}
              </tbody>
            </table>
          </section>

          <TemplateManager
            templates={templates}
            addTemplate={async (tpl) => {
              try {
                if (addMessageTemplate) {
                  await addMessageTemplate(tpl)
                } else {
                  await apiComm.addTemplate(tpl)
                  // refresh list quickly
                  try { setTemplates(await apiComm.listTemplates()) } catch {}
                }
              } catch (e: any) {
                alert(e?.message || 'Add template failed')
              }
            }}
          />
        </>
      )}

      {/* ====== SMS ====== */}
      {tab === 'sms' && (
        <>
          <h1 className="text-2xl font-semibold mt-2">SMS Hub</h1>

          {/* Scope */}
          <section className="card p-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <select className="input" value={smsMode} onChange={e=>setSmsMode(e.target.value as SmsMode)}>
                <option value="byClass">Select by class</option>
                <option value="byBalance">Balances ≥ amount</option>
              </select>

              <input type="number" className="input" value={year} onChange={e=>setYear(Number(e.target.value))} />
              <select className="input" value={term} onChange={e=>setTerm(Number(e.target.value))}>
                <option value={1}>Term 1</option>
                <option value={2}>Term 2</option>
                <option value={3}>Term 3</option>
              </select>

              <select className="input" value={classId} onChange={e=>setClassId(e.target.value)}>
                <option value="">(All classes)</option>
                {classOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {smsMode === 'byBalance' && (
              <div className="grid gap-3 sm:grid-cols-3">
                <input className="input" placeholder="Minimum balance (e.g., 5000)" value={balanceGte} onChange={e=>setBalanceGte(e.target.value.replace(/[^\d.]/g, ''))} />
                <div className="pill self-center sm:col-span-2">Filter: students with balance ≥ this amount</div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <select className="input" value={smsTemplateId} onChange={e=>{ setSmsTemplateId(e.target.value); applyTemplateToBody(e.target.value, true) }}>
                <option value="">(Optional) Template</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input className="input sm:col-span-2" placeholder="SMS text (e.g., Dear Parent, ...)" value={smsBody} onChange={e=>setSmsBody(e.target.value)} />
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn btn-secondary" onClick={loadTargets} disabled={loadingPool}>
                {loadingPool ? 'Loading…' : 'Load Targets'}
              </button>
              {pool.length > 0 && (
                <>
                  <button className="btn btn-secondary" onClick={()=>toggleAll(!allChecked)}>
                    {allChecked ? 'Unselect All' : 'Select All'}
                  </button>
                  <div className="pill">Ready: {pool.filter(p=>selected[p.studentId]).length} / {pool.length}</div>
                </>
              )}
            </div>

            {/* New: textbox-style MultiSelect to pick individual students */}
            {pool.length > 0 && (
              <MultiStudentSelect
                options={studentOptions}
                selectedIds={Object.entries(selected).filter(([_,on])=>on).map(([id])=>id)}
                onChange={(ids) => {
                  const onMap: Record<string, boolean> = {}
                  ids.forEach(id => { onMap[id] = true })
                  setSelected(prev => {
                    const next: Record<string, boolean> = {}
                    pool.forEach(p => { next[p.studentId] = !!onMap[p.studentId] })
                    return next
                  })
                }}
              />
            )}
          </section>

          {/* Target list */}
          <section className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">Recipients</h2>
              <div className="pill">Year {year} · Term {term}</div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left">
                    <input type="checkbox" style={{ appearance: 'auto' }} checked={allChecked} onChange={e=>toggleAll(e.target.checked)} />
                  </th>
                  <th className="px-4 py-2 text-left">Student</th>
                  <th className="px-4 py-2 text-left">Class</th>
                  <th className="px-4 py-2 text-left">Parent Phone</th>
                  {smsMode==='byBalance' && <th className="px-4 py-2 text-right">Balance</th>}
                </tr>
              </thead>
              <tbody>
                {pool.map(r => (
                  <tr key={r.studentId}>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        style={{ appearance: 'auto' }}
                        checked={!!selected[r.studentId]}
                        onChange={e=>toggleOne(r.studentId, e.target.checked)}
                      />
                    </td>
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="px-4 py-2">{r.className}</td>
                    <td className="px-4 py-2">{r.parentPhone || <i className="opacity-70">No phone</i>}</td>
                    {smsMode==='byBalance' && <td className="px-4 py-2 text-right">Ksh {Number(r.balance||0).toLocaleString('en-KE')}</td>}
                  </tr>
                ))}
                {pool.length===0 && <tr><td className="px-4 py-8 text-center opacity-70" colSpan={smsMode==='byBalance'?5:4}>No recipients loaded.</td></tr>}
              </tbody>
            </table>
          </section>

          <div className="flex items-center gap-2">
            <button className="btn btn-primary" onClick={queueSmsMany} disabled={pool.length===0}>
              Queue SMS to Parents
            </button>
            <div className="pill">Queued messages go to your provider via backend.</div>
          </div>
        </>
      )}
    </div>
  )
}

/* =========================
   Message Templates manager
========================= */
function TemplateManager({
  templates,
  addTemplate,
}: {
  templates: Template[]
  addTemplate?: (tpl: { name: string; body: string }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [body, setBody] = useState('')

  const addTemplateNow = async () => {
    const n = name.trim(), b = body.trim()
    if (!n || !b) return
    try {
      if (addTemplate) {
        await addTemplate({ name: n, body: b })
      }
      setName(''); setBody('')
    } catch (e: any) {
      alert(e?.message || 'Add template failed')
    }
  }

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Message Templates</h2>
        <button className="btn btn-primary" onClick={addTemplateNow}>+ Add</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 mt-3">
        <input className="input" placeholder="Template name" value={name} onChange={e=>setName(e.target.value)} />
        <input className="input sm:col-span-2" placeholder="Template body" value={body} onChange={e=>setBody(e.target.value)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {templates.map(t => <div key={t.id} className="pill">{t.name}</div>)}
        {templates.length===0 && <div className="opacity-70 text-sm">No templates yet.</div>}
      </div>
    </section>
  )
}

/* =========================
   Small, dependency-free MultiSelect
========================= */
function MultiStudentSelect({
  options,
  selectedIds,
  onChange,
}: {
  options: { value: string; label: string }[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return options.slice(0, 50)
    return options.filter(o => o.label.toLowerCase().includes(s)).slice(0, 50)
  }, [q, options])

  const add = (id: string) => {
    if (selectedSet.has(id)) return
    onChange([...selectedIds, id])
    setQ('')
  }
  const remove = (id: string) => onChange(selectedIds.filter(x => x !== id))

  return (
    <div className="relative">
      <div
        className="input"
        onClick={() => setOpen(true)}
        style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '.4rem .5rem' }}
      >
        {selectedIds.map(id => {
          const lab = options.find(o => o.value === id)?.label || id
          return (
            <span key={id} className="pill" style={{ padding: '.2rem .45rem' }}>
              {lab}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(id) }}
                className="ml-1 opacity-80 hover:opacity-100"
                aria-label={`Remove ${lab}`}
              >
                ✕
              </button>
            </span>
          )
        })}
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={selectedIds.length ? '' : 'Type a student name to select…'}
          className="bg-transparent outline-none flex-1"
          style={{ minWidth: '12ch' }}
        />
      </div>

      {open && (
        <div
          className="select-menu"
          style={{ position: 'absolute', insetInlineStart: 0, insetBlockStart: '100%', marginTop: 6, zIndex: 60 }}
        >
          {filtered.length === 0 && (
            <div className="select-option opacity-70">No matches</div>
          )}
          {filtered.map(o => {
            const chosen = selectedSet.has(o.value)
            return (
              <div
                key={o.value}
                className={`select-option${chosen ? ' is-selected' : ''}`}
                onMouseDown={(e)=> e.preventDefault() }
                onClick={() => add(o.value)}
              >
                {o.label}
              </div>
            )
          })}
          <div className="select-option is-active" onClick={()=>setOpen(false)}>Close</div>
        </div>
      )}
    </div>
  )
}

/* ---------------- helpers ---------------- */
function toUnix(ts: any): number {
  if (!ts) return 0
  // support Date, Firestore Timestamp-like, number
  if (typeof ts === 'number') return ts
  if (ts?.seconds) return ts.seconds
  const d = ts?.toDate?.() ?? (ts instanceof Date ? ts : null)
  return d ? Math.floor(d.getTime()/1000) : 0
}
function formatWhen(ts: any) {
  const d = ts?.toDate?.() ?? (ts instanceof Date ? ts : null)
  if (d) return d.toLocaleString()
  if (typeof ts === 'number') return new Date(ts).toLocaleString()
  return '-'
}
