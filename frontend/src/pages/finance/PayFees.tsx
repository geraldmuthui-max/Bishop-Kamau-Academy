import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where, orderBy, addDoc } from 'firebase/firestore';
import { useSchoolData } from '../../contexts/SchoolDataContext';
import { db } from '../../lib/firebase';

type Props = { year: number; term: number };
type Item = { voteheadId: string; amount: number };

export default function PayFees({ year, term }: Props) {
  const {
    classes, voteheads, students,
    assignClassFees, recordPayment, getStudentBalance,
    invalidateBalanceCache
  } = useSchoolData();

  /* ============================== PAYMENTS ============================== */
  const [payClassId, setPayClassId] = useState('');
  const payClassStudents = useMemo(() => students.filter(s => s.classId === payClassId), [students, payClassId]);
  const [studentId, setStudentId] = useState('');
  const [method, setMethod] = useState<'cash' | 'card' | 'mpesa'>('cash');
  const [receiptNo, setReceiptNo] = useState('');
  const [amountTotal, setAmountTotal] = useState<string>('');
  const [receipt, setReceipt] = useState<any | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);

  const [liveBalance, setLiveBalance] = useState<{due:number;paid:number;currentTermPaid?:number;balance:number} | null>(null);
  const [checkingBal, setCheckingBal] = useState(false);

  const checkBalanceNow = async () => {
    if (!studentId) return;
    setCheckingBal(true);
    try {
      const b = await getStudentBalance({ studentId, year, term });
      // Backend returns: { totals: { due, paid, balance, currentTermPaid }, ... }
      setLiveBalance({
        due: b.totals.due,
        paid: b.totals.paid,
        currentTermPaid: b.totals.currentTermPaid,
        balance: b.totals.balance
      });
    } catch (error) {
      console.error('Error checking balance:', error);
    } finally { 
      setCheckingBal(false); 
    }
  };

  const loadFeesForThisStudent = async () => {
    if (!studentId || !payClassId) return;
    
    // Check if student already has fees for this specific term
    const qCheck = query(
      collection(db, 'students', studentId, 'ledger'),
      where('type', '==', 'fee'),
      where('year', '==', year),
      where('term', '==', term)
    );
    const snap = await getDocs(qCheck);
    if (!snap.empty) { 
      alert('This student already has fees assigned for this term.'); 
      return; 
    }
    
    // Get class fee template
    const tDoc = await getDoc(doc(db, 'class_fee_templates', `${payClassId}_${year}_${term}`));
    if (!tDoc.exists()) { 
      alert('No class fee template found for this class/term. Please assign fees in Voteheads first.'); 
      return; 
    }
    
    const distribution = (tDoc.data() as any).distribution || {};
    
    // Add fee entries to student's ledger
    const batch: Promise<any>[] = [];
    for (const [voteheadId, amount] of Object.entries(distribution)) {
      if (Number(amount) > 0) {
        batch.push(
          addDoc(collection(db, 'students', studentId, 'ledger'), {
            type: 'fee',
            year,
            term,
            voteheadId: String(voteheadId),
            amount: Number(amount),
            learnerId: studentId,
            createdAt: Date.now(),
          })
        );
      }
    }
    
    await Promise.all(batch);
    
    // Invalidate cache for this student
    invalidateBalanceCache(studentId);
    
    await checkBalanceNow();
    alert('Fees loaded for this student.');
  };

  const buildItemsForAmount = async (sid: string, amt: number): Promise<Item[]> => {
    const bal = await getStudentBalance({ studentId: sid, year, term });
    const prio = voteheads.map(v => v.id);
    let remaining = amt;
    const items: Item[] = [];
    
    // Allocate payment to voteheads with outstanding balance
    for (const vhId of prio) {
      if (remaining <= 0) break;
      const b = bal.perVotehead[vhId];
      const need = Math.max(0, (b?.balance || 0));
      if (need <= 0) continue;
      const take = Math.min(need, remaining);
      if (take > 0) { 
        items.push({ voteheadId: vhId, amount: take }); 
        remaining -= take; 
      }
    }
    
    // If there's still remaining amount and we have items, add to first votehead
    if (remaining > 0 && items.length > 0) { 
      items[0].amount += remaining; 
      remaining = 0; 
    }
    
    // If no items but payment exists, create unallocated entry
    if (items.length === 0 && amt > 0) {
      const firstVh = voteheads[0];
      if (firstVh) {
        items.push({ voteheadId: firstVh.id, amount: amt });
      }
    }
    
    return items;
  };

  const confirmPayment = async () => {
    if (!payClassId) return alert('Select class');
    if (!studentId) return alert('Select student');
    const amt = Number(amountTotal || 0);
    if (!amt || amt <= 0) return alert('Enter amount paid');

    const items = await buildItemsForAmount(studentId, amt);
    if (items.length === 0) return alert('Could not allocate payment.');

    try {
      setSavingPayment(true);
      await recordPayment({
        studentId, 
        method, 
        items,
        receiptNo: receiptNo || undefined,
        year, 
        term
      });

      // Invalidate cache after payment
      invalidateBalanceCache(studentId);

      const bal = await getStudentBalance({ studentId, year, term });
      const st = students.find(s => s.id === studentId);
      const cl = classes.find(c => c.id === payClassId);
      
      setReceipt({
        school: 'Bishop Dr. Kamau Academy', 
        logo: '🟩', 
        at: new Date().toLocaleString(),
        student: st?.name || '', 
        class: cl?.name || '', 
        year, 
        term, 
        method,
        receiptNo: receiptNo || '',
        amountPaidNow: amt, // THIS PAYMENT ONLY
        items: items.map(i => ({ 
          votehead: voteheads.find(v => v.id === i.voteheadId)?.name || i.voteheadId, 
          amount: i.amount 
        })),
        totals: {
          due: bal.totals.due,
          paid: bal.totals.paid,
          balance: bal.totals.balance - amt // NEW BALANCE after this payment
        },
        per: Object.fromEntries(
          Object.entries(bal.perVotehead).map(([id, r]) => [
            (voteheads.find(v => v.id === id)?.name || id), 
            r
          ])
        )
      });

      setAmountTotal(''); 
      setReceiptNo(''); 
      setStudentId('');
      alert('Payment recorded. Receipt ready.');
    } catch (e: any) {
      alert(e?.message || 'Failed to record payment');
    } finally {
      setSavingPayment(false);
    }
  };

  /* ---------- Payment history (per student) ---------- */
  const [histClassId, setHistClassId] = useState<string>('');
  const histStudents = useMemo(() => students.filter(s => s.classId === histClassId), [students, histClassId]);

  type HistRow = { 
    date: string; 
    amount: number; 
    balanceAfter: number; 
    note?: string; 
    kind: 'opening' | 'fee' | 'payment' 
  };
  
  const [historyRows, setHistoryRows] = useState<HistRow[]>([]);
  const KES = (n:number) => `Ksh ${Number(n||0).toLocaleString('en-KE')}`;

  // Helper to compare terms chronologically
  const before = (aY: number, aT: number, bY: number, bT: number) => {
    return aY < bY || (aY === bY && aT < bT);
  };

  const loadHistory = async (sid?: string) => {
    const target = sid || studentId;
    if (!target) return;
    
    console.log('[PayHistory] Loading history for student:', target, 'Year:', year, 'Term:', term);
    
    try {
      // Get all ledger entries with proper ordering
      const qy = query(
        collection(db, 'students', target, 'ledger'), 
        orderBy('createdAt', 'asc')
      );
      const snap = await getDocs(qy);
      
      console.log('[PayHistory] Found', snap.size, 'ledger entries');
      
      type Entry = { 
        type: 'fee' | 'payment'; 
        amount: number; 
        year: number; 
        term: number; 
        voteheadId?: string;
        note?: string; 
        createdAt: number 
      };
      
      const all: Entry[] = [];
      snap.forEach(d => {
        const x = d.data() as any;
        // Fix timestamp - convert Firestore timestamp to milliseconds
        let timestamp = 0;
        if (x.createdAt) {
          if (typeof x.createdAt === 'object' && x.createdAt.toMillis) {
            // Firestore Timestamp object
            timestamp = x.createdAt.toMillis();
          } else if (typeof x.createdAt === 'number') {
            // Already a number - check if it's in seconds or milliseconds
            timestamp = x.createdAt < 10000000000 ? x.createdAt * 1000 : x.createdAt;
          } else if (typeof x.createdAt === 'object' && x.createdAt.seconds) {
            // Firestore timestamp with seconds field
            timestamp = x.createdAt.seconds * 1000;
          }
        }
        
        if (!timestamp || timestamp === 0) {
          timestamp = Date.now();
        }
        
        all.push({ 
          type: x.type, 
          amount: Number(x.amount || 0), 
          year: Number(x.year ?? 0), 
          term: Number(x.term ?? 1), 
          voteheadId: x.voteheadId,
          note: x.note, 
          createdAt: timestamp
        });
      });

      console.log('[PayHistory] Parsed entries:', all.length);

      const Y = Number(year);
      const T = Number(term);
      
      // Calculate opening balance (carry-forward from previous terms)
      const prior = all.filter(e => before(e.year, e.term, Y, T));
      const opening = prior.reduce((sum, e) => {
        return sum + (e.type === 'fee' ? e.amount : -e.amount);
      }, 0);

      console.log('[PayHistory] Opening balance:', opening, 'from', prior.length, 'prior entries');

      // Get entries for current term
      const inTerm = all.filter(e => e.year === Y && e.term === T);
      
      console.log('[PayHistory] Current term entries:', inTerm.length);
      
      // Group by date for display
      type Group = { 
        ts: number; 
        fee: number; 
        payment: number; 
        feeCount: number; 
        payCount: number;
        entries: Entry[];
      };
      
      const groups: Record<string, Group> = {};
      inTerm.forEach(e => {
        const ts = e.createdAt || Date.now();
        const d = new Date(ts);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        
        if (!groups[key]) {
          groups[key] = { ts, fee: 0, payment: 0, feeCount: 0, payCount: 0, entries: [] };
        }
        
        if (e.type === 'fee') { 
          groups[key].fee += e.amount; 
          groups[key].feeCount++; 
        } else { 
          groups[key].payment += e.amount; 
          groups[key].payCount++; 
        }
        
        groups[key].entries.push(e);
        
        if (ts < groups[key].ts) groups[key].ts = ts;
      });

      // Build history rows
      let running = opening;
      const rows: HistRow[] = [];
      
      // Add opening balance row
      if (opening !== 0) {
        rows.push({
          date: `Opening (carry-forward) — Term ${T}, ${Y}`,
          amount: opening,
          balanceAfter: opening,
          kind: 'opening',
          note: opening > 0 ? 'Amount owed from previous terms' : 'Overpayment from previous terms'
        });
      } else {
        rows.push({
          date: `Opening (carry-forward) — Term ${T}, ${Y}`,
          amount: 0,
          balanceAfter: 0,
          kind: 'opening',
          note: 'No balance carried forward'
        });
      }

      // Add grouped entries
      const sorted = Object.entries(groups).sort((a, b) => a[1].ts - b[1].ts);
      sorted.forEach(([_, g]) => {
        const displayDate = new Date(g.ts).toLocaleDateString('en-KE', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        });
        
        // Add fees first (if any on this date)
        if (g.fee > 0) { 
          running += g.fee; 
          rows.push({ 
            date: displayDate, 
            amount: g.fee, 
            balanceAfter: running, 
            kind: 'fee',
            note: g.feeCount > 1 ? `${g.feeCount} fee entries` : 'Fee assigned'
          }); 
        }
        
        // Then add payments (if any on this date)
        if (g.payment > 0) { 
          running -= g.payment; 
          rows.push({ 
            date: displayDate, 
            amount: -g.payment, 
            balanceAfter: running, 
            kind: 'payment',
            note: g.payCount > 1 ? `${g.payCount} payments` : 'Payment received'
          }); 
        }
      });

      console.log('[PayHistory] Built', rows.length, 'history rows');
      setHistoryRows(rows);
    } catch (error) {
      console.error('[PayHistory] Error loading history:', error);
      setHistoryRows([]);
    }
  };

  /* ---------- Payment Plan (class → student) ---------- */
  const [planClassId, setPlanClassId] = useState<string>('');
  const planStudents = useMemo(() => students.filter(s => s.classId === planClassId), [students, planClassId]);
  const [planStudentId, setPlanStudentId] = useState<string>('');
  const [planNextDate, setPlanNextDate] = useState<string>('');
  const [planNote, setPlanNote] = useState<string>('');

  const savePaymentPlan = async () => {
    if (!planStudentId || !planNextDate) return alert('Select student and date.');
    await addDoc(collection(db, 'payment_plans'), {
      studentId: planStudentId,
      nextPaymentDate: planNextDate,
      note: planNote || '',
      year, 
      term,
      createdAt: Date.now()
    });
    setPlanNote('');
    alert('Payment plan saved.');
  };

  /* ============================== Helpers =============================== */
  const sortedClasses = useMemo(
    () => [...classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [classes]
  );
  const classOptions = sortedClasses.map(c => ({ value: c.id, label: c.name }));
  const KESTop = (n:number) => `Ksh ${Number(n||0).toLocaleString('en-KE')}`;

  /* ================================ UI ================================= */
  return (
    <section className="space-y-6">
      <div className="card p-4">
        <h2 className="text-lg font-bold text-cyan-400 mb-3">Pay Now</h2>

        <div className="grid gap-3 sm:grid-cols-4">
          <select 
            className="input" 
            value={payClassId} 
            onChange={e => { setPayClassId(e.target.value); setStudentId(''); }} 
            style={{ colorScheme: 'dark' as any }}
          >
            <option value="">Select class</option>
            {classOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          
          <select 
            className="input" 
            value={studentId} 
            onChange={e => setStudentId(e.target.value)} 
            style={{ colorScheme: 'dark' as any }}
          >
            <option value="">Select student</option>
            {payClassStudents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          
          <select 
            className="input" 
            value={method} 
            onChange={e => setMethod(e.target.value as 'cash'|'card'|'mpesa')} 
            style={{ colorScheme: 'dark' as any }}
          >
            <option value="cash">Cash</option>
            <option value="mpesa">M-Pesa</option>
            <option value="card">Card</option>
          </select>
          
          <input 
            className="input" 
            placeholder="Amount paid (eg. 2000)" 
            value={amountTotal} 
            onChange={e => setAmountTotal(e.target.value.replace(/[^\d.]/g, ''))} 
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div className="pill sm:col-span-3">Optional: add Receipt/Ref No below.</div>
          <input 
            className="input" 
            placeholder="Receipt / Reference No (optional)" 
            value={receiptNo} 
            onChange={e => setReceiptNo(e.target.value)} 
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <button 
            className="btn btn-secondary" 
            disabled={!studentId || checkingBal} 
            onClick={checkBalanceNow}
          >
            {checkingBal ? 'Checking…' : 'Check Balance'}
          </button>
          
          <button 
            className="btn btn-secondary" 
            disabled={!studentId} 
            onClick={loadFeesForThisStudent}
          >
            Load Fees for this Student
          </button>
          
          {liveBalance && (
            <div className="pill">
              Total Due: {KESTop(liveBalance.due)} · This Term Paid: {KESTop(liveBalance.currentTermPaid || 0)} · Outstanding: {KESTop(liveBalance.balance)}
            </div>
          )}
        </div>

        <div className="mt-3">
          <button 
            className="btn btn-primary" 
            disabled={savingPayment} 
            onClick={confirmPayment}
          >
            {savingPayment ? 'Saving…' : 'Confirm Payment'}
          </button>
        </div>

        {receipt && (
          <div className="mt-6 card p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-cyan-400">Receipt</h3>
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={() => {
                  const win = window.open('', 'PRINT', 'height=650,width=900,top=100,left=150');
                  if (!win) return;
                  const itemsHtml = receipt.items.map((r: any) =>
                    `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${r.votehead}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">Ksh ${r.amount.toLocaleString('en-KE')}</td></tr>`
                  ).join('');
                  win.document.write(`
                    <html><head><title>Receipt</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
                    <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#111; padding:20px;">
                      <div style="max-width:700px;margin:0 auto;">
                        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
                          <div style="font-size:28px">${receipt.logo}</div>
                          <div><div style="font-size:18px;font-weight:700">${receipt.school}</div>
                            <div style="font-size:12px;color:#555">Receipt • ${receipt.at}</div></div>
                          </div>
                        <table style="width:100%;font-size:14px;margin-bottom:10px">
                          <tr><td>Student</td><td style="text-align:right">${receipt.student}</td></tr>
                          <tr><td>Class</td><td style="text-align:right">${receipt.class}</td></tr>
                          <tr><td>Year/Term</td><td style="text-align:right">${receipt.year} / T${receipt.term}</td></tr>
                          <tr><td>Method</td><td style="text-align:right">${receipt.method}${receipt.receiptNo ? ` • ${receipt.receiptNo}` : ''}</td></tr>
                          <tr><td><strong>Amount Paid</strong></td><td style="text-align:right"><strong>Ksh ${receipt.amountPaidNow.toLocaleString('en-KE')}</strong></td></tr>
                        </table>
                        <div style="font-weight:600;margin:8px 0">Payment Items</div>
                        <table style="width:100%;border-collapse:collapse">${itemsHtml}</table>
                        <div style="margin-top:12px;padding:12px;background:#f8f9fa;border-radius:4px">
                          <div style="font-weight:700;margin-bottom:4px">Account Summary</div>
                          <div style="font-size:13px">Total Due (incl. arrears): <strong>Ksh ${receipt.totals.due.toLocaleString('en-KE')}</strong></div>
                          <div style="font-size:13px">Amount Paid Now: <strong style="color:#059669">Ksh ${receipt.amountPaidNow.toLocaleString('en-KE')}</strong></div>
                          <div style="font-size:13px">Outstanding Balance: <strong>Ksh ${receipt.totals.balance.toLocaleString('en-KE')}</strong></div>
                        </div>
                      </div>
                      <script>window.focus(); window.print(); setTimeout(()=>window.close(), 200);</script>
                    </body></html>
                  `);
                  win.document.close();
                  setReceipt(null);
                }}>Print</button>
                <button className="btn btn-danger" onClick={() => setReceipt(null)}>Close</button>
              </div>
            </div>
            <div className="text-sm opacity-80">Date: {receipt.at}</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div><b>Student:</b> {receipt.student}</div>
              <div><b>Class:</b> {receipt.class}</div>
              <div><b>Year/Term:</b> {receipt.year} / T{receipt.term}</div>
              <div><b>Method:</b> {receipt.method}{receipt.receiptNo ? ` • ${receipt.receiptNo}` : ''}</div>
              <div className="sm:col-span-2"><b>Amount Paid:</b> <span className="text-lg font-bold text-green-400">{KESTop(receipt.amountPaidNow)}</span></div>
            </div>
            <div className="mt-4">
              <div className="font-semibold mb-1">Payment Items</div>
              <ul className="text-sm space-y-1">
                {receipt.items.map((r: any, i: number) => (
                  <li key={i} className="flex justify-between">
                    <span>{r.votehead}</span>
                    <span>{KESTop(r.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 text-sm opacity-80">
              <div className="font-semibold mb-1">Account Summary</div>
              <div>Total Due (incl. arrears): {KESTop(receipt.totals.due)}</div>
              <div>Amount Paid Now: {KESTop(receipt.amountPaidNow)}</div>
              <div>Outstanding Balance: {KESTop(receipt.totals.balance)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Payment History (class → student) */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-cyan-400">Payment History per Student</h2>
          <div className="flex gap-2">
            <select className="input" value={histClassId} onChange={e => { setHistClassId(e.target.value); setStudentId(''); setHistoryRows([]); }} style={{ colorScheme: 'dark' as any }}>
              <option value="">Select class</option>
              {classOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="input w-full md:w-80 !py-2.5 !px-3 !text-base" value={studentId} onChange={e => setStudentId(e.target.value)} style={{ colorScheme: 'dark' as any }}>
              <option value="">Select student</option>
              {histStudents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn btn-primary" onClick={() => { checkBalanceNow(); loadHistory(); }} disabled={!studentId}>Load</button>
          </div>
        </div>
        <div className="mt-2">
          {liveBalance && (
            <div className="pill">Current Balance — Due: {KESTop(liveBalance.due)} · This Term Paid: {KESTop(liveBalance.currentTermPaid || 0)} · Arrears: {KESTop(liveBalance.balance)}</div>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left">Date / Entry</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-right">Balance after</th>
                  <th className="px-4 py-2 text-left">Note</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((r, i) => (
                  <tr key={i} className={`border-t ${r.kind === 'opening' ? 'opacity-80' : ''}`}>
                    <td className="px-4 py-2">
                      {r.kind === 'opening' ? <span className="italic">{r.date}</span> : r.date}
                    </td>
                    <td className={`px-4 py-2 text-right ${r.amount < 0 ? 'text-green-400' : 'text-red-300'}`}>
                      {r.amount < 0 ? `(${KES(Math.abs(r.amount))})` : `+${KES(r.amount)}`}
                    </td>
                    <td className={`px-4 py-2 text-right ${r.balanceAfter > 0 ? 'text-amber-300' : 'text-cyan-300'}`}>
                      {KES(r.balanceAfter)}
                    </td>
                    <td className="px-4 py-2">{r.note || (r.kind === 'opening' ? 'Carry-forward' : '—')}</td>
                  </tr>
                ))}
                {historyRows.length === 0 && (
                  <tr><td className="px-4 py-6 text-center opacity-70" colSpan={4}>No ledger entries found for the selected term.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Payment Plan (class → student) */}
      <div className="card p-4">
        <h2 className="text-lg font-bold text-cyan-400 mb-3">Payment Plan</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <select 
            className="input" 
            value={planClassId} 
            onChange={e => { setPlanClassId(e.target.value); setPlanStudentId(''); }} 
            style={{ colorScheme: 'dark' as any }}
          >
            <option value="">Select class</option>
            {classOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          
          <select 
            className="input" 
            value={planStudentId} 
            onChange={e => setPlanStudentId(e.target.value)} 
            style={{ colorScheme: 'dark' as any }}
          >
            <option value="">Select student</option>
            {planStudents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          
          <input 
            type="date" 
            className="input" 
            value={planNextDate} 
            onChange={e => setPlanNextDate(e.target.value)} 
          />
          
          <input 
            className="input" 
            placeholder="Note (optional)" 
            value={planNote} 
            onChange={e => setPlanNote(e.target.value)} 
          />
        </div>
        <div className="mt-3">
          <button className="btn btn-primary" onClick={savePaymentPlan}>
            Save Plan
          </button>
        </div>
        <p className="text-xs opacity-70 mt-2">
          These plans appear under Reports → Payment Plan Report per class.
        </p>
      </div>
    </section>
  );
}