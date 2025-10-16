import { useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useSchoolData } from '../../contexts/SchoolDataContext';
import Select from '../../components/ui/Select';
import { apiStudents } from './api';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export default function FilterStudents() {
  const {
    classes, students, getStudentsByClass, currentYear, currentTerm,
    updateStudent, deleteStudent,
  } = useSchoolData();

  const classOptions = useMemo(
    () => classes
      .slice()
      .sort((a,b)=>a.name.localeCompare(b.name, undefined, { numeric:true }))
      .map(c => ({ value: c.id, label: c.name })),
    [classes]
  );

  // Year/Term filters
  const now = new Date().getFullYear();
  const years = [currentYear || now, (currentYear || now) - 1, (currentYear || now) + 1, (currentYear || now) + 2];
  const [selectedYear, setSelectedYear] = useState<number>(currentYear || now);
  const [selectedTerm, setSelectedTerm] = useState<1|2|3>(currentTerm || 1);

  const [filterClassId, setFilterClassId] = useState('');
  const [search, setSearch] = useState('');
  const [showFew, setShowFew] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let base = filterClassId ? getStudentsByClass(filterClassId) : students;
    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter((s:any) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.assessmentNo || '').toLowerCase().includes(q) ||
        (s.admissionNo || '').toLowerCase().includes(q) ||
        (s.parentName || '').toLowerCase().includes(q) ||
        (s.parentPhone || '').toLowerCase().includes(q) ||
        (s.parentArea || '').toLowerCase().includes(q)
      );
    }
    return base.slice().sort((a:any,b:any)=>(a.name||'').localeCompare(b.name||''));
  }, [filterClassId, search, students, getStudentsByClass]);

  const show = showFew ? filtered.slice(0, 10) : filtered;

  const [editSid, setEditSid] = useState<string | null>(null);
  const [editStudent, setEditStudent] = useState<any>({});

  const beginEditStudent = (s:any) => {
    setEditSid(s.id);
    setEditStudent({
      name: s.name || '',
      classId: s.classId || '',
      assessmentNo: s.assessmentNo || '',
      admissionNo: s.admissionNo || '',
      admissionDate: s.admissionDate || '',
      yearOfBirth: s.yearOfBirth || '',
      birthCertNo: s.birthCertNo || '',
      previousSchool: s.previousSchool || '',
      parentName: s.parentName || '',
      parentPhone: s.parentPhone || '',
      parentEmail: s.parentEmail || '',
      parentArea: s.parentArea || '',
      gender: s.gender || '',
    });
  };

  const saveStudent = async (id:string) => {
    try { 
      await apiStudents.update(id, editStudent); 
      alert('Student updated successfully');
    } catch (err: any) { 
      try {
        await updateStudent?.(id, editStudent); 
        alert('Student updated successfully');
      } catch (err2: any) {
        alert(`Failed to update: ${err2?.message || err?.message || 'Unknown error'}`);
      }
    }
    setEditSid(null);
  };

  const onDeleteFromYear = async (id: string, name: string) => {
    const confirmed = window.confirm(
      `⚠️ REMOVE STUDENT FROM ${selectedYear}?\n\n` +
      `Student: ${name}\n` +
      `Year: ${selectedYear}\n` +
      `Action: Delete enrollment records for this year\n\n` +
      `This will:\n` +
      `✅ Remove student from ${selectedYear} (all terms)\n` +
      `✅ Keep student record and data from other years\n` +
      `✅ Keep all marks/grades from other years\n\n` +
      `Continue?`
    );
    
    if (!confirmed) return;

    setDeleting(id);
    
    try {
      console.log(`Deleting enrollments for student ${id} in year ${selectedYear}...`);
      
      // Delete enrollment records for all 3 terms of the selected year
      const enrollmentsQuery = query(
        collection(db, 'student_enrollments'),
        where('studentId', '==', id),
        where('year', '==', selectedYear)
      );
      
      const enrollmentSnap = await getDocs(enrollmentsQuery);
      
      if (enrollmentSnap.empty) {
        alert(`⚠️ No enrollment records found for ${name} in ${selectedYear}.\n\nStudent may not be enrolled in this year.`);
        return;
      }
      
      const deletePromises = enrollmentSnap.docs.map(docSnap => 
        deleteDoc(doc(db, 'student_enrollments', docSnap.id))
      );
      
      await Promise.all(deletePromises);
      
      console.log(`✅ Deleted ${enrollmentSnap.size} enrollment records for ${selectedYear}`);
      
      alert(
        `✅ Student removed from ${selectedYear}\n\n` +
        `Deleted: ${enrollmentSnap.size} enrollment record(s)\n` +
        `Student record preserved for other years\n\n` +
        `Page will refresh...`
      );
      
      // Reload to show updated list
      window.location.reload();
      
    } catch (error: any) {
      console.error('Delete enrollment failed:', error);
      alert(
        `❌ Failed to remove student from ${selectedYear}\n\n` +
        `Error: ${error?.message || 'Unknown error'}\n\n` +
        `Please check console for details.`
      );
    } finally {
      setDeleting(null);
    }
  };

  const onDeletePermanently = async (id: string, name: string) => {
    const confirmed = window.confirm(
      `🚨 PERMANENTLY DELETE STUDENT?\n\n` +
      `Student: ${name}\n` +
      `ID: ${id}\n\n` +
      `⚠️ WARNING: This will delete:\n` +
      `❌ Student record (name, parent info, etc.)\n` +
      `❌ ALL enrollment records (all years)\n` +
      `❌ ALL marks/grades (all years)\n\n` +
      `This CANNOT be undone!\n\n` +
      `Type the student's name to confirm:`
    );
    
    if (!confirmed) return;

    const nameConfirm = window.prompt(`Type "${name}" to confirm permanent deletion:`);
    
    if (nameConfirm !== name) {
      alert('❌ Name did not match. Deletion cancelled.');
      return;
    }

    setDeleting(id);
    
    try {
      console.log('PERMANENTLY deleting student:', id);
      
      // 1. Delete all enrollments
      const enrollmentsQuery = query(
        collection(db, 'student_enrollments'),
        where('studentId', '==', id)
      );
      const enrollmentSnap = await getDocs(enrollmentsQuery);
      const enrollmentDeletes = enrollmentSnap.docs.map(d => 
        deleteDoc(doc(db, 'student_enrollments', d.id))
      );
      await Promise.all(enrollmentDeletes);
      console.log(`Deleted ${enrollmentSnap.size} enrollment records`);
      
      // 2. Delete all marks
      const marksQuery = query(
        collection(db, 'marks'),
        where('studentId', '==', id)
      );
      const marksSnap = await getDocs(marksQuery);
      const markDeletes = marksSnap.docs.map(d => 
        deleteDoc(doc(db, 'marks', d.id))
      );
      await Promise.all(markDeletes);
      console.log(`Deleted ${marksSnap.size} mark records`);
      
      // 3. Delete student record
      await deleteDoc(doc(db, 'students', id));
      console.log('Deleted student record');
      
      alert(
        `✅ Student permanently deleted\n\n` +
        `Removed:\n` +
        `• Student record\n` +
        `• ${enrollmentSnap.size} enrollment records\n` +
        `• ${marksSnap.size} mark records\n\n` +
        `Page will refresh...`
      );
      
      window.location.reload();
      
    } catch (error: any) {
      console.error('Permanent delete failed:', error);
      alert(
        `❌ Failed to delete student\n\n` +
        `Error: ${error?.message || 'Unknown error'}`
      );
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-cyan-400 mt-4">Filter Students</h2>
        <button className="btn btn-secondary" onClick={()=>setShowFew(v=>!v)}>
          {showFew ? 'Show all' : 'Show first 10'}
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-5">
        <Select 
          value={filterClassId} 
          onChange={setFilterClassId} 
          options={[{value:'',label:'All classes'}, ...classOptions]} 
          placeholder="Class filter" 
        />
        <input 
          className="input" 
          value={search} 
          onChange={e=>setSearch(e.target.value)} 
          placeholder="Search..." 
        />
        <div>
          <label className="block text-xs opacity-70 mb-1">Year</label>
          <select className="input" value={selectedYear} onChange={e=>setSelectedYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs opacity-70 mb-1">Term</label>
          <select className="input" value={selectedTerm} onChange={e=>setSelectedTerm(Number(e.target.value) as 1|2|3)}>
            <option value={1}>Term 1</option>
            <option value={2}>Term 2</option>
            <option value={3}>Term 3</option>
          </select>
        </div>
        <div className="pill self-end">Matches: {filtered.length}</div>
      </div>

      <div className="mt-2 p-3 bg-yellow-900/20 border border-yellow-600/30 rounded text-sm">
        <strong>Delete Options:</strong>
        <ul className="mt-1 ml-4 list-disc text-xs">
          <li><strong>Trash icon:</strong> Remove from {selectedYear} only (keeps other years)</li>
          <li><strong>Permanent delete:</strong> Available in student details (deletes everything)</li>
        </ul>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Class</th>
              <th className="px-4 py-2 text-left">Assessment #</th>
              <th className="px-4 py-2 text-left">Admission #</th>
              <th className="px-4 py-2 text-left">Gender</th>
              <th className="px-4 py-2 text-left">Guardian</th>
              <th className="px-4 py-2 text-left">Phone</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {show.map((s:any)=>(
              <tr key={s.id} className="border-t hover:bg-white/5">
                {editSid !== s.id ? (
                  <>
                    <td className="px-4 py-2">{s.name}</td>
                    <td className="px-4 py-2">{classes.find(c=>c.id===s.classId)?.name || '-'}</td>
                    <td className="px-4 py-2">{s.assessmentNo || '-'}</td>
                    <td className="px-4 py-2">{s.admissionNo || '-'}</td>
                    <td className="px-4 py-2">{s.gender || '-'}</td>
                    <td className="px-4 py-2">{s.parentName || '-'}</td>
                    <td className="px-4 py-2">{s.parentPhone || '-'}</td>
                    <td className="px-4 py-2 space-x-2">
                      <button 
                        className="icon-btn" 
                        title="Edit" 
                        onClick={()=>beginEditStudent(s)}
                        disabled={deleting === s.id}
                      >
                        <Pencil size={16}/>
                      </button>
                      <button 
                        className="icon-btn danger" 
                        title={`Remove from ${selectedYear}`}
                        onClick={()=>onDeleteFromYear(s.id, s.name)}
                        disabled={deleting === s.id}
                        style={{
                          opacity: deleting === s.id ? 0.5 : 1,
                          cursor: deleting === s.id ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {deleting === s.id ? '...' : <Trash2 size={16}/>}
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2">
                      <input 
                        className="input" 
                        value={editStudent.name} 
                        onChange={e=>setEditStudent((p:any)=>({...p,name:e.target.value}))} 
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Select 
                        value={editStudent.classId} 
                        onChange={(v)=>setEditStudent((p:any)=>({...p,classId:v}))} 
                        options={classOptions} 
                        placeholder="Class" 
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input 
                        className="input" 
                        value={editStudent.assessmentNo} 
                        onChange={e=>setEditStudent((p:any)=>({...p,assessmentNo:e.target.value}))} 
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input 
                        className="input" 
                        value={editStudent.admissionNo} 
                        onChange={e=>setEditStudent((p:any)=>({...p,admissionNo:e.target.value}))} 
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select 
                        className="input"
                        value={editStudent.gender} 
                        onChange={e=>setEditStudent((p:any)=>({...p,gender:e.target.value}))}
                      >
                        <option value="">Select</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input 
                        className="input" 
                        value={editStudent.parentName} 
                        onChange={e=>setEditStudent((p:any)=>({...p,parentName:e.target.value}))} 
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input 
                        className="input" 
                        value={editStudent.parentPhone} 
                        onChange={e=>setEditStudent((p:any)=>({...p,parentPhone:e.target.value}))} 
                      />
                    </td>
                    <td className="px-4 py-2 space-x-2">
                      <button className="btn btn-primary btn-sm" onClick={()=>saveStudent(s.id)}>Save</button>
                      <button className="btn btn-secondary btn-sm" onClick={()=>setEditSid(null)}>Cancel</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {show.length === 0 && (
              <tr><td className="px-4 py-6 text-center opacity-70" colSpan={8}>No students match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 10 && (
        <div className="mt-4 text-center text-sm opacity-70">
          Showing {show.length} of {filtered.length} students
        </div>
      )}
    </section>
  );
}