import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Notice, PageHeader, Spinner } from '../components/ui'
import { createErpNextClient } from '../lib/erpnext'
import type { ConnectionProfile } from '../lib/types'

export function SettingsPage({ connection, onLock }: { connection: ConnectionProfile; onLock: () => void }) {
  const [user, setUser] = useState('')
  const [error, setError] = useState('')
  const client = useMemo(() => createErpNextClient(connection), [connection])
  const test = useMutation({ mutationFn: client.getCurrentUser, onSuccess: setUser, onError: (reason) => setError(reason.message) })
  return <section><PageHeader title="Conexión" description="La configuración se mantiene únicamente en este navegador." /><div className="card max-w-2xl p-5"><dl className="grid gap-4 sm:grid-cols-2"><div><dt className="field-label">Perfil</dt><dd className="mt-1 text-sm font-medium">{connection.label}</dd></div><div><dt className="field-label">Instancia</dt><dd className="mt-1 break-all text-sm font-medium">{connection.baseUrl}</dd></div></dl><div className="mt-6 flex flex-wrap gap-2"><Button onClick={() => { setError(''); test.mutate() }} disabled={test.isPending}>{test.isPending ? <Spinner /> : 'Probar conexión'}</Button><Button variant="secondary" onClick={onLock}>Bloquear sesión</Button></div>{user && <Notice tone="info">Conectado como {user}</Notice>}{error && <div className="mt-4"><Notice>{error}</Notice></div>}</div></section>
}
