// src/components/layout/Sidebar.tsx
import { NavLink } from 'react-router-dom'
import {
  LayoutGrid, Users, Star, GraduationCap, DollarSign, MessageSquare,
  Settings as Gear, UserCog
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

type NavItem = {
  to: string
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  color: string
}

const nav: NavItem[] = [
  { to: '/',               label: 'Dashboard',      icon: LayoutGrid,    color: '#58a6ff' }, // blue grid/chart
  { to: '/students',       label: 'Students',       icon: Users,         color: '#39d353' }, // green person/group
  { to: '/teachers',       label: 'Teachers',       icon: Star,          color: '#ff7b72' }, // red star
  { to: '/academics',      label: 'Academics',      icon: GraduationCap, color: '#a5a5ff' }, // purple cap
  { to: '/finance',        label: 'Finance',        icon: DollarSign,    color: '#56d364' }, // green dollar
  { to: '/communication',  label: 'Communication',  icon: MessageSquare, color: '#ffa657' }, // orange chat
  { to: '/users',          label: 'Users',          icon: UserCog,       color: '#f85149' }, // red user (admin area)
  // REMOVED: Firebase Status / Firebase Test
  { to: '/settings',       label: 'Settings',       icon: Gear,          color: '#8b949e' }, // gray gear
]

export default function Sidebar() {
  const { profile } = useAuth()

  return (
    <div className="sidebar flex h-full flex-col">
      {/* Brand */}
      <div className="px-4 py-4 flex items-center gap-3 brand">
        <div className="logo-bubble">ET</div>
        <div>
          <div className="font-semibold">EduTeck</div>
          <div className="text-xs opacity-70">School Management System</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="px-2 space-y-1">
        {nav.map(({ to, label, icon: Icon, color }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}
          >
            <span className="relative flex items-center gap-3">
              <span className="icon-wrap">
                <Icon className="h-4 w-4" style={{ color }} aria-hidden />
              </span>
              <span className="label">{label}</span>
            </span>
          </NavLink>
        ))}
      </nav>

      {/* Footer (signed-in identity) */}
      <div className="mt-auto px-4 py-4 text-xs opacity-80 sidebar-foot">
        <div className="truncate">{profile?.displayName || 'Signed in'}</div>
        <div className="truncate">{profile?.email || ''}</div>
      </div>
    </div>
  )
}
