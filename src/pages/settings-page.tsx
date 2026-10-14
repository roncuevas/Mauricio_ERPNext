import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Notice, PageHeader, Spinner } from '../components/ui'
import { useTheme } from '../components/theme-provider'
import { createErpNextClient } from '../lib/erpnext'
import type { ConnectionProfile } from '../lib/types'

export function SettingsPage({ connection, onLock }: { connection: ConnectionProfile; onLock: () => void }) {
  const [user, setUser] = useState('')
  const [error, setError] = useState('')
  const client = useMemo(() => createErpNextClient(connection), [connection])
  const test = useMutation({ mutationFn: client.getCurrentUser, onSuccess: setUser, onError: (reason) => setError(reason.message) })
  const { theme, setTheme, themes } = useTheme()
  const activeTheme = themes.find((entry) => entry.id === theme) ?? themes[0]

  return <section>
    <PageHeader title="Configuración" description="Administra tu conexión y personaliza la apariencia de esta aplicación." />
    <div className="settings-grid">
      <div className="card settings-connection-card">
        <div className="settings-section-heading"><div><p className="settings-eyebrow">Conexión</p><h2>Instancia ERPNext</h2></div><span className="settings-section-icon" aria-hidden="true">↗</span></div>
        <dl className="settings-connection-details"><div><dt className="field-label">Perfil</dt><dd>{connection.label}</dd></div><div><dt className="field-label">Instancia</dt><dd className="break-all">{connection.baseUrl}</dd></div></dl>
        <div className="settings-actions"><Button onClick={() => { setError(''); test.mutate() }} disabled={test.isPending}>{test.isPending ? <><Spinner /> Probando</> : 'Probar conexión'}</Button><Button variant="secondary" onClick={onLock}>Bloquear sesión</Button></div>
        {user && <Notice tone="info">Conectado como {user}</Notice>}{error && <div className="mt-4"><Notice>{error}</Notice></div>}
      </div>

      <div className="card settings-theme-card">
        <div className="settings-section-heading"><div><p className="settings-eyebrow">Apariencia</p><h2>Paleta de colores</h2><p className="muted">El cambio se aplica a toda la aplicación y se guarda en este navegador.</p></div><span className="settings-theme-current" style={{ background: activeTheme.colors.primary }} aria-label={`Paleta activa: ${activeTheme.name}`} /></div>
        <div className="theme-preview" aria-label="Vista previa de la paleta activa"><div><span className="theme-preview-label">Vista previa</span><strong>{activeTheme.name}</strong></div><div className="theme-preview-actions"><span className="theme-preview-chip">Datos sincronizados</span><Button size="compact">Acción principal</Button><Button size="compact" variant="secondary">Secundaria</Button></div></div>
        <div className="theme-grid" role="radiogroup" aria-label="Paletas disponibles">{themes.map((entry) => <button key={entry.id} type="button" role="radio" aria-checked={entry.id === theme} className={`theme-option${entry.id === theme ? ' theme-option-active' : ''}`} onClick={() => setTheme(entry.id)}><span className="theme-option-swatches" aria-hidden="true"><i style={{ background: entry.colors.primary }} /><i style={{ background: entry.colors.secondary }} /><i style={{ background: entry.colors.accent }} /><i style={{ background: entry.colors.page }} /></span><span className="theme-option-copy"><strong>{entry.name}</strong><small>{entry.description}</small></span><span className="theme-option-check" aria-hidden="true">{entry.id === theme ? '✓' : ''}</span></button>)}</div>
      </div>
    </div>
  </section>
}
