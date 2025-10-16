// src/pages/Finance.tsx
import { useState } from 'react';
import { useSchoolData } from '../contexts/SchoolDataContext';
import Overview from './Finance/Overview';
import Voteheads from './Finance/Voteheads';
import PayFees from './Finance/PayFees';
import Reports from './Finance/Reports';

type TabKey = 'overview' | 'voteheads' | 'payments' | 'reports';

export default function Finance() {
  const { currentYear, currentTerm } = useSchoolData();

  // Tabs
  const [tab, setTab] = useState<TabKey>('overview');
  const TabBtn = (k: TabKey, label: string) => (
    <button
      key={k}
      className={`btn ${tab === k ? 'btn-primary' : 'btn-secondary'}`}
      onClick={() => setTab(k)}
      aria-selected={tab === k}
      role="tab"
    >
      {label}
    </button>
  );

  // Year & Term (shared across all four modules)
  const [year, setYear] = useState<number>(currentYear);
  const [term, setTerm] = useState<number>(currentTerm);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="card p-2 sticky top-16 z-10 backdrop-blur">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Finance sections">
          {TabBtn('overview', 'Overview')}
          {TabBtn('voteheads', 'Vote Heads')}
          {TabBtn('payments', 'Pay Fees')}
          {TabBtn('reports', 'Reports')}
        </div>
      </div>

      {/* Year & Term */}
      <section className="card p-4 mt-8">
        <h2 className="text-lg font-bold text-cyan-400 mb-3 mt-4">Term & Year</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            type="number"
            className="input"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
          <select
            className="input"
            value={term}
            onChange={(e) => setTerm(Number(e.target.value))}
            style={{ colorScheme: 'dark' as any }}
          >
            <option value={1}>Term 1</option>
            <option value={2}>Term 2</option>
            <option value={3}>Term 3</option>
          </select>
          <div className="pill self-center">Active: {year} · T{term}</div>
        </div>
      </section>

      {/* Tab bodies (all logic moved into these modules) */}
      {tab === 'overview'  && (<Overview  year={year} term={term} />)}
      {tab === 'voteheads' && (<Voteheads year={year} term={term} />)}
      {tab === 'payments'  && (<PayFees   year={year} term={term} />)}
      {tab === 'reports'   && (<Reports   year={year} term={term} />)}
    </div>
  );
}
