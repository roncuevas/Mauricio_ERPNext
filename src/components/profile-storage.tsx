import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, Notice, Spinner } from './ui'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from './ui/item'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { useConfirmDialog } from './confirm-dialog'
import { clearProfileData, listProfilesWithData, measureProfileData, type ProfileDataUsage } from '../lib/profile-data'
import { readProfiles } from '../lib/storage'
import { queryKeys } from '../lib/query-keys'
import type { StoredProfile } from '../lib/types'

/** Bytes as B, KB, MB or GB, with one decimal from megabytes up, in the interface language. */
function formatBytes(bytes: number, language: string) {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1 }
  return `${new Intl.NumberFormat(language === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: unit < 2 ? 0 : 1 }).format(value)} ${units[unit]}`
}

async function readStorage() {
  const profiles = readProfiles()
  const known = new Set(profiles.map((profile) => profile.id))
  const orphanIds = (await listProfilesWithData()).filter((id) => !known.has(id))
  const [usage, orphans] = await Promise.all([
    Promise.all(profiles.map(async (profile) => ({ profile, usage: await measureProfileData(profile.id) }))),
    Promise.all(orphanIds.map(measureProfileData)),
  ])
  const total = [...usage.map((entry) => entry.usage), ...orphans].reduce((sum, entry) => sum + entry.total, 0)
  return { usage, orphans, total }
}

function UsageDetail({ usage }: { usage: ProfileDataUsage }) {
  const { t, i18n } = useTranslation()
  const size = (bytes: number) => formatBytes(bytes, i18n.language)
  const rows = [
    ...usage.caches.map((entry) => ({ key: entry.id, label: t(`cache.labels.${entry.id}`), bytes: entry.bytes, kept: false })),
    ...(usage.images.count ? [{ key: 'images', label: t('profileStorage.images', { count: usage.images.count }), bytes: usage.images.bytes, kept: false }] : []),
    ...(usage.carts ? [{ key: 'carts', label: t('profileStorage.carts'), bytes: usage.carts, kept: true }] : []),
    ...(usage.preferences ? [{ key: 'preferences', label: t('profileStorage.preferences'), bytes: usage.preferences, kept: true }] : []),
  ].sort((a, b) => Number(a.kept) - Number(b.kept) || b.bytes - a.bytes)
  if (!rows.length) return null
  return <Collapsible className="profile-storage-detail">
    <CollapsibleTrigger asChild><Button type="button" variant="link" className="profile-storage-toggle">{t('profileStorage.detail')}<ChevronDown aria-hidden="true" /></Button></CollapsibleTrigger>
    <CollapsibleContent>
      <dl className="profile-storage-breakdown">{rows.map((row) => <div key={row.key} data-kept={row.kept || undefined}>
        <dt>{row.label}{row.kept && <span>{t('profileStorage.kept')}</span>}</dt>
        <dd>{size(row.bytes)}</dd>
      </div>)}</dl>
    </CollapsibleContent>
  </Collapsible>
}

/** Measures every saved profile and clears their data, with the confirmation dialog it needs. */
function useProfileStorage(activeProfileId?: string) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirmDialog()
  const storage = useQuery({ queryKey: queryKeys.settings.profileStorage(), queryFn: readStorage, staleTime: 0, refetchOnMount: 'always' })
  const size = (bytes: number) => formatBytes(bytes, i18n.language)

  const clear = useMutation({
    mutationFn: async ({ ids, everything }: { ids: string[]; everything: boolean }) => { for (const id of ids) await clearProfileData(id, { everything }) },
    onSuccess: async (_result, { ids }) => {
      // Screens of the open profile read from the cache it just lost: start them over from the now empty cache.
      if (activeProfileId && ids.includes(activeProfileId)) await queryClient.resetQueries({ predicate: (query) => query.queryKey.includes(activeProfileId) })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.settings.profileStorage() }),
  })

  async function clearProfile(profile: StoredProfile, usage: ProfileDataUsage) {
    const active = profile.id === activeProfileId
    const ok = await confirm({
      title: t('profileStorage.clearTitle', { label: profile.label }),
      description: `${t('profileStorage.clearDescription', { size: size(usage.cacheBytes) })}${active ? ` ${t('profileStorage.clearActive')}` : ''}`,
      confirmLabel: t('profileStorage.clear'),
      tone: 'danger',
    })
    if (ok) clear.mutate({ ids: [profile.id], everything: false })
  }

  async function clearOrphans(orphans: ProfileDataUsage[]) {
    const total = orphans.reduce((sum, entry) => sum + entry.total, 0)
    const ok = await confirm({ title: t('profileStorage.orphansTitle'), description: t('profileStorage.orphansDescription', { size: size(total) }), confirmLabel: t('profileStorage.clear'), tone: 'danger' })
    if (ok) clear.mutate({ ids: orphans.map((entry) => entry.profileId), everything: true })
  }

  return { storage, clear, dialog, size, clearProfile, clearOrphans, activeProfileId }
}

type ProfileStorageState = ReturnType<typeof useProfileStorage>

function MeasureButton({ state }: { state: ProfileStorageState }) {
  const { t } = useTranslation()
  return <Button type="button" variant="secondary" size="compact" disabled={state.storage.isFetching || state.clear.isPending} onClick={() => void state.storage.refetch()}>{state.storage.isFetching ? <Spinner /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}{t('profileStorage.measure')}</Button>
}

function ProfileStorageList({ state }: { state: ProfileStorageState }) {
  const { t } = useTranslation()
  const { storage, clear, size, activeProfileId } = state
  const busyIds = clear.isPending ? clear.variables.ids : []
  const orphans = storage.data?.orphans ?? []
  return <>
    {storage.isError && <Notice>{storage.error instanceof Error ? storage.error.message : t('cache.readError')}</Notice>}
    {clear.isError && <Notice>{clear.error instanceof Error ? clear.error.message : t('profileStorage.clearError')}</Notice>}
    {storage.isPending ? <p className="settings-facts-pending"><Spinner /> {t('profileStorage.measuring')}</p> : <ItemGroup>
      {storage.data?.usage.map(({ profile, usage }) => {
        const busy = busyIds.includes(profile.id)
        return <Item key={profile.id} role="listitem" size="sm" className="cache-item profile-storage-item">
          <ItemContent>
            <ItemTitle><h3>{profile.label}</h3>{profile.id === activeProfileId && <Badge tone="info">{t('profileStorage.current')}</Badge>}</ItemTitle>
            <ItemDescription>{[profile.userName, profile.baseUrl.replace(/^https?:\/\//, '')].filter(Boolean).join(' · ')}</ItemDescription>
            <UsageDetail usage={usage} />
          </ItemContent>
          <ItemActions>
            <strong className="profile-storage-size" data-empty={!usage.total || undefined}>{usage.total ? size(usage.total) : t('profileStorage.nothing')}</strong>
            <Button type="button" variant="secondary" size="compact" disabled={!usage.cacheBytes || clear.isPending} onClick={() => void state.clearProfile(profile, usage)}>{busy ? <><Spinner /> {t('profileStorage.clearing')}</> : usage.cacheBytes ? t('profileStorage.clear') : t('profileStorage.empty')}</Button>
          </ItemActions>
        </Item>
      })}
      {orphans.length > 0 && <Item role="listitem" size="sm" className="cache-item profile-storage-item">
        <ItemContent>
          <ItemTitle><h3>{t('profileStorage.orphans')}</h3></ItemTitle>
          <ItemDescription>{t('profileStorage.orphansHint', { count: orphans.length })}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <strong className="profile-storage-size">{size(orphans.reduce((sum, entry) => sum + entry.total, 0))}</strong>
          <Button type="button" variant="secondary" size="compact" disabled={clear.isPending} onClick={() => void state.clearOrphans(orphans)}>{t('profileStorage.clear')}</Button>
        </ItemActions>
      </Item>}
    </ItemGroup>}
    {storage.data && <p className="profile-storage-total"><span>{t('profileStorage.total')}</span><strong>{size(storage.data.total)}</strong></p>}
    {state.dialog}
  </>
}

/** How much each saved connection keeps in this browser, with a way to clear its downloaded data. */
export function ProfileStorageCard({ activeProfileId }: { activeProfileId: string }) {
  const { t } = useTranslation()
  const state = useProfileStorage(activeProfileId)
  return <Card className="settings-card profile-storage-card">
    <CardHeader>
      <CardTitle as="h2">{t('profileStorage.title')}</CardTitle>
      <CardDescription>{t('profileStorage.description')}</CardDescription>
      <CardAction><MeasureButton state={state} /></CardAction>
    </CardHeader>
    <CardContent><ProfileStorageList state={state} /></CardContent>
  </Card>
}

function ProfileStorageSheetBody() {
  const { t } = useTranslation()
  const state = useProfileStorage()
  return <>
    <SheetHeader className="profile-storage-sheet-header">
      <SheetTitle>{t('profileStorage.title')}</SheetTitle>
      <SheetDescription>{t('profileStorage.description')}</SheetDescription>
      <div><MeasureButton state={state} /></div>
    </SheetHeader>
    <div className="profile-storage-sheet-body"><ProfileStorageList state={state} /></div>
  </>
}

/**
 * The same storage view for the login screen, where no profile is open yet; it measures only while open. `children`
 * holds its `SheetTrigger`, so closing returns focus to it.
 */
export function ProfileStorageSheet({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return <Sheet open={open} onOpenChange={setOpen}>
    {children}
    <SheetContent side="right" className="profile-storage-sheet">{open && <ProfileStorageSheetBody />}</SheetContent>
  </Sheet>
}
