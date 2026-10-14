import { useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Spinner } from './components/ui'
import { MobileNavigation, NavLink, PageLayout } from './components/layout'
import { ConnectionScreen } from './components/connection-screen'
import { ItemEditorPage, UomEditorPage, VariantEditorPage } from './pages/editors'
import { DocTypesPage, ItemsPage, VariantsPage } from './pages/catalog-pages'
import { PriceManagementPage, PricesPage } from './pages/prices-page'
import { SuppliersPage } from './pages/suppliers-page'
import { SettingsPage } from './pages/settings-page'
import { createErpNextClient } from './lib/erpnext'
import { clearLocalSession, restoreLocalSession, startLocalSession } from './lib/session'
import { readProfiles } from './lib/storage'
import { readSharedConnection } from './lib/share-link'
import type { ConnectionProfile } from './lib/types'

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

  return <div className="min-h-screen lg:flex"><MobileNavigation onLock={onLock} /><aside className="app-sidebar border-b border-slate-200 bg-white lg:min-h-screen lg:border-b-0 lg:border-r"><div className="app-sidebar-brand"><img className="app-brand-logo" src="/mauricio-logo-cropped.png" alt="Mauricio" /><div><p className="app-brand-name">Mauricio</p><p className="app-brand-caption">ERPNext local</p></div></div><div className="app-sidebar-profile"><span className="app-sidebar-eyebrow">Conexión activa</span><strong title={connection.label}>{connection.label}</strong><small title={connection.baseUrl}>{connection.baseUrl.replace(/^https?:\/\//, '')}</small></div><nav className="app-sidebar-nav"><NavLink to="/items">Productos</NavLink><NavLink to="/variants">Variantes</NavLink><NavLink to="/prices">Precios</NavLink><NavLink to="/suppliers">Proveedores</NavLink><NavLink to="/doctypes">DocTypes</NavLink><NavLink to="/settings">Conexión</NavLink></nav><div className="app-sidebar-footer"><button className="app-sidebar-lock" type="button" onClick={onLock}><span>Bloquear sesión</span><span aria-hidden="true">↗</span></button></div></aside><main className="min-w-0 flex-1"><Routes><Route element={<PageLayout client={client} />}><Route path="/" element={<Navigate to="/items" replace />} /><Route path="/items" element={<ItemsPage client={client} profileId={connection.id} />} /><Route path="/items/new" element={<ItemEditorPage client={client} profileId={connection.id} />} /><Route path="/items/:name" element={<ItemEditorPage client={client} profileId={connection.id} />} /><Route path="/items/:name/uoms" element={<UomEditorPage client={client} profileId={connection.id} />} /><Route path="/variants" element={<VariantsPage client={client} profileId={connection.id} />} /><Route path="/variants/new" element={<VariantEditorPage client={client} profileId={connection.id} />} /><Route path="/variants/:name" element={<VariantEditorPage client={client} profileId={connection.id} />} /><Route path="/prices" element={<PricesPage client={client} profileId={connection.id} />} /><Route path="/prices/manage/:itemName" element={<PriceManagementPage client={client} profileId={connection.id} />} /><Route path="/suppliers" element={<SuppliersPage client={client} profileId={connection.id} />} /><Route path="/doctypes" element={<DocTypesPage client={client} profileId={connection.id} />} /><Route path="/settings" element={<SettingsPage connection={connection} onLock={onLock} />} /></Route></Routes></main></div>
}

export default App
