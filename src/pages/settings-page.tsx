import { useEffect, useId, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Database, Palette, Store, UserRound, type LucideIcon } from 'lucide-react'
import { Badge, Button, Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input, Notice, PageHeader, RefreshButton, Spinner, ToggleGroup, ToggleGroupItem } from '../components/ui'
import { Checkbox } from '../components/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '../components/ui/field'
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Switch } from '../components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { CacheManagerPanel } from '../components/cache-manager-panel'
import { ProfileStorageCard } from '../components/profile-storage'
import { useConfirmDialog } from '../components/confirm-dialog'
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
const SESSION_HOURS = [4, 8, 12, 24, 48] as const

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

function UserDetail({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}

export function SettingsPage({ connection, onLock }: { connection: ConnectionProfile; onLock: () => void }) {
  const { t } = useTranslation()
  const id = useId()
  const client = useMemo(() => createErpNextClient(connection), [connection])
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = resolveTab(searchParams.get('tab'))
  const userQuery = useQuery({ queryKey: queryKeys.settings.userProfile(connection.id), queryFn: () => loadUserProfile(client) })
  const posProfilesQuery = useQuery({ queryKey: queryKeys.pos.profiles(connection.id), queryFn: async () => (await client.listDocuments<PosProfile>('POS Profile', { fields: ['name', 'company', 'warehouse', 'currency', 'disabled'], pageLength: 100, orderBy: 'name asc' })).data.filter((profile) => profile.disabled !== true && profile.disabled !== 1 && String(profile.disabled) !== '1') })
  const pendingPriceListsQuery = useQuery({ queryKey: queryKeys.prices.lists(connection.id), queryFn: async () => (await client.listDocuments<PriceList>('Price List', { fields: ['name', 'selling', 'buying', 'enabled'], filters: [['enabled', '=', 1]], pageLength: 500, orderBy: 'name asc' })).data })
  const customersQuery = useQuery({ queryKey: queryKeys.pos.customers(connection.id), queryFn: async () => (await client.listDocuments<{ name: string; customer_name?: string }>('Customer', { fields: ['name', 'customer_name'], filters: [['disabled', '=', 0]], pageLength: 500, orderBy: 'customer_name asc' })).data })
  const [posDraft, setPosDraft] = useState<PosPreferences>(() => readPosPreferences(connection.id))
  const [posMessage, setPosMessage] = useState('')
  const [posError, setPosError] = useState('')
  const [imageSync, setImageSync] = useState<{ completed: number; total: number } | null>(null)
  const { confirm: confirmImages, dialog: imageDialog } = useConfirmDialog()
  const [imageSyncMessage, setImageSyncMessage] = useState('')
  const [imageSyncError, setImageSyncError] = useState('')
  const [appPreferences, setAppPreferences] = useState<AppPreferences>(() => readAppPreferences())
  const [pendingPreferences, setPendingPreferences] = useState<PendingPreferences>(() => readPendingPreferences(connection.id))
  const [productView, setProductView] = useState<ProductView>(() => readProductView(connection.id))
  const { theme, setTheme, themes, colorMode, toggleColorMode } = useTheme()
  const activeProfile = posProfilesQuery.data?.find((entry) => entry.name === posDraft.profileName) ?? posProfilesQuery.data?.[0]
  const user = userQuery.data?.profile
  const priceLists = pendingPriceListsQuery.data ?? []
  const fieldId = (name: string) => `${id}-${name}`

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

  async function forceImageDownload() {
    const ok = await confirmImages({ title: t('productImages.forceTitle'), description: t('productImages.forceDescription'), confirmLabel: t('productImages.forceAction'), tone: 'primary' })
    if (ok) await refreshMissingImages(true)
  }

  async function refreshMissingImages(force = false) {
    setImageSync({ completed: 0, total: 0 })
    setImageSyncMessage('')
    setImageSyncError('')
    try {
      const result = await downloadMissingProductImages(client, connection.id, (completed, total) => setImageSync({ completed, total }), { force })
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
    <Tabs value={activeTab} onValueChange={selectTab} className="settings-layout">
      <TabsList aria-label={t('settings.sections')} className="settings-nav">
        {TAB_VALUES.map((tab) => { const Icon = TAB_ICONS[tab]; return <TabsTrigger key={tab} value={tab} className="settings-nav-item"><Icon aria-hidden="true" strokeWidth={1.8} /><span>{t(`settings.tabs.${tab}`)}</span></TabsTrigger> })}
      </TabsList>

      <TabsContent value="account" className="settings-panel">
        <Card className="settings-card">
          <CardHeader><CardTitle as="h2">{t('settings.connection.title')}</CardTitle><CardDescription>{t('settings.connection.description')}</CardDescription></CardHeader>
          <CardContent>
            <dl className="settings-facts">
              <div><dt>{t('settings.connection.profile')}</dt><dd>{connection.label}</dd></div>
              <div><dt>{t('settings.connection.instance')}</dt><dd className="break-all">{connection.baseUrl}</dd></div>
              <div><dt>{t('settings.connection.status')}</dt><dd>{userQuery.isError ? <Badge tone="danger">{userQuery.error instanceof Error ? userQuery.error.message : t('settings.connection.userError')}</Badge> : user ? <Badge tone="success">{t('settings.connection.connectedAs', { user: user.email || user.name })}</Badge> : <span className="settings-facts-pending"><Spinner /> {t('settings.connection.testing')}</span>}</dd></div>
            </dl>
          </CardContent>
          <CardFooter><Button variant="secondary" onClick={onLock}>{t('navigation.lock')}</Button><Button onClick={() => { void userQuery.refetch() }} disabled={userQuery.isFetching}>{userQuery.isFetching ? <><Spinner /> {t('settings.connection.testing')}</> : t('settings.connection.test')}</Button></CardFooter>
        </Card>

        <Card className="settings-card">
          <CardHeader><CardTitle as="h2">{t('settings.user.title')}</CardTitle><CardDescription>{t('settings.user.description')}</CardDescription>{user && <CardAction><RefreshButton label={t('settings.user.refresh')} loading={userQuery.isFetching} onClick={() => { void userQuery.refetch() }} /></CardAction>}</CardHeader>
          <CardContent>
            {userQuery.isPending ? <p className="settings-facts-pending"><Spinner /> {t('settings.user.loading')}</p> : user ? <>
              <dl className="settings-user-details"><UserDetail label={t('settings.user.name')} value={user.displayName} /><UserDetail label={t('settings.user.email')} value={user.email} /><UserDetail label={t('settings.user.username')} value={user.username || user.name} /><UserDetail label={t('settings.user.type')} value={user.userType} /><UserDetail label={t('common.status')} value={user.enabled === undefined ? undefined : user.enabled ? t('common.active') : t('common.disabled')} /><UserDetail label={t('settings.user.mobile')} value={user.mobile} /><UserDetail label={t('settings.user.phone')} value={user.phone} /><UserDetail label={t('common.language')} value={user.language} /><UserDetail label={t('settings.user.timezone')} value={user.timeZone} /><UserDetail label={t('settings.user.created')} value={formatProfileDate(user.creation)} /><UserDetail label={t('settings.user.lastLogin')} value={formatProfileDate(user.lastLogin)} /></dl>
              <div className="settings-user-roles"><h3>{t('settings.user.roles')}</h3>{user.roles.length ? <ul>{user.roles.map((role) => <li key={role}><Badge>{role}</Badge></li>)}</ul> : <p>{t('settings.user.noRoles')}</p>}</div>
              {userQuery.data?.warning && <Notice tone="warning">{t('settings.profilePermission')}</Notice>}
            </> : null}
          </CardContent>
        </Card>

        <Card className="settings-card">
          <CardHeader><CardTitle as="h2">{t('settings.session.title')}</CardTitle><CardDescription>{t('settings.session.description')}</CardDescription></CardHeader>
          <CardContent><FieldGroup className="settings-fields">
            <Field orientation="responsive">
              <FieldContent><FieldLabel htmlFor={fieldId('session')}>{t('settings.session.duration')}</FieldLabel></FieldContent>
              <Select value={String(appPreferences.sessionDurationHours)} onValueChange={(value) => saveAppPreferences({ sessionDurationHours: Number(value) as AppPreferences['sessionDurationHours'] })}><SelectTrigger id={fieldId('session')} className="settings-control"><SelectValue /></SelectTrigger><SelectContent>{SESSION_HOURS.map((hours) => <SelectItem key={hours} value={String(hours)}>{hours} {t('settings.session.hours')}</SelectItem>)}</SelectContent></Select>
            </Field>
            <Field orientation="horizontal">
              <FieldContent><FieldLabel htmlFor={fieldId('refresh')}>{t('settings.session.refreshCaches')}</FieldLabel><FieldDescription>{t('settings.session.refreshCachesDescription')}</FieldDescription></FieldContent>
              <Switch id={fieldId('refresh')} checked={appPreferences.refreshCachesOnLogin} onCheckedChange={(checked) => saveAppPreferences({ refreshCachesOnLogin: checked })} />
            </Field>
          </FieldGroup></CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="operation" className="settings-panel">
        <Card className="settings-card">
          <CardHeader><CardTitle as="h2">{t('settings.pos.title')}</CardTitle><CardDescription>{t('settings.pos.description')}</CardDescription></CardHeader>
          <CardContent>
            {posProfilesQuery.isError && <Notice>{posProfilesQuery.error instanceof Error ? posProfilesQuery.error.message : t('settings.pos.profilesError')}</Notice>}
            {customersQuery.isError && <Notice>{customersQuery.error instanceof Error ? customersQuery.error.message : t('settings.pos.customersError')}</Notice>}
            <FieldGroup className="settings-fields">
              <Field orientation="responsive">
                <FieldContent><FieldTitle>{t('settings.pos.profile')}</FieldTitle><FieldDescription>{t('settings.pos.profileDescription')}</FieldDescription></FieldContent>
                <EntityCombobox className="settings-control" ariaLabel={t('settings.pos.profile')} value={posDraft.profileName} onValueChange={(value) => updatePosDraft({ profileName: value })} placeholder={t('settings.pos.profilePlaceholder')} searchPlaceholder={t('settings.pos.profileSearch')} allowClear options={(posProfilesQuery.data ?? []).map((profile) => ({ value: profile.name, label: profile.name, searchText: `${profile.company ?? ''} ${profile.warehouse ?? ''}`, meta: profile.company }))} disabled={posProfilesQuery.isPending} loading={posProfilesQuery.isPending} />
              </Field>
              <Field orientation="responsive">
                <FieldContent><FieldTitle>{t('settings.pos.customer')}</FieldTitle></FieldContent>
                <EntityCombobox className="settings-control" ariaLabel={t('settings.pos.customer')} value={posDraft.defaultCustomer} onValueChange={(value) => updatePosDraft({ defaultCustomer: value })} placeholder={t('settings.pos.customerPlaceholder')} searchPlaceholder={t('settings.pos.customerSearch')} allowClear options={(customersQuery.data ?? []).map((customer) => ({ value: customer.name, label: customer.customer_name || customer.name, searchText: customer.name, meta: customer.customer_name ? customer.name : undefined }))} disabled={customersQuery.isPending} loading={customersQuery.isPending} />
              </Field>
              {([
                ['rememberCustomer', t('settings.pos.rememberCustomer'), t('settings.pos.rememberCustomerDescription')],
                ['autoFocusProductSearch', t('settings.pos.autoFocus'), t('settings.pos.autoFocusDescription')],
                ['showProductImages', t('productImages.show'), t('productImages.showDescription')],
              ] as const).map(([key, label, description]) => <Field key={key} orientation="horizontal">
                <Checkbox id={fieldId(key)} checked={posDraft[key]} onCheckedChange={(checked) => updatePosDraft({ [key]: checked === true })} />
                <FieldContent><FieldLabel htmlFor={fieldId(key)}>{label}</FieldLabel><FieldDescription>{description}</FieldDescription></FieldContent>
              </Field>)}
            </FieldGroup>
          </CardContent>
          <CardFooter>{(posMessage || posError) && <p className={`settings-footer-status${posError ? ' settings-footer-status-error' : ''}`} role={posError ? 'alert' : 'status'}>{posError || posMessage}</p>}<Button type="button" variant="secondary" onClick={resetPosPreferences}>{t('settings.pos.restore')}</Button><Button type="button" onClick={savePosPreferences}>{t('common.save')}</Button></CardFooter>
        </Card>

        <Card className="settings-card">
          <CardHeader><CardTitle as="h2">{t('settings.pending.title')}</CardTitle><CardDescription>{t('settings.pending.description')}</CardDescription></CardHeader>
          <CardContent>
            {pendingPriceListsQuery.isError && <Notice tone="error">{pendingPriceListsQuery.error instanceof Error ? pendingPriceListsQuery.error.message : t('settings.pending.loadError')}</Notice>}
            <FieldGroup className="settings-fields">
              <Field orientation="responsive">
                <FieldContent><FieldLabel htmlFor={fieldId('buying')}>{t('settings.pending.buying')}</FieldLabel></FieldContent>
                <Select value={pendingPreferences.buyingPriceList} onValueChange={(value) => changePendingPreferences({ buyingPriceList: value })}><SelectTrigger id={fieldId('buying')} className="settings-control"><SelectValue /></SelectTrigger><SelectContent>{priceListOptions(pendingPreferences.buyingPriceList, 'buying')}</SelectContent></Select>
              </Field>
              <Field orientation="responsive">
                <FieldContent><FieldLabel htmlFor={fieldId('selling')}>{t('settings.pending.selling')}</FieldLabel></FieldContent>
                <Select value={pendingPreferences.sellingPriceList} onValueChange={(value) => changePendingPreferences({ sellingPriceList: value })}><SelectTrigger id={fieldId('selling')} className="settings-control"><SelectValue /></SelectTrigger><SelectContent>{priceListOptions(pendingPreferences.sellingPriceList, 'selling')}</SelectContent></Select>
              </Field>
              <Field orientation="responsive">
                <FieldContent><FieldLabel htmlFor={fieldId('margin')}>{t('settings.pending.lowMarginThreshold')}</FieldLabel><FieldDescription>{t('settings.pending.lowMarginDescription')}</FieldDescription></FieldContent>
                <Input id={fieldId('margin')} className="settings-control-narrow" type="number" inputMode="numeric" min="0" max="100" step="1" value={pendingPreferences.lowMarginThreshold} onChange={(event) => changePendingPreferences({ lowMarginThreshold: Number(event.target.value) })} />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="interface" className="settings-panel">
        <Card className="settings-card">
          <CardHeader><CardTitle as="h2">{t('settings.appearance.title')}</CardTitle><CardDescription>{t('settings.appearance.description')}</CardDescription></CardHeader>
          <CardContent><FieldGroup className="settings-fields">
            <Field orientation="responsive">
              <FieldContent><FieldTitle>{t('settings.appearance.colorMode')}</FieldTitle></FieldContent>
              <ToggleGroup type="single" className="segmented-control" aria-label={t('settings.appearance.colorMode')} value={colorMode} onValueChange={(next) => { if (next && next !== colorMode) toggleColorMode() }}><ToggleGroupItem value="light">{t('settings.appearance.light')}</ToggleGroupItem><ToggleGroupItem value="dark">{t('settings.appearance.dark')}</ToggleGroupItem></ToggleGroup>
            </Field>
            <Field orientation="responsive">
              <FieldContent><FieldTitle>{t('common.language')}</FieldTitle><FieldDescription>{t('settings.language.description')}</FieldDescription></FieldContent>
              <LanguageSelector className="settings-control" />
            </Field>
            <Field orientation="horizontal">
              <FieldContent><FieldLabel htmlFor={fieldId('density')}>{t('settings.navigation.compactDensity')}</FieldLabel><FieldDescription>{t('settings.navigation.compactDensityDescription')}</FieldDescription></FieldContent>
              <Switch id={fieldId('density')} checked={appPreferences.density === 'compact'} onCheckedChange={(checked) => saveAppPreferences({ density: checked ? 'compact' : 'comfortable' })} />
            </Field>
            <Field>
              <FieldTitle id={fieldId('palette')}>{t('settings.appearance.palette')}</FieldTitle>
              <RadioGroup className="settings-palette" value={theme} onValueChange={setTheme} aria-labelledby={fieldId('palette')}>
                {themes.map((entry) => <FieldLabel key={entry.id} htmlFor={fieldId(`theme-${entry.id}`)}>
                  <Field orientation="horizontal">
                    <span className="settings-swatch" aria-hidden="true"><i style={{ background: entry.colors.primary }} /><i style={{ background: entry.colors.secondary }} /><i style={{ background: entry.colors.accent }} /><i style={{ background: entry.colors.page }} /></span>
                    <FieldContent><FieldTitle>{entry.name}</FieldTitle><FieldDescription>{entry.description}</FieldDescription></FieldContent>
                    <RadioGroupItem id={fieldId(`theme-${entry.id}`)} value={entry.id} />
                  </Field>
                </FieldLabel>)}
              </RadioGroup>
            </Field>
          </FieldGroup></CardContent>
        </Card>

        <Card className="settings-card">
          <CardHeader><CardTitle as="h2">{t('settings.navigation.title')}</CardTitle><CardDescription>{t('settings.navigation.description')}</CardDescription></CardHeader>
          <CardContent><FieldGroup className="settings-fields">
            <Field orientation="responsive">
              <FieldContent><FieldLabel htmlFor={fieldId('landing')}>{t('settings.navigation.landing')}</FieldLabel></FieldContent>
              <Select value={appPreferences.landingRoute} onValueChange={(value) => saveAppPreferences({ landingRoute: value as LandingRoute })}><SelectTrigger id={fieldId('landing')} className="settings-control"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="/">{t('settings.navigation.home')}</SelectItem><SelectItem value="/pos">{t('settings.navigation.pos')}</SelectItem><SelectItem value="/items">{t('settings.navigation.products')}</SelectItem><SelectItem value="/prices">{t('settings.navigation.prices')}</SelectItem></SelectContent></Select>
            </Field>
            <Field orientation="responsive">
              <FieldContent><FieldLabel htmlFor={fieldId('product-view')}>{t('settings.navigation.productView')}</FieldLabel></FieldContent>
              <Select value={productView} onValueChange={(value) => changeProductView(value as ProductView)}><SelectTrigger id={fieldId('product-view')} className="settings-control"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="table">{t('settings.navigation.table')}</SelectItem><SelectItem value="cards">{t('settings.navigation.cards')}</SelectItem><SelectItem value="hierarchy">{t('settings.navigation.hierarchy')}</SelectItem></SelectContent></Select>
            </Field>
            <Field orientation="horizontal">
              <FieldContent><FieldLabel htmlFor={fieldId('sidebar')}>{t('settings.navigation.collapsedSidebar')}</FieldLabel><FieldDescription>{t('settings.navigation.collapsedSidebarDescription')}</FieldDescription></FieldContent>
              <Switch id={fieldId('sidebar')} checked={appPreferences.sidebarCollapsed} onCheckedChange={(checked) => saveAppPreferences({ sidebarCollapsed: checked })} />
            </Field>
          </FieldGroup></CardContent>
          <CardFooter><Button type="button" variant="secondary" onClick={restoreInterfacePreferences}>{t('settings.navigation.restore')}</Button></CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="data" className="settings-panel">
        <CacheManagerPanel client={client} profileId={connection.id} activeProfile={activeProfile} />
        <Card className="settings-card">
          <CardHeader><CardTitle as="h2">{t('productImages.cacheTitle')}</CardTitle><CardDescription>{t('productImages.cacheDescription')}</CardDescription><CardAction className="settings-card-actions"><Button type="button" variant="secondary" onClick={() => void refreshMissingImages()} disabled={Boolean(imageSync)}>{imageSync ? <><Spinner /> {t('productImages.syncing')}</> : t('productImages.syncAction')}</Button><Button type="button" variant="secondary" onClick={() => void forceImageDownload()} disabled={Boolean(imageSync)}>{t('productImages.forceAction')}</Button></CardAction></CardHeader>
          {(imageSync || imageSyncMessage || imageSyncError) && <CardContent>
            {imageSync && <p role="status" className="settings-facts-pending">{t('productImages.syncProgress', imageSync)}</p>}
            {(imageSyncMessage || imageSyncError) && <Notice tone={imageSyncError ? 'error' : 'info'}>{imageSyncError || imageSyncMessage}</Notice>}
          </CardContent>}
        </Card>
        <ProfileStorageCard activeProfileId={connection.id} />
        {imageDialog}
      </TabsContent>
    </Tabs>
  </section>
}
