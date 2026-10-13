import { useEffect, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

const navigation = [
  ['/items', 'Productos'],
  ['/variants', 'Variantes'],
  ['/prices', 'Precios'],
  ['/suppliers', 'Proveedores'],
  ['/doctypes', 'DocTypes'],
  ['/settings', 'Conexión'],
] as const

export function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const location = useLocation()
  const active = location.pathname === to
  return <Link className={`app-nav-link whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${active ? 'app-nav-link-active bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`} aria-current={active ? 'page' : undefined} to={to}>{children}</Link>
}

export function MobileNavigation({ onLock }: { onLock: () => void }) {
  const location = useLocation()
  const [open, setOpen] = useState(false)

  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return <div className={`mobile-navigation${open ? ' mobile-navigation-open' : ''}`}>
    <div className="mobile-navigation-bar">
      <button className="menu-button" type="button" aria-expanded={open} aria-controls="mobile-navigation-menu" onClick={() => setOpen((current) => !current)}>
        <span aria-hidden="true">☰</span>
        <span>Menú</span>
      </button>
      <span className="mobile-navigation-title">Mauricio</span>
      <button className="menu-lock-button" type="button" onClick={onLock}>Bloquear</button>
    </div>
    {open && <nav id="mobile-navigation-menu" className="mobile-navigation-menu" aria-label="Navegación principal">
      {navigation.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
    </nav>}
  </div>
}

export function PageLayout({ children }: { client?: unknown; children?: ReactNode }) {
  return <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">{children ?? <Outlet />}</div>
}
