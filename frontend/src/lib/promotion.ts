// src/lib/promotion.ts
import { collection, doc, getDocs, writeBatch, setDoc, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

export type PromotionMap = Record<string, string>;

export type StudentRow = {
  id: string;
  name: string;
  classId: string;
  assessmentNo?: string;
  gender?: string;
};

export type PromotionPreview = {
  fromYear: number;
  toYear: number;
  groups: Array<{
    sourceClassId: string;
    targetClassId: string | null;
    students: StudentRow[];
  }>;
  total: number;
};

export async function previewPromotion(args: {
  fromYear: number;
  toYear: number;
  classMap: PromotionMap;
  sourceFilter?: string[];
}) : Promise<PromotionPreview> {
  // Get enrollments for the FROM year to see which students are currently enrolled
  const enrollmentSnap = await getDocs(
    query(collection(db, 'student_enrollments'),
      where('year', '==', args.fromYear))
  );

  const enrolledStudentIds = new Set<string>();
  const currentClassMap = new Map<string, string>();

  enrollmentSnap.forEach(d => {
    const data = d.data();
    if (data.studentId && data.classId) {
      enrolledStudentIds.add(data.studentId);
      currentClassMap.set(data.studentId, data.classId);
    }
  });

  // Get all student records
  const snap = await getDocs(collection(db, 'students'));
  const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const groupsMap: Record<string, StudentRow[]> = {};
  
  for (const s of rows) {
    // Only include students who are enrolled in the FROM year
    if (!enrolledStudentIds.has(s.id)) continue;
    
    // Use the enrollment class, not the base classId
    const src = currentClassMap.get(s.id) || String(s.classId || '');
    
    // Apply source filter if provided
    if (args.sourceFilter && !args.sourceFilter.includes(src)) continue;
    
    (groupsMap[src] ||= []).push({
      id: s.id,
      name: String(s.name || [s.firstName, s.middleName, s.surname].filter(Boolean).join(' ') || '—'),
      classId: src,
      assessmentNo: s.assessmentNo,
      gender: s.gender,
    });
  }

  const groups: PromotionPreview['groups'] = [];
  let total = 0;
  
  for (const [sourceClassId, students] of Object.entries(groupsMap)) {
    const targetClassId = args.classMap[sourceClassId] ?? null;
    groups.push({ sourceClassId, targetClassId, students });
    total += students.length;
  }

  groups.sort((a,b)=>a.sourceClassId.localeCompare(b.sourceClassId));
  groups.forEach(g => g.students.sort((a,b)=>a.name.localeCompare(b.name, undefined, { numeric: true })));

  return { fromYear: args.fromYear, toYear: args.toYear, groups, total };
}

export type PromotionSelection = {
  studentId: string;
  sourceClassId: string;
  targetClassId: string | null;
  archive?: boolean;
};

export async function runPromotionWithSelection(args: {
  fromYear: number;
  toYear: number;
  selections: PromotionSelection[];
  requestedByUid?: string | null;
  updateStudentClassNow?: boolean;
}) : Promise<{ promoted: number; archived: number; logId: string }> {
  const { fromYear, toYear, selections } = args;

  const batch = writeBatch(db);
  let promoted = 0;
  let archived = 0;

  for (const sel of selections) {
    if (sel.archive || !sel.targetClassId) {
      // Archive the student
      archived += 1;
      batch.set(doc(db, 'archives', `${sel.studentId}_${toYear}`), {
        studentId: sel.studentId,
        fromYear,
        toYear,
        archivedAt: Date.now(),
        reason: 'graduated_or_left',
      }, { merge: true });
      continue;
    }

    // ✅ KEY FIX: Create enrollment records for ALL THREE TERMS in the new year
    for (let term = 1; term <= 3; term++) {
      const enrId = `${sel.studentId}_${toYear}_${term}`;
      batch.set(doc(db, 'student_enrollments', enrId), {
        studentId: sel.studentId,
        classId: sel.targetClassId,
        year: toYear,
        term,
        promotedFromYear: fromYear,
        createdAt: Date.now()
      }, { merge: true });
    }

    // Optionally update the student's base classId
    if (args.updateStudentClassNow !== false) {
      batch.set(doc(db, 'students', sel.studentId), { 
        classId: sel.targetClassId 
      }, { merge: true });
    }

    promoted += 1;
  }

  // Create promotion log
  const logId = `${fromYear}_to_${toYear}_${Date.now()}`;
  batch.set(doc(db, 'promotions', logId), {
    fromYear, 
    toYear, 
    terms: [1, 2, 3], // Indicate all terms were created
    requestedByUid: args.requestedByUid || null,
    createdAt: Date.now(),
    stats: { promoted, archived },
  });

  await batch.commit();
  
  console.log(`✅ Promotion complete: ${promoted} students promoted to ${toYear} (all 3 terms), ${archived} archived`);
  
  return { promoted, archived, logId };
}

export function rankPredictMap(classes: Array<{id:string; name:string}>): PromotionMap {
  const byName: Record<string, {id:string; name:string}> = {};
  classes.forEach(c => { byName[c.name] = c; });
  
  const map: PromotionMap = {};
  
  classes.forEach(src => {
    const m = src.name.match(/(\d+)/);
    if (m) {
      const currentGrade = Number(m[1]);
      const nextGrade = currentGrade + 1;
      const next = src.name.replace(String(m[1]), String(nextGrade));
      map[src.id] = byName[next]?.id || src.id; // If no next grade, keep in same class
    } else {
      map[src.id] = src.id; // If no number in name, keep in same class
    }
  });
  
  return map;
}