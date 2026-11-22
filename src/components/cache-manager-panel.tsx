import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { Badge, Button, Notice, RefreshButton, Spinner } from './ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { cacheTtlLabel, managedCacheOrder, readManagedCacheOverviews, type ManagedCacheId, type ManagedCacheOverview } from '../lib/cache-manager'
import { useManagedCacheRefresh } from './use-managed-cache-refresh'
import { relativeAge } from '../lib/relative-time'
import { queryKeys } from '../lib/query-keys'
import type { PosProfile } from '../lib/types'
import type { createErpNextClient } from '../lib/erpnext'

type Client = ReturnType<typeof createErpNextClient>

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

function CacheRow({ entry, busy, onRefresh }: { entry: ManagedCacheOverview; busy: boolean; onRefresh: (id: ManagedCacheId, retryOnly?: boolean) => void }) {
  const { t, i18n } = useTranslation()
  const label = t(`cache.labels.${entry.id}`)
  const locale = i18n.language === 'en' ? 'en-US' : 'es-MX'
  const showLastSuccess = entry.lastSuccessAt && entry.lastSuccessAt !== entry.updatedAt
  return <li className="cache-row" data-status={entry.status}>
    <div className="cache-row-main">
      <div className="cache-row-title"><h3>{label}</h3><Badge tone={statusTone(entry.status)}>{busy ? t('cache.refreshing') : cacheStatusLabel(entry, t)}</Badge></div>
      <p className="cache-row-description">{t(`cache.descriptions.${entry.id}`, { defaultValue: entry.description })}</p>
      <p className="cache-row-doctypes">{entry.doctypes.join(' · ')}</p>
    </div>
    <dl className="cache-row-stats">
      <div><dt>{t('cache.records')}</dt><dd className="tabular-nums">{entry.count === undefined || !entry.updatedAt ? '—' : entry.count.toLocaleString(locale)}</dd></div>
      <div><dt>{t('cache.lastFetch')}</dt><dd><time dateTime={entry.updatedAt} title={formatDate(entry.updatedAt, i18n.language)}>{relativeAge(entry.updatedAt, i18n.language) ?? t('common.never')}</time></dd></div>
      <div><dt>{t('cache.validity')}</dt><dd>{cacheTtlLabel(entry.id)}</dd></div>
    </dl>
    <div className="cache-row-actions">{entry.error && entry.issues?.length ? <Button type="button" variant="secondary" size="compact" disabled={busy} onClick={() => onRefresh(entry.id, true)}>{t('cache.retryErrors')}</Button> : null}<RefreshButton label={`${t('common.refresh')} ${label}`} loading={busy} disabled={busy} onClick={() => onRefresh(entry.id)} /></div>
    {entry.requiresContext && !entry.updatedAt && <p className="cache-row-note cache-row-hint">{t('cache.contextHint')}</p>}
    {entry.error && <div className="cache-row-note cache-row-error" role="alert"><p>{entry.error}</p>{showLastSuccess && <p>{t('cache.lastSuccess')}: {formatDate(entry.lastSuccessAt, i18n.language)}</p>}{entry.issues?.map((issue, index) => <p key={`${issue.doctype}-${issue.operation}-${index}`}><strong>{issue.doctype}</strong>: {issue.message}{issue.field ? ` (${t('cache.removedField')}: ${issue.field})` : ''}</p>)}</div>}
  </li>
}

function cacheStatusLabel(entry: ManagedCacheOverview, t: TFunction) {
  return entry.status === 'fresh' ? t('cache.updated') : entry.status === 'stale' ? t('cache.stale') : entry.status === 'error' ? t('cache.partialError') : t('cache.withoutCache')
}

export function CacheSyncTable({ entries, busyIds, onRefresh }: { entries: ManagedCacheOverview[]; busyIds: ManagedCacheId[]; onRefresh: (id: ManagedCacheId) => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'en' ? 'en-US' : 'es-MX'
  return <div className="cache-sync-scroll"><Table className="cache-sync-table">
    <TableHeader><TableRow><TableHead>{t('cache.data')}</TableHead><TableHead className="text-right">{t('cache.records')}</TableHead><TableHead>{t('cache.lastFetch')}</TableHead><TableHead><span className="sr-only">{t('common.refresh')}</span></TableHead></TableRow></TableHeader>
    <TableBody>{entries.map((entry) => {
      const busy = busyIds.includes(entry.id)
      const label = t(`cache.labels.${entry.id}`)
      return <TableRow key={entry.id} data-status={entry.status}>
        <TableCell><div className="cache-sync-name-cell"><span className="cache-sync-name">{label}</span>{entry.status !== 'fresh' && <Badge tone={statusTone(entry.status)}>{busy ? t('cache.refreshing') : cacheStatusLabel(entry, t)}</Badge>}</div></TableCell>
        <TableCell className="text-right tabular-nums">{entry.count === undefined || !entry.updatedAt ? '—' : entry.count.toLocaleString(locale)}</TableCell>
        <TableCell><time dateTime={entry.updatedAt} title={formatDate(entry.updatedAt, i18n.language)}>{relativeAge(entry.updatedAt, i18n.language) ?? t('common.never')}</time></TableCell>
        <TableCell className="text-right"><RefreshButton label={`${t('common.refresh')} ${label}`} loading={busy} disabled={busy} onClick={() => onRefresh(entry.id)} /></TableCell>
      </TableRow>
    })}</TableBody>
  </Table></div>
}

export function CacheManagerPanel({ client, profileId, activeProfile, onChanged }: { client: Client; profileId: string; activeProfile?: PosProfile; onChanged?: () => void }) {
  const { t } = useTranslation()
  const overview = useQuery({ queryKey: queryKeys.settings.cacheOverview(profileId), queryFn: () => readManagedCacheOverviews(profileId), staleTime: Infinity })
  const entries = useMemo(() => managedCacheOrder.map((id) => overview.data?.find((entry) => entry.id === id)).filter(Boolean) as ManagedCacheOverview[], [overview.data])
  const { busyIds, message, error, refreshOne, refreshMany } = useManagedCacheRefresh({ client, profileId, activeProfile, onSettled: onChanged })
  const refreshAll = () => refreshMany()

  return <section className="card settings-section" aria-labelledby="settings-cache-title">
    <header className="settings-section-header settings-section-header-action"><div><h2 id="settings-cache-title">{t('cache.syncTitle')}</h2><p>{t('cache.syncDescription')}</p></div><Button type="button" onClick={() => void refreshAll()} disabled={busyIds.length > 0}>{busyIds.length > 0 ? <><Spinner /> {t('cache.updating')}</> : t('cache.all')}</Button></header>
    <div className="settings-section-body">
      {(message || error) && <Notice tone={error ? 'warning' : 'info'}><span role="status" aria-live="polite">{error || message}</span></Notice>}
      {overview.isError && <Notice>{overview.error instanceof Error ? overview.error.message : t('cache.readError')}</Notice>}
      {overview.isPending ? <div className="settings-loading"><Spinner /> {t('cache.reading')}</div> : <ul className="cache-list">{entries.map((entry) => <CacheRow key={entry.id} entry={entry} busy={busyIds.includes(entry.id)} onRefresh={(id, retryOnly) => void refreshOne(id, retryOnly)} />)}</ul>}
    </div>
  </section>
}
