import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Notice, RefreshButton, Spinner } from './ui'
import { localDate } from '../lib/sales-orders'
import { cacheTtlLabel, readManagedCacheOverviews, runManagedCacheRefresh, type ManagedCacheId, type ManagedCacheOverview, type ManagedRefreshContext } from '../lib/cache-manager'
import { queryKeys } from '../lib/query-keys'
import type { PosProfile } from '../lib/types'
import type { createErpNextClient } from '../lib/erpnext'

type Client = ReturnType<typeof createErpNextClient>

const cacheOrder: ManagedCacheId[] = ['products', 'variants', 'uom', 'prices', 'priceLists', 'stock', 'suppliers', 'customers', 'doctypes', 'posContext', 'shifts', 'salesOrders', 'quotations']

function formatDate(value?: string) {
  if (!value) return 'Nunca'
  const parsed = new Date(value.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('es-MX')
}

function statusLabel(status: ManagedCacheOverview['status']) {
  if (status === 'fresh') return 'Actualizada'
  if (status === 'stale') return 'Posiblemente desactualizada'
  if (status === 'error') return 'Error parcial'
  return 'Sin caché'
}

function statusTone(status: ManagedCacheOverview['status']) {
  if (status === 'fresh') return 'success' as const
  if (status === 'stale' || status === 'error') return 'warning' as const
  return 'neutral' as const
}

function relatedQueryKeys(profileId: string, id: ManagedCacheId) {
  const keys: Array<readonly unknown[]> = []
  if (id === 'products') keys.push(queryKeys.catalog.item(profileId))
  if (id === 'variants' || id === 'uom') { keys.push(queryKeys.catalog.variant(profileId), queryKeys.uom.options(profileId)) }
  if (id === 'prices') keys.push(queryKeys.catalog.price(profileId))
  if (id === 'priceLists') keys.push(queryKeys.prices.lists(profileId))
  if (id === 'stock') keys.push(queryKeys.catalog.stock(profileId))
  if (id === 'suppliers') keys.push(queryKeys.catalog.supplier(profileId))
  if (id === 'doctypes') keys.push(queryKeys.catalog.doctype(profileId))
  if (id === 'customers') keys.push(queryKeys.salesOrders.customers(profileId), queryKeys.pos.customers(profileId))
  if (id === 'salesOrders') keys.push(queryKeys.salesOrders.cache(profileId), ['sales-orders', profileId])
  if (id === 'posContext') keys.push(queryKeys.pos.profiles(profileId), queryKeys.pos.settings(profileId), ['pos-payment-methods', profileId])
  if (id === 'shifts') keys.push(queryKeys.pos.currentUser(profileId), queryKeys.pos.openings(profileId), queryKeys.pos.profiles(profileId), ['pos-shift-profile-details', profileId])
  if (id === 'quotations') keys.push(queryKeys.quotations.list(profileId))
  return keys
}

function CacheCard({ entry, busy, onRefresh }: { entry: ManagedCacheOverview; busy: boolean; onRefresh: (id: ManagedCacheId) => void }) {
  return <Card className="settings-cache-card">
    <div className="settings-cache-card-header"><div><p className="settings-eyebrow">Caché local</p><h3>{entry.label}</h3></div><Badge tone={statusTone(entry.status)}>{busy ? 'Refrescando…' : statusLabel(entry.status)}</Badge></div>
    <p className="settings-cache-description">{entry.description}</p>
    <dl className="settings-cache-details"><div><dt>Último fetch</dt><dd>{formatDate(entry.updatedAt)}</dd></div><div><dt>Registros</dt><dd>{entry.count === undefined ? '—' : entry.count.toLocaleString('es-MX')}</dd></div><div><dt>Vigencia orientativa</dt><dd>{cacheTtlLabel(entry.id)}</dd></div></dl>
    <div className="settings-cache-doctypes"><span>DocTypes</span><div>{entry.doctypes.map((doctype) => <span key={doctype}>{doctype}</span>)}</div></div>
    {entry.requiresContext && !entry.updatedAt && <p className="settings-cache-hint">Usa el POS Profile activo y la fecha actual. Si no hay compañía configurada, primero define Preferencias del POS.</p>}
    {entry.error && <p className="settings-cache-error" role="alert">Último error: {entry.error}</p>}
    <div className="settings-cache-actions"><RefreshButton label={`Refrescar ${entry.label}`} loading={busy} disabled={busy} onClick={() => onRefresh(entry.id)} /><span className="settings-cache-attempt">Intento: {formatDate(entry.lastAttemptAt)}</span></div>
  </Card>
}

export function CacheManagerPanel({ client, profileId, activeProfile }: { client: Client; profileId: string; activeProfile?: PosProfile }) {
  const queryClient = useQueryClient()
  const [busyIds, setBusyIds] = useState<ManagedCacheId[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const overview = useQuery({ queryKey: queryKeys.settings.cacheOverview(profileId), queryFn: () => readManagedCacheOverviews(profileId), staleTime: Infinity })
  const entries = useMemo(() => cacheOrder.map((id) => overview.data?.find((entry) => entry.id === id)).filter(Boolean) as ManagedCacheOverview[], [overview.data])
  const context: ManagedRefreshContext = { client, profileId, activeProfile, date: localDate() }

  async function invalidateRelated(id: ManagedCacheId) {
    await Promise.all(relatedQueryKeys(profileId, id).map((queryKey) => queryClient.invalidateQueries({ queryKey, refetchType: 'active' })))
  }

  const refresh = useMutation({ mutationFn: async (id: ManagedCacheId) => runManagedCacheRefresh(id, context, (progress) => setMessage(progress)), onSuccess: async (_result, id) => { await invalidateRelated(id); await overview.refetch(); setMessage(`${entries.find((entry) => entry.id === id)?.label ?? 'Caché'} actualizada.`) }, onError: async (reason) => { setError(reason instanceof Error ? reason.message : 'No se pudo actualizar la caché.'); await overview.refetch() } })

  async function refreshOne(id: ManagedCacheId) {
    setError(''); setBusyIds((current) => [...current, id])
    try { await refresh.mutateAsync(id) } finally { setBusyIds((current) => current.filter((value) => value !== id)) }
  }

  async function refreshAll() {
    setError(''); setMessage('Actualizando cachés…'); setBusyIds(cacheOrder)
    const results = await Promise.allSettled(cacheOrder.map((id) => runManagedCacheRefresh(id, context, (progress) => setMessage(progress))))
    const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    await Promise.all(cacheOrder.map((id) => invalidateRelated(id)))
    await overview.refetch()
    setBusyIds([])
    if (failed.length) { setError(`${failed.length} caché(s) no pudieron actualizarse. La información anterior se conservó.`); setMessage(`${cacheOrder.length - failed.length} caché(s) actualizadas con resultados parciales.`) } else setMessage(`${cacheOrder.length} caché(s) actualizadas.`)
  }

  return <section className="settings-cache-panel" aria-labelledby="settings-cache-title">
    <div className="settings-cache-toolbar"><div><p className="settings-eyebrow">Sincronización local</p><h2 id="settings-cache-title">Cachés y último fetch</h2><p className="muted">Los datos se guardan por conexión en este navegador. Los errores no eliminan la caché anterior.</p></div><Button type="button" onClick={() => void refreshAll()} disabled={busyIds.length > 0}>{busyIds.length > 0 ? <><Spinner /> Actualizando…</> : 'Refrescar todo'}</Button></div>
    {(message || error) && <Notice tone={error ? 'warning' : 'info'}><span role="status" aria-live="polite">{error || message}</span></Notice>}
    {overview.isError && <Notice>{overview.error instanceof Error ? overview.error.message : 'No se pudo leer el estado de las cachés.'}</Notice>}
    {overview.isPending ? <div className="settings-cache-loading"><Spinner /> Leyendo estado local…</div> : <div className="settings-cache-grid">{entries.map((entry) => <CacheCard key={entry.id} entry={entry} busy={busyIds.includes(entry.id)} onRefresh={(id) => void refreshOne(id)} />)}</div>}
  </section>
}
