import { Pencil, Trash2 } from 'lucide-react';
import { useSchoolData } from '../../contexts/SchoolDataContext';
import { apiTeachers } from './api';

export default function Teachers() {
  const { teachers, updateTeacher, deleteTeacher } = useSchoolData();

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-cyan-400 mt-4">Teachers</h2>
      </div>
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Department</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t: any) => (
              <tr key={t.id} className="border-t">
                <td className="px-4 py-2">{t.name}</td>
                <td className="px-4 py-2">{t.department || '-'}</td>
                <td className="px-4 py-2 capitalize">{t.status || 'active'}</td>
                <td className="px-4 py-2 space-x-2">
                  <button
                    className="icon-btn"
                    title="Toggle Status"
                    onClick={async () => {
                      const next = t.status === 'left' ? 'active' : 'left';
                      try { await apiTeachers.update(t.id, { status: next }); }
                      catch { await updateTeacher?.(t.id, { status: next }); }
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-btn danger"
                    title="Delete"
                    onClick={async () => {
                      if (!confirm('Delete teacher?')) return;
                      try { await apiTeachers.delete(t.id); }
                      catch { await deleteTeacher?.(t.id); }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {teachers.length === 0 && (
              <tr><td className="px-4 py-6 text-center opacity-70" colSpan={4}>No teachers</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
