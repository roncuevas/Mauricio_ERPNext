import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, IconButton, Input, Notice, RadioGroup, RadioGroupItem, Spinner, buttonVariants } from './ui'
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from './ui/field'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { decryptProfile, encryptProfile, normalizeBaseUrl } from '../lib/crypto'
import { verifyConnection } from '../lib/erpnext'
import { PasswordInput } from './password-input'
import { useConfirmDialog } from './confirm-dialog'
import { Check, Share2, Trash2 } from 'lucide-react'
import { buildShareUrl, clearSharedConnectionParams, readSharedConnection, readSharedConnectionFromLink } from '../lib/share-link'
import { readLastProfileId, rememberProfileUserName, removeProfile, writeLastProfileId, writeProfiles } from '../lib/storage'
import type { ConnectionProfile, StoredProfile } from '../lib/types'
import { LanguageSelector } from './language-selector'
import { ThemePaletteSelector } from './theme-palette-selector'
import { ThemeModeToggle } from './layout'

/** Where ERPNext issues the API Key and Secret, behind a disclosure so the form stays short for people who have them. */
function ApiKeyHelp({ baseUrl }: { baseUrl: string }) {
  const { t } = useTranslation()
  let deskUrl = ''
  try { deskUrl = `${normalizeBaseUrl(baseUrl)}/app` } catch { /* The link appears once the URL is valid. */ }
  return <Collapsible className="connection-help">
    <CollapsibleTrigger asChild><Button type="button" variant="link">{t('connection.apiHelp.toggle')}</Button></CollapsibleTrigger>
    <CollapsibleContent className="connection-help-panel">
      <ol>
        <li>{t('connection.apiHelp.step1')}</li>
        <li>{t('connection.apiHelp.step2')}</li>
        <li>{t('connection.apiHelp.step3')}</li>
      </ol>
      <p>{t('connection.apiHelp.note')}</p>
      {deskUrl && <a className={buttonVariants({ variant: 'link' })} href={deskUrl} target="_blank" rel="noopener noreferrer">{t('connection.apiHelp.open')}</a>}
    </CollapsibleContent>
  </Collapsible>
}

/** A URL that wraps after its dots, slashes and hyphens instead of mid-word, so it is never cut. */
function BreakableUrl({ url }: { url: string }) {
  return <>{url.split(/(?<=[./-])/).map((part, index) => <span key={index}>{index > 0 && <wbr />}{part}</span>)}</>
}

const MIN_PASSWORD = 8

/** Says the local password is new and only for this browser, and counts down to the minimum length while typing. */
function PasswordHint({ id, length }: { id: string; length: number }) {
  const { t } = useTranslation()
  const ready = length >= MIN_PASSWORD
  return <div id={id}>
    <FieldDescription>{t('connection.password.purpose')}</FieldDescription>
    <FieldDescription className={ready ? 'is-ready' : undefined} aria-live="polite">{ready ? <><Check aria-hidden="true" /> {t('connection.password.ready')}</> : length ? t('connection.password.remaining', { count: MIN_PASSWORD - length }) : t('connection.password.minimum', { count: MIN_PASSWORD })}</FieldDescription>
  </div>
}

type ConnectionFormState = { label: string; baseUrl: string; apiKey: string; apiSecret: string; passphrase: string }

export function ConnectionScreen({ profiles, onUnlock, onProfilesChange }: { profiles: StoredProfile[]; onUnlock: (p: ConnectionProfile) => Promise<void>; onProfilesChange: (p: StoredProfile[]) => void }) {
  const { t } = useTranslation()
  const { confirm, dialog: confirmDialog } = useConfirmDialog()
  const formRef = useRef<HTMLFormElement>(null)
  const shared = useMemo(() => readSharedConnection(window.location.search, window.location.hash), [])
  // A returning user lands on the password of the profile used last; a shared link or no profiles opens the new form.
  const [initialProfile] = useState(() => shared ? null : profiles.find((profile) => profile.id === readLastProfileId()) ?? profiles[0] ?? null)
  const [selected, setSelected] = useState<StoredProfile | null>(initialProfile)
  const [form, setForm] = useState<ConnectionFormState>({ label: shared?.label ?? '', baseUrl: shared?.baseUrl ?? '', apiKey: shared?.apiKey ?? '', apiSecret: shared?.apiSecret ?? '', passphrase: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'new' | 'unlock' | 'share'>(initialProfile ? 'unlock' : 'new')
  const [shareNotice, setShareNotice] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [importLink, setImportLink] = useState('')

  useEffect(() => {
    if (!shared) return
    window.history.replaceState({}, document.title, clearSharedConnectionParams(window.location.href))
  }, [shared])

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      if (mode === 'unlock' && selected) {
        const profile = await decryptProfile(selected, form.passphrase)
        writeLastProfileId(selected.id)
        // Profiles saved before the user's name was recorded learn it in the background; signing in never waits on it.
        if (!selected.userName) void verifyConnection(profile).then(({ userName }) => { if (userName) onProfilesChange(rememberProfileUserName(selected.id, userName)) }).catch(() => undefined)
        await onUnlock(profile)
        return
      }
      if (mode === 'share' && selected) {
        const profile = await decryptProfile(selected, form.passphrase)
        const url = buildShareUrl(profile, window.location.href)
        try { await navigator.clipboard.writeText(url); setShareNotice(t('connection.shareCopied')) } catch { setShareNotice(t('connection.clipboardError')) }
        return
      }
      const profile: ConnectionProfile = { id: crypto.randomUUID(), label: form.label.trim() || new URL(form.baseUrl).hostname, baseUrl: normalizeBaseUrl(form.baseUrl), apiKey: form.apiKey.trim(), apiSecret: form.apiSecret.trim() }
      if (!profile.apiKey || !profile.apiSecret) throw new Error(t('errors.apiRequired'))
      // Only a connection ERPNext accepts is encrypted and saved, so a typo never leaves a broken profile behind.
      const { userName } = await verifyConnection(profile)
      const stored = await encryptProfile(profile, form.passphrase, userName)
      const next = [...profiles.filter((p) => p.id !== stored.id), stored]
      writeProfiles(next); onProfilesChange(next); writeLastProfileId(stored.id); await onUnlock(profile)
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('connection.saveError')) } finally { setBusy(false) }
  }

  function importFromLink() {
    setError('')
    setShareNotice('')
    const imported = readSharedConnectionFromLink(importLink)
    if (!imported) {
      setError(t('connection.invalidLink'))
      return
    }
    setSelected(null)
    setMode('new')
    setForm({ label: imported.label, baseUrl: imported.baseUrl, apiKey: imported.apiKey, apiSecret: imported.apiSecret, passphrase: '' })
    setShowImport(false)
    setShareNotice(t('connection.sharedLinkImported'))
  }

  async function deleteProfile(profile: StoredProfile) {
    if (!(await confirm({ title: t('connection.delete.title'), description: t('connection.delete.description', { label: profile.label }), confirmLabel: t('connection.delete.action'), tone: 'danger' }))) return
    removeProfile(profile.id)
    const next = profiles.filter((p) => p.id !== profile.id)
    onProfilesChange(next)
    if (selected?.id === profile.id) {
      if (next[0]) chooseProfile(next[0])
      else startNew()
    }
    // The dialog's trigger is gone, so focus would fall to the page; keep it on the form instead.
    focusPassword()
  }

  function chooseProfile(profile: StoredProfile, nextMode: 'unlock' | 'share' = 'unlock') {
    setSelected(profile)
    setMode(nextMode)
    setShareNotice('')
    setError('')
    setShowImport(false)
    updateForm({ passphrase: '' })
  }

  function focusPassword() { window.setTimeout(() => formRef.current?.querySelector('input')?.focus()) }

  function startNew(importing = false) {
    setMode('new')
    setSelected(null)
    setShareNotice('')
    setError('')
    setShowImport(importing)
  }

  const savedProfile = mode !== 'new' ? selected : null
  const fieldId = useId()
  const id = (name: string) => `${fieldId}-${name}`
  const heading = mode === 'unlock' ? t('connection.unlock') : mode === 'share' ? t('connection.share') : t('connection.connect')
  const updateForm = (patch: Partial<ConnectionFormState>) => setForm((current) => ({ ...current, ...patch }))

  return (
    <main className="connection-screen flex min-h-screen items-center justify-center p-4 sm:p-6">
      <div className="connection-shell w-full">
        <header className="connection-branding">
          <img className="connection-brand-logo" src="/icon-192.png" alt={t('common.appName')} />
          <div><p className="connection-brand-name">{t('common.appName')}</p><p className="connection-brand-caption">{t('common.appCaption')}</p></div>
        </header>
        <Card className="connection-card p-6 sm:p-8">
          <div className="connection-card-heading"><h1>{heading}</h1><p>{t('connection.security')}</p></div>
          {shared && <div className="connection-notice"><Notice tone="warning">{t('connection.sharedLinkWarning')}</Notice></div>}
          {savedProfile && <RadioGroup className="connection-profiles" value={savedProfile.id} onValueChange={(value) => { const profile = profiles.find((entry) => entry.id === value); if (profile) chooseProfile(profile) }} aria-label={t('connection.profiles')}>
            {profiles.length > 1 && <p className="field-label" aria-hidden="true">{t('connection.profiles')}</p>}
            {profiles.map((profile) => {
              const sharing = mode === 'share' && profile.id === savedProfile.id
              return <div key={profile.id} className="connection-profile-card flex items-center gap-2">
              <FieldLabel className="connection-profile-option" htmlFor={id(`profile-${profile.id}`)} onClick={focusPassword}>
                <RadioGroupItem className="sr-only" id={id(`profile-${profile.id}`)} value={profile.id} />
                <FieldContent>
                  <FieldTitle>{profile.label}</FieldTitle>
                  <FieldDescription>{profile.userName && <><span className="connection-profile-user">{profile.userName}</span><span aria-hidden="true"> · </span></>}<BreakableUrl url={profile.baseUrl.replace(/^https?:\/\//, '')} /></FieldDescription>
                </FieldContent>
              </FieldLabel>
              <div className="connection-profile-actions flex shrink-0 gap-2"><IconButton type="button" size="compact" variant={sharing ? 'primary' : 'secondary'} aria-pressed={sharing} label={t('connection.shareProfile')} icon={<Share2 aria-hidden="true" strokeWidth={1.8} />} onClick={() => sharing ? chooseProfile(profile) : chooseProfile(profile, 'share')} /><IconButton type="button" size="compact" label={t('connection.deleteProfile')} variant="danger" icon={<Trash2 aria-hidden="true" strokeWidth={1.8} />} onClick={() => void deleteProfile(profile)} /></div>
            </div>
            })}
          </RadioGroup>}
          {mode === 'new' && showImport && <div className="connection-import-panel"><Field><FieldLabel htmlFor={id('import')}>{t('connection.linkLabel')}</FieldLabel><Input id={id('import')} type="url" value={importLink} onChange={(e) => setImportLink(e.target.value)} placeholder={t('connection.linkPlaceholder')} autoFocus /></Field><Button type="button" onClick={importFromLink}>{t('connection.importButton')}</Button></div>}
          {error && <div className="connection-notice"><Notice>{error}</Notice></div>}
          {shareNotice && <div className="connection-notice"><Notice tone="warning">{shareNotice}</Notice></div>}
          <form ref={formRef} className="connection-form" onSubmit={submit}>
            {savedProfile ? <><Field><FieldLabel htmlFor={id('password')}>{t('connection.localPassword')}</FieldLabel><PasswordInput id={id('password')} key={mode} autoFocus autoComplete="current-password" value={form.passphrase} onChange={(e) => updateForm({ passphrase: e.target.value })} minLength={8} required aria-describedby={mode === 'share' ? id('share-hint') : undefined} />{mode === 'share' && <FieldDescription id={id('share-hint')} className="connection-share-hint"><Share2 aria-hidden="true" /> {t('connection.shareHint', { label: savedProfile.label })}</FieldDescription>}</Field><Button type="submit" disabled={busy}>{busy ? <Spinner /> : mode === 'share' ? t('connection.copyShare') : t('connection.unlockButton')}</Button></> : <><Field><FieldLabel htmlFor={id('label')}>{t('connection.profileName')}</FieldLabel><Input id={id('label')} value={form.label} onChange={(e) => updateForm({ label: e.target.value })} placeholder={t('connection.profilePlaceholder')} /></Field><Field><FieldLabel htmlFor={id('url')}>{t('connection.url')}</FieldLabel><Input id={id('url')} type="url" value={form.baseUrl} onChange={(e) => updateForm({ baseUrl: e.target.value })} placeholder={t('connection.urlPlaceholder')} required /></Field><Field><FieldLabel htmlFor={id('api-key')}>{t('connection.apiKey')}</FieldLabel><Input id={id('api-key')} value={form.apiKey} onChange={(e) => updateForm({ apiKey: e.target.value })} required autoComplete="off" /></Field><Field><FieldLabel htmlFor={id('api-secret')}>{t('connection.apiSecret')}</FieldLabel><PasswordInput id={id('api-secret')} value={form.apiSecret} onChange={(e) => updateForm({ apiSecret: e.target.value })} required autoComplete="off" /></Field><ApiKeyHelp baseUrl={form.baseUrl} /><Field><FieldLabel htmlFor={id('new-password')}>{t('connection.newLocalPassword')}</FieldLabel><PasswordInput id={id('new-password')} value={form.passphrase} onChange={(e) => updateForm({ passphrase: e.target.value })} minLength={8} required autoComplete="new-password" aria-describedby={id('password-hint')} /><PasswordHint id={id('password-hint')} length={form.passphrase.length} /></Field><Button type="submit" disabled={busy}>{busy ? <><Spinner /> {t('connection.verify.checking')}</> : t('connection.encryptConnect')}</Button></>}
          </form>
          <div className="connection-alt-actions">
            {mode === 'share' && savedProfile && <Button type="button" variant="link" onClick={() => chooseProfile(savedProfile)}>{t('common.cancel')}</Button>}
            {savedProfile && <Button type="button" variant="link" onClick={() => startNew()}>{t('connection.new')}</Button>}
            {!savedProfile && profiles.length > 0 && <Button type="button" variant="link" onClick={() => chooseProfile(profiles.find((profile) => profile.id === readLastProfileId()) ?? profiles[0])}>{t('connection.useSaved')}</Button>}
            <Button type="button" variant="link" aria-expanded={mode === 'new' ? showImport : false} onClick={() => mode === 'new' ? setShowImport((value) => !value) : startNew(true)}>{mode === 'new' && showImport ? t('connection.cancelImport') : t('connection.importLink')}</Button>
          </div>
        </Card>
        <div className="connection-preferences" role="group" aria-label={t('connection.preferences')}>
          <LanguageSelector compact />
          <ThemePaletteSelector compact />
          <ThemeModeToggle className="connection-theme-toggle" />
        </div>
      </div>
      {confirmDialog}
    </main>
  )
}
