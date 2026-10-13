import type { ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

export function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const location = useLocation()
  const active = location.pathname === to
  return <Link className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`} to={to}>{children}</Link>
}

export function PageLayout({ children }: { client?: unknown; children?: ReactNode }) {
  return <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">{children ?? <Outlet />}</div>
}
