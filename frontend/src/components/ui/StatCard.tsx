import { ReactNode } from 'react'

export function StatCard({
  title, value, icon, hint
}: { title: string, value: ReactNode, icon?: ReactNode, hint?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm opacity-80">{title}</div>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs opacity-70">{hint}</div>}
    </div>
  )
}
