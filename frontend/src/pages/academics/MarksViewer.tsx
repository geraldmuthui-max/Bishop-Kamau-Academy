import { useState } from 'react';
import * as XLSX from 'xlsx';
import Select from '../../components/ui/Select';
import { useSchoolData } from '../../contexts/SchoolDataContext';
import { apiMarks } from './api';

const EXAMS = [
  { value: 'Opener', label: 'Opener' },
  { value: 'Mid Term', label: 'Mid Term' },
  { value: 'End Term', label: 'End Term' },
];

export default function MarksViewer({
  year, term
}: { year: number; term: 1|2|3 }) {
  const { classes, subjects, getStudentsByClass, getMarksFor } = useSchoolData();

  const classOptions = classes
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map(c => ({ value: c.id, label: c.name }));

  const [viewClassId, setViewClassId] = useState('');
  const [viewExam, setViewExam] = useState('Opener');
  const [rows, setRows] = useState<any[]>([]);

  const loadMarks = async () => {
    if (!viewClassId) return alert('Choose class');
    try {
      const all: any[] = [];
      for (const subj of subjects) {
        let lines: any[] = [];
        try {
          lines = await apiMarks.list({ classId: viewClassId, subjectId: subj.id, year, term, exam: viewExam });
        } catch {
          lines = await (getMarksFor?.({ classId: viewClassId, subjectId: subj.id, year, term, exam: viewExam }) as any) || [];
        }
        if (Array.isArray(lines)) lines.forEach(r => all.push(r));
      }
      setRows(all);
    } catch (e:any) {
      console.error('Load marks failed:', e);
      alert(`Load marks failed: ${e?.message || e}`);
    }
  };

  const exportExcel = async () => {
    if (!viewClassId) return alert('Choose a class first');
    if (rows.length === 0) await loadMarks();

    const classStudents = getStudentsByClass(viewClassId)
      .slice()
      .sort((a:any,b:any)=>(a.name||'').localeCompare(b.name||''));

    const by: Record<string, Record<string, {score?:number; remark?:string}>> = {};
    rows.forEach((m:any) => {
      if (!m.studentId || !m.subjectId) return;
      if (!by[m.studentId]) by[m.studentId] = {};
      by[m.studentId][m.subjectId] = { score: m.score ?? undefined, remark: m.remark ?? undefined };
    });

    const subjectsSorted = subjects.slice().sort((a:any,b:any)=>a.name.localeCompare(b.name));
    const grid: any[] = [];
    for (const st of classStudents) {
      const row: any = { Student: st.name };
      for (const subj of subjectsSorted) {
        const cell = by[st.id]?.[subj.id];
        row[`${subj.name} (Score)`] = cell?.score ?? '';
        row[`${subj.name} (Remark)`] = cell?.remark ?? '';
      }
      grid.push(row);
    }

    const ws = XLSX.utils.json_to_sheet(grid);
    const colCount = Object.keys(grid[0] || { Student: '' }).length;
    const widths = Array.from({ length: colCount }, () => ({ wch: 16 }));
    if (widths.length) widths[0] = { wch: 24 };
    (ws as any)['!cols'] = widths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Marks');

    const className = (classes.find((c:any)=>c.id===viewClassId)?.name || 'Class').replace(/[\\/:*?"<>|]/g, '_');
    const file = `Marks_${className}_${year}_T${term}_${viewExam}.xlsx`;
    XLSX.writeFile(wb, file, { bookSST: true, compression: true });
  };

  return (
    <section className="card p-4">
      <h2 className="text-lg font-bold text-cyan-400 mb-3 mt-4">Marks Viewer</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select value={viewClassId} onChange={setViewClassId} options={classOptions} placeholder="Year group / class" />
        <Select value={viewExam} onChange={setViewExam} options={EXAMS} placeholder="Exam" />
        <div className="pill self-center justify-self-end">Year {year} • Term {term}</div>
      </div>

      <div className="mt-3 flex gap-2">
        <button className="btn btn-primary" onClick={loadMarks}>Load Marks</button>
        <button className="btn btn-secondary" onClick={exportExcel}>Export (Excel)</button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm bg-white text-black print:bg-white">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left">Student</th>
              {subjects.slice().sort((a:any,b:any)=>a.name.localeCompare(b.name))
                .map((s:any)=><th key={s.id} className="px-4 py-2 text-left">{s.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {getStudentsByClass(viewClassId).map((st:any)=>{
              const row: Record<string, {score?:number; remark?:string}> = {};
              rows.filter((m:any)=>m.studentId===st.id)
                  .forEach((m:any)=>{ row[m.subjectId] = { score:m.score, remark:m.remark }; });
              return (
                <tr key={st.id} className="border-t">
                  <td className="px-4 py-2">{st.name}</td>
                  {subjects.slice().sort((a:any,b:any)=>a.name.localeCompare(b.name)).map((s:any)=>{
                    const c = row[s.id];
                    const label = (c?.score==null || c?.score==='') ? '—' : `${c.score} • ${c.remark || ''}`.trim();
                    return <td key={s.id} className="px-4 py-2">{label}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
