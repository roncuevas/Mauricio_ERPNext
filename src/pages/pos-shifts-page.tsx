import { useEffect, useMemo, useState, type CSSProperties } from 'react'
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

function availabilityLabel(status: ReturnType<typeof openingAvailability>) {
  if (status === 'available') return 'Disponible'
  if (status === 'profile-open') return 'Perfil ocupado'
  if (status === 'user-open') return 'Usuario ocupado'
  if (status === 'not-applicable') return 'No asignado'
  if (status === 'disabled') return 'Desactivado'
  return 'Configuración incompleta'
}

function availabilityTone(status: ReturnType<typeof openingAvailability>) {
  if (status === 'available') return 'success' as const
  if (status === 'profile-open' || status === 'user-open') return 'warning' as const
  return 'danger' as const
}

export function PosShiftsPage({ client }: { client: PosClient }) {
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
  const profileDetails = useQuery({ queryKey: ['pos-shift-profile-details', profiles.data?.map((profile) => profile.name).join('|')], enabled: Boolean(profiles.data?.length), queryFn: async () => Promise.all((profiles.data ?? []).map(async (profile) => { try { return await client.getDocument<PosProfile>('POS Profile', profile.name) } catch { return profile } })) })
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
      setMessage(`Turno abierto: ${created.name}`); setSelectedProfileName(''); await openings.refetch()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo abrir el turno.') } finally { setBusy(false) }
  }

  const user = currentUser.data ?? 'Verificando usuario…'
  return <div className="pos-shifts-page">
    <header className="pos-shifts-header">
      <div className="pos-shifts-heading"><div className="pos-shifts-title-row"><div><p className="pos-shifts-kicker">Operación / Caja</p><h1>Turnos</h1></div><Badge tone="info">POS</Badge></div><p>Administra la jornada de caja del usuario actual y revisa qué perfiles están disponibles.</p></div>
      <div className="pos-shifts-header-actions"><div className="pos-shifts-user"><span>Usuario ERPNext</span><strong>{user}</strong></div><RefreshButton label="Actualizar turnos" loading={profiles.isFetching || openings.isFetching} onClick={() => { void Promise.all([profiles.refetch(), openings.refetch(), currentUser.refetch()]) }} /></div>
    </header>
    {message && <Notice tone="info"><span role="status" aria-live="polite">{message}</span><span className="ml-2"><Link className="font-semibold underline" to="/pos">Ir al POS</Link></span></Notice>}
    {error && <Notice>{error}</Notice>}
    {currentUser.isError && <Notice>{currentUser.error instanceof Error ? currentUser.error.message : 'No se pudo verificar el usuario actual.'}</Notice>}
    {profiles.isError && <Notice>{profiles.error instanceof Error ? profiles.error.message : 'No se pudieron cargar los POS Profiles.'}</Notice>}
    {openings.isError && <Notice>{openings.error instanceof Error ? openings.error.message : 'No se pudieron cargar los turnos abiertos.'}</Notice>}
    {profiles.isPending || profileDetails.isPending || currentUser.isPending ? <Card className="pos-shifts-loading"><Spinner /> Cargando perfiles y turnos…</Card> : null}
    {!profiles.isPending && !profiles.data?.length && <Notice>No hay POS Profiles activos. Configura y habilita uno en ERPNext antes de usar la caja.</Notice>}
    {profileDetails.data?.length ? <>
      <section aria-label="Resumen de turnos" className="pos-shifts-summary">
        <Card className="pos-shift-stat"><span>Perfiles activos</span><strong>{profileStatuses.length}</strong><small>Configurados en ERPNext</small></Card>
        <Card className="pos-shift-stat pos-shift-stat-ready"><span>Listos para abrir</span><strong>{availableProfiles}</strong><small>Disponibles para este usuario</small></Card>
        <Card className="pos-shift-stat pos-shift-stat-open"><span>Turnos abiertos</span><strong>{openProfiles}</strong><small>Requieren operación o cierre</small></Card>
      </section>
      <section aria-label="POS Profiles" className="pos-shifts-profiles">
        <div className="pos-shifts-section-heading"><div><p className="pos-shifts-eyebrow">Perfiles de caja</p><h2>{profileFilter === 'all' ? 'Todos los perfiles' : profileFilter === 'available' ? 'Disponibles ahora' : 'Con turno abierto'}</h2></div><Tabs value={profileFilter} onValueChange={(next) => setProfileFilter(next as typeof profileFilter)}><TabsList aria-label="Filtrar perfiles"><TabsTrigger value="all">Todos <span>{profileStatuses.length}</span></TabsTrigger><TabsTrigger value="available">Disponibles <span>{availableProfiles}</span></TabsTrigger><TabsTrigger value="open">Abiertos <span>{openProfiles}</span></TabsTrigger></TabsList></Tabs></div>
        {!visibleProfiles.length ? <Card className="pos-shifts-empty"><strong>No hay perfiles en este filtro</strong><span>Prueba con otra vista para continuar.</span></Card> : visibleProfiles.map(({ profile, status }, index) => {
      const openEntry = (openings.data ?? []).find((entry) => entry.pos_profile === profile.name)
      const userEntry = (openings.data ?? []).find((entry) => entry.user === currentUser.data)
      const canOpen = status === 'available' && Boolean(currentUser.data) && isPosProfileAvailableForUser(profile, currentUser.data ?? '')
      return <Card key={profile.name} className="pos-shift-card" style={{ '--shift-index': index } as CSSProperties}><div className="pos-shift-card-header"><div><p className="pos-shifts-eyebrow">POS Profile</p><h2>{profile.name}</h2><p>{profile.company || 'Sin empresa'} · {profile.warehouse || 'Sin almacén'}</p></div><Badge tone={availabilityTone(status)}>{availabilityLabel(status)}</Badge></div>
        {openEntry && <p className="text-sm text-slate-600">Turno <strong>{openEntry.name}</strong> abierto por <strong>{openEntry.user || 'usuario desconocido'}</strong>.</p>}
        {!openEntry && status === 'user-open' && <p className="text-sm text-slate-600">El usuario actual ya tiene abierto <strong>{userEntry?.name || 'otro turno'}</strong>. Solo puede existir un turno abierto por usuario.</p>}
        {status === 'not-applicable' && <p className="text-sm text-slate-600">Este perfil tiene usuarios asignados y el usuario actual no está incluido.</p>}
        {status === 'invalid' && <p className="text-sm text-slate-600">Configura empresa y almacén en ERPNext antes de abrirlo.</p>}
        <div className="pos-shift-card-actions"><Button onClick={() => startOpening(profile)} disabled={!canOpen || busy}>{status === 'available' ? 'Abrir turno' : 'No disponible'}</Button>{openEntry && openEntry.user === currentUser.data && <ButtonLink variant="secondary" to="/pos">Ir al POS</ButtonLink>}</div>
      </Card>
        })}
      </section>
    </> : null}
    {selectedProfile && <Card aria-label="Formulario de apertura" className="pos-shift-opening"><div className="pos-shift-opening-heading"><p className="pos-shifts-eyebrow">Nueva apertura</p><h2>Abrir {selectedProfile.name}</h2><p>Captura el fondo inicial por método de pago. ERPNext validará la apertura al enviarla.</p></div>
      {!paymentMethods.length ? <Notice tone="warning">El perfil no tiene métodos de pago válidos. Configúralos en ERPNext antes de abrir.</Notice> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{paymentMethods.map((method: PosPaymentMethod) => <Field label={method.mode_of_payment} key={method.mode_of_payment}><Input aria-label={`Fondo inicial ${method.mode_of_payment}`} type="number" min="0" step="0.01" value={openingBalances.find((line) => line.modeOfPayment === method.mode_of_payment)?.amount ?? 0} onChange={(event) => updateBalance(method.mode_of_payment, event.target.value)} /></Field>)}</div>}
      <div className="pos-shift-opening-actions"><Button onClick={() => void submitOpening()} disabled={busy || !paymentMethods.length}>{busy ? <><Spinner /> Abriendo…</> : 'Confirmar apertura'}</Button><Button variant="secondary" onClick={() => { setSelectedProfileName(''); setError('') }} disabled={busy}>Cancelar</Button></div>
    </Card>}
    <Card className="pos-shift-rule"><p className="pos-shifts-eyebrow">Regla de ERPNext</p><h2>Una apertura por perfil y usuario</h2><p>Esta vista lista aperturas; el cierre y la cancelación se realizan desde el POS o ERPNext.</p></Card>
  </div>
}
