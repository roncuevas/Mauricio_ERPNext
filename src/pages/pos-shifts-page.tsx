import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Badge, Button, ButtonLink, Card, Field, Input, Notice, RefreshButton, Spinner } from '../components/ui'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { createErpNextClient } from '../lib/erpnext'
import { isPosProfileAvailableForUser, openingAvailability, openingPayload, paymentLines, validateOpeningRequest } from '../lib/pos'
import type { PosOpeningEntry, PosPaymentLine, PosPaymentMethod, PosProfile } from '../lib/types'
import { queryKeys } from '../lib/query-keys'

type PosClient = ReturnType<typeof createErpNextClient>
const profileFields = ['name', 'company', 'warehouse', 'currency', 'selling_price_list', 'customer', 'tax_category', 'taxes_and_charges', 'disabled']
const openingFields = ['name', 'user', 'pos_profile', 'company', 'status', 'period_start_date', 'period_end_date', 'posting_date', 'pos_closing_entry', 'docstatus']

function availabilityLabel(status: ReturnType<typeof openingAvailability>, t: TFunction) {
  if (status === 'available') return t('shifts.available')
  if (status === 'profile-open') return t('shifts.profileBusy')
  if (status === 'user-open') return t('shifts.userBusy')
  if (status === 'not-applicable') return t('shifts.notAssigned')
  if (status === 'disabled') return t('shifts.disabled')
  return t('shifts.incomplete')
}

function availabilityTone(status: ReturnType<typeof openingAvailability>) {
  if (status === 'available') return 'success' as const
  if (status === 'profile-open' || status === 'user-open') return 'warning' as const
  return 'danger' as const
}

export function PosShiftsPage({ client }: { client: PosClient }) {
  const { t } = useTranslation()
  const profileId = client.profileId
  const [selectedProfileName, setSelectedProfileName] = useState('')
  const [profileFilter, setProfileFilter] = useState<'all' | 'available' | 'open'>('all')
  const [openingBalances, setOpeningBalances] = useState<PosPaymentLine[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const currentUser = useQuery({ queryKey: queryKeys.pos.currentUser(profileId), queryFn: () => client.getCurrentUser() })
  const profiles = useQuery({ queryKey: queryKeys.pos.profiles(profileId), queryFn: async () => (await client.listDocuments<PosProfile>('POS Profile', { fields: profileFields, pageLength: 100, orderBy: 'name asc' })).data.filter((profile) => profile.disabled !== true && profile.disabled !== 1 && String(profile.disabled) !== '1') })
  const openings = useQuery({ queryKey: queryKeys.pos.openings(profileId), queryFn: async () => (await client.listDocuments<PosOpeningEntry>('POS Opening Entry', { fields: openingFields, pageLength: 100, orderBy: 'creation desc' })).data.filter((entry) => entry.status === 'Open') })
  const profileDetails = useQuery({ queryKey: queryKeys.pos.profileDetails(profileId, profiles.data?.map((profile) => profile.name).join('|') ?? ''), enabled: Boolean(profiles.data?.length), queryFn: async () => Promise.all((profiles.data ?? []).map(async (profile) => { try { return await client.getDocument<PosProfile>('POS Profile', profile.name) } catch { return profile } })) })
  const selectedProfile = useMemo(() => profileDetails.data?.find((profile) => profile.name === selectedProfileName), [profileDetails.data, selectedProfileName])
  const paymentMethods = useMemo(() => (selectedProfile?.payments ?? []).filter((method) => method.mode_of_payment), [selectedProfile])
  const profileStatuses = useMemo(() => (profileDetails.data ?? []).map((profile) => ({ profile, status: openingAvailability({ profile, user: currentUser.data ?? '', openings: openings.data ?? [] }) })), [currentUser.data, openings.data, profileDetails.data])
  const availableProfiles = profileStatuses.filter(({ status }) => status === 'available').length
  const openProfiles = profileStatuses.filter(({ status }) => status === 'profile-open' || status === 'user-open').length
  const visibleProfiles = profileStatuses.filter(({ status }) => profileFilter === 'all' || (profileFilter === 'available' ? status === 'available' : status === 'profile-open' || status === 'user-open'))

  useEffect(() => { if (selectedProfile) setOpeningBalances(paymentLines(paymentMethods)) }, [paymentMethods, selectedProfile])

  function startOpening(profile: PosProfile) { setSelectedProfileName(profile.name); setMessage(''); setError('') }
  function updateBalance(modeOfPayment: string, value: string) { setOpeningBalances((current) => paymentMethods.map((method) => ({ modeOfPayment: method.mode_of_payment, amount: method.mode_of_payment === modeOfPayment ? Number(value) : current.find((line) => line.modeOfPayment === method.mode_of_payment)?.amount ?? 0 }))) }

  async function submitOpening() {
    if (!selectedProfile || !currentUser.data) return
    setBusy(true); setError(''); setMessage('')
    try {
      validateOpeningRequest({ profile: selectedProfile, user: currentUser.data, openings: openings.data ?? [], balances: openingBalances })
      const openingAt = new Date().toISOString()
      const payload = openingPayload({ profile: selectedProfile, user: currentUser.data, openingAt, balances: openingBalances })
      const created = await client.createDocument<{ name: string }>('POS Opening Entry', payload)
      await client.submitDocument('POS Opening Entry', created.name)
      setMessage(t('shifts.opened', { name: created.name })); setSelectedProfileName(''); await openings.refetch()
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('shifts.openError')) } finally { setBusy(false) }
  }

  const user = currentUser.data ?? t('shifts.checkingUser')
  return <div className="pos-shifts-page">
    <header className="pos-shifts-header">
      <div className="pos-shifts-heading"><div className="pos-shifts-title-row"><div><p className="pos-shifts-kicker">{t('shifts.eyebrow')}</p><h1>{t('navigation.shifts')}</h1></div><Badge tone="info">POS</Badge></div><p>{t('shifts.description')}</p></div>
      <div className="pos-shifts-header-actions"><div className="pos-shifts-user"><span>{t('shifts.erpnextUser')}</span><strong>{user}</strong></div><RefreshButton label={t('shifts.refresh')} loading={profiles.isFetching || openings.isFetching} onClick={() => { void Promise.all([profiles.refetch(), openings.refetch(), currentUser.refetch()]) }} /></div>
    </header>
    {message && <Notice tone="info"><span role="status" aria-live="polite">{message}</span><span className="ml-2"><Link className="font-semibold underline" to="/pos">{t('shifts.goToPos')}</Link></span></Notice>}
    {error && <Notice>{error}</Notice>}
    {currentUser.isError && <Notice>{currentUser.error instanceof Error ? currentUser.error.message : t('shifts.userError')}</Notice>}
    {profiles.isError && <Notice>{profiles.error instanceof Error ? profiles.error.message : t('shifts.profilesError')}</Notice>}
    {openings.isError && <Notice>{openings.error instanceof Error ? openings.error.message : t('shifts.openingsError')}</Notice>}
    {profiles.isPending || profileDetails.isPending || currentUser.isPending ? <Card className="pos-shifts-loading"><Spinner /> {t('shifts.loading')}</Card> : null}
    {!profiles.isPending && !profiles.data?.length && <Notice>{t('shifts.noProfiles')}</Notice>}
    {profileDetails.data?.length ? <>
      <section aria-label={t('shifts.summary')} className="pos-shifts-summary">
        <Card className="pos-shift-stat"><span>{t('shifts.activeProfiles')}</span><strong>{profileStatuses.length}</strong><small>{t('shifts.configured')}</small></Card>
        <Card className="pos-shift-stat pos-shift-stat-ready"><span>{t('shifts.readyToOpen')}</span><strong>{availableProfiles}</strong><small>{t('shifts.availableForUser')}</small></Card>
        <Card className="pos-shift-stat pos-shift-stat-open"><span>{t('shifts.openShifts')}</span><strong>{openProfiles}</strong><small>{t('shifts.requireAction')}</small></Card>
      </section>
      {/* i18next-instrument-ignore-next-line */}
      <section aria-label="POS Profiles" className="pos-shifts-profiles">
        <div className="pos-shifts-section-heading"><div><p className="pos-shifts-eyebrow">{t('shifts.cashProfiles')}</p><h2>{profileFilter === 'all' ? t('shifts.allProfiles') : profileFilter === 'available' ? t('shifts.availableNow') : t('shifts.withOpenShift')}</h2></div><Tabs value={profileFilter} onValueChange={(next) => setProfileFilter(next as typeof profileFilter)}><TabsList aria-label={t('shifts.filterProfiles')}><TabsTrigger value="all">{t('shifts.all')} <span>{profileStatuses.length}</span></TabsTrigger><TabsTrigger value="available">{t('shifts.available')} <span>{availableProfiles}</span></TabsTrigger><TabsTrigger value="open">{t('shifts.open')} <span>{openProfiles}</span></TabsTrigger></TabsList></Tabs></div>
        {!visibleProfiles.length ? <Card className="pos-shifts-empty"><strong>{t('shifts.noFilteredProfiles')}</strong><span>{t('shifts.tryAnotherFilter')}</span></Card> : visibleProfiles.map(({ profile, status }, index) => {
      const openEntry = (openings.data ?? []).find((entry) => entry.pos_profile === profile.name)
      const userEntry = (openings.data ?? []).find((entry) => entry.user === currentUser.data)
      const canOpen = status === 'available' && Boolean(currentUser.data) && isPosProfileAvailableForUser(profile, currentUser.data ?? '')
      // i18next-instrument-ignore-next-line
      const posProfileLabel = 'POS Profile'
      return <Card key={profile.name} className="pos-shift-card" style={{ '--shift-index': index } as CSSProperties}><div className="pos-shift-card-header"><div><p className="pos-shifts-eyebrow">{posProfileLabel}</p><h2>{profile.name}</h2><p>{profile.company || t('shifts.noCompany')} · {profile.warehouse || t('shifts.noWarehouse')}</p></div><Badge tone={availabilityTone(status)}>{availabilityLabel(status, t)}</Badge></div>
        {openEntry && <p className="text-sm text-slate-600">{t('shifts.openedBy', { name: openEntry.name, user: openEntry.user || t('shifts.unknownUser') })}</p>}
        {!openEntry && status === 'user-open' && <p className="text-sm text-slate-600">{t('shifts.userAlreadyOpen', { name: userEntry?.name || t('shifts.otherShift') })}</p>}
        {status === 'not-applicable' && <p className="text-sm text-slate-600">{t('shifts.notAssignedDescription')}</p>}
        {status === 'invalid' && <p className="text-sm text-slate-600">{t('shifts.invalidDescription')}</p>}
        <div className="pos-shift-card-actions"><Button onClick={() => startOpening(profile)} disabled={!canOpen || busy}>{status === 'available' ? t('shifts.openShift') : t('shifts.unavailable')}</Button>{openEntry && openEntry.user === currentUser.data && <ButtonLink variant="secondary" to="/pos">{t('shifts.goToPos')}</ButtonLink>}</div>
      </Card>
        })}
      </section>
    </> : null}
    {selectedProfile && <Card aria-label={t('shifts.openingForm')} className="pos-shift-opening"><div className="pos-shift-opening-heading"><p className="pos-shifts-eyebrow">{t('shifts.newOpening')}</p><h2>{t('shifts.openProfile', { name: selectedProfile.name })}</h2><p>{t('shifts.openingDescription')}</p></div>
      {!paymentMethods.length ? <Notice tone="warning">{t('shifts.noPaymentMethods')}</Notice> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{paymentMethods.map((method: PosPaymentMethod) => <Field label={method.mode_of_payment} key={method.mode_of_payment}><Input aria-label={t('shifts.openingBalance', { method: method.mode_of_payment })} type="number" min="0" step="0.01" value={openingBalances.find((line) => line.modeOfPayment === method.mode_of_payment)?.amount ?? 0} onChange={(event) => updateBalance(method.mode_of_payment, event.target.value)} /></Field>)}</div>}
      <div className="pos-shift-opening-actions"><Button onClick={() => void submitOpening()} disabled={busy || !paymentMethods.length}>{busy ? <><Spinner /> {t('shifts.opening')}</> : t('shifts.confirmOpening')}</Button><Button variant="secondary" onClick={() => { setSelectedProfileName(''); setError('') }} disabled={busy}>{t('common.cancel')}</Button></div>
    </Card>}
    <Card className="pos-shift-rule"><p className="pos-shifts-eyebrow">{t('shifts.erpnextRule')}</p><h2>{t('shifts.oneOpeningRule')}</h2><p>{t('shifts.ruleDescription')}</p></Card>
  </div>
}
