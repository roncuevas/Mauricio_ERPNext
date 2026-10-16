import { useEffect, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { IconButton } from './ui'
import { useTheme } from './theme-provider'

const navigation = [
  ['/pos', 'POS'],
  ['/pos/turnos', 'Turnos'],
  ['/items', 'Productos'],
  ['/variants', 'Variantes'],
  ['/prices', 'Precios'],
  ['/stock', 'Inventario'],
  ['/suppliers', 'Proveedores'],
  ['/doctypes', 'DocTypes'],
  ['/settings', 'Configuración'],
] as const

export function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const location = useLocation()
  const active = location.pathname === to
  return <Link className={`app-nav-link whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${active ? 'app-nav-link-active bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`} aria-current={active ? 'page' : undefined} to={to}>{children}</Link>
}

export function MobileNavigation({ onLock }: { onLock: () => void }) {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const currentPage = navigation.find(([to]) => location.pathname === to)?.[1] ?? 'Mauricio'

  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return <div className={`mobile-navigation${open ? ' mobile-navigation-open' : ''}`}>
    <div className="mobile-navigation-bar">
      <div className="mobile-navigation-brand">
        <img className="mobile-brand-logo" src="/mauricio-logo-cropped.png" alt="Mauricio" />
        <div className="mobile-navigation-heading">
          <strong>{currentPage}</strong>
          <span>Mauricio</span>
        </div>
      </div>
      <div className="mobile-navigation-actions">
        <button className="menu-lock-button" type="button" onClick={onLock}>Bloquear</button>
        <button className="menu-button" type="button" aria-expanded={open} aria-controls="mobile-navigation-menu" onClick={() => setOpen((current) => !current)}>
          <span className="menu-button-icon" aria-hidden="true">{open ? '×' : '☰'}</span>
          <span>Menú</span>
        </button>
      </div>
    </div>
    {open && <nav id="mobile-navigation-menu" className="mobile-navigation-menu" aria-label="Navegación principal">
      <div className="mobile-navigation-menu-heading"><span>Ir a</span><small>Sección actual: {currentPage}</small></div>
      {navigation.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
    </nav>}
  </div>
}

export function ThemeModeToggle() {
  const { colorMode, toggleColorMode } = useTheme()
  const label = colorMode === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'
  return <IconButton className="app-sidebar-theme-toggle" type="button" label={label} title={label} onClick={toggleColorMode} icon="☀" />
}

export function PageLayout({ children }: { client?: unknown; children?: ReactNode }) {
  return <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">{children ?? <Outlet />}</div>
}
