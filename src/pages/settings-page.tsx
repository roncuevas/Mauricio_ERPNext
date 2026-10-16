import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Notice, PageHeader, RefreshButton, Spinner } from '../components/ui'
import { useTheme } from '../components/theme-provider'
import { ErpNextError, createErpNextClient } from '../lib/erpnext'
import { normalizeUserProfile, type UserProfileSummary } from '../lib/user-profile'
import type { ConnectionProfile } from '../lib/types'

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
  const userQuery = useQuery({ queryKey: ['settings-user-profile', connection.id], queryFn: () => loadUserProfile(client) })
  const { theme, setTheme, themes } = useTheme()
  const activeTheme = themes.find((entry) => entry.id === theme) ?? themes[0]
  const user = userQuery.data?.profile

  return <section>
    <PageHeader title="Configuración" description="Administra tu conexión y personaliza la apariencia de esta aplicación." />
    <div className="settings-grid">
      <div className="card settings-connection-card">
        <div className="settings-section-heading"><div><p className="settings-eyebrow">Conexión</p><h2>Instancia ERPNext</h2></div><span className="settings-section-icon" aria-hidden="true">↗</span></div>
        <dl className="settings-connection-details"><div><dt className="field-label">Perfil</dt><dd>{connection.label}</dd></div><div><dt className="field-label">Instancia</dt><dd className="break-all">{connection.baseUrl}</dd></div></dl>
        <div className="settings-actions"><Button onClick={() => { void userQuery.refetch() }} disabled={userQuery.isFetching}>{userQuery.isFetching ? <><Spinner /> Probando</> : 'Probar conexión'}</Button><Button variant="secondary" onClick={onLock}>Bloquear sesión</Button></div>
        {user && <Notice tone="info">Conectado como {user.email || user.name}</Notice>}{userQuery.isError && <div className="mt-4"><Notice>{userQuery.error instanceof Error ? userQuery.error.message : 'No se pudo cargar el usuario actual.'}</Notice></div>}
      </div>

      <div className="card settings-user-card">
        <div className="settings-section-heading"><div><p className="settings-eyebrow">Usuario ERPNext</p><h2>Perfil de usuario</h2><p className="muted">Datos informativos obtenidos de la instancia activa. No se modifican desde aquí.</p></div><span className="settings-section-icon" aria-hidden="true">◎</span></div>
        {userQuery.isPending ? <div className="settings-user-loading"><Spinner /> Cargando perfil…</div> : user ? <><dl className="settings-user-details"><UserDetail label="Nombre" value={user.displayName} /><UserDetail label="Correo" value={user.email} /><UserDetail label="Usuario" value={user.username || user.name} /><UserDetail label="Tipo de usuario" value={user.userType} /><UserDetail label="Estado" value={user.enabled === undefined ? undefined : user.enabled ? 'Activo' : 'Desactivado'} /><UserDetail label="Móvil" value={user.mobile} /><UserDetail label="Teléfono" value={user.phone} /><UserDetail label="Idioma" value={user.language} /><UserDetail label="Zona horaria" value={user.timeZone} /><UserDetail label="Creado" value={formatProfileDate(user.creation)} /><UserDetail label="Último acceso" value={formatProfileDate(user.lastLogin)} /></dl><div className="settings-user-roles"><span className="field-label">Roles</span>{user.roles.length ? <div className="settings-role-list">{user.roles.map((role) => <span key={role}>{role}</span>)}</div> : <p className="muted">No se devolvieron roles.</p>}</div>{userQuery.data?.warning && <Notice tone="warning">{userQuery.data.warning}</Notice>}<RefreshButton className="settings-user-refresh" label="Actualizar perfil" loading={userQuery.isFetching} onClick={() => { void userQuery.refetch() }} /></> : null}
      </div>

      <div className="card settings-theme-card">
        <div className="settings-section-heading"><div><p className="settings-eyebrow">Apariencia</p><h2>Paleta de colores</h2><p className="muted">El cambio se aplica a toda la aplicación y se guarda en este navegador.</p></div><span className="settings-theme-current" style={{ background: activeTheme.colors.primary }} aria-label={`Paleta activa: ${activeTheme.name}`} /></div>
        <div className="theme-preview" aria-label="Vista previa de la paleta activa"><div><span className="theme-preview-label">Vista previa</span><strong>{activeTheme.name}</strong></div><div className="theme-preview-actions"><span className="theme-preview-chip">Datos sincronizados</span><Button size="compact">Acción principal</Button><Button size="compact" variant="secondary">Secundaria</Button></div></div>
        <div className="theme-grid" role="radiogroup" aria-label="Paletas disponibles">{themes.map((entry) => <button key={entry.id} type="button" role="radio" aria-checked={entry.id === theme} className={`theme-option${entry.id === theme ? ' theme-option-active' : ''}`} onClick={() => setTheme(entry.id)}><span className="theme-option-swatches" aria-hidden="true"><i style={{ background: entry.colors.primary }} /><i style={{ background: entry.colors.secondary }} /><i style={{ background: entry.colors.accent }} /><i style={{ background: entry.colors.page }} /></span><span className="theme-option-copy"><strong>{entry.name}</strong><small>{entry.description}</small></span><span className="theme-option-check" aria-hidden="true">{entry.id === theme ? '✓' : ''}</span></button>)}</div>
      </div>
    </div>
  </section>
}
