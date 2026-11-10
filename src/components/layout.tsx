import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { IconButton } from './ui'
import { useTheme } from './theme-provider'
import { featureFlags } from '../lib/feature-flags'
import { LanguageSelector } from './language-selector'
import { ConnectionStatus } from './connection-status'
import { GlobalSearchNavigationAction } from './global-search-trigger'
import type { createErpNextClient } from '../lib/erpnext'
import { useTranslation } from 'react-i18next'
import { Boxes, ChevronDown, ChevronLeft, ChevronRight, House, LayoutDashboard, LockKeyhole, LogOut, Menu, Moon, Settings, Sun, Warehouse, X, type LucideIcon } from 'lucide-react'

type NavigationItem = { to: string; label: string }
export type SidebarIconName = 'home' | 'operation' | 'catalog' | 'inventory' | 'settings' | 'sun' | 'moon' | 'lock' | 'logout' | 'menu' | 'close' | 'chevronDown' | 'chevronLeft' | 'chevronRight'
type NavigationGroup = { id: string; label: string; icon: SidebarIconName; landing: string; items: NavigationItem[] }

const sidebarIcons: Record<SidebarIconName, LucideIcon> = { home: House, operation: LayoutDashboard, catalog: Boxes, inventory: Warehouse, settings: Settings, sun: Sun, moon: Moon, lock: LockKeyhole, logout: LogOut, menu: Menu, close: X, chevronDown: ChevronDown, chevronLeft: ChevronLeft, chevronRight: ChevronRight }

export function SidebarIcon({ name, className = '' }: { name: SidebarIconName; className?: string }) {
  const Icon = sidebarIcons[name]
  return <Icon className={`sidebar-icon ${className}`.trim()} aria-hidden="true" focusable="false" strokeWidth={1.8} />
}

const navigationGroups: NavigationGroup[] = [
  { id: 'operation', label: 'Operación', icon: 'operation', landing: '/pos', items: [{ to: '/pos', label: 'POS' }, { to: '/pos/ventas', label: 'Ventas del día' }, { to: '/pos/turnos', label: 'Turnos' }, { to: '/pos/cotizaciones', label: 'Cotizaciones' }] },
  { id: 'catalog', label: 'Catálogo', icon: 'catalog', landing: '/items', items: [{ to: '/items', label: 'Productos' }, { to: '/variants', label: 'Variantes' }, { to: '/prices', label: 'Precios' }, { to: '/pendientes', label: 'Pendientes' }] },
  { id: 'inventory', label: 'Inventario', icon: 'inventory', landing: '/stock', items: [{ to: '/stock', label: 'Inventario' }, { to: '/suppliers', label: 'Proveedores' }] },
  { id: 'administration', label: 'Administración', icon: 'settings', landing: '/settings', items: [{ to: '/settings', label: 'Configuración' }, { to: '/doctypes', label: 'DocTypes' }] },
]

const navigationStorageKey = 'mauricio-erpnext:open-navigation-groups'

function routeMatches(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`)
}

function visibleGroups() {
  return navigationGroups.map((group) => ({ ...group, items: group.items.filter((item) => item.to !== '/pos/cotizaciones' || featureFlags.quotationsView) })).filter((group) => group.items.length)
}

function navigationItemKey(label: string) {
  const keys: Record<string, string> = { POS: 'pos', 'Ventas del día': 'dailySales', Turnos: 'shifts', Cotizaciones: 'quotations', Productos: 'products', Variantes: 'variants', Precios: 'prices', Pendientes: 'pending', Inventario: 'stock', Proveedores: 'suppliers', Configuración: 'settings', DocTypes: 'doctypes' }
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
      return <section className={`navigation-group${isOpen ? ' navigation-group-open' : ''}${activeGroup === group.id ? ' navigation-group-active' : ''}${collapsed ? ' navigation-group-collapsed' : ''}`} key={group.id}>
        <div className="navigation-group-heading">
          <Link className="navigation-group-link" to={group.landing} title={collapsed ? translate(`navigation.${group.id}`) : undefined} aria-current={activeGroup === group.id ? 'page' : undefined}>
            <span className="navigation-group-icon"><SidebarIcon name={group.icon} /></span>
            <span className="navigation-group-label">{translate(`navigation.${group.id}`)}</span>
          </Link>
          <button className="navigation-group-toggle" type="button" aria-expanded={isOpen} aria-controls={groupLabelId} aria-label={translate(isOpen ? 'navigation.collapse' : 'navigation.expand', { group: translate(`navigation.${group.id}`) })} onClick={() => toggleGroup(group.id)}>
            <SidebarIcon name={isOpen ? 'chevronDown' : 'chevronRight'} className="navigation-group-toggle-icon" />
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
  return <div className="desktop-navigation-stack"><NavLink to="/" className="navigation-home-link"><SidebarIcon name="home" /><span className="navigation-home-label">{t('navigation.home')}</span></NavLink><GlobalSearchNavigationAction className="navigation-home-link global-search-navigation-action" collapsed={collapsed} /><NavigationGroups collapsed={collapsed} /></div>
}

export function MobileNavigation({ onLock, client }: { onLock: () => void; client: ReturnType<typeof createErpNextClient> }) {
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
        <img className="mobile-brand-logo" src="/icon-192.png" alt={t('common.appName')} />
        <div className="mobile-navigation-heading">
          <strong>{currentPage}</strong>
          <span>{t('common.appName')}</span>
          <ConnectionStatus client={client} />
        </div>
      </div>
      <div className="mobile-navigation-actions">
        <ThemeModeToggle className="mobile-theme-toggle" />
        <button className="menu-lock-button" type="button" aria-label={t('navigation.lock')} title={t('navigation.lock')} onClick={onLock}><SidebarIcon name="lock" /></button>
        <button className="menu-button" type="button" aria-expanded={open} aria-controls="mobile-navigation-menu" onClick={() => setOpen((current) => !current)}>
          <SidebarIcon name={open ? 'close' : 'menu'} className="menu-button-icon" />
          <span>{t('navigation.menu')}</span>
        </button>
      </div>
    </div>
    {open && <nav id="mobile-navigation-menu" className="mobile-navigation-menu" aria-label={t('navigation.main')}>
      <div className="mobile-navigation-menu-heading"><span>{t('navigation.goTo')}</span><small>{t('navigation.currentSection', { section: currentPage })}</small></div>
      <NavLink to="/" className="navigation-home-link"><SidebarIcon name="home" /><span>{t('navigation.home')}</span></NavLink><GlobalSearchNavigationAction className="navigation-home-link global-search-navigation-action" /><NavigationGroups mobile />
      <div className="mobile-navigation-menu-footer"><LanguageSelector compact className="mobile-language-selector" /></div>
    </nav>}
  </div>
}

export function ThemeModeToggle({ className = 'app-sidebar-theme-toggle' }: { className?: string } = {}) {
  const { t } = useTranslation()
  const { colorMode, toggleColorMode } = useTheme()
  const label = colorMode === 'dark' ? t('navigation.lightMode') : t('navigation.darkMode')
  return <IconButton className={className} type="button" label={label} title={label} onClick={toggleColorMode} icon={<SidebarIcon name={colorMode === 'dark' ? 'sun' : 'moon'} />} />
}
