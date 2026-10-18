import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Field, Input, Notice, PageHeader, RefreshButton, Spinner } from '../components/ui'
import { Checkbox } from '../components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { CacheManagerPanel } from '../components/cache-manager-panel'
import { useTheme } from '../components/theme-provider'
import { ErpNextError, createErpNextClient } from '../lib/erpnext'
import { normalizeUserProfile, type UserProfileSummary } from '../lib/user-profile'
import type { ConnectionProfile, PosProfile } from '../lib/types'
import { queryKeys } from '../lib/query-keys'
import { clearPosPreferences, DEFAULT_POS_PREFERENCES, readPosPreferences, writePosPreferences, type PosPreferences } from '../lib/pos-preferences'

function formatProfileDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-MX')
}

async function loadUserProfile(client: ReturnType<typeof createErpNextClient>): Promise<{ profile: UserProfileSummary; warning?: string }> {
  const currentUser = await client.getCurrentUser()
  try {
    return { profile: normalizeUserProfile(await client.getUserProfile(currentUser), currentUser) }
  } catch (error) {
    if (error instanceof ErpNextError && error.status === 403) {
      return { profile: normalizeUserProfile({ name: currentUser }, currentUser), warning: 'ERPNext no permite leer el perfil completo del usuario. Solicita permiso de lectura sobre User para mostrar más datos.' }
    }
    throw error
  }
}

function UserDetail({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return <div><dt className="field-label">{label}</dt><dd>{value}</dd></div>
}

export function SettingsPage({ connection, onLock }: { connection: ConnectionProfile; onLock: () => void }) {
  const client = useMemo(() => createErpNextClient(connection), [connection])
  const userQuery = useQuery({ queryKey: queryKeys.settings.userProfile(connection.id), queryFn: () => loadUserProfile(client) })
  const posProfilesQuery = useQuery({ queryKey: queryKeys.pos.profiles(connection.id), queryFn: async () => (await client.listDocuments<PosProfile>('POS Profile', { fields: ['name', 'company', 'warehouse', 'currency', 'disabled'], pageLength: 100, orderBy: 'name asc' })).data.filter((profile) => profile.disabled !== true && profile.disabled !== 1 && String(profile.disabled) !== '1') })
  const customersQuery = useQuery({ queryKey: queryKeys.pos.customers(connection.id), queryFn: async () => (await client.listDocuments<{ name: string; customer_name?: string }>('Customer', { fields: ['name', 'customer_name'], filters: [['disabled', '=', 0]], pageLength: 500, orderBy: 'customer_name asc' })).data })
  const [posDraft, setPosDraft] = useState<PosPreferences>(() => readPosPreferences(connection.id))
  const [customerSearch, setCustomerSearch] = useState('')
  const [posMessage, setPosMessage] = useState('')
  const [posError, setPosError] = useState('')
  const { theme, setTheme, themes } = useTheme()
  const activeTheme = themes.find((entry) => entry.id === theme) ?? themes[0]
  const activePosProfile = posProfilesQuery.data?.find((entry) => entry.name === posDraft.profileName) ?? posProfilesQuery.data?.[0]
  const user = userQuery.data?.profile
  const customerOptions = (customersQuery.data ?? []).filter((customer) => `${customer.name} ${customer.customer_name ?? ''}`.toLocaleLowerCase().includes(customerSearch.toLocaleLowerCase()))

  function savePosPreferences() {
    setPosError('')
    const profile = posProfilesQuery.data?.find((entry) => entry.name === posDraft.profileName)
    const customer = customersQuery.data?.find((entry) => entry.name === posDraft.defaultCustomer)
    if (posDraft.profileName && !profile) return setPosError('El POS Profile seleccionado ya no está disponible.')
    if (posDraft.defaultCustomer && !customer) return setPosError('El cliente seleccionado ya no está disponible.')
    writePosPreferences(connection.id, posDraft)
    setPosMessage('Preferencias de POS guardadas en este navegador.')
  }

  function resetPosPreferences() {
    clearPosPreferences(connection.id)
    setPosDraft({ ...DEFAULT_POS_PREFERENCES })
    setCustomerSearch('')
    setPosError('')
    setPosMessage('Preferencias de POS restauradas.')
  }

  return <section>
    <PageHeader title="Configuración" description="Administra tu conexión y personaliza la apariencia de esta aplicación." />
    <Tabs defaultValue="general" className="settings-tabs">
      <TabsList aria-label="Secciones de configuración"><TabsTrigger value="general">General</TabsTrigger><TabsTrigger value="caches">Cachés</TabsTrigger></TabsList>
      <TabsContent value="general"><div className="settings-grid">
      <div className="card settings-connection-card">
        <div className="settings-section-heading"><div><p className="settings-eyebrow">Conexión</p><h2>Instancia ERPNext</h2></div><span className="settings-section-icon" aria-hidden="true">↗</span></div>
        <dl className="settings-connection-details"><div><dt className="field-label">Perfil</dt><dd>{connection.label}</dd></div><div><dt className="field-label">Instancia</dt><dd className="break-all">{connection.baseUrl}</dd></div></dl>
        <div className="settings-actions"><Button onClick={() => { void userQuery.refetch() }} disabled={userQuery.isFetching}>{userQuery.isFetching ? <><Spinner /> Probando</> : 'Probar conexión'}</Button><Button variant="secondary" onClick={onLock}>Bloquear sesión</Button></div>
        {user && <Notice tone="info">Conectado como {user.email || user.name}</Notice>}{userQuery.isError && <div className="mt-4"><Notice>{userQuery.error instanceof Error ? userQuery.error.message : 'No se pudo cargar el usuario actual.'}</Notice></div>}
      </div>

      <div className="card settings-user-card">
        <div className="settings-section-heading"><div><p className="settings-eyebrow">Usuario ERPNext</p><h2>Perfil de usuario</h2><p className="muted">Datos informativos obtenidos de la instancia activa. No se modifican desde aquí.</p></div><span className="settings-section-icon" aria-hidden="true">◎</span></div>
        {userQuery.isPending ? <div className="settings-user-loading"><Spinner /> Cargando perfil…</div> : user ? <><dl className="settings-user-details"><UserDetail label="Nombre" value={user.displayName} /><UserDetail label="Correo" value={user.email} /><UserDetail label="Usuario" value={user.username || user.name} /><UserDetail label="Tipo de usuario" value={user.userType} /><UserDetail label="Estado" value={user.enabled === undefined ? undefined : user.enabled ? 'Activo' : 'Desactivado'} /><UserDetail label="Móvil" value={user.mobile} /><UserDetail label="Teléfono" value={user.phone} /><UserDetail label="Idioma" value={user.language} /><UserDetail label="Zona horaria" value={user.timeZone} /><UserDetail label="Creado" value={formatProfileDate(user.creation)} /><UserDetail label="Último acceso / actividad" value={formatProfileDate(user.lastLogin)} /></dl><div className="settings-user-roles"><span className="field-label">Roles</span>{user.roles.length ? <div className="settings-role-list">{user.roles.map((role) => <span key={role}>{role}</span>)}</div> : <p className="muted">No se devolvieron roles.</p>}</div>{userQuery.data?.warning && <Notice tone="warning">{userQuery.data.warning}</Notice>}<RefreshButton className="settings-user-refresh" label="Actualizar perfil" loading={userQuery.isFetching} onClick={() => { void userQuery.refetch() }} /></> : null}
      </div>

      <div className="card settings-pos-card">
        <div className="settings-section-heading"><div><p className="settings-eyebrow">Operación</p><h2>Preferencias del POS</h2><p className="muted">Se guardan solo en este navegador y para esta conexión. ERPNext sigue controlando perfiles, turnos y ventas.</p></div><span className="settings-section-icon" aria-hidden="true">▣</span></div>
        {posProfilesQuery.isError && <Notice>{posProfilesQuery.error instanceof Error ? posProfilesQuery.error.message : 'No se pudieron cargar los POS Profiles.'}</Notice>}
        {customersQuery.isError && <Notice>{customersQuery.error instanceof Error ? customersQuery.error.message : 'No se pudieron cargar los clientes.'}</Notice>}
        <div className="settings-pos-form">
          <Field label="POS Profile predeterminado"><Select value={posDraft.profileName || '__none__'} onValueChange={(value) => setPosDraft((current) => ({ ...current, profileName: value === '__none__' ? '' : value }))} disabled={posProfilesQuery.isPending}><SelectTrigger aria-label="POS Profile predeterminado"><SelectValue placeholder="Usar el primer perfil activo" /></SelectTrigger><SelectContent align="start"><SelectItem value="__none__">Usar el primer perfil activo</SelectItem>{(posProfilesQuery.data ?? []).map((profile) => <SelectItem key={profile.name} value={profile.name}>{profile.name}{profile.company ? ` · ${profile.company}` : ''}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Buscar cliente predeterminado"><Input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Filtrar por nombre o ID" aria-label="Buscar cliente predeterminado" disabled={customersQuery.isPending} /></Field>
          <Field label="Cliente predeterminado"><Select value={posDraft.defaultCustomer || '__none__'} onValueChange={(value) => setPosDraft((current) => ({ ...current, defaultCustomer: value === '__none__' ? '' : value }))} disabled={customersQuery.isPending}><SelectTrigger aria-label="Cliente predeterminado"><SelectValue placeholder="Sin cliente predeterminado" /></SelectTrigger><SelectContent align="start"><SelectItem value="__none__">Sin cliente predeterminado</SelectItem>{customerOptions.map((customer) => <SelectItem key={customer.name} value={customer.name}>{customer.customer_name || customer.name}{customer.customer_name ? ` · ${customer.name}` : ''}</SelectItem>)}</SelectContent></Select></Field>
        </div>
        <div className="settings-pos-options">
          <label className="settings-pos-option"><Checkbox checked={posDraft.rememberCustomer} onCheckedChange={(checked) => setPosDraft((current) => ({ ...current, rememberCustomer: checked === true }))} /><span><strong>Recordar cliente</strong><small>Conservarlo después de cobrar o guardar un carrito.</small></span></label>
          <label className="settings-pos-option"><Checkbox checked={posDraft.autoFocusProductSearch} onCheckedChange={(checked) => setPosDraft((current) => ({ ...current, autoFocusProductSearch: checked === true }))} /><span><strong>Enfocar búsqueda de productos</strong><small>Facilitar la captura rápida al abrir el POS.</small></span></label>
        </div>
        {(posMessage || posError) && <div className="mt-4"><Notice tone={posError ? 'error' : 'info'}>{posError || posMessage}</Notice></div>}
        <div className="settings-actions"><Button type="button" onClick={savePosPreferences}>Guardar preferencias</Button><Button type="button" variant="secondary" onClick={resetPosPreferences}>Restaurar valores</Button></div>
      </div>

      <div className="card settings-theme-card">
        <div className="settings-section-heading"><div><p className="settings-eyebrow">Apariencia</p><h2>Paleta de colores</h2><p className="muted">El cambio se aplica a toda la aplicación y se guarda en este navegador.</p></div><span className="settings-theme-current" style={{ background: activeTheme.colors.primary }} aria-label={`Paleta activa: ${activeTheme.name}`} /></div>
        <div className="theme-preview" aria-label="Vista previa de la paleta activa"><div><span className="theme-preview-label">Vista previa</span><strong>{activeTheme.name}</strong></div><div className="theme-preview-actions"><span className="theme-preview-chip">Datos sincronizados</span><Button size="compact">Acción principal</Button><Button size="compact" variant="secondary">Secundaria</Button></div></div>
        <RadioGroup className="theme-grid" value={theme} onValueChange={setTheme} aria-label="Paletas disponibles">{themes.map((entry) => <label key={entry.id} className={`theme-option${entry.id === theme ? ' theme-option-active' : ''}`} htmlFor={`theme-${entry.id}`}><RadioGroupItem id={`theme-${entry.id}`} value={entry.id} className="sr-only" /><span className="theme-option-swatches" aria-hidden="true"><i style={{ background: entry.colors.primary }} /><i style={{ background: entry.colors.secondary }} /><i style={{ background: entry.colors.accent }} /><i style={{ background: entry.colors.page }} /></span><span className="theme-option-copy"><strong>{entry.name}</strong><small>{entry.description}</small></span><span className="theme-option-check" aria-hidden="true">{entry.id === theme ? '✓' : ''}</span></label>)}</RadioGroup>
      </div></div></TabsContent>
      <TabsContent value="caches"><CacheManagerPanel client={client} profileId={connection.id} activeProfile={activePosProfile} /></TabsContent>
    </Tabs>
  </section>
}
