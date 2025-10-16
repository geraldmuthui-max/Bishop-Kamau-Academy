import { Route, Routes } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './pages/Dashboard'
import Students from './pages/Students'
import Teachers from './pages/Teachers'
import Academics from './pages/Academics'
import Finance from './pages/Finance'
import Communication from './pages/Communication'
import Users from './pages/Users'
import Settings from './pages/Settings'
import FirebaseStatus from './pages/FirebaseStatus'   // <-- ADD THIS
import { SchoolDataProvider } from './contexts/SchoolDataContext'
import { AuthProvider } from './contexts/AuthContext'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import { RequireAuth, RedirectIfAuthed } from './routes/guards'
import RequireApproved from './components/auth/RequireApproved'

export default function App() {
  return (
    <AuthProvider>
      <SchoolDataProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
          <Route path="/signup" element={<RedirectIfAuthed><Signup /></RedirectIfAuthed>} />

          {/* Protected app (must be signed in AND approved) */}
          <Route element={
            <RequireAuth>
              <RequireApproved>
                <AppLayout />
              </RequireApproved>
            </RequireAuth>
          }>
            <Route index element={<Dashboard />} />
            <Route path="students" element={<Students />} />
            <Route path="teachers" element={<Teachers />} />
            <Route path="academics" element={<Academics />} />
            <Route path="finance" element={<Finance />} />
            <Route path="communication" element={<Communication />} />
            <Route path="users" element={<Users />} />
            <Route path="firebase-status" element={<FirebaseStatus />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
        </Routes>
      </SchoolDataProvider>
    </AuthProvider>
  )
}
