import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, Route, Routes } from 'react-router-dom'
import { IconButton, Spinner } from './components/ui'
import { DesktopNavigation, MobileNavigation, NavLink, PageLayout, ThemeModeToggle } from './components/layout'
import { ConnectionScreen } from './components/connection-screen'
import { RouteErrorBoundary } from './components/route-error-boundary'
import { createErpNextClient } from './lib/erpnext'
import { clearLocalSession, restoreLocalSession, startLocalSession } from './lib/session'
import { readProfiles } from './lib/storage'
import { readSharedConnection } from './lib/share-link'
import { readItemCatalog } from './lib/item-cache'
import { readItemPriceCatalog } from './lib/price-cache'
import { readVariantCatalogOrItems } from './lib/variant-cache'
import { queryKeys } from './lib/query-keys'
import { markPerformance } from './lib/performance'
import type { ConnectionProfile } from './lib/types'

const ItemEditorPage = lazy(() => import('./pages/editors').then(({ ItemEditorPage }) => ({ default: ItemEditorPage })))
const UomEditorPage = lazy(() => import('./pages/editors').then(({ UomEditorPage }) => ({ default: UomEditorPage })))
const VariantEditorPage = lazy(() => import('./pages/editors').then(({ VariantEditorPage }) => ({ default: VariantEditorPage })))
const PricesPage = lazy(() => import('./pages/prices-page').then(({ PricesPage }) => ({ default: PricesPage })))
const PriceManagementPage = lazy(() => import('./pages/prices-page').then(({ PriceManagementPage }) => ({ default: PriceManagementPage })))
const SuppliersPage = lazy(() => import('./pages/suppliers-page').then(({ SuppliersPage }) => ({ default: SuppliersPage })))
const StockPage = lazy(() => import('./pages/stock-page').then(({ StockPage }) => ({ default: StockPage })))
const StockReconciliationPage = lazy(() => import('./pages/stock-page').then(({ StockReconciliationPage }) => ({ default: StockReconciliationPage })))
const PosPage = lazy(() => import('./pages/pos-page').then(({ PosPage }) => ({ default: PosPage })))
const PosShiftsPage = lazy(() => import('./pages/pos-shifts-page').then(({ PosShiftsPage }) => ({ default: PosShiftsPage })))
const QuotationsPage = lazy(() => import('./pages/quotations-page').then(({ QuotationsPage }) => ({ default: QuotationsPage })))
const QuotationEditorPage = lazy(() => import('./pages/quotations-page').then(({ QuotationEditorPage }) => ({ default: QuotationEditorPage })))
const SalesOrdersPage = lazy(() => import('./pages/sales-orders-page').then(({ SalesOrdersPage }) => ({ default: SalesOrdersPage })))
const ItemsPage = lazy(() => import('./pages/catalog-pages').then(({ ItemsPage }) => ({ default: ItemsPage })))
const VariantsPage = lazy(() => import('./pages/catalog-pages').then(({ VariantsPage }) => ({ default: VariantsPage })))
const DocTypesPage = lazy(() => import('./pages/catalog-pages').then(({ DocTypesPage }) => ({ default: DocTypesPage })))
const SettingsPage = lazy(() => import('./pages/settings-page').then(({ SettingsPage }) => ({ default: SettingsPage })))

function App() {
  const [profiles, setProfiles] = useState(readProfiles)
  const [connection, setConnection] = useState<ConnectionProfile | null>(null)
  const [restoring, setRestoring] = useState(true)
  const sharedConnection = useMemo(() => readSharedConnection(window.location.search, window.location.hash), [])

  useEffect(() => {
    if (sharedConnection) { setRestoring(false); return }
    restoreLocalSession().then(setConnection).finally(() => setRestoring(false))
  }, [sharedConnection])

  async function unlock(profile: ConnectionProfile) {
    await startLocalSession(profile)
    setConnection(profile)
  }

  async function lock() {
    await clearLocalSession()
    setConnection(null)
  }

  if (restoring) {
    return <main className="flex min-h-screen items-center justify-center p-4"><div className="flex items-center gap-2 muted"><Spinner /> Restaurando sesión local...</div></main>
  }

  if (!connection) {
    return <ConnectionScreen profiles={profiles} onUnlock={unlock} onProfilesChange={setProfiles} />
  }

  return <AppShell connection={connection} onLock={lock} />
}

function AppShell({ connection, onLock }: { connection: ConnectionProfile; onLock: () => void }) {
  const client = useMemo(() => createErpNextClient(connection), [connection])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('mauricio-erpnext:sidebar-collapsed') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('mauricio-erpnext:sidebar-collapsed', String(sidebarCollapsed))
    } catch {
      // La preferencia es opcional; la sesión debe continuar si el storage está bloqueado.
    }
  }, [sidebarCollapsed])

  useEffect(() => { markPerformance('app-shell-ready') }, [])
  return <div className={`min-h-screen lg:flex${sidebarCollapsed ? ' app-shell-sidebar-collapsed' : ''}`}>
    <LocalCachePrefetch profileId={connection.id} />
    <MobileNavigation onLock={onLock} />
    <aside className="app-sidebar border-b border-slate-200 bg-white lg:min-h-screen lg:border-b-0 lg:border-r">
      <div className="app-sidebar-brand"><img className="app-brand-logo" src="/mauricio-logo-cropped.png" alt="Mauricio" /><div className="app-sidebar-brand-copy"><p className="app-brand-name">Mauricio</p><p className="app-brand-caption">ERPNext local</p></div><IconButton className="app-sidebar-collapse-toggle" type="button" variant="secondary" label={sidebarCollapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'} aria-pressed={sidebarCollapsed} onClick={() => setSidebarCollapsed((current) => !current)} icon={sidebarCollapsed ? '→' : '←'} /></div>
      <div className="app-sidebar-profile"><span className="app-sidebar-eyebrow">Conexión activa</span><strong title={connection.label}>{connection.label}</strong><small title={connection.baseUrl}>{connection.baseUrl.replace(/^https?:\/\//, '')}</small></div>
      <nav className="app-sidebar-nav" aria-label="Navegación principal"><DesktopNavigation collapsed={sidebarCollapsed} /></nav>
      <div className="app-sidebar-footer"><div className="app-sidebar-footer-actions"><NavLink to="/settings" className="app-sidebar-settings-link" ariaLabel="Configuración"><span className="app-sidebar-settings-icon" aria-hidden="true">⚙</span><span className="app-sidebar-settings-label">Configuración</span></NavLink><ThemeModeToggle /></div><button className="app-sidebar-lock" type="button" aria-label="Bloquear sesión" onClick={onLock}><span>Bloquear sesión</span><span aria-hidden="true">↗</span></button></div>
    </aside>
    <main className="min-w-0 flex-1"><RouteErrorBoundary onLock={onLock}><Suspense fallback={<main className="flex min-h-[16rem] items-center justify-center p-6"><div className="flex items-center gap-2 muted"><Spinner /> Cargando módulo...</div></main>}><Routes><Route element={<PageLayout client={client} />}><Route path="/" element={<Navigate to="/items" replace />} /><Route path="/pos" element={<PosPage client={client} profileId={connection.id} />} /><Route path="/pos/ventas" element={<SalesOrdersPage client={client} profileId={connection.id} />} /><Route path="/pos/ventas/nueva" element={<SalesOrdersPage client={client} profileId={connection.id} />} /><Route path="/pos/ventas/:name/editar" element={<SalesOrdersPage client={client} profileId={connection.id} />} /><Route path="/pos/cotizaciones" element={<QuotationsPage client={client} profileId={connection.id} />} /><Route path="/pos/cotizaciones/nueva" element={<QuotationEditorPage client={client} profileId={connection.id} />} /><Route path="/pos/cotizaciones/:name/editar" element={<QuotationEditorPage client={client} profileId={connection.id} />} /><Route path="/pos/turnos" element={<PosShiftsPage client={client} />} /><Route path="/items" element={<ItemsPage client={client} profileId={connection.id} />} /><Route path="/items/new" element={<ItemEditorPage client={client} profileId={connection.id} />} /><Route path="/items/:name" element={<ItemEditorPage client={client} profileId={connection.id} />} /><Route path="/items/:name/uoms" element={<UomEditorPage client={client} profileId={connection.id} />} /><Route path="/variants" element={<VariantsPage client={client} profileId={connection.id} />} /><Route path="/variants/new" element={<VariantEditorPage client={client} profileId={connection.id} />} /><Route path="/variants/:name" element={<VariantEditorPage client={client} profileId={connection.id} />} /><Route path="/prices" element={<PricesPage client={client} profileId={connection.id} />} /><Route path="/prices/manage/:itemName" element={<PriceManagementPage client={client} profileId={connection.id} />} /><Route path="/stock" element={<StockPage client={client} profileId={connection.id} />} /><Route path="/stock/reconciliation" element={<StockReconciliationPage client={client} profileId={connection.id} />} /><Route path="/suppliers" element={<SuppliersPage client={client} profileId={connection.id} />} /><Route path="/doctypes" element={<DocTypesPage client={client} profileId={connection.id} />} /><Route path="/settings" element={<SettingsPage connection={connection} onLock={onLock} />} /></Route></Routes></Suspense></RouteErrorBoundary></main>
  </div>
}

function LocalCachePrefetch({ profileId }: { profileId: string }) {
  const queryClient = useQueryClient()
  useEffect(() => {
    void Promise.all([readItemCatalog(profileId), readItemPriceCatalog(profileId), readVariantCatalogOrItems(profileId)]).then(([items, prices, variants]) => {
      queryClient.setQueryData(queryKeys.catalog.item(profileId), items)
      queryClient.setQueryData(queryKeys.catalog.price(profileId), prices)
      queryClient.setQueryData(queryKeys.catalog.variant(profileId), variants)
      markPerformance('local-cache-ready')
    })
  }, [profileId, queryClient])
  return null
}

export default App
