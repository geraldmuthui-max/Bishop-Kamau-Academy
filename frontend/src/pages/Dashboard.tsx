import { useEffect, useMemo, useState } from "react";
import { useSchoolData } from "../contexts/SchoolDataContext";

type Totals = { due: number; paid: number; balance: number };

const fmtKsh = (n: number) =>
  `Ksh ${Math.round(n || 0).toLocaleString("en-KE", { useGrouping: true })}`;

// Simple Donut Component
const Donut = ({ percent, size, thickness, colorA, colorB, label }) => {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = `${(percent / 100) * circumference} ${circumference}`;
  
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colorB}
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colorA}
          strokeWidth={thickness}
          strokeDasharray={strokeDasharray}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dasharray 0.5s ease-in-out',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-2xl font-bold">{label}</div>
        <div className="text-sm opacity-70">Collection</div>
      </div>
    </div>
  );
};

const COLORS = {
  cyan:   'rgba(34, 211, 238, .72)',
  yellow: 'rgba(250, 204,  21, .78)',
  magenta:'rgba(244, 114, 182, .70)',
  track:  'rgba(55,  65,  81, .55)'
};

export default function Dashboard() {
  const {
    students,
    currentYear,
    currentTerm,
    classes = [],
    getStudentBalance,
    preloadBalances
  } = useSchoolData();

  // show the active period, defaulting to context
  const [year, setYear] = useState<number>(currentYear);
  const [term, setTerm] = useState<number>(currentTerm);

  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState<Totals>({ due: 0, paid: 0, balance: 0 });
  
  // Class-level states
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [classTotals, setClassTotals] = useState<Totals>({ due: 0, paid: 0, balance: 0 });
  const [loadingClass, setLoadingClass] = useState(false);

  // Initialize selected class
  useEffect(() => {
    if (classes.length > 0 && !selectedClassId) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  const computeOverview = async () => {
    if (!students || students.length === 0) {
      setTotals({ due: 0, paid: 0, balance: 0 });
      return;
    }
    setLoading(true);
    try {
      const balances = await Promise.all(
        students.map((s) =>
          getStudentBalance({ studentId: s.id, year, term })
        )
      );
      const roll = balances.reduce<Totals>(
        (acc, b) => {
          acc.due += b.totalDue || 0;
          acc.paid += b.totalPaid || 0;
          acc.balance += b.balance || 0;
          return acc;
        },
        { due: 0, paid: 0, balance: 0 }
      );
      setTotals(roll);
    } catch (error) {
      console.error('Error computing overview:', error);
    } finally {
      setLoading(false);
    }
  };

  const computeClassTotals = async () => {
    if (!selectedClassId || !students) {
      setClassTotals({ due: 0, paid: 0, balance: 0 });
      return;
    }
    
    setLoadingClass(true);
    try {
      const classStudents = students.filter(s => s.classId === selectedClassId);
      const balances = await Promise.all(
        classStudents.map((s) =>
          getStudentBalance({ studentId: s.id, year, term })
        )
      );
      const roll = balances.reduce<Totals>(
        (acc, b) => {
          acc.due += b.totalDue || 0;
          acc.paid += b.totalPaid || 0;
          acc.balance += b.balance || 0;
          return acc;
        },
        { due: 0, paid: 0, balance: 0 }
      );
      setClassTotals(roll);
    } catch (error) {
      console.error('Error computing class totals:', error);
    } finally {
      setLoadingClass(false);
    }
  };

  useEffect(() => {
    computeOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students.length, year, term]);

  useEffect(() => {
    if (selectedClassId) {
      computeClassTotals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, students.length, year, term]);

  // Calculate percentages
  const schoolPct = totals.due > 0 ? (totals.paid / totals.due) * 100 : 0;
  const classPct = classTotals.due > 0 ? (classTotals.paid / classTotals.due) * 100 : 0;

  // Class options for dropdown
  const classOptions = useMemo(() => {
    return classes.map(cls => ({
      value: cls.id,
      label: cls.name || `Class ${cls.id}`
    }));
  }, [classes]);

  const handleRefresh = async () => {
    setLoading(true);
    setLoadingClass(true);
    try {
      // Force reload from backend
      await preloadBalances({ year, term });
      await computeOverview();
      await computeClassTotals();
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setLoading(false);
      setLoadingClass(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Period picker */}
      <div className="card p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="pill">Active</span>
          <span className="opacity-80">{year} · T{term}</span>
        </div>
        <div className="flex gap-2">
          <select
            className="input w-28"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            className="input w-28"
            value={term}
            onChange={(e) => setTerm(Number(e.target.value))}
          >
            <option value={1}>Term 1</option>
            <option value={2}>Term 2</option>
            <option value={3}>Term 3</option>
          </select>
          <button 
            className="btn btn-secondary" 
            onClick={handleRefresh} 
            disabled={loading || loadingClass}
          >
            {(loading || loadingClass) ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Collection Overview - Two Donuts */}
      <section className="card p-4">
        <h1 className="text-xl font-bold text-cyan-400 mb-6">Collection Overview</h1>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Schoolwide donut */}
          <div className="card p-4">
            <h2 className="font-semibold mb-4 donut-title">
              Whole School Fees (Expected vs Collected)
            </h2>
            <div className="flex items-center gap-6 flex-wrap">
              <Donut
                percent={schoolPct}
                size={200}
                thickness={24}
                colorA={COLORS.cyan}
                colorB={COLORS.track}
                label={loading ? '...' : `${Math.round(schoolPct)}%`}
              />

              {/* four chips */}
              <div className="grid grid-cols-2 gap-3 min-w-[260px]">
                <div className="pill" style={{ color: COLORS.yellow }}>
                  Expected:{' '}
                  <span className="stat-lg">{fmtKsh(totals.due)}</span>
                </div>
                <div className="pill" style={{ color: COLORS.cyan }}>
                  Collected:{' '}
                  <span className="stat-lg">{fmtKsh(totals.paid)}</span>
                </div>
                <div className="pill" style={{ color: '#fff' }}>
                  Balance:{' '}
                  <span className="stat-lg">{fmtKsh(totals.balance)}</span>
                </div>
                <div className="pill">
                  Classes:{' '}
                  <span className="stat-lg">{classes.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Per-class donut */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold donut-title">Class Balances</h2>
              <select
                className="input w-fit min-w-[100px]"
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                style={{ colorScheme: 'dark' as any }}
              >
                {classOptions.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-6 flex-wrap">
              <Donut
                percent={classPct}
                size={200}
                thickness={24}
                colorA={COLORS.yellow}
                colorB={COLORS.track}
                label={loadingClass ? '...' : `${Math.round(classPct)}%`}
              />

              {/* four chips */}
              <div className="grid grid-cols-2 gap-3 min-w-[260px]">
                <div className="pill" style={{ color: COLORS.yellow }}>
                  Expected:{' '}
                  <span className="stat-lg">{fmtKsh(classTotals.due)}</span>
                </div>
                <div className="pill" style={{ color: COLORS.cyan }}>
                  Collected:{' '}
                  <span className="stat-lg">{fmtKsh(classTotals.paid)}</span>
                </div>
                <div className="pill" style={{ color: '#fff' }}>
                  Balance:{' '}
                  <span className="stat-lg">{fmtKsh(classTotals.balance)}</span>
                </div>
                <div className="pill">
                  Students:{' '}
                  <span className="stat-lg">
                    {students.filter(s => s.classId === selectedClassId).length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}