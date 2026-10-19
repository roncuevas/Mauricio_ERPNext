import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { IconButton } from './ui'
import { useTheme } from './theme-provider'
import { featureFlags } from '../lib/feature-flags'
import { WorkspaceNavigation } from './workspace-navigation'
import { LanguageSelector } from './language-selector'
import { useTranslation } from 'react-i18next'

type NavigationItem = { to: string; label: string }
type NavigationGroup = { id: string; label: string; icon: string; landing: string; items: NavigationItem[] }

const navigationGroups: NavigationGroup[] = [
  { id: 'operation', label: 'Operación', icon: '▣', landing: '/pos', items: [{ to: '/pos', label: 'POS' }, { to: '/pos/ventas', label: 'Ventas del día' }, { to: '/pos/turnos', label: 'Turnos' }, { to: '/pos/cotizaciones', label: 'Cotizaciones' }] },
  { id: 'catalog', label: 'Catálogo', icon: '▦', landing: '/items', items: [{ to: '/items', label: 'Productos' }, { to: '/variants', label: 'Variantes' }, { to: '/prices', label: 'Precios' }] },
  { id: 'inventory', label: 'Inventario', icon: '◫', landing: '/stock', items: [{ to: '/stock', label: 'Inventario' }, { to: '/suppliers', label: 'Proveedores' }] },
  { id: 'administration', label: 'Administración', icon: '⚙', landing: '/settings', items: [{ to: '/settings', label: 'Configuración' }, { to: '/doctypes', label: 'DocTypes' }] },
]

const navigationStorageKey = 'mauricio-erpnext:open-navigation-groups'

function routeMatches(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`)
}

function visibleGroups() {
  return navigationGroups.map((group) => ({ ...group, items: group.items.filter((item) => item.to !== '/pos/cotizaciones' || featureFlags.quotationsView) })).filter((group) => group.items.length)
}

function navigationItemKey(label: string) {
  const keys: Record<string, string> = { 'Ventas del día': 'dailySales', Turnos: 'shifts', Cotizaciones: 'quotations', Productos: 'products', Variantes: 'variants', Precios: 'prices', Inventario: 'stock', Proveedores: 'suppliers', Configuración: 'settings', DocTypes: 'doctypes' }
  return keys[label] ?? label
}

export function NavLink({ to, children, className = '', ariaLabel }: { to: string; children: ReactNode; className?: string; ariaLabel?: string }) {
  const location = useLocation()
  const active = routeMatches(location.pathname, to)
  return <Link className={`app-nav-link whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${active ? 'app-nav-link-active bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'} ${className}`.trim()} aria-current={active ? 'page' : undefined} aria-label={ariaLabel} to={to}>{children}</Link>
}

function NavigationGroups({ mobile = false, collapsed = false }: { mobile?: boolean; collapsed?: boolean }) {
  const { t } = useTranslation()
  const translate = (key: string, options?: Record<string, unknown>) => String((t as unknown as (key: string, options?: Record<string, unknown>) => unknown)(key, options))
  const location = useLocation()
  const groups = useMemo(visibleGroups, [])
  const activeGroup = groups.find((group) => group.items.some((item) => routeMatches(location.pathname, item.to)))?.id ?? null
  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(navigationStorageKey) ?? '[]')
      return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === 'string') : []
    } catch { return [] }
  })

  useEffect(() => {
    if (!activeGroup || openGroups.includes(activeGroup)) return
    setOpenGroups((current) => [...current, activeGroup])
  }, [activeGroup, openGroups])

  useEffect(() => {
    localStorage.setItem(navigationStorageKey, JSON.stringify(openGroups))
  }, [openGroups])

  function toggleGroup(id: string) {
    setOpenGroups((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  return <div className={`navigation-groups${mobile ? ' navigation-groups-mobile' : ''}`}>
    {groups.map((group) => {
      const isOpen = openGroups.includes(group.id) || activeGroup === group.id
      const groupLabelId = `${mobile ? 'mobile-' : 'desktop-'}navigation-group-${group.id}`
      return <section className={`navigation-group${isOpen ? ' navigation-group-open' : ''}${collapsed ? ' navigation-group-collapsed' : ''}`} key={group.id}>
        <div className="navigation-group-heading">
          <Link className="navigation-group-link" to={group.landing} title={collapsed ? translate(`navigation.${group.id}`) : undefined} aria-current={activeGroup === group.id ? 'page' : undefined}>
            <span className="navigation-group-icon" aria-hidden="true">{group.icon}</span>
            <span className="navigation-group-label">{translate(`navigation.${group.id}`)}</span>
          </Link>
          <button className="navigation-group-toggle" type="button" aria-expanded={isOpen} aria-controls={groupLabelId} aria-label={translate(isOpen ? 'navigation.collapse' : 'navigation.expand', { group: translate(`navigation.${group.id}`) })} onClick={() => toggleGroup(group.id)}>
            <span aria-hidden="true">{isOpen ? '⌄' : '›'}</span>
          </button>
        </div>
        <div id={groupLabelId} className="navigation-group-items" hidden={!isOpen || collapsed}>
          {group.items.map((item) => <NavLink key={item.to} to={item.to}>{translate(`navigation.${navigationItemKey(item.label)}`)}</NavLink>)}
        </div>
      </section>
    })}
  </div>
}

export function DesktopNavigation({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useTranslation()
  return <div className="desktop-navigation-stack"><NavLink to="/" className="navigation-home-link"><span aria-hidden="true">⌂</span><span className="navigation-home-label">{t('navigation.home')}</span></NavLink><NavigationGroups collapsed={collapsed} /></div>
}

export function MobileNavigation({ onLock }: { onLock: () => void }) {
  const { t } = useTranslation()
  const translate = (key: string) => String((t as unknown as (key: string) => unknown)(key))
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const currentPageItem = visibleGroups().flatMap((group) => group.items).find((item) => routeMatches(location.pathname, item.to))
  const currentPage = currentPageItem ? translate(`navigation.${navigationItemKey(currentPageItem.label)}`) : translate('common.appName')

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
          <span>{t('common.appName')}</span>
        </div>
      </div>
      <div className="mobile-navigation-actions">
        <ThemeModeToggle className="mobile-theme-toggle" />
        <button className="menu-lock-button" type="button" aria-label={t('navigation.lock')} title={t('navigation.lock')} onClick={onLock}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10M12 14v2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg></button>
        <button className="menu-button" type="button" aria-expanded={open} aria-controls="mobile-navigation-menu" onClick={() => setOpen((current) => !current)}>
          <span className="menu-button-icon" aria-hidden="true">{open ? '×' : '☰'}</span>
          <span>{t('navigation.menu')}</span>
        </button>
      </div>
    </div>
    {open && <nav id="mobile-navigation-menu" className="mobile-navigation-menu" aria-label="Navegación principal">
      <div className="mobile-navigation-menu-heading"><span>{t('navigation.goTo')}</span><small>{t('navigation.currentSection', { section: currentPage })}</small></div>
      <NavLink to="/" className="navigation-home-link"><span aria-hidden="true">⌂</span><span>{t('navigation.home')}</span></NavLink><NavigationGroups mobile />
      <div className="mobile-navigation-menu-footer"><LanguageSelector compact className="mobile-language-selector" /></div>
    </nav>}
  </div>
}

export function ThemeModeToggle({ className = 'app-sidebar-theme-toggle' }: { className?: string } = {}) {
  const { t } = useTranslation()
  const { colorMode, toggleColorMode } = useTheme()
  const label = colorMode === 'dark' ? t('navigation.lightMode') : t('navigation.darkMode')
  return <IconButton className={className} type="button" label={label} title={label} onClick={toggleColorMode} icon={colorMode === 'dark' ? '☀' : '☾'} />
}

export function PageLayout({ children }: { client?: unknown; children?: ReactNode }) {
  return <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8"><div className="app-topbar"><LanguageSelector /></div><WorkspaceNavigation />{children ?? <Outlet />}</div>
}
