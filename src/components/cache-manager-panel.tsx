import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Notice, RefreshButton, Spinner } from './ui'
import { localDate } from '../lib/sales-orders'
import { cacheTtlLabel, readManagedCacheOverviews, runManagedCacheRefresh, type ManagedCacheId, type ManagedCacheOverview, type ManagedRefreshContext } from '../lib/cache-manager'
import { queryKeys } from '../lib/query-keys'
import type { PosProfile } from '../lib/types'
import type { createErpNextClient } from '../lib/erpnext'

type Client = ReturnType<typeof createErpNextClient>

const cacheOrder: ManagedCacheId[] = ['products', 'variants', 'uom', 'prices', 'priceLists', 'stock', 'suppliers', 'customers', 'doctypes', 'posContext', 'shifts', 'salesOrders', 'quotations']
const contextCacheIds: ManagedCacheId[] = ['salesOrders', 'quotations']

function formatDate(value?: string, language = 'es') {
  if (!value) return ''
  const parsed = new Date(value.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(language === 'en' ? 'en-US' : 'es-MX')
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

function CacheCard({ entry, busy, onRefresh }: { entry: ManagedCacheOverview; busy: boolean; onRefresh: (id: ManagedCacheId, retryOnly?: boolean) => void }) {
  const { t, i18n } = useTranslation()
  const statusLabel = entry.status === 'fresh' ? t('cache.updated') : entry.status === 'stale' ? t('cache.stale') : entry.status === 'error' ? t('cache.partialError') : t('cache.withoutCache')
  return <Card className="settings-cache-card">
    <div className="settings-cache-card-header"><div><p className="settings-eyebrow">{t('cache.local')}</p><h3>{t(`cache.labels.${entry.id}`)}</h3></div><Badge tone={statusTone(entry.status)}>{busy ? t('cache.refreshing') : statusLabel}</Badge></div>
    <p className="settings-cache-description">{entry.description}</p>
    <dl className="settings-cache-details"><div><dt>{t('cache.lastFetch')}</dt><dd>{formatDate(entry.updatedAt, i18n.language) || t('common.never')}</dd></div><div><dt>{t('cache.lastSuccess')}</dt><dd>{formatDate(entry.lastSuccessAt, i18n.language) || t('common.never')}</dd></div><div><dt>{t('cache.records')}</dt><dd>{entry.count === undefined ? '—' : entry.count.toLocaleString(i18n.language === 'en' ? 'en-US' : 'es-MX')}</dd></div><div><dt>{t('cache.validity')}</dt><dd>{cacheTtlLabel(entry.id)}</dd></div></dl>
    {/* i18next-instrument-ignore-next-line */}
    <div className="settings-cache-doctypes"><span>DocTypes</span><div>{entry.doctypes.map((doctype) => <span key={doctype}>{doctype}</span>)}</div></div>
    {entry.requiresContext && !entry.updatedAt && <p className="settings-cache-hint">{t('cache.contextHint')}</p>}
    {entry.error && <div className="settings-cache-error" role="alert"><p>{entry.error}</p>{entry.issues?.map((issue, index) => <p key={`${issue.doctype}-${issue.operation}-${index}`}><strong>{issue.doctype}</strong>: {issue.message}{issue.field ? ` (${t('cache.removedField')}: ${issue.field})` : ''}</p>)}</div>}
    <div className="settings-cache-actions"><RefreshButton label={`${t('common.refresh')} ${t(`cache.labels.${entry.id}`)}`} loading={busy} disabled={busy} onClick={() => onRefresh(entry.id)} />{entry.error && entry.issues?.length ? <Button type="button" variant="secondary" size="compact" disabled={busy} onClick={() => onRefresh(entry.id, true)}>{t('cache.retryErrors')}</Button> : null}<span className="settings-cache-attempt">{formatDate(entry.lastAttemptAt, i18n.language)}</span></div>
  </Card>
}

export function CacheManagerPanel({ client, profileId, activeProfile, onChanged }: { client: Client; profileId: string; activeProfile?: PosProfile; onChanged?: () => void }) {
  const { t } = useTranslation()
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

  const refresh = useMutation({ mutationFn: async ({ id, retryOnly }: { id: ManagedCacheId; retryOnly?: boolean }) => runManagedCacheRefresh(id, context, (progress) => setMessage(progress), retryOnly), onSuccess: async (_result, variables) => { await invalidateRelated(variables.id); await overview.refetch(); onChanged?.(); setMessage(t('cache.updateMessage', { label: t(`cache.labels.${variables.id}`) })) }, onError: async (reason) => { setError(reason instanceof Error ? reason.message : t('errors.unknown')); await overview.refetch(); onChanged?.() } })

  async function refreshOne(id: ManagedCacheId, retryOnly = false) {
    if (contextCacheIds.includes(id) && !activeProfile?.company) { setError(t('cache.contextRequired')); return }
    setError(''); setBusyIds((current) => [...current, id])
    try { await refresh.mutateAsync({ id, retryOnly }) } finally { setBusyIds((current) => current.filter((value) => value !== id)) }
  }

  async function refreshAll() {
    const refreshableIds = activeProfile?.company ? cacheOrder : cacheOrder.filter((id) => !contextCacheIds.includes(id))
    const skippedCount = cacheOrder.length - refreshableIds.length
    setError(''); setMessage(t('cache.updating')); setBusyIds(refreshableIds)
    const results = await Promise.allSettled(refreshableIds.map((id) => runManagedCacheRefresh(id, context, (progress) => setMessage(progress))))
    const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    await Promise.all(refreshableIds.map((id) => invalidateRelated(id)))
    await overview.refetch()
    onChanged?.()
    setBusyIds([])
    const skippedMessage = skippedCount ? ` ${t('cache.skippedContext', { count: skippedCount })}` : ''
    if (failed.length) { setError(t('cache.failed', { count: failed.length })); setMessage(`${t('cache.partialMessage', { count: refreshableIds.length - failed.length })}${skippedMessage}`) } else setMessage(`${t('cache.allUpdated', { count: refreshableIds.length })}${skippedMessage}`)
  }

  return <section className="settings-cache-panel" aria-labelledby="settings-cache-title">
    <div className="settings-cache-toolbar"><div><p className="settings-eyebrow">{t('cache.local')}</p><h2 id="settings-cache-title">{t('cache.syncTitle')}</h2><p className="muted">{t('cache.syncDescription')}</p></div><Button type="button" onClick={() => void refreshAll()} disabled={busyIds.length > 0}>{busyIds.length > 0 ? <><Spinner /> {t('cache.updating')}</> : t('cache.all')}</Button></div>
    {(message || error) && <Notice tone={error ? 'warning' : 'info'}><span role="status" aria-live="polite">{error || message}</span></Notice>}
    {overview.isError && <Notice>{overview.error instanceof Error ? overview.error.message : t('cache.readError')}</Notice>}
    {overview.isPending ? <div className="settings-cache-loading"><Spinner /> {t('cache.reading')}</div> : <div className="settings-cache-grid">{entries.map((entry) => <CacheCard key={entry.id} entry={entry} busy={busyIds.includes(entry.id)} onRefresh={(id) => void refreshOne(id)} />)}</div>}
  </section>
}
