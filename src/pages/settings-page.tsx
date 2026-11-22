import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Check, Database, Palette, Store, UserRound, type LucideIcon } from 'lucide-react'
import { Button, Input, Notice, PageHeader, RefreshButton, Spinner, ToggleGroup, ToggleGroupItem } from '../components/ui'
import { Checkbox } from '../components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { CacheManagerPanel } from '../components/cache-manager-panel'
import { EntityCombobox } from '../components/entity-combobox'
import { LanguageSelector } from '../components/language-selector'
import { useTheme } from '../components/theme-provider'
import { ErpNextError, createErpNextClient } from '../lib/erpnext'
import { normalizeUserProfile, type UserProfileSummary } from '../lib/user-profile'
import type { ConnectionProfile, PosProfile, PriceList } from '../lib/types'
import { queryKeys } from '../lib/query-keys'
import { clearPosPreferences, DEFAULT_POS_PREFERENCES, readPosPreferences, writePosPreferences, type PosPreferences } from '../lib/pos-preferences'
import { DEFAULT_APP_PREFERENCES, readAppPreferences, writeAppPreferences, type AppPreferences, type LandingRoute } from '../lib/app-preferences'
import { useTranslation } from 'react-i18next'
import { readPendingPreferences, writePendingPreferences, type PendingPreferences } from '../lib/pending-preferences'
import { downloadMissingProductImages } from '../lib/product-image-sync'

const TAB_VALUES = ['account', 'operation', 'interface', 'data'] as const
type SettingsTab = typeof TAB_VALUES[number]
const TAB_ICONS: Record<SettingsTab, LucideIcon> = { account: UserRound, operation: Store, interface: Palette, data: Database }
// Earlier releases linked to these tab ids; keep those links working.
const LEGACY_TABS: Record<string, SettingsTab> = { general: 'account', pos: 'operation', appearance: 'interface', language: 'interface', navigation: 'interface' }
type ProductView = 'table' | 'cards' | 'hierarchy'
const PRODUCT_VIEW_KEY = (profileId: string) => `mauricio-erpnext:products-view:${profileId}`
const DESKTOP_QUERY = '(min-width: 1024px)'

function resolveTab(value: string | null): SettingsTab {
  if (!value) return 'account'
  if (TAB_VALUES.includes(value as SettingsTab)) return value as SettingsTab
  return LEGACY_TABS[value] ?? 'account'
}

function formatProfileDate(value?: string) {
  if (!value) return undefined
  const date = new Date(value.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

async function loadUserProfile(client: ReturnType<typeof createErpNextClient>): Promise<{ profile: UserProfileSummary; warning?: string }> {
  const currentUser = await client.getCurrentUser()
  try {
    return { profile: normalizeUserProfile(await client.getUserProfile(currentUser), currentUser) }
  } catch (error) {
    if (error instanceof ErpNextError && error.status === 403) return { profile: normalizeUserProfile({ name: currentUser }, currentUser), warning: 'settings.profilePermission' }
    throw error
  }
}

function readProductView(profileId: string): ProductView {
  try {
    const value = localStorage.getItem(PRODUCT_VIEW_KEY(profileId))
    return value === 'cards' || value === 'hierarchy' ? value : 'table'
  } catch { return 'table' }
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

function SettingsSection({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  const id = useId()
  return <section className="card settings-section" aria-labelledby={id}>
    <header className="settings-section-header"><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</header>
    <div className="settings-section-body">{children}</div>
    {footer && <footer className="settings-section-footer">{footer}</footer>}
  </section>
}

/** One setting: name and explanation on the left, its control on the right (stacked on narrow screens). */
function SettingRow({ label, description, htmlFor, children }: { label: string; description?: string; htmlFor?: string; children: ReactNode }) {
  return <div className="settings-row">
    <div className="settings-row-copy">{htmlFor ? <label className="settings-row-label" htmlFor={htmlFor}>{label}</label> : <span className="settings-row-label">{label}</span>}{description && <p className="settings-row-description">{description}</p>}</div>
    <div className="settings-row-control">{children}</div>
  </div>
}

function CheckboxRow({ label, description, checked, onCheckedChange }: { label: string; description?: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  const id = useId()
  return <div className="settings-row settings-row-check">
    <Checkbox id={id} checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
    <div className="settings-row-copy"><label className="settings-row-label" htmlFor={id}>{label}</label>{description && <p className="settings-row-description">{description}</p>}</div>
  </div>
}

function SelectRow({ label, description, value, onValueChange, children }: { label: string; description?: string; value: string; onValueChange: (value: string) => void; children: ReactNode }) {
  const id = useId()
  return <SettingRow label={label} description={description} htmlFor={id}>
    <Select value={value} onValueChange={onValueChange}><SelectTrigger id={id} aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{children}</SelectContent></Select>
  </SettingRow>
}

function UserDetail({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}

export function SettingsPage({ connection, onLock }: { connection: ConnectionProfile; onLock: () => void }) {
  const { t } = useTranslation()
  const client = useMemo(() => createErpNextClient(connection), [connection])
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = resolveTab(searchParams.get('tab'))
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const thresholdId = useId()
  const userQuery = useQuery({ queryKey: queryKeys.settings.userProfile(connection.id), queryFn: () => loadUserProfile(client) })
  const posProfilesQuery = useQuery({ queryKey: queryKeys.pos.profiles(connection.id), queryFn: async () => (await client.listDocuments<PosProfile>('POS Profile', { fields: ['name', 'company', 'warehouse', 'currency', 'disabled'], pageLength: 100, orderBy: 'name asc' })).data.filter((profile) => profile.disabled !== true && profile.disabled !== 1 && String(profile.disabled) !== '1') })
  const pendingPriceListsQuery = useQuery({ queryKey: queryKeys.prices.lists(connection.id), queryFn: async () => (await client.listDocuments<PriceList>('Price List', { fields: ['name', 'selling', 'buying', 'enabled'], filters: [['enabled', '=', 1]], pageLength: 500, orderBy: 'name asc' })).data })
  const customersQuery = useQuery({ queryKey: queryKeys.pos.customers(connection.id), queryFn: async () => (await client.listDocuments<{ name: string; customer_name?: string }>('Customer', { fields: ['name', 'customer_name'], filters: [['disabled', '=', 0]], pageLength: 500, orderBy: 'customer_name asc' })).data })
  const [posDraft, setPosDraft] = useState<PosPreferences>(() => readPosPreferences(connection.id))
  const [posMessage, setPosMessage] = useState('')
  const [posError, setPosError] = useState('')
  const [imageSync, setImageSync] = useState<{ completed: number; total: number } | null>(null)
  const [imageSyncMessage, setImageSyncMessage] = useState('')
  const [imageSyncError, setImageSyncError] = useState('')
  const [appPreferences, setAppPreferences] = useState<AppPreferences>(() => readAppPreferences())
  const [pendingPreferences, setPendingPreferences] = useState<PendingPreferences>(() => readPendingPreferences(connection.id))
  const [productView, setProductView] = useState<ProductView>(() => readProductView(connection.id))
  const { theme, setTheme, themes, colorMode, toggleColorMode } = useTheme()
  const activeProfile = posProfilesQuery.data?.find((entry) => entry.name === posDraft.profileName) ?? posProfilesQuery.data?.[0]
  const user = userQuery.data?.profile
  const priceLists = pendingPriceListsQuery.data ?? []

  useEffect(() => {
    setProductView(readProductView(connection.id))
    setPosDraft(readPosPreferences(connection.id))
    setPendingPreferences(readPendingPreferences(connection.id))
  }, [connection.id])

  function selectTab(value: string) {
    if (!TAB_VALUES.includes(value as SettingsTab)) return
    setSearchParams((current) => { const next = new URLSearchParams(current); next.set('tab', value); return next }, { replace: true })
  }

  function updatePosDraft(patch: Partial<PosPreferences>) {
    setPosDraft((current) => ({ ...current, ...patch }))
    setPosMessage('')
  }

  function savePosPreferences() {
    setPosError('')
    const profile = posProfilesQuery.data?.find((entry) => entry.name === posDraft.profileName)
    const customer = customersQuery.data?.find((entry) => entry.name === posDraft.defaultCustomer)
    if (posDraft.profileName && !profile) return setPosError(t('settings.posProfileMissing'))
    if (posDraft.defaultCustomer && !customer) return setPosError(t('settings.customerMissing'))
    writePosPreferences(connection.id, posDraft)
    setPosMessage(t('settings.posSaved'))
  }

  function resetPosPreferences() {
    clearPosPreferences(connection.id)
    setPosDraft({ ...DEFAULT_POS_PREFERENCES })
    setPosError('')
    setPosMessage(t('settings.posReset'))
  }

  async function refreshMissingImages() {
    setImageSync({ completed: 0, total: 0 })
    setImageSyncMessage('')
    setImageSyncError('')
    try {
      const result = await downloadMissingProductImages(client, connection.id, (completed, total) => setImageSync({ completed, total }))
      const failureExamples = result.failureDetails.map((error) => t('productImages.syncFailureExample', { error })).join(' ')
      const remainingFailures = result.failed > result.failureDetails.length ? ` ${t('productImages.syncMoreFailures', { count: result.failed - result.failureDetails.length })}` : ''
      setImageSyncMessage(`${t('productImages.syncComplete', result)} ${failureExamples}${remainingFailures}`.trim())
    } catch (error) {
      setImageSyncError(error instanceof Error ? error.message : t('productImages.syncError'))
    } finally { setImageSync(null) }
  }

  function saveAppPreferences(patch: Partial<AppPreferences>) {
    setAppPreferences((current) => writeAppPreferences({ ...current, ...patch }))
  }

  function changePendingPreferences(patch: Partial<PendingPreferences>) {
    setPendingPreferences((current) => writePendingPreferences(connection.id, { ...current, ...patch }))
  }

  function changeProductView(next: ProductView) {
    setProductView(next)
    try { localStorage.setItem(PRODUCT_VIEW_KEY(connection.id), next) } catch { /* storage unavailable: keep the in-memory choice */ }
  }

  function restoreInterfacePreferences() {
    saveAppPreferences({ landingRoute: DEFAULT_APP_PREFERENCES.landingRoute, density: DEFAULT_APP_PREFERENCES.density })
    changeProductView('table')
  }

  function priceListOptions(selected: string, kind: 'buying' | 'selling') {
    const options = priceLists.filter((list) => Boolean(list[kind]))
    return <>{!options.some((list) => list.name === selected) && <SelectItem value={selected}>{selected}</SelectItem>}{options.map((list) => <SelectItem key={list.name} value={list.name}>{list.name}</SelectItem>)}</>
  }

  return <section className="settings-page">
    <PageHeader title={t('settings.title')} description={t('settings.description')} />
    <Tabs value={activeTab} onValueChange={selectTab} orientation={isDesktop ? 'vertical' : 'horizontal'} className="settings-layout">
      <TabsList aria-label={t('settings.sections')} className="settings-nav">
        {TAB_VALUES.map((tab) => { const Icon = TAB_ICONS[tab]; return <TabsTrigger key={tab} value={tab} className="settings-nav-item"><Icon aria-hidden="true" strokeWidth={1.8} /><span>{t(`settings.tabs.${tab}`)}</span></TabsTrigger> })}
      </TabsList>

      <TabsContent value="account" className="settings-panel">
        <SettingsSection title={t('settings.connection.title')} description={t('settings.connection.description')} footer={<><Button onClick={() => { void userQuery.refetch() }} disabled={userQuery.isFetching}>{userQuery.isFetching ? <><Spinner /> {t('settings.connection.testing')}</> : t('settings.connection.test')}</Button><Button variant="secondary" onClick={onLock}>{t('navigation.lock')}</Button></>}>
          <SettingRow label={t('settings.connection.profile')}><span className="settings-row-value">{connection.label}</span></SettingRow>
          <SettingRow label={t('settings.connection.instance')}><span className="settings-row-value break-all">{connection.baseUrl}</span></SettingRow>
          <SettingRow label={t('settings.connection.status')}>{userQuery.isError ? <span className="settings-row-value settings-row-value-error">{userQuery.error instanceof Error ? userQuery.error.message : t('settings.connection.userError')}</span> : user ? <span className="settings-row-value">{t('settings.connection.connectedAs', { user: user.email || user.name })}</span> : <span className="settings-row-value settings-row-value-muted"><Spinner /> {t('settings.connection.testing')}</span>}</SettingRow>
        </SettingsSection>

        <SettingsSection title={t('settings.user.title')} description={t('settings.user.description')} footer={user ? <RefreshButton label={t('settings.user.refresh')} loading={userQuery.isFetching} onClick={() => { void userQuery.refetch() }} /> : undefined}>
          {userQuery.isPending ? <div className="settings-loading"><Spinner /> {t('settings.user.loading')}</div> : user ? <>
            <dl className="settings-user-details"><UserDetail label={t('settings.user.name')} value={user.displayName} /><UserDetail label={t('settings.user.email')} value={user.email} /><UserDetail label={t('settings.user.username')} value={user.username || user.name} /><UserDetail label={t('settings.user.type')} value={user.userType} /><UserDetail label={t('common.status')} value={user.enabled === undefined ? undefined : user.enabled ? t('common.active') : t('common.disabled')} /><UserDetail label={t('settings.user.mobile')} value={user.mobile} /><UserDetail label={t('settings.user.phone')} value={user.phone} /><UserDetail label={t('common.language')} value={user.language} /><UserDetail label={t('settings.user.timezone')} value={user.timeZone} /><UserDetail label={t('settings.user.created')} value={formatProfileDate(user.creation)} /><UserDetail label={t('settings.user.lastLogin')} value={formatProfileDate(user.lastLogin)} /></dl>
            <div className="settings-user-roles"><span className="settings-row-label">{t('settings.user.roles')}</span>{user.roles.length ? <ul className="settings-role-list">{user.roles.map((role) => <li key={role}>{role}</li>)}</ul> : <p className="settings-row-description">{t('settings.user.noRoles')}</p>}</div>
            {userQuery.data?.warning && <Notice tone="warning">{t('settings.profilePermission')}</Notice>}
          </> : null}
        </SettingsSection>

        <SettingsSection title={t('settings.session.title')} description={t('settings.session.description')}>
          <SelectRow label={t('settings.session.duration')} value={String(appPreferences.sessionDurationHours)} onValueChange={(value) => saveAppPreferences({ sessionDurationHours: Number(value) as AppPreferences['sessionDurationHours'] })}>{[4, 8, 12, 24, 48].map((hours) => <SelectItem key={hours} value={String(hours)}>{hours} {t('settings.session.hours')}</SelectItem>)}</SelectRow>
          <CheckboxRow label={t('settings.session.refreshCaches')} description={t('settings.session.refreshCachesDescription')} checked={appPreferences.refreshCachesOnLogin} onCheckedChange={(checked) => saveAppPreferences({ refreshCachesOnLogin: checked })} />
        </SettingsSection>
      </TabsContent>

      <TabsContent value="operation" className="settings-panel">
        <SettingsSection title={t('settings.pos.title')} description={t('settings.pos.description')} footer={<>{(posMessage || posError) && <p className={`settings-footer-status${posError ? ' settings-footer-status-error' : ''}`} role={posError ? 'alert' : 'status'}>{posError || posMessage}</p>}<Button type="button" variant="secondary" onClick={resetPosPreferences}>{t('settings.pos.restore')}</Button><Button type="button" onClick={savePosPreferences}>{t('common.save')}</Button></>}>
          {posProfilesQuery.isError && <Notice>{posProfilesQuery.error instanceof Error ? posProfilesQuery.error.message : t('settings.pos.profilesError')}</Notice>}
          {customersQuery.isError && <Notice>{customersQuery.error instanceof Error ? customersQuery.error.message : t('settings.pos.customersError')}</Notice>}
          <SettingRow label={t('settings.pos.profile')} description={t('settings.pos.profileDescription')}><EntityCombobox ariaLabel={t('settings.pos.profile')} value={posDraft.profileName} onValueChange={(value) => updatePosDraft({ profileName: value })} placeholder={t('settings.pos.profilePlaceholder')} searchPlaceholder={t('settings.pos.profileSearch')} allowClear options={(posProfilesQuery.data ?? []).map((profile) => ({ value: profile.name, label: profile.name, searchText: `${profile.company ?? ''} ${profile.warehouse ?? ''}`, meta: profile.company }))} disabled={posProfilesQuery.isPending} loading={posProfilesQuery.isPending} /></SettingRow>
          <SettingRow label={t('settings.pos.customer')}><EntityCombobox ariaLabel={t('settings.pos.customer')} value={posDraft.defaultCustomer} onValueChange={(value) => updatePosDraft({ defaultCustomer: value })} placeholder={t('settings.pos.customerPlaceholder')} searchPlaceholder={t('settings.pos.customerSearch')} allowClear options={(customersQuery.data ?? []).map((customer) => ({ value: customer.name, label: customer.customer_name || customer.name, searchText: customer.name, meta: customer.customer_name ? customer.name : undefined }))} disabled={customersQuery.isPending} loading={customersQuery.isPending} /></SettingRow>
          <CheckboxRow label={t('settings.pos.rememberCustomer')} description={t('settings.pos.rememberCustomerDescription')} checked={posDraft.rememberCustomer} onCheckedChange={(checked) => updatePosDraft({ rememberCustomer: checked })} />
          <CheckboxRow label={t('settings.pos.autoFocus')} description={t('settings.pos.autoFocusDescription')} checked={posDraft.autoFocusProductSearch} onCheckedChange={(checked) => updatePosDraft({ autoFocusProductSearch: checked })} />
          <CheckboxRow label={t('productImages.show')} description={t('productImages.showDescription')} checked={posDraft.showProductImages} onCheckedChange={(checked) => updatePosDraft({ showProductImages: checked })} />
        </SettingsSection>

        <SettingsSection title={t('settings.pending.title')} description={t('settings.pending.description')}>
          {pendingPriceListsQuery.isError && <Notice tone="error">{pendingPriceListsQuery.error instanceof Error ? pendingPriceListsQuery.error.message : t('settings.pending.loadError')}</Notice>}
          <SelectRow label={t('settings.pending.buying')} value={pendingPreferences.buyingPriceList} onValueChange={(value) => changePendingPreferences({ buyingPriceList: value })}>{priceListOptions(pendingPreferences.buyingPriceList, 'buying')}</SelectRow>
          <SelectRow label={t('settings.pending.selling')} value={pendingPreferences.sellingPriceList} onValueChange={(value) => changePendingPreferences({ sellingPriceList: value })}>{priceListOptions(pendingPreferences.sellingPriceList, 'selling')}</SelectRow>
          <SettingRow label={t('settings.pending.lowMarginThreshold')} description={t('settings.pending.lowMarginDescription')} htmlFor={thresholdId}><Input id={thresholdId} className="settings-number-input" type="number" inputMode="numeric" min="0" max="100" step="1" value={pendingPreferences.lowMarginThreshold} onChange={(event) => changePendingPreferences({ lowMarginThreshold: Number(event.target.value) })} /></SettingRow>
        </SettingsSection>
      </TabsContent>

      <TabsContent value="interface" className="settings-panel">
        <SettingsSection title={t('settings.appearance.title')} description={t('settings.appearance.description')}>
          <SettingRow label={t('settings.appearance.colorMode')}><ToggleGroup type="single" className="segmented-control" aria-label={t('settings.appearance.colorMode')} value={colorMode} onValueChange={(next) => { if (next && next !== colorMode) toggleColorMode() }}><ToggleGroupItem value="light">{t('settings.appearance.light')}</ToggleGroupItem><ToggleGroupItem value="dark">{t('settings.appearance.dark')}</ToggleGroupItem></ToggleGroup></SettingRow>
          <SettingRow label={t('common.language')} description={t('settings.language.description')}><LanguageSelector /></SettingRow>
          <CheckboxRow label={t('settings.navigation.compactDensity')} description={t('settings.navigation.compactDensityDescription')} checked={appPreferences.density === 'compact'} onCheckedChange={(checked) => saveAppPreferences({ density: checked ? 'compact' : 'comfortable' })} />
          <div className="settings-row settings-row-block">
            <span className="settings-row-label" id="settings-palette-label">{t('settings.appearance.palette')}</span>
            <RadioGroup className="theme-grid" value={theme} onValueChange={setTheme} aria-labelledby="settings-palette-label">{themes.map((entry) => <label key={entry.id} className={`theme-option${entry.id === theme ? ' theme-option-active' : ''}`} htmlFor={`theme-${entry.id}`}><RadioGroupItem id={`theme-${entry.id}`} value={entry.id} className="sr-only" /><span className="theme-option-swatches" aria-hidden="true"><i style={{ background: entry.colors.primary }} /><i style={{ background: entry.colors.secondary }} /><i style={{ background: entry.colors.accent }} /><i style={{ background: entry.colors.page }} /></span><span className="theme-option-copy"><strong>{entry.name}</strong><small>{entry.description}</small></span><span className="theme-option-check" aria-hidden="true">{entry.id === theme && <Check strokeWidth={3} />}</span></label>)}</RadioGroup>
          </div>
        </SettingsSection>

        <SettingsSection title={t('settings.navigation.title')} description={t('settings.navigation.description')} footer={<Button type="button" variant="secondary" onClick={restoreInterfacePreferences}>{t('settings.navigation.restore')}</Button>}>
          <SelectRow label={t('settings.navigation.landing')} value={appPreferences.landingRoute} onValueChange={(value) => saveAppPreferences({ landingRoute: value as LandingRoute })}><SelectItem value="/">{t('settings.navigation.home')}</SelectItem><SelectItem value="/pos">{t('settings.navigation.pos')}</SelectItem><SelectItem value="/items">{t('settings.navigation.products')}</SelectItem><SelectItem value="/prices">{t('settings.navigation.prices')}</SelectItem></SelectRow>
          <SelectRow label={t('settings.navigation.productView')} value={productView} onValueChange={(value) => changeProductView(value as ProductView)}><SelectItem value="table">{t('settings.navigation.table')}</SelectItem><SelectItem value="cards">{t('settings.navigation.cards')}</SelectItem><SelectItem value="hierarchy">{t('settings.navigation.hierarchy')}</SelectItem></SelectRow>
          <CheckboxRow label={t('settings.navigation.collapsedSidebar')} description={t('settings.navigation.collapsedSidebarDescription')} checked={appPreferences.sidebarCollapsed} onCheckedChange={(checked) => saveAppPreferences({ sidebarCollapsed: checked })} />
        </SettingsSection>
      </TabsContent>

      <TabsContent value="data" className="settings-panel">
        <CacheManagerPanel client={client} profileId={connection.id} activeProfile={activeProfile} />
        <SettingsSection title={t('productImages.cacheTitle')} description={t('productImages.cacheDescription')} footer={<Button type="button" variant="secondary" onClick={() => void refreshMissingImages()} disabled={Boolean(imageSync)}>{imageSync ? <><Spinner /> {t('productImages.syncing')}</> : t('productImages.syncAction')}</Button>}>
          {imageSync && <p role="status" className="settings-row-description">{t('productImages.syncProgress', imageSync)}</p>}
          {(imageSyncMessage || imageSyncError) && <Notice tone={imageSyncError ? 'error' : 'info'}>{imageSyncError || imageSyncMessage}</Notice>}
        </SettingsSection>
      </TabsContent>
    </Tabs>
  </section>
}
