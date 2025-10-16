import { useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useSchoolData } from '../../contexts/SchoolDataContext';
import { apiClasses, apiSubjects } from './api';

export default function ManageClassesSubjects() {
  const {
    classes, subjects,
    addClass, addSubject,
    updateClass, deleteClass,
    updateSubject, deleteSubject,
  } = useSchoolData();

  const [newClass, setNewClass] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [showFewClasses, setShowFewClasses] = useState(true);
  const [showFewSubjects, setShowFewSubjects] = useState(true);
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

  const addClassNow = async () => {
    const name = newClass.trim();
    if (!name) return;
    const exists = classes.some(c => normalize(c.name) === normalize(name));
    if (exists) return alert('Class already exists');
    await addClass({ name });
    setNewClass('');
    alert(`Class "${name}" added`);
  };

  const addSubjectNow = async () => {
    const name = newSubject.trim();
    if (!name) return;
    const exists = subjects.some(s => normalize(s.name) === normalize(name));
    if (exists) return alert('Subject already exists');
    await addSubject({ name });
    setNewSubject('');
    alert(`Subject "${name}" added`);
  };

  const editClassName = async (c: any) => {
    const next = prompt('Edit class name', c.name);
    if (!next || next.trim() === c.name) return;
    const payload = { name: next.trim() };
    try { await apiClasses.update(c.id, payload); }
    catch { await updateClass?.(c.id, payload); }
  };

  const deleteClassHard = async (c: any) => {
    if (!confirm('Delete this class? (Students remain in database)')) return;
    try { await apiClasses.delete(c.id); }
    catch { await deleteClass?.(c.id); }
  };

  const editSubjectName = async (s: any) => {
    const next = prompt('Edit subject name', s.name);
    if (!next || next.trim() === s.name) return;
    const payload = { name: next.trim() };
    try { await apiSubjects.update(s.id, payload); }
    catch { await updateSubject?.(s.id, payload); }
  };

  const deleteSubjectHard = async (s: any) => {
    if (!confirm('Delete this subject?')) return;
    try { await apiSubjects.delete(s.id); }
    catch { await deleteSubject?.(s.id); }
  };

  const classesSorted = useMemo(
    () => classes.slice().sort((a,b)=>a.name.localeCompare(b.name, undefined, { numeric:true })),
    [classes]
  );

  return (
    <section className="card p-4">
      <h2 className="text-lg font-bold text-cyan-400 mb-3 mt-4">Manage Classes & Subjects</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex gap-2">
          <input className="input" value={newClass} onChange={e=>setNewClass(e.target.value)} placeholder='New class name (any text/numbers)' />
          <button className="btn btn-primary" onClick={addClassNow}>Add Class</button>
        </div>
        <div className="flex gap-2">
          <input className="input" value={newSubject} onChange={e=>setNewSubject(e.target.value)} placeholder="New subject name" />
          <button className="btn btn-primary" onClick={addSubjectNow}>Add Subject</button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold text-cyan-400">Classes</h3>
            <button className="btn btn-secondary" onClick={()=>setShowFewClasses(v=>!v)}>
              {showFewClasses ? 'Show all' : 'Show first 5'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(showFewClasses ? classesSorted.slice(0,5) : classesSorted).map((c:any)=>(
                  <tr key={c.id} className="border-t">
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="px-4 py-2 space-x-2">
                      <button className="icon-btn" title="Edit" onClick={()=>editClassName(c)}><Pencil size={16}/></button>
                      <button className="icon-btn danger" title="Delete" onClick={()=>deleteClassHard(c)}><Trash2 size={16}/></button>
                    </td>
                  </tr>
                ))}
                {classes.length === 0 && (
                  <tr><td className="px-4 py-6 text-center opacity-70" colSpan={2}>No classes yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold text-cyan-400">Subjects</h3>
            <button className="btn btn-secondary" onClick={()=>setShowFewSubjects(v=>!v)}>
              {showFewSubjects ? 'Show all' : 'Show first 5'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(showFewSubjects ? subjects.slice(0,5) : subjects).map((s:any)=>(
                  <tr key={s.id} className="border-t">
                    <td className="px-4 py-2">{s.name}</td>
                    <td className="px-4 py-2 space-x-2">
                      <button className="icon-btn" title="Edit" onClick={()=>editSubjectName(s)}><Pencil size={16}/></button>
                      <button className="icon-btn danger" title="Delete" onClick={()=>deleteSubjectHard(s)}><Trash2 size={16}/></button>
                    </td>
                  </tr>
                ))}
                {subjects.length === 0 && (
                  <tr><td className="px-4 py-6 text-center opacity-70" colSpan={2}>No subjects yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
