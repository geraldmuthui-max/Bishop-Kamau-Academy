// Shared backend helpers (token-auth) used by all subpages
import { getAuth } from 'firebase/auth';

const API_BASE =
  ((import.meta as any).env?.VITE_API_URL
    ? String((import.meta as any).env.VITE_API_URL).replace(/\/$/, '')
    : 'http://localhost:4001') + '/api';

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAuth().currentUser?.getIdToken?.(true);
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `HTTP ${res.status}`);
  }
  const ct = res.headers.get('content-type') || '';
  return (ct.includes('application/json') ? res.json() : (null as any)) as T;
}

export const apiClasses = {
  update: (id: string, body: any) =>
    apiFetch<{ ok:boolean; data:any }>(`/classes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }).then(r => r.data),
  delete: (id: string) =>
    apiFetch<{ ok:boolean }>(`/classes/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then(r => r.ok),
};

export const apiSubjects = {
  update: (id: string, body: any) =>
    apiFetch<{ ok:boolean; data:any }>(`/subjects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }).then(r => r.data),
  delete: (id: string) =>
    apiFetch<{ ok:boolean }>(`/subjects/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then(r => r.ok),
};

export const apiTeachers = {
  update: (id: string, body: any) =>
    apiFetch<{ ok:boolean; data:any }>(`/teachers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }).then(r => r.data),
  delete: (id: string) =>
    apiFetch<{ ok:boolean }>(`/teachers/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then(r => r.ok),
};

export const apiStudents = {
  list: (classId?: string) =>
    apiFetch<{ ok: boolean; data: any[] }>(
      `/students${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`
    ).then(r => r.data),
  
  get: (id: string) =>
    apiFetch<{ ok: boolean; data: any }>(`/students/${encodeURIComponent(id)}`)
      .then(r => r.data),
  
  update: (id: string, body: any) =>
    apiFetch<{ ok:boolean; data:any }>(`/students/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }).then(r => r.data),
  
  delete: (id: string) =>
    apiFetch<{ ok:boolean }>(`/students/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then(r => r.ok),
  
  // Backwards compatibility with /learners endpoint
  deleteLearner: (id: string) =>
    apiFetch<{ ok:boolean }>(`/learners/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then(r => r.ok),
};

export const apiMarks = {
  list: (params: { classId: string; subjectId: string; year: number; term: 1|2|3; exam: string }) => {
    const q = new URLSearchParams({
      classId: params.classId,
      subjectId: params.subjectId,
      year: String(params.year),
      term: String(params.term),
      exam: params.exam,
    });
    return apiFetch<{ ok:boolean; data:any[] }>(`/marks?${q.toString()}`).then(r => r.data);
  },
  
  upsert: (body: any) =>
    apiFetch<{ ok:boolean; data:any }>('/marks', {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(r => r.data),
};