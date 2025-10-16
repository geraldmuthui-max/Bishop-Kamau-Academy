import { useMemo, useState } from 'react';
import { useSchoolData } from '../../contexts/SchoolDataContext';
import Select from '../../components/ui/Select';

export default function FeesOverview({
  year, term,
}: { year: number; term: number }) {
  const { classes, getStudentsByClass, getStudentBalance, students } = useSchoolData();

  const classOptions = useMemo(
    () => classes
      .slice()
      .sort((a,b)=>a.name.localeCompare(b.name, undefined, { numeric:true }))
      .map(c => ({ value: c.id, label: c.name })),
    [classes]
  );

  const [ovwClassId, setOvwClassId] = useState<string>(''); // empty = all
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<
    { studentId: string; name: string; className: string; due: number; paid: number; currentTermPaid: number; balance: number }[]
  >([]);

  const KES = (n:number) => `Ksh ${Number(n||0).toLocaleString('en-KE')}`;

  const load = async () => {
    try {
      setLoading(true);
      const scope = ovwClassId ? classes.filter(c => c.id === ovwClassId) : classes;
      const out: any[] = [];
      for (const c of scope) {
        const sts = getStudentsByClass(c.id);
        for (const s of sts) {
          // Backend returns cumulative totals including carry-forward
          const { totals } = await getStudentBalance({ studentId: s.id, year, term: term as 1|2|3 });
          out.push({
            studentId: s.id,
            name: s.name,
            className: c.name,
            // totals.due includes current term fees PLUS any arrears from previous terms
            // totals.currentTermPaid includes ONLY payments for this specific term
            // totals.paid includes ALL payments up to and including current term
            // totals.balance is what's still owed (can be negative if overpaid)
            due: Number(totals.due || 0),
            paid: Number(totals.paid || 0),
            currentTermPaid: Number(totals.currentTermPaid || 0),
            balance: Number(totals.balance || 0),
          });
        }
      }
      setRows(out);
    } catch (e:any) {
      console.error('FeesOverview load failed:', e);
      alert(`Load failed: ${e?.message || e}`);
    } finally { setLoading(false); }
  };

  const totals = rows.reduce((acc,r)=>({
    due: acc.due + r.due,
    paid: acc.paid + r.paid,
    currentTermPaid: acc.currentTermPaid + r.currentTermPaid,
    balance: acc.balance + r.balance,
  }), { due:0, paid:0, currentTermPaid:0, balance:0 });

  return (
    <section className="card p-4">
      <h2 className="text-lg font-bold text-cyan-400 mb-3 mt-4">School Fees Overview</h2>
      
      <div className="mb-3 text-sm opacity-80">
        <strong>Note:</strong> "Total Due" includes carry-forward from previous terms. 
        "This Term Paid" shows payments made in the current term only. "Balance" is the outstanding amount.
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Select
          value={ovwClassId}
          onChange={setOvwClassId}
          options={[{ value: '', label: 'All classes' }, ...classOptions]}
          placeholder="Class scope"
        />
        <div className="pill self-center">Year: {year}</div>
        <div className="pill self-center">Term: {term}</div>
        <button className="btn btn-primary" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Load Fees'}
        </button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap gap-3">
            <div className="pill">Students: {rows.length}</div>
            <div className="pill">Total Due (incl. arrears): {KES(totals.due)}</div>
            <div className="pill">This Term Paid: {KES(totals.currentTermPaid)}</div>
            <div className="pill">Outstanding Balance: {KES(totals.balance)}</div>
            <div className="pill">Classes: {ovwClassId ? '1' : classes.length}</div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left">Student</th>
                  <th className="px-4 py-2 text-left">Class</th>
                  <th className="px-4 py-2 text-left">Total Due</th>
                  <th className="px-4 py-2 text-left">This Term Paid</th>
                  <th className="px-4 py-2 text-left">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.studentId} className="border-t">
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="px-4 py-2">{r.className}</td>
                    <td className="px-4 py-2">{KES(r.due)}</td>
                    <td className="px-4 py-2">{KES(r.currentTermPaid)}</td>
                    <td className={`px-4 py-2 font-semibold ${r.balance > 0 ? 'text-red-300' : r.balance < 0 ? 'text-cyan-300' : ''}`}>
                      {KES(r.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted font-semibold">
                <tr>
                  <td className="px-4 py-2" colSpan={2}>TOTALS</td>
                  <td className="px-4 py-2">{KES(totals.due)}</td>
                  <td className="px-4 py-2">{KES(totals.currentTermPaid)}</td>
                  <td className={`px-4 py-2 ${totals.balance > 0 ? 'text-red-300' : totals.balance < 0 ? 'text-cyan-300' : ''}`}>
                    {KES(totals.balance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {rows.length === 0 && !loading && (
        <div className="mt-3 opacity-70">No data loaded yet. Choose a scope and click <b>Load Fees</b>.</div>
      )}
    </section>
  );
}