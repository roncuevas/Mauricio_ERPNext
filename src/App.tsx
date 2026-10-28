import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './components/ui/alert-dialog'
import { Button, IconButton, Spinner } from './components/ui'
import { DesktopNavigation, MobileNavigation, NavLink, PageLayout, SidebarIcon, ThemeModeToggle } from './components/layout'
import { ConnectionScreen } from './components/connection-screen'
import { ConnectionStatus } from './components/connection-status'
import { GlobalSearch } from './components/global-search'
import { LanguageSelector } from './components/language-selector'
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
import { readAppPreferences, writeAppPreferences, type AppPreferences } from './lib/app-preferences'
import type { ConnectionProfile } from './lib/types'
import { useTranslation } from 'react-i18next'

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
const HomePage = lazy(() => import('./pages/home-page').then(({ HomePage }) => ({ default: HomePage })))

function App() {
  const { t } = useTranslation()
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
    return <main className="flex min-h-screen items-center justify-center p-4"><div className="flex items-center gap-2 muted"><Spinner /> {t('common.loading')}</div></main>
  }

  if (!connection) {
    return <ConnectionScreen profiles={profiles} onUnlock={unlock} onProfilesChange={setProfiles} />
  }

  return <AppShell connection={connection} onLock={lock} />
}

function AppShell({ connection, onLock }: { connection: ConnectionProfile; onLock: () => void }) {
  const { t } = useTranslation()
  const [confirmLock, setConfirmLock] = useState(false)
  const client = useMemo(() => createErpNextClient(connection), [connection])
  const [appPreferences, setAppPreferences] = useState<AppPreferences>(() => readAppPreferences())
  const sidebarCollapsed = appPreferences.sidebarCollapsed

  useEffect(() => {
    const onPreferencesChanged = (event: Event) => {
      const detail = (event as CustomEvent<AppPreferences>).detail
      if (detail) setAppPreferences(detail)
    }
    window.addEventListener('mauricio-app-preferences-changed', onPreferencesChanged)
    return () => window.removeEventListener('mauricio-app-preferences-changed', onPreferencesChanged)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.density = appPreferences.density
  }, [appPreferences])

  useEffect(() => { markPerformance('app-shell-ready') }, [])
  const requestLock = () => setConfirmLock(true)
  const lockSession = () => { setConfirmLock(false); onLock() }
  return <div className={`min-h-screen lg:flex${sidebarCollapsed ? ' app-shell-sidebar-collapsed' : ''}`}>
    <LocalCachePrefetch profileId={connection.id} />
    <MobileNavigation onLock={requestLock} client={client} />
    <aside className="app-sidebar border-b border-slate-200 bg-white lg:min-h-screen lg:border-b-0 lg:border-r">
      <div className="app-sidebar-brand"><img className="app-brand-logo" src="/icon-192.png" alt={t('common.appName')} /><div className="app-sidebar-brand-copy"><p className="app-brand-name">{t('common.appName')}</p><p className="app-brand-caption">{t('common.appCaption')}</p></div><IconButton className="app-sidebar-collapse-toggle" type="button" variant="secondary" label={sidebarCollapsed ? t('navigation.unlockSidebar') : t('navigation.lockSidebar')} aria-pressed={sidebarCollapsed} onClick={() => setAppPreferences(writeAppPreferences({ ...appPreferences, sidebarCollapsed: !sidebarCollapsed }))} icon={<SidebarIcon name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'} />} /></div>
      <div className="app-sidebar-profile"><span className="app-sidebar-eyebrow">{t('navigation.activeConnection')}</span><strong title={connection.label}>{connection.label}</strong><small title={connection.baseUrl}>{connection.baseUrl.replace(/^https?:\/\//, '')}</small><ConnectionStatus client={client} /></div>
      <nav className="app-sidebar-nav" aria-label={t('navigation.main')}><DesktopNavigation collapsed={sidebarCollapsed} /></nav>
      <div className="app-sidebar-footer"><div className="app-sidebar-footer-actions"><NavLink to="/settings" className="app-sidebar-settings-link" ariaLabel={t('navigation.settings')}><span className="app-sidebar-settings-icon"><SidebarIcon name="settings" /></span><span className="app-sidebar-settings-label">{t('navigation.settings')}</span></NavLink><ThemeModeToggle /><LanguageSelector compact={sidebarCollapsed} className="app-sidebar-language-selector" /><button className="app-sidebar-lock" type="button" aria-label={t('navigation.lock')} onClick={requestLock}><span>{t('navigation.lock')}</span><SidebarIcon name="logout" /></button></div></div>
    </aside>
    <main className="min-w-0 flex-1"><GlobalSearch profileId={connection.id} /><RouteErrorBoundary onLock={requestLock}><Suspense fallback={<main className="flex min-h-[16rem] items-center justify-center p-6"><div className="flex items-center gap-2 muted"><Spinner /> {t('common.loading')}</div></main>}><Routes><Route element={<PageLayout client={client} />}>
        <Route path="/" element={<DefaultLandingPage client={client} profileId={connection.id} route={appPreferences.landingRoute} />} />
        <Route path="/pos" element={<PosPage client={client} profileId={connection.id} />} />
        <Route path="/pos/ventas" element={<SalesOrdersPage client={client} profileId={connection.id} />} />
        <Route path="/pos/ventas/nueva" element={<SalesOrdersPage client={client} profileId={connection.id} />} />
        <Route path="/pos/ventas/:name/editar" element={<SalesOrdersPage client={client} profileId={connection.id} />} />
        <Route path="/pos/cotizaciones" element={<QuotationsPage client={client} profileId={connection.id} />} />
        <Route path="/pos/cotizaciones/nueva" element={<QuotationEditorPage client={client} profileId={connection.id} />} />
        <Route path="/pos/cotizaciones/:name/editar" element={<QuotationEditorPage client={client} profileId={connection.id} />} />
        <Route path="/pos/turnos" element={<PosShiftsPage client={client} />} />
        <Route path="/items" element={<ItemsPage client={client} profileId={connection.id} />} />
        <Route path="/items/new" element={<ItemEditorPage client={client} profileId={connection.id} />} />
        <Route path="/items/:name" element={<ItemEditorPage client={client} profileId={connection.id} />} />
        <Route path="/items/:name/uoms" element={<UomEditorPage client={client} profileId={connection.id} />} />
        <Route path="/variants" element={<VariantsPage client={client} profileId={connection.id} />} />
        <Route path="/variants/new" element={<VariantEditorPage client={client} profileId={connection.id} />} />
        <Route path="/variants/:name" element={<VariantEditorPage client={client} profileId={connection.id} />} />
        <Route path="/prices" element={<PricesPage client={client} profileId={connection.id} />} />
        <Route path="/prices/manage/:itemName" element={<PriceManagementPage client={client} profileId={connection.id} />} />
        <Route path="/stock" element={<StockPage client={client} profileId={connection.id} />} />
        <Route path="/stock/reconciliation" element={<StockReconciliationPage client={client} profileId={connection.id} />} />
        <Route path="/suppliers" element={<SuppliersPage client={client} profileId={connection.id} />} />
        <Route path="/doctypes" element={<DocTypesPage client={client} profileId={connection.id} />} />
        <Route path="/settings" element={<SettingsPage connection={connection} onLock={requestLock} />} />
      </Route></Routes></Suspense></RouteErrorBoundary></main>
    <AlertDialog open={confirmLock} onOpenChange={setConfirmLock}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('navigation.lockConfirmTitle')}</AlertDialogTitle><AlertDialogDescription>{t('navigation.lockConfirmDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel asChild><Button variant="secondary">{t('common.cancel')}</Button></AlertDialogCancel><AlertDialogAction asChild><Button variant="danger" onClick={lockSession}>{t('navigation.lockConfirmAction')}</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}

function DefaultLandingPage({ client, profileId, route }: { client: ReturnType<typeof createErpNextClient>; profileId: string; route: AppPreferences['landingRoute'] }) {
  if (route === '/') return <HomePage client={client} profileId={profileId} />
  return <Navigate to={route} replace />
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
