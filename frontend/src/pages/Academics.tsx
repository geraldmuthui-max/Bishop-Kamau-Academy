// src/pages/Academics.tsx
import { useMemo, useState } from 'react';
import { useSchoolData } from '../contexts/SchoolDataContext';

import FeesOverview from './academics/FeesOverview';
import Teachers from './academics/Teachers';
import ManageClassesSubjects from './academics/ManageClassesSubjects';
import FilterStudents from './academics/FilterStudents';
import MarksViewer from './academics/MarksViewer';


type TabKey = 'fees' | 'teachers' | 'manage' | 'filter' | 'marks';

export default function Academics() {
  const { currentYear, currentTerm, classes } = useSchoolData();

  // Tabs
  const [active, setActive] = useState<TabKey>('fees');
  const tabBtn = (key: TabKey, label: string) => (
    <button
      key={key}
      role="tab"
      aria-selected={active === key}
      className={`btn ${active === key ? 'btn-primary' : 'btn-secondary'}`}
      onClick={() => setActive(key)}
    >
      {label}
    </button>
  );

  // Topbar Year/Term (shared by subpages that need it)
  const [yearTop, setYearTop] = useState<number>(currentYear);
  const [termTop, setTermTop] = useState<number>(currentTerm);
  const yr = currentYear;
  const yearOptions = [yr - 1, yr, yr + 1, yr + 2].map(n => ({ value: n, label: String(n) }));

  const classCount = useMemo(()=> classes.length, [classes.length]);

  return (
    <div className="space-y-6">
      {/* Top tabbar with Year/Term on the right */}
      <div className="card p-2 sticky top-16 z-10 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Academics sections">
            {tabBtn('fees', 'Fees Overview')}
            {tabBtn('teachers', 'Teachers')}
            {tabBtn('manage', 'Add Class or Subject')}
            {tabBtn('filter', 'Filter Students')}
            {tabBtn('marks', 'Marks Viewer')}
          </div>

          {/* Top-right Year / Term */}
          <div className="flex items-center gap-2">
            <div className="input flex items-center gap-2">
              <span className="opacity-70 text-sm">Year</span>
              <select
                className="bg-transparent outline-none"
                value={yearTop}
                onChange={e => setYearTop(Number(e.target.value))}
              >
                {yearOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="input flex items-center gap-2">
              <span className="opacity-70 text-sm">Term</span>
              <select
                className="bg-transparent outline-none"
                value={termTop}
                onChange={e => setTermTop(Number(e.target.value))}
              >
                <option value={1}>Term 1</option>
                <option value={2}>Term 2</option>
                <option value={3}>Term 3</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ======= Pages ======= */}
      {active === 'fees'     && <FeesOverview year={yearTop} term={termTop as 1|2|3} />}
      {active === 'teachers' && <Teachers />}
      {active === 'manage'   && <ManageClassesSubjects />}
      {active === 'filter'   && <FilterStudents />}
      {active === 'marks'    && <MarksViewer year={yearTop} term={termTop as 1|2|3} />}
    </div>
  );
}
