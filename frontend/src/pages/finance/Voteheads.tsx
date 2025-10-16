import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where, addDoc } from 'firebase/firestore';
import { useSchoolData } from '../../contexts/SchoolDataContext';
import { db } from '../../lib/firebase';

type Props = { year: number; term: number };

export default function Voteheads({ year, term }: Props) {
  const {
    classes, voteheads, students,
    addVotehead, assignClassFees,
  } = useSchoolData();

  // Create Votehead
  const [vhName, setVhName] = useState('');
  const addVhNow = async () => {
    const name = vhName.trim(); if (!name) return;
    try {
      await addVotehead(name);
      setVhName('');
    } catch (error: any) {
      console.error('Failed to add votehead:', error);
      alert('Failed to add votehead: ' + error.message);
    }
  };

  // Assign Class Fees
  const [feeClassId, setFeeClassId] = useState('');
  const [dist, setDist] = useState<Record<string, string>>({});
  const [include, setInclude] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const baseAmt: Record<string, string> = {};
    const baseInc: Record<string, boolean> = {};
    voteheads.forEach(v => { baseAmt[v.id] = ''; baseInc[v.id] = false; });
    setDist(baseAmt);
    setInclude(baseInc);
  }, [voteheads.length]);

  const classStudents = useMemo(
    () => students.filter(s => s.classId === feeClassId),
    [students, feeClassId]
  );

  useEffect(() => {
    (async () => {
      const baseAmt: Record<string, string> = {};
      const baseInc: Record<string, boolean> = {};
      voteheads.forEach(v => { baseAmt[v.id] = ''; baseInc[v.id] = false; });

      if (!feeClassId) { setDist(baseAmt); setInclude(baseInc); return; }

      const tDoc = await getDoc(doc(db, 'class_fee_templates', `${feeClassId}_${year}_${term}`));
      if (tDoc.exists()) {
        const distribution = (tDoc.data() as any).distribution || {};
        voteheads.forEach(v => {
          const n = Number(distribution[v.id] || 0);
          if (n > 0) { baseAmt[v.id] = String(n); baseInc[v.id] = true; }
        });
        setDist(baseAmt); setInclude(baseInc); return;
      }

      // fallback: infer from sample students
      const sample = classStudents.slice(0, 15);
      const agg: Record<string, { sum: number, n: number }> = {};
      for (const st of sample) {
        const qy = query(
          collection(db, 'students', st.id, 'ledger'),
          where('type', '==', 'fee'),
          where('year', '==', year),
          where('term', '==', term)
        );
        const snap = await getDocs(qy);
        snap.forEach(d => {
          const x = d.data() as any;
          const key = x.voteheadId;
          const row = (agg[key] ||= { sum: 0, n: 0 });
          row.sum += Number(x.amount || 0);
          row.n += 1;
        });
      }
      voteheads.forEach(v => {
        const a = agg[v.id];
        if (a && a.n > 0) { baseAmt[v.id] = String(Math.round(a.sum / a.n)); baseInc[v.id] = true; }
      });
      setDist(baseAmt); setInclude(baseInc);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeClassId, year, term, voteheads.length, classStudents.length]);

  const setDistField = (id: string, val: string) => setDist(prev => ({ ...prev, [id]: val.replace(/[^\d.]/g, '') }));
  const toggleInclude = (id: string, on: boolean) => setInclude(prev => ({ ...prev, [id]: on }));

  const classHasExistingFees = async () => {
    const s = classStudents[0]; if (!s) return false;
    const qy = query(
      collection(db, 'students', s.id, 'ledger'),
      where('type', '==', 'fee'),
      where('year', '==', year),
      where('term', '==', term)
    );
    const snap = await getDocs(qy);
    return !snap.empty;
  };

  const applyFeesToClass = async () => {
    if (!feeClassId) return alert('Select class');
    const numeric: Record<string, number> = {};
    for (const [id, str] of Object.entries(dist)) {
      if (!include[id]) continue;
      const n = Number(str || 0);
      if (n > 0) numeric[id] = n;
    }
    if (Object.keys(numeric).length === 0) return alert('Check at least one votehead and enter an amount.');

    const exists = await classHasExistingFees();
    const cname = classes.find(c => c.id === feeClassId)?.name || 'Selected class';
    if (exists) {
      const ok = confirm(`${cname} already has fees for ${year} T${term}.\nOverwrite the existing figures?`);
      if (!ok) return;
    }

    try {
      await assignClassFees({ classId: feeClassId, year, term, distribution: numeric });
      alert(`School fees applied to ${cname}.`);
    } catch (error: any) {
      alert('Failed to assign fees: ' + error.message);
    }
  };

  /* ==================== Additional fee to a single student ==================== */
  const [showAddFee, setShowAddFee] = useState(false);
  const [addClassId, setAddClassId] = useState<string>('');
  const [addStudentId, setAddStudentId] = useState<string>('');
  const [addVoteId, setAddVoteId] = useState<string>('');
  const [addAmount, setAddAmount] = useState<string>('');

  const addClassStudents = useMemo(
    () => students.filter(s => s.classId === addClassId),
    [students, addClassId]
  );

  const [addTemplate, setAddTemplate] = useState<Record<string, number>>({});
  useEffect(() => {
    (async () => {
      setAddTemplate({});
      if (!addClassId) return;
      const t = await getDoc(doc(db, 'class_fee_templates', `${addClassId}_${year}_${term}`));
      if (t.exists()) {
        const d = (t.data() as any).distribution || {};
        setAddTemplate(Object.fromEntries(Object.entries(d).map(([k,v]) => [String(k), Number(v||0)])));
      }
    })();
  }, [addClassId, year, term]);

  useEffect(() => {
    if (!addVoteId) return;
    const suggest = addTemplate[addVoteId];
    if (suggest && !addAmount) setAddAmount(String(suggest));
  }, [addVoteId, addTemplate, addAmount]);

  const [addingOne, setAddingOne] = useState(false);
  const addFeeForStudent = async () => {
    if (!addClassId) return alert('Select class');
    if (!addStudentId) return alert('Select student');
    if (!addVoteId) return alert('Select vote head');
    const amt = Number(addAmount || 0);
    if (!amt || amt <= 0) return alert('Enter a positive amount');

    const qCheck = query(
      collection(db, 'students', addStudentId, 'ledger'),
      where('type', '==', 'fee'),
      where('year', '==', year),
      where('term', '==', term),
      where('voteheadId', '==', addVoteId)
    );
    const snap = await getDocs(qCheck);
    if (!snap.empty) {
      const ok = confirm('This student already has this vote head for the selected term.\nAdd another fee line on top of it?');
      if (!ok) return;
    }

    try {
      setAddingOne(true);
      await addDoc(collection(db, 'students', addStudentId, 'ledger'), {
        type: 'fee',
        year,
        term,
        voteheadId: addVoteId,
        amount: amt,
        note: 'Added individually',
        createdAt: Date.now(),
      } as any);

      alert('Additional fee added for the student.');
      setShowAddFee(false);
      setAddClassId(''); setAddStudentId(''); setAddVoteId(''); setAddAmount('');
    } finally {
      setAddingOne(false);
    }
  };

  /* ============================== Helpers =============================== */
  const sortedClasses = useMemo(
    () => [...classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [classes]
  );
  const classOptions = sortedClasses.map(c => ({ value: c.id, label: c.name }));

  /* ================================ UI ================================= */
  return (
    <section className="space-y-6">
      {/* Create Voteheads */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-cyan-400">Create Voteheads</h2>
          <div className="flex gap-2">
            <input className="input" value={vhName} onChange={e => setVhName(e.target.value)} placeholder="e.g., Tuition" />
            <button className="btn btn-primary" onClick={addVhNow}>Add</button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {voteheads.map(v => <div key={v.id} className="pill">{v.name}</div>)}
          {voteheads.length === 0 && <div className="opacity-70 text-sm">No voteheads yet.</div>}
        </div>
      </div>

      {/* Assign Class Fees + Additional Fee wizard button */}
      <div className="card p-4">
        <h2 className="text-lg font-bold text-cyan-400 mb-3">Assign Class Fees (auto-apply per student)</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <select className="input" value={feeClassId} onChange={e => setFeeClassId(e.target.value)} style={{ colorScheme: 'dark' as any }}>
            <option value="">Select class</option>
            {classOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="pill self-center">Students: {classStudents.length}</div>
          <div className="pill self-center">Voteheads: {voteheads.length}</div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {voteheads.map(v => (
            <div key={v.id} className="space-y-1">
              <label className="flex items-center gap-2 text-sm select-none">
                <input
                  type="checkbox"
                  style={{ appearance: 'auto', WebkitAppearance: 'auto', MozAppearance: 'auto' }}
                  className="h-4 w-4 accent-emerald-500 mr-1"
                  checked={!!include[v.id]}
                  onChange={e => toggleInclude(v.id, e.target.checked)}
                />
                <span className="opacity-80">Include</span> – <span>{v.name}</span>
              </label>
              <input
                className="input"
                placeholder="Per student amount"
                value={dist[v.id] || ''}
                onChange={e => setDistField(v.id, e.target.value)}
                disabled={!include[v.id]}
              />
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <button className="btn btn-primary" onClick={applyFeesToClass}>
            Apply to Class
          </button>

          <div className="ml-auto">
            <button className="btn btn-identity" onClick={() => setShowAddFee(true)}>
              Additional Fees to A Student
            </button>
          </div>
        </div>
      </div>

      {/* Generate Fees Structure per class (printable) */}
      <PrintableStructure year={year} term={term} classOptions={classOptions} />

      {/* =================== MODAL: Add fee to one student =================== */}
      {showAddFee && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="card w-full max-w-xl p-5 bg[rgba(0,0,0,.7)] backdrop-blur">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-cyan-400">Additional Fees to A Student</h3>
              <button className="btn btn-danger" onClick={() => setShowAddFee(false)}>Close</button>
            </div>
            <p className="text-sm opacity-80 mb-3">Pick class, student, and vote head. Amount auto-fills from the class template if present (you can override).</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <select className="input" value={addClassId} onChange={e => { setAddClassId(e.target.value); setAddStudentId(''); }} style={{ colorScheme: 'dark' as any }}>
                <option value="">Select class</option>
                {classOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              <select className="input" value={addStudentId} onChange={e => setAddStudentId(e.target.value)} disabled={!addClassId} style={{ colorScheme: 'dark' as any }}>
                <option value="">{addClassId ? 'Select student' : 'Pick a class first'}</option>
                {addClassStudents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

              <select className="input" value={addVoteId} onChange={e => setAddVoteId(e.target.value)} style={{ colorScheme: 'dark' as any }}>
                <option value="">Select vote head</option>
                {voteheads.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>

              <input className="input" placeholder="Amount (e.g. 1500)" value={addAmount} onChange={e => setAddAmount(e.target.value.replace(/[^\d.]/g,''))} />
            </div>

            <div className="mt-4 flex gap-2">
              <button className="btn btn-primary" disabled={addingOne} onClick={addFeeForStudent}>
                {addingOne ? 'Saving…' : 'Add Fee'}
              </button>
              <div className="pill">
                {addVoteId && (addTemplate[addVoteId] ? `Template: Ksh ${addTemplate[addVoteId].toLocaleString('en-KE')}` : 'No template amount')}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------- Printable Fees Structure ---------------- */
function PrintableStructure({
  year,
  term,
  classOptions,
}: {
  year: number;
  term: number;
  classOptions: { value: string; label: string }[];
}) {
  const { voteheads } = useSchoolData();
  const vhMap = useMemo(
    () => Object.fromEntries(voteheads.map(v => [String(v.id), v.name])),
    [voteheads]
  );

  const [school, setSchool] = useState<{ name: string; logoUrl?: string }>({
    name: 'Bishop Dr. Kamau Academy',
    logoUrl: '',
  });
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'school'));
        if (snap.exists()) {
          const s = snap.data() as any;
          setSchool({ name: s?.name || s?.schoolName || 'Bishop Dr. Kamau Academy', logoUrl: s?.logoUrl || s?.logo || '' });
        }
      } catch {}
    })();
  }, []);

  const [cls, setCls] = useState<string>(classOptions[0]?.value || '');
  const [rows, setRows] = useState<{ id: string; name: string; amount: number }[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!cls) return;
    setLoading(true);
    try {
      const tDoc = await getDoc(doc(db, 'class_fee_templates', `${cls}_${year}_${term}`));
      const distribution = tDoc.exists() ? ((tDoc.data() as any).distribution || {}) : {};
      const list = Object.entries(distribution).map(([vhId, amt]) => ({
        id: String(vhId),
        name: vhMap[String(vhId)] || String(vhId),
        amount: Number(amt || 0),
      }));
      setRows(list);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [cls, year, term, voteheads.length]); // eslint-disable-line

  const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const KES = (n: number) => `Ksh ${Number(n || 0).toLocaleString('en-KE')}`;
  const clsName = useMemo(() => classOptions.find(c => c.value === cls)?.label || '—', [classOptions, cls]);

  const printNow = () => {
    const body = rows.map((r, i) =>
      `<tr><td>${i + 1}</td><td>${r.name}</td><td style="text-align:right">${KES(r.amount)}</td></tr>`
    ).join('');
    const logoHtml = school.logoUrl
      ? `<img src="${school.logoUrl}" alt="logo" style="height:48px;width:48px;object-fit:contain;margin-right:12px" onerror="this.style.display='none'"/>`
      : `<div style="height:48px;width:48px;border-radius:8px;background:#0ea5e9;display:inline-block;margin-right:12px"></div>`;

    const html = `
      <html><head><title>Fees Structure</title>
      <style>
        body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;padding:24px;color:#111}
        h1,h2{margin:0 0 8px}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}
        th{background:#f7f7f7}
        .muted{color:#666;font-size:12px}
        .header{display:flex;align-items:center;margin-bottom:12px}
      </style></head>
      <body>
        <div class="header">
          ${logoHtml}
          <div>
            <div style="font-size:20px;font-weight:700">${school.name}</div>
            <div class="muted">Fees Structure • Year ${year} • Term ${term} • ${clsName}</div>
          </div>
        </div>
        <table>
          <thead><tr><th>#</th><th>Votehead</th><th>Amount</th></tr></thead>
          <tbody>${body || '<tr><td colspan="3">No template found for this class/term.</td></tr>'}</tbody>
          <tfoot><tr><th colspan="2" style="text-align:right">Total</th><th style="text-align:right">${KES(total)}</th></tr></tfoot>
        </table>
        <script>window.print(); setTimeout(()=>window.close(), 200);</script>
      </body></html>
    `;
    const win = window.open('', 'PRINT', 'height=700,width=900,top=60,left=100');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-cyan-400">Generate Fees Structure per Class</h2>
        <div className="flex gap-2">
          <select className="input" value={cls} onChange={e => setCls(e.target.value)} style={{ colorScheme: 'dark' as any }}>
            {classOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button className="btn btn-primary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Reload'}</button>
          <button className="btn btn-primary" onClick={printNow}>Print</button>
        </div>
      </div>

      <div className="mt-2 text-sm opacity-80">
        <b>{school.name}</b> – Year {year}, Term {term}, {clsName}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-2 text-left">#</th>
              <th className="px-4 py-2 text-left">Votehead</th>
              <th className="px-4 py-2 text-left">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2">{i + 1}</td>
                <td className="px-4 py-2">{r.name}</td>
                <td className="px-4 py-2">{KES(r.amount)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="px-4 py-6 text-center opacity-70" colSpan={3}>No template found for this class/term.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th className="px-4 py-2 text-left" colSpan={2}>Total</th>
              <th className="px-4 py-2 text-left">{KES(total)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
