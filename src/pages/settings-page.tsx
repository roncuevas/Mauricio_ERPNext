import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Button, Field, Notice, PageHeader, RefreshButton, Spinner } from '../components/ui'
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
import type { ConnectionProfile, PosProfile } from '../lib/types'
import { queryKeys } from '../lib/query-keys'
import { clearPosPreferences, DEFAULT_POS_PREFERENCES, readPosPreferences, writePosPreferences, type PosPreferences } from '../lib/pos-preferences'
import { DEFAULT_APP_PREFERENCES, readAppPreferences, writeAppPreferences, type AppPreferences, type Density, type LandingRoute } from '../lib/app-preferences'
import { useTranslation } from 'react-i18next'

const TAB_VALUES = ['general', 'pos', 'appearance', 'language', 'data', 'navigation'] as const
type SettingsTab = typeof TAB_VALUES[number]
type ProductView = 'table' | 'cards' | 'hierarchy'
const PRODUCT_VIEW_KEY = (profileId: string) => `mauricio-erpnext:products-view:${profileId}`

function formatProfileDate(value?: string) {
  if (!value) return '—'
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

function UserDetail({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return <div><dt className="field-label">{label}</dt><dd>{value}</dd></div>
}

function SettingSection({ eyebrow, title, description, children, className = '' }: { eyebrow: string; title: string; description?: string; children: React.ReactNode; className?: string }) {
  return <div className={`card settings-section-card ${className}`}><div className="settings-section-heading"><div><p className="settings-eyebrow">{eyebrow}</p><h2>{title}</h2>{description && <p className="muted">{description}</p>}</div></div>{children}</div>
}

function readProductView(profileId: string): ProductView {
  try {
    const value = localStorage.getItem(PRODUCT_VIEW_KEY(profileId))
    return value === 'cards' || value === 'hierarchy' ? value : 'table'
  } catch { return 'table' }
}

export function SettingsPage({ connection, onLock }: { connection: ConnectionProfile; onLock: () => void }) {
  const { t } = useTranslation()
  const client = useMemo(() => createErpNextClient(connection), [connection])
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeTab: SettingsTab = TAB_VALUES.includes(rawTab as SettingsTab) ? rawTab as SettingsTab : 'general'
  const userQuery = useQuery({ queryKey: queryKeys.settings.userProfile(connection.id), queryFn: () => loadUserProfile(client) })
  const posProfilesQuery = useQuery({ queryKey: queryKeys.pos.profiles(connection.id), queryFn: async () => (await client.listDocuments<PosProfile>('POS Profile', { fields: ['name', 'company', 'warehouse', 'currency', 'disabled'], pageLength: 100, orderBy: 'name asc' })).data.filter((profile) => profile.disabled !== true && profile.disabled !== 1 && String(profile.disabled) !== '1') })
  const customersQuery = useQuery({ queryKey: queryKeys.pos.customers(connection.id), queryFn: async () => (await client.listDocuments<{ name: string; customer_name?: string }>('Customer', { fields: ['name', 'customer_name'], filters: [['disabled', '=', 0]], pageLength: 500, orderBy: 'customer_name asc' })).data })
  const [posDraft, setPosDraft] = useState<PosPreferences>(() => readPosPreferences(connection.id))
  const [posMessage, setPosMessage] = useState('')
  const [posError, setPosError] = useState('')
  const [appPreferences, setAppPreferences] = useState<AppPreferences>(() => readAppPreferences())
  const [productView, setProductView] = useState<ProductView>(() => readProductView(connection.id))
  const { theme, setTheme, themes, colorMode, toggleColorMode } = useTheme()
  const activeTheme = themes.find((entry) => entry.id === theme) ?? themes[0]
  const activeProfile = posProfilesQuery.data?.find((entry) => entry.name === posDraft.profileName) ?? posProfilesQuery.data?.[0]
  const user = userQuery.data?.profile

  useEffect(() => {
    setProductView(readProductView(connection.id))
    setPosDraft(readPosPreferences(connection.id))
  }, [connection.id])

  function selectTab(value: string) {
    if (!TAB_VALUES.includes(value as SettingsTab)) return
    setSearchParams((current) => { const next = new URLSearchParams(current); next.set('tab', value); return next }, { replace: true })
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

  function saveAppPreferences(next: AppPreferences) {
    setAppPreferences(writeAppPreferences(next))
  }

  function changeProductView(next: ProductView) {
    setProductView(next)
    localStorage.setItem(PRODUCT_VIEW_KEY(connection.id), next)
  }

  return <section>
    <PageHeader title={t('settings.title')} description={t('settings.description')} />
    <Tabs value={activeTab} onValueChange={selectTab} className="settings-tabs">
      <TabsList aria-label={t('settings.sections')} className="settings-tabs-list">
        <TabsTrigger value="general">{t('settings.tabs.general')}</TabsTrigger>
        <TabsTrigger value="pos">{t('settings.tabs.pos')}</TabsTrigger>
        <TabsTrigger value="appearance">{t('settings.tabs.appearance')}</TabsTrigger>
        <TabsTrigger value="language">{t('settings.tabs.language')}</TabsTrigger>
        <TabsTrigger value="data">{t('settings.tabs.data')}</TabsTrigger>
        <TabsTrigger value="navigation">{t('settings.tabs.navigation')}</TabsTrigger>
      </TabsList>

      <TabsContent value="general"><div className="settings-grid">
        <SettingSection eyebrow={t('settings.connection.eyebrow')} title={t('settings.connection.title')} description={t('settings.connection.description')}>
          <dl className="settings-connection-details"><div><dt className="field-label">{t('settings.connection.profile')}</dt><dd>{connection.label}</dd></div><div><dt className="field-label">{t('settings.connection.instance')}</dt><dd className="break-all">{connection.baseUrl}</dd></div></dl>
          <div className="settings-actions"><Button onClick={() => { void userQuery.refetch() }} disabled={userQuery.isFetching}>{userQuery.isFetching ? <><Spinner /> {t('settings.connection.testing')}</> : t('settings.connection.test')}</Button><Button variant="secondary" onClick={onLock}>{t('navigation.lock')}</Button></div>
          {user && <Notice tone="info">{t('settings.connection.connectedAs', { user: user.email || user.name })}</Notice>}{userQuery.isError && <div className="mt-4"><Notice>{userQuery.error instanceof Error ? userQuery.error.message : t('settings.connection.userError')}</Notice></div>}
        </SettingSection>
        <SettingSection eyebrow={t('settings.user.eyebrow')} title={t('settings.user.title')} description={t('settings.user.description')}>
          {userQuery.isPending ? <div className="settings-user-loading"><Spinner /> {t('settings.user.loading')}</div> : user ? <><dl className="settings-user-details"><UserDetail label={t('settings.user.name')} value={user.displayName} /><UserDetail label={t('settings.user.email')} value={user.email} /><UserDetail label={t('settings.user.username')} value={user.username || user.name} /><UserDetail label={t('settings.user.type')} value={user.userType} /><UserDetail label={t('common.status')} value={user.enabled === undefined ? undefined : user.enabled ? t('common.active') : t('common.disabled')} /><UserDetail label={t('settings.user.mobile')} value={user.mobile} /><UserDetail label={t('settings.user.phone')} value={user.phone} /><UserDetail label={t('common.language')} value={user.language} /><UserDetail label={t('settings.user.timezone')} value={user.timeZone} /><UserDetail label={t('settings.user.created')} value={formatProfileDate(user.creation)} /><UserDetail label={t('settings.user.lastLogin')} value={formatProfileDate(user.lastLogin)} /></dl><div className="settings-user-roles"><span className="field-label">{t('settings.user.roles')}</span>{user.roles.length ? <div className="settings-role-list">{user.roles.map((role) => <span key={role}>{role}</span>)}</div> : <p className="muted">{t('settings.user.noRoles')}</p>}</div>{userQuery.data?.warning && <Notice tone="warning">{t('settings.profilePermission')}</Notice>}<RefreshButton className="settings-user-refresh" label={t('settings.user.refresh')} loading={userQuery.isFetching} onClick={() => { void userQuery.refetch() }} /></> : null}
        </SettingSection>
      </div></TabsContent>

      <TabsContent value="pos"><SettingSection eyebrow={t('settings.pos.eyebrow')} title={t('settings.pos.title')} description={t('settings.pos.description')}>
        {posProfilesQuery.isError && <Notice>{posProfilesQuery.error instanceof Error ? posProfilesQuery.error.message : t('settings.pos.profilesError')}</Notice>}
        {customersQuery.isError && <Notice>{customersQuery.error instanceof Error ? customersQuery.error.message : t('settings.pos.customersError')}</Notice>}
        <div className="settings-pos-form"><Field label={t('settings.pos.profile')}><EntityCombobox ariaLabel={t('settings.pos.profile')} value={posDraft.profileName} onValueChange={(value) => setPosDraft((current) => ({ ...current, profileName: value }))} placeholder={t('settings.pos.profilePlaceholder')} searchPlaceholder={t('settings.pos.profileSearch')} allowClear options={(posProfilesQuery.data ?? []).map((profile) => ({ value: profile.name, label: profile.name, searchText: `${profile.company ?? ''} ${profile.warehouse ?? ''}`, meta: profile.company }))} disabled={posProfilesQuery.isPending} loading={posProfilesQuery.isPending} /></Field><Field label={t('settings.pos.customer')}><EntityCombobox ariaLabel={t('settings.pos.customer')} value={posDraft.defaultCustomer} onValueChange={(value) => setPosDraft((current) => ({ ...current, defaultCustomer: value }))} placeholder={t('settings.pos.customerPlaceholder')} searchPlaceholder={t('settings.pos.customerSearch')} allowClear options={(customersQuery.data ?? []).map((customer) => ({ value: customer.name, label: customer.customer_name || customer.name, searchText: customer.name, meta: customer.customer_name ? customer.name : undefined }))} disabled={customersQuery.isPending} loading={customersQuery.isPending} /></Field></div>
        <div className="settings-pos-options"><label className="settings-pos-option"><Checkbox checked={posDraft.rememberCustomer} onCheckedChange={(checked) => setPosDraft((current) => ({ ...current, rememberCustomer: checked === true }))} /><span><strong>{t('settings.pos.rememberCustomer')}</strong><small>{t('settings.pos.rememberCustomerDescription')}</small></span></label><label className="settings-pos-option"><Checkbox checked={posDraft.autoFocusProductSearch} onCheckedChange={(checked) => setPosDraft((current) => ({ ...current, autoFocusProductSearch: checked === true }))} /><span><strong>{t('settings.pos.autoFocus')}</strong><small>{t('settings.pos.autoFocusDescription')}</small></span></label></div>
        {(posMessage || posError) && <div className="mt-4"><Notice tone={posError ? 'error' : 'info'}>{posError || posMessage}</Notice></div>}<div className="settings-actions"><Button type="button" onClick={savePosPreferences}>{t('common.save')}</Button><Button type="button" variant="secondary" onClick={resetPosPreferences}>{t('settings.pos.restore')}</Button></div>
      </SettingSection></TabsContent>

      <TabsContent value="appearance"><SettingSection eyebrow={t('settings.appearance.eyebrow')} title={t('settings.appearance.title')} description={t('settings.appearance.description')}>
        <div className="settings-theme-mode"><div><strong>{t('settings.appearance.colorMode')}</strong><p className="muted">{t('settings.appearance.colorModeDescription')}</p></div><Button type="button" variant="secondary" onClick={toggleColorMode}>{colorMode === 'dark' ? t('navigation.lightMode') : t('navigation.darkMode')}</Button></div>
        <div className="theme-preview" aria-label={t('settings.appearance.preview')}><div><span className="theme-preview-label">{t('settings.appearance.preview')}</span><strong>{activeTheme.name}</strong></div><div className="theme-preview-actions"><span className="theme-preview-chip">{t('settings.appearance.previewStatus')}</span><Button size="compact">{t('settings.appearance.primary')}</Button><Button size="compact" variant="secondary">{t('settings.appearance.secondary')}</Button></div></div>
        <RadioGroup className="theme-grid" value={theme} onValueChange={setTheme} aria-label={t('settings.appearance.palette')}><p className="field-label">{t('settings.appearance.palette')}</p>{themes.map((entry) => <label key={entry.id} className={`theme-option${entry.id === theme ? ' theme-option-active' : ''}`} htmlFor={`theme-${entry.id}`}><RadioGroupItem id={`theme-${entry.id}`} value={entry.id} className="sr-only" /><span className="theme-option-swatches" aria-hidden="true"><i style={{ background: entry.colors.primary }} /><i style={{ background: entry.colors.secondary }} /><i style={{ background: entry.colors.accent }} /><i style={{ background: entry.colors.page }} /></span><span className="theme-option-copy"><strong>{entry.name}</strong><small>{entry.description}</small></span><span className="theme-option-check" aria-hidden="true">{entry.id === theme ? '✓' : ''}</span></label>)}</RadioGroup>
      </SettingSection></TabsContent>

      <TabsContent value="language"><SettingSection eyebrow={t('settings.language.eyebrow')} title={t('settings.language.title')} description={t('settings.language.description')}><LanguageSelector /></SettingSection></TabsContent>
      <TabsContent value="data"><CacheManagerPanel client={client} profileId={connection.id} activeProfile={activeProfile} /></TabsContent>

      <TabsContent value="navigation"><SettingSection eyebrow={t('settings.navigation.eyebrow')} title={t('settings.navigation.title')} description={t('settings.navigation.description')}>
        <div className="settings-navigation-grid"><Field label={t('settings.navigation.landing')}><Select value={appPreferences.landingRoute} onValueChange={(value) => saveAppPreferences({ ...appPreferences, landingRoute: value as LandingRoute })}><SelectTrigger aria-label={t('settings.navigation.landing')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="/">{t('settings.navigation.home')}</SelectItem><SelectItem value="/pos">{t('settings.navigation.pos')}</SelectItem><SelectItem value="/items">{t('settings.navigation.products')}</SelectItem><SelectItem value="/prices">{t('settings.navigation.prices')}</SelectItem></SelectContent></Select></Field>
          <Field label={t('settings.navigation.productView')}><Select value={productView} onValueChange={(value) => changeProductView(value as ProductView)}><SelectTrigger aria-label={t('settings.navigation.productView')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="table">{t('settings.navigation.table')}</SelectItem><SelectItem value="cards">{t('settings.navigation.cards')}</SelectItem><SelectItem value="hierarchy">{t('settings.navigation.hierarchy')}</SelectItem></SelectContent></Select></Field>
        </div>
        <div className="settings-pos-options"><label className="settings-pos-option"><Checkbox checked={appPreferences.sidebarCollapsed} onCheckedChange={(checked) => saveAppPreferences({ ...appPreferences, sidebarCollapsed: checked === true })} /><span><strong>{t('settings.navigation.collapsedSidebar')}</strong><small>{t('settings.navigation.collapsedSidebarDescription')}</small></span></label><label className="settings-pos-option"><Checkbox checked={appPreferences.density === 'compact'} onCheckedChange={(checked) => saveAppPreferences({ ...appPreferences, density: checked === true ? 'compact' : 'comfortable' as Density })} /><span><strong>{t('settings.navigation.compactDensity')}</strong><small>{t('settings.navigation.compactDensityDescription')}</small></span></label></div>
        <Notice tone="info">{t('settings.navigation.groupsNote')}</Notice>
        <Button type="button" variant="secondary" onClick={() => saveAppPreferences({ ...DEFAULT_APP_PREFERENCES, sidebarCollapsed: appPreferences.sidebarCollapsed })}>{t('settings.navigation.restore')}</Button>
      </SettingSection></TabsContent>
    </Tabs>
  </section>
}
