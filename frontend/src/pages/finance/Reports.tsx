import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useSchoolData } from '../../contexts/SchoolDataContext';
import { db } from '../../lib/firebase';

type Props = { year: number; term: number };

export default function Reports({ year, term }: Props) {
  const {
    classes, students, getStudentBalance,
  } = useSchoolData();

  /* ============================== REPORTS =============================== */
  const [repClassId, setRepClassId] = useState<string>('');
  const [balanceOp, setBalanceOp] = useState<'<' | '<=' | '=' | '>=' | '>'>('>=');
  const [balanceAmt, setBalanceAmt] = useState<string>('0');
  const [reportRows, setReportRows] = useState<{ name: string, className: string, due: number, paid: number, balance: number }[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);

  const passes = (bal: number) => {
    const x = Number(balanceAmt || 0);
    switch (balanceOp) {
      case '<': return bal < x;
      case '<=': return bal <= x;
      case '=': return bal === x;
      case '>=': return bal >= x;
      case '>': return bal > x;
      default: return false;
    }
  };

  const loadReport = async () => {
    try {
      setLoadingReport(true);
      const poolStudents = repClassId ? students.filter(s => s.classId === repClassId) : students;
      const balances = await Promise.all(
        poolStudents.map(s => getStudentBalance({ studentId: s.id, year, term }))
      );
      const rows = balances.map((b, i) => ({
        name: poolStudents[i].name || '',
        className: classes.find(c => c.id === poolStudents[i].classId)?.name || '—',
        due: b.totals.due || 0,
        paid: b.totals.paid || 0,
        balance: b.totals.balance || 0,
      })).filter(r => passes(r.balance));
      setReportRows(rows);
    } catch (error) {
      console.error('Error loading report:', error);
    } finally {
      setLoadingReport(false);
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
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-cyan-400">Payment Reports Per Class</h2>
          <div className="flex gap-2">
            <select className="input" value={repClassId} onChange={e => setRepClassId(e.target.value)} style={{ colorScheme: 'dark' as any }}>
              <option value="">All classes</option>
              {classOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="input" value={balanceOp} onChange={e => setBalanceOp(e.target.value as any)} style={{ colorScheme: 'dark' as any }}>
              <option value=">=">&ge;</option>
              <option value=">">&gt;</option>
              <option value="=">=</option>
              <option value="<=">&le;</option>
              <option value="<">&lt;</option>
            </select>
            <input type="number" className="input" placeholder="Balance amount (e.g. -2000)" value={balanceAmt} onChange={e => setBalanceAmt(e.target.value)} step="1" />
            <button className="btn btn-primary" onClick={loadReport} disabled={loadingReport}>
              {loadingReport ? 'Loading…' : 'Filter'}
            </button>
            <button className="btn btn-primary" onClick={() => {
              const header = 'Student,Class,Due,Paid,Balance\n';
              const lines = reportRows.map(r => `"${r.name.replace(/"/g,'""')}","${r.className.replace(/"/g,'""')}",${r.due},${r.paid},${r.balance}`).join('\n');
              const blob = new Blob([header + lines], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `finance_report_${year}_T${term}.csv`;
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }} disabled={reportRows.length === 0}>
              Export CSV
            </button>
          </div>
        </div>

        <p className="text-sm mt-2 text-right" style={{ color: '#FFE600' }}>
          Tip: Shows Students Where <b>Balance</b> {balanceOp} {Number(balanceAmt ?? 0).toLocaleString("en-KE")}.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 text-left">Student</th>
                <th className="px-4 py-2 text-left">Class</th>
                <th className="px-4 py-2 text-left">Due</th>
                <th className="px-4 py-2 text-left">Paid</th>
                <th className="px-4 py-2 text-left">Balance</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2">{r.className}</td>
                  <td className="px-4 py-2">Ksh {r.due.toLocaleString('en-KE')}</td>
                  <td className="px-4 py-2">Ksh {r.paid.toLocaleString('en-KE')}</td>
                  <td className="px-4 py-2">Ksh {r.balance.toLocaleString('en-KE')}</td>
                </tr>
              ))}
              {reportRows.length === 0 && (
                <tr><td className="px-4 py-6 text-center opacity-70" colSpan={5}>No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Plan Report per class */}
      <PaymentPlanReport year={year} term={term} />
    </section>
  );
}

/* ---------------- Payment Plan Report ---------------- */
function PaymentPlanReport({ year, term }: { year:number; term:number }) {
  const { classes, students, getStudentBalance } = useSchoolData();
  const [rows, setRows] = useState<{className:string; student:string; nextDate:string; arrears:number; note:string}[]>([]);
  const [loading, setLoading] = useState(false);

  const KES = (n:number) => `Ksh ${Number(n||0).toLocaleString('en-KE')}`;

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'payment_plans'), where('year','==',year), where('term','==',term)));
      const buf: {studentId:string; nextPaymentDate:string; note:string}[] = [];
      snap.forEach(d => buf.push(d.data() as any));

      const out: {className:string; student:string; nextDate:string; arrears:number; note:string}[] = [];
      for (const pl of buf) {
        const st = students.find(s => s.id === pl.studentId);
        if (!st) continue;
        const bal = await getStudentBalance({ studentId: st.id, year, term });
        out.push({
          className: classes.find(c => c.id === st.classId)?.name || '—',
          student: st.name || '',
          nextDate: new Date(pl.nextPaymentDate).toLocaleDateString(),
          arrears: Math.max(0, bal.totals.balance || 0),
          note: (pl as any).note || ''
        });
      }
      out.sort((a,b) => new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime());
      setRows(out);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [year, term]); // eslint-disable-line

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-cyan-400">Payment Plan Report per class</h2>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Reload'}</button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-2 text-left">Class</th>
              <th className="px-4 py-2 text-left">Student</th>
              <th className="px-4 py-2 text-left">Next Payment Date</th>
              <th className="px-4 py-2 text-left">Arrears</th>
              <th className="px-4 py-2 text-left">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i) => (
              <tr key={i} className="border-t">
                <td className="px-4 py-2">{r.className}</td>
                <td className="px-4 py-2">{r.student}</td>
                <td className="px-4 py-2">{r.nextDate}</td>
                <td className="px-4 py-2">{KES(r.arrears)}</td>
                <td className="px-4 py-2">{r.note || '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="px-4 py-6 text-center opacity-70" colSpan={5}>No payment plans found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs opacity-70 mt-2">* We'll add automatic reminders later.</p>
    </div>
  );
}
