import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useSchoolData } from '../contexts/SchoolDataContext';
import { collection, addDoc, setDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

type ImportRow = {
  fullName: string;
  yearGroup: string;
  assessmentNo?: string;
  gender?: string;
  admissionDate?: string;
  yearOfBirth?: number;
  birthCertNo?: string;
  previousSchool?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  parentArea?: string;
  house?: string;
  tutor?: string;
};

export default function ImportStudents() {
  const { classes, currentYear, currentTerm } = useSchoolData();
  
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  // Download template
  const downloadTemplate = () => {
    const template = [
      {
        'Full Name': 'John Doe',
        'Year Group': 'Year 1',
        'Assessment Number': 'A001',
        'Gender': 'Male',
        'Admission Date': '2025-01-15',
        'Year of Birth': 2015,
        'Birth Cert Number': 'BC123456',
        'Previous School': 'ABC Primary',
        'Parent Name': 'Jane Doe',
        'Parent Phone': '+254712345678',
        'Parent Email': 'jane@example.com',
        'Parent Area': 'Nairobi',
        'House': 'Red House',
        'Tutor': 'Mr. Smith'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 25 }, // Full Name
      { wch: 15 }, // Year Group
      { wch: 18 }, // Assessment Number
      { wch: 10 }, // Gender
      { wch: 15 }, // Admission Date
      { wch: 15 }, // Year of Birth
      { wch: 18 }, // Birth Cert
      { wch: 20 }, // Previous School
      { wch: 25 }, // Parent Name
      { wch: 18 }, // Parent Phone
      { wch: 25 }, // Parent Email
      { wch: 20 }, // Parent Area
      { wch: 15 }, // House
      { wch: 15 }  // Tutor
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students Template');
    XLSX.writeFile(wb, 'students_import_template.xlsx');
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setResults(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        const parsed: ImportRow[] = jsonData.map((row: any) => ({
          fullName: String(row['Full Name'] || row['fullName'] || '').trim(),
          yearGroup: String(row['Year Group'] || row['yearGroup'] || '').trim(),
          assessmentNo: String(row['Assessment Number'] || row['assessmentNo'] || '').trim() || undefined,
          gender: String(row['Gender'] || row['gender'] || '').trim() || undefined,
          admissionDate: row['Admission Date'] || row['admissionDate'] || undefined,
          yearOfBirth: row['Year of Birth'] || row['yearOfBirth'] || undefined,
          birthCertNo: String(row['Birth Cert Number'] || row['birthCertNo'] || '').trim() || undefined,
          previousSchool: String(row['Previous School'] || row['previousSchool'] || '').trim() || undefined,
          parentName: String(row['Parent Name'] || row['parentName'] || '').trim() || undefined,
          parentPhone: String(row['Parent Phone'] || row['parentPhone'] || '').trim() || undefined,
          parentEmail: String(row['Parent Email'] || row['parentEmail'] || '').trim() || undefined,
          parentArea: String(row['Parent Area'] || row['parentArea'] || '').trim() || undefined,
          house: String(row['House'] || row['house'] || '').trim() || undefined,
          tutor: String(row['Tutor'] || row['tutor'] || '').trim() || undefined,
        }));

        setPreviewData(parsed.filter(row => row.fullName)); // Only include rows with names
      } catch (error: any) {
        alert(`Failed to read file: ${error.message}`);
      }
    };

    reader.readAsArrayBuffer(uploadedFile);
  };

  // Split name into parts
  const splitName = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 0) return { firstName: '', middleName: '', surname: '' };
    if (parts.length === 1) return { firstName: parts[0], middleName: '', surname: '' };
    if (parts.length === 2) return { firstName: parts[0], middleName: '', surname: parts[1] };
    return { firstName: parts[0], middleName: parts.slice(1, -1).join(' '), surname: parts[parts.length - 1] };
  };

  // Import students
  const importStudents = async () => {
    if (previewData.length === 0) {
      alert('No data to import');
      return;
    }

    const confirmed = window.confirm(
      `Import ${previewData.length} students for ${currentYear} (all 3 terms)?\n\n` +
      `This will create:\n` +
      `• ${previewData.length} student records\n` +
      `• ${previewData.length * 3} enrollment records (Terms 1, 2, 3)\n\n` +
      `Continue?`
    );

    if (!confirmed) return;

    setImporting(true);
    const errors: string[] = [];
    let successCount = 0;
    let failCount = 0;

    try {
      for (let i = 0; i < previewData.length; i++) {
        const row = previewData[i];
        
        try {
          // Validate required fields
          if (!row.fullName) {
            errors.push(`Row ${i + 2}: Missing full name`);
            failCount++;
            continue;
          }

          if (!row.yearGroup) {
            errors.push(`Row ${i + 2}: Missing year group for ${row.fullName}`);
            failCount++;
            continue;
          }

          // Find or create class ID
          const existingClass = classes.find(c => 
            c.name.toLowerCase() === row.yearGroup.toLowerCase()
          );
          
          let classId = existingClass?.id;
          
          if (!classId) {
            // Create new class if it doesn't exist
            const newClassId = row.yearGroup.toLowerCase().replace(/\s+/g, '-');
            await setDoc(doc(db, 'classes', newClassId), {
              name: row.yearGroup,
              capacity: 40,
              createdAt: Date.now(),
              createdBy: 'import_script'
            });
            classId = newClassId;
          }

          // Split name
          const { firstName, middleName, surname } = splitName(row.fullName);

          // Create student record
          const studentData = {
            firstName,
            middleName,
            surname,
            name: row.fullName,
            classId,
            yearGroup: row.yearGroup,
            assessmentNo: row.assessmentNo || '',
            gender: row.gender || '',
            admissionDate: row.admissionDate || '',
            yearOfBirth: row.yearOfBirth || null,
            birthCertNo: row.birthCertNo || '',
            previousSchool: row.previousSchool || '',
            parentName: row.parentName || '',
            parentPhone: row.parentPhone || '',
            parentEmail: row.parentEmail || '',
            parentArea: row.parentArea || '',
            house: row.house || '',
            tutor: row.tutor || '',
            createdAt: Date.now(),
            importedAt: Date.now()
          };

          const studentRef = await addDoc(collection(db, 'students'), studentData);

          // Create enrollment records for all 3 terms
          for (let term = 1; term <= 3; term++) {
            await setDoc(doc(db, 'student_enrollments', `${studentRef.id}_${currentYear}_${term}`), {
              studentId: studentRef.id,
              classId,
              year: currentYear,
              term,
              createdAt: Date.now(),
              importedAt: Date.now()
            });
          }

          successCount++;
        } catch (error: any) {
          errors.push(`Row ${i + 2} (${row.fullName}): ${error.message}`);
          failCount++;
        }
      }

      setResults({ success: successCount, failed: failCount, errors });
      
      if (successCount > 0) {
        alert(
          `Import Complete!\n\n` +
          `✅ Success: ${successCount} students\n` +
          `❌ Failed: ${failCount} students\n\n` +
          `${successCount * 3} enrollment records created`
        );
      }

    } catch (error: any) {
      alert(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-2xl font-bold text-cyan-400 mb-2">Import Students from Excel</h2>
        <p className="text-sm opacity-70 mb-6">
          Import multiple students at once using an Excel file. Students will be enrolled in {currentYear} for all 3 terms.
        </p>

        {/* Step 1: Download Template */}
        <div className="space-y-4">
          <div className="flex items-start gap-4 p-4 bg-blue-900/20 border border-blue-600/30 rounded-lg">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
              1
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-2">Download Template</h3>
              <p className="text-sm opacity-80 mb-3">
                Download the Excel template with all required columns and sample data.
              </p>
              <button 
                className="btn btn-secondary flex items-center gap-2"
                onClick={downloadTemplate}
              >
                <Download size={16} />
                Download Template
              </button>
            </div>
          </div>

          {/* Step 2: Fill Template */}
          <div className="flex items-start gap-4 p-4 bg-purple-900/20 border border-purple-600/30 rounded-lg">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold">
              2
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-2">Fill in Student Data</h3>
              <div className="text-sm opacity-80 space-y-2">
                <p><strong>Required fields:</strong></p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Full Name</li>
                  <li>Year Group (e.g., Year 1, Year 2, Form 1, etc.)</li>
                </ul>
                <p className="mt-3"><strong>Optional fields:</strong></p>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Assessment Number, Gender, Admission Date</li>
                  <li>Year of Birth, Birth Certificate Number</li>
                  <li>Parent Name, Phone, Email, Area</li>
                  <li>House, Tutor, Previous School</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Step 3: Upload File */}
          <div className="flex items-start gap-4 p-4 bg-green-900/20 border border-green-600/30 rounded-lg">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center font-bold">
              3
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-2">Upload Filled Template</h3>
              <p className="text-sm opacity-80 mb-3">
                Select your completed Excel file to preview and import students.
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="block w-full text-sm
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-cyan-600 file:text-white
                  hover:file:bg-cyan-700
                  file:cursor-pointer cursor-pointer"
              />
              {file && (
                <p className="mt-2 text-sm text-green-400">
                  ✓ {file.name} loaded
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Data */}
      {previewData.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold">Preview ({previewData.length} students)</h3>
            <button
              className="btn btn-primary flex items-center gap-2"
              onClick={importStudents}
              disabled={importing}
            >
              <Upload size={16} />
              {importing ? 'Importing...' : `Import ${previewData.length} Students`}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Full Name</th>
                  <th className="px-3 py-2 text-left">Year Group</th>
                  <th className="px-3 py-2 text-left">Assessment #</th>
                  <th className="px-3 py-2 text-left">Gender</th>
                  <th className="px-3 py-2 text-left">Parent Name</th>
                  <th className="px-3 py-2 text-left">Parent Phone</th>
                  <th className="px-3 py-2 text-left">House</th>
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, i) => (
                  <tr key={i} className="border-t hover:bg-white/5">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2">{row.fullName}</td>
                    <td className="px-3 py-2">{row.yearGroup}</td>
                    <td className="px-3 py-2">{row.assessmentNo || '-'}</td>
                    <td className="px-3 py-2">{row.gender || '-'}</td>
                    <td className="px-3 py-2">{row.parentName || '-'}</td>
                    <td className="px-3 py-2">{row.parentPhone || '-'}</td>
                    <td className="px-3 py-2">{row.house || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="card p-6">
          <h3 className="text-xl font-semibold mb-4">Import Results</h3>
          
          <div className="grid gap-4 sm:grid-cols-2 mb-6">
            <div className="flex items-center gap-3 p-4 bg-green-900/20 border border-green-600/30 rounded-lg">
              <CheckCircle2 size={32} className="text-green-400" />
              <div>
                <div className="text-2xl font-bold">{results.success}</div>
                <div className="text-sm opacity-70">Students Imported</div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-4 bg-red-900/20 border border-red-600/30 rounded-lg">
              <AlertCircle size={32} className="text-red-400" />
              <div>
                <div className="text-2xl font-bold">{results.failed}</div>
                <div className="text-sm opacity-70">Failed</div>
              </div>
            </div>
          </div>

          {results.errors.length > 0 && (
            <div className="p-4 bg-red-900/20 border border-red-600/30 rounded-lg">
              <h4 className="font-semibold mb-2 text-red-300">Errors:</h4>
              <ul className="text-sm space-y-1 max-h-60 overflow-y-auto">
                {results.errors.map((error, i) => (
                  <li key={i} className="opacity-80">• {error}</li>
                ))}
              </ul>
            </div>
          )}

          {results.success > 0 && (
            <div className="mt-4 p-4 bg-blue-900/20 border border-blue-600/30 rounded-lg text-sm">
              <strong>Next steps:</strong>
              <ul className="mt-2 ml-4 list-disc space-y-1 opacity-80">
                <li>Go to Students → View Students to see imported students</li>
                <li>Check that all students are in the correct year groups</li>
                <li>Add marks/grades as needed in Academics</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}