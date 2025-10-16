import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

export default function AppLayout() {
  return (
    <div className="flex h-screen">
      {/* sidebar column */}
      <aside className="w-64 shrink-0 border-r border-white/10 bg-sidebar">
        <Sidebar />
      </aside>

      {/* main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* keep sticky here; no border line */}
        <header className="sticky top-0 z-40 bg-[#0a0a0a]/80 backdrop-blur">
          {/* If you DO want a subtle separator, swap the class above for:
              "sticky top-0 z-40 bg-[#0a0a0a]/80 backdrop-blur shadow-[inset_0_-1px_0_0_rgba(255,255,255,.06)]"
          */}
          <Header />
        </header>

        {/* only the center pane scrolls */}
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl p-4">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
