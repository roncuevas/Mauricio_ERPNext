import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { contextCacheIds, managedCacheIdsForContext, managedCacheOrder, managedCacheQueryKeys, runManagedCacheRefresh, type ManagedCacheId, type ManagedRefreshContext } from '../lib/cache-manager'
import { localDate } from '../lib/sales-orders'
import { queryKeys } from '../lib/query-keys'
import type { PosProfile } from '../lib/types'
import type { createErpNextClient } from '../lib/erpnext'

type Client = ReturnType<typeof createErpNextClient>

export function useManagedCacheRefresh({ client, profileId, activeProfile, onSettled }: { client: Client; profileId: string; activeProfile?: PosProfile; onSettled?: () => void | Promise<unknown> }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [busyIds, setBusyIds] = useState<ManagedCacheId[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const context: ManagedRefreshContext = { client, profileId, activeProfile, date: localDate() }

  async function settle(ids: ManagedCacheId[]) {
    await Promise.all(ids.flatMap((id) => managedCacheQueryKeys(profileId, id)).map((queryKey) => queryClient.invalidateQueries({ queryKey, refetchType: 'active' })))
    await queryClient.invalidateQueries({ queryKey: queryKeys.settings.cacheOverview(profileId) })
    await onSettled?.()
  }

  const refresh = useMutation({ mutationFn: async ({ id, retryOnly }: { id: ManagedCacheId; retryOnly?: boolean }) => runManagedCacheRefresh(id, context, (progress) => setMessage(progress), retryOnly), onSuccess: async (_result, variables) => { await settle([variables.id]); setMessage(t('cache.updateMessage', { label: t(`cache.labels.${variables.id}`) })) }, onError: async (reason, variables) => { setMessage(''); setError(reason instanceof Error ? reason.message : t('errors.unknown')); await settle([variables.id]) } })

  async function refreshOne(id: ManagedCacheId, retryOnly = false) {
    if (contextCacheIds.includes(id) && !activeProfile?.company) { setError(t('cache.contextRequired')); return }
    setError(''); setBusyIds((current) => [...current, id])
    try { await refresh.mutateAsync({ id, retryOnly }) } catch { /* error state set by the mutation */ } finally { setBusyIds((current) => current.filter((value) => value !== id)) }
  }

  async function refreshMany(ids: ManagedCacheId[] = managedCacheOrder) {
    const allowed = managedCacheIdsForContext(activeProfile)
    const refreshableIds = ids.filter((id) => allowed.includes(id))
    const skippedCount = ids.length - refreshableIds.length
    if (!refreshableIds.length) { setError(t('cache.contextRequired')); return }
    setError(''); setMessage(t('cache.updating')); setBusyIds(refreshableIds)
    const results = await Promise.allSettled(refreshableIds.map((id) => runManagedCacheRefresh(id, context, (progress) => setMessage(progress))))
    const failed = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    await settle(refreshableIds)
    setBusyIds([])
    const skippedMessage = skippedCount ? ` ${t('cache.skippedContext', { count: skippedCount })}` : ''
    if (failed.length) { setError(t('cache.failed', { count: failed.length })); setMessage(`${t('cache.partialMessage', { count: refreshableIds.length - failed.length })}${skippedMessage}`) } else setMessage(`${refreshableIds.length === 1 ? t('cache.updateMessage', { label: t(`cache.labels.${refreshableIds[0]}`) }) : t('cache.allUpdated', { count: refreshableIds.length })}${skippedMessage}`)
  }

  return { busyIds, busy: busyIds.length > 0, message, error, refreshOne, refreshMany }
}

// Page-level refresh buttons share the cache manager's loaders so every screen
// downloads the same fields, applies the same fallbacks and updates the same caches.
export function useCatalogCacheRefresh({ client, profileId, onProgress }: { client: Client; profileId: string; onProgress?: (message: string) => void }) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: ManagedCacheId[]) => {
      const context: ManagedRefreshContext = { client, profileId, date: localDate() }
      for (const id of ids) await runManagedCacheRefresh(id, context, onProgress)
      return ids
    },
    onSettled: async (_result, _error, ids) => {
      await Promise.all(ids.flatMap((id) => managedCacheQueryKeys(profileId, id)).map((queryKey) => queryClient.invalidateQueries({ queryKey })))
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.cacheOverview(profileId) })
    },
  })
}
