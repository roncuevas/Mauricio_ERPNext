import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Field, IconButton, Input, Notice, Spinner } from './ui'
import { decryptProfile, encryptProfile, normalizeBaseUrl } from '../lib/crypto'
import { verifyConnection } from '../lib/erpnext'
import { buildShareUrl, clearSharedConnectionParams, readSharedConnection, readSharedConnectionFromLink } from '../lib/share-link'
import { readLastProfileId, removeProfile, writeLastProfileId, writeProfiles } from '../lib/storage'
import type { ConnectionProfile, StoredProfile } from '../lib/types'
import { LanguageSelector } from './language-selector'
import { ThemePaletteSelector } from './theme-palette-selector'
import { ThemeModeToggle } from './layout'

function ShareIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" focusable="false"><circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.8" /><circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" /><circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.8" /><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>
}

function TrashIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" focusable="false"><path d="M4.5 7.5h15M9 4.5h6l.75 3H8.25l.75-3ZM7 7.5l.75 12h8.5l.75-12M10 11v5M14 11v5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
}

type ConnectionFormState = { label: string; baseUrl: string; apiKey: string; apiSecret: string; passphrase: string }

export function ConnectionScreen({ profiles, onUnlock, onProfilesChange }: { profiles: StoredProfile[]; onUnlock: (p: ConnectionProfile) => Promise<void>; onProfilesChange: (p: StoredProfile[]) => void }) {
  const { t } = useTranslation()
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
      if (mode === 'unlock' && selected) { const profile = await decryptProfile(selected, form.passphrase); writeLastProfileId(selected.id); await onUnlock(profile); return }
      if (mode === 'share' && selected) {
        const profile = await decryptProfile(selected, form.passphrase)
        const url = buildShareUrl(profile, window.location.href)
        try { await navigator.clipboard.writeText(url); setShareNotice(t('connection.shareCopied')) } catch { setShareNotice(t('connection.clipboardError')) }
        return
      }
      const profile: ConnectionProfile = { id: crypto.randomUUID(), label: form.label.trim() || new URL(form.baseUrl).hostname, baseUrl: normalizeBaseUrl(form.baseUrl), apiKey: form.apiKey.trim(), apiSecret: form.apiSecret.trim() }
      if (!profile.apiKey || !profile.apiSecret) throw new Error(t('errors.apiRequired'))
      // Only a connection ERPNext accepts is encrypted and saved, so a typo never leaves a broken profile behind.
      await verifyConnection(profile)
      const stored = await encryptProfile(profile, form.passphrase)
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

  function deleteProfile(profile: StoredProfile) {
    if (!confirm(`¿Eliminar el perfil local “${profile.label}”?`)) return
    removeProfile(profile.id)
    const next = profiles.filter((p) => p.id !== profile.id)
    onProfilesChange(next)
    if (selected?.id === profile.id) {
      if (next[0]) chooseProfile(next[0])
      else startNew()
    }
  }

  function chooseProfile(profile: StoredProfile, nextMode: 'unlock' | 'share' = 'unlock') {
    setSelected(profile)
    setMode(nextMode)
    setShareNotice('')
    setError('')
    setShowImport(false)
    updateForm({ passphrase: '' })
  }

  function startNew(importing = false) {
    setMode('new')
    setSelected(null)
    setShareNotice('')
    setError('')
    setShowImport(importing)
  }

  const savedProfile = mode !== 'new' ? selected : null
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
          <div className="connection-card-heading"><p className="connection-eyebrow">{t('connection.secure')}</p><h1>{heading}</h1><p>{t('connection.security')}</p></div>
          {shared && <div className="connection-notice"><Notice tone="warning">{t('connection.sharedLinkWarning')}</Notice></div>}
          {savedProfile && <div className="connection-profiles">
            {profiles.length > 1 && <p className="field-label">{t('connection.profiles')}</p>}
            {profiles.map((profile) => {
              const active = profile.id === savedProfile.id
              return <div key={profile.id} className={`connection-profile-card flex items-center gap-2 ${active ? 'is-selected' : ''}`}>
                <button type="button" className="connection-profile-details min-w-0 flex-1 text-left" aria-pressed={active} onClick={() => chooseProfile(profile)}><strong className="block text-sm">{profile.label}</strong><span className="block text-xs">{profile.baseUrl}</span></button>
                <div className="connection-profile-actions flex shrink-0 gap-2"><IconButton type="button" size="compact" label={t('connection.shareProfile')} icon={<ShareIcon />} onClick={() => chooseProfile(profile, 'share')} /><IconButton type="button" size="compact" label={t('connection.deleteProfile')} variant="danger" icon={<TrashIcon />} onClick={() => deleteProfile(profile)} /></div>
              </div>
            })}
          </div>}
          {mode === 'new' && showImport && <div className="connection-import-panel"><Field label={t('connection.linkLabel')}><Input type="url" value={importLink} onChange={(e) => setImportLink(e.target.value)} placeholder={t('connection.linkPlaceholder')} autoFocus /></Field><Button type="button" onClick={importFromLink}>{t('connection.importButton')}</Button></div>}
          {error && <div className="connection-notice"><Notice>{error}</Notice></div>}
          {shareNotice && <div className="connection-notice"><Notice tone="warning">{shareNotice}</Notice></div>}
          <form className="connection-form" onSubmit={submit}>
            {savedProfile ? <><Field label={t('connection.localPassword')}><Input key={`${savedProfile.id}-${mode}`} autoFocus type="password" autoComplete="current-password" value={form.passphrase} onChange={(e) => updateForm({ passphrase: e.target.value })} minLength={8} required /></Field><Button type="submit" disabled={busy}>{busy ? <Spinner /> : mode === 'share' ? t('connection.copyShare') : t('connection.unlockButton')}</Button></> : <><Field label={t('connection.profileName')}><Input value={form.label} onChange={(e) => updateForm({ label: e.target.value })} placeholder={t('connection.profilePlaceholder')} /></Field><Field label={t('connection.url')}><Input type="url" value={form.baseUrl} onChange={(e) => updateForm({ baseUrl: e.target.value })} placeholder={t('connection.urlPlaceholder')} required /></Field><Field label={t('connection.apiKey')}><Input value={form.apiKey} onChange={(e) => updateForm({ apiKey: e.target.value })} required autoComplete="off" /></Field><Field label={t('connection.apiSecret')}><Input type="password" value={form.apiSecret} onChange={(e) => updateForm({ apiSecret: e.target.value })} required autoComplete="off" /></Field><Field label={t('connection.localPassword')}><Input type="password" value={form.passphrase} onChange={(e) => updateForm({ passphrase: e.target.value })} minLength={8} required placeholder={t('connection.passwordPlaceholder')} /></Field><Button type="submit" disabled={busy}>{busy ? <><Spinner /> {t('connection.verify.checking')}</> : t('connection.encryptConnect')}</Button></>}
          </form>
          <div className="connection-alt-actions">
            {mode === 'share' && savedProfile && <button type="button" className="connection-link" onClick={() => chooseProfile(savedProfile)}>{t('common.cancel')}</button>}
            {savedProfile && <button type="button" className="connection-link" onClick={() => startNew()}>{t('connection.new')}</button>}
            {!savedProfile && profiles.length > 0 && <button type="button" className="connection-link" onClick={() => chooseProfile(profiles.find((profile) => profile.id === readLastProfileId()) ?? profiles[0])}>{t('connection.useSaved')}</button>}
            <button type="button" className="connection-link" aria-expanded={mode === 'new' ? showImport : false} onClick={() => mode === 'new' ? setShowImport((value) => !value) : startNew(true)}>{mode === 'new' && showImport ? t('connection.cancelImport') : t('connection.importLink')}</button>
          </div>
          <p className="connection-security-note"><span aria-hidden="true">●</span> {t('connection.credentialsLocal')}</p>
        </Card>
        <div className="connection-preferences" role="group" aria-label={t('connection.preferences')}>
          <LanguageSelector compact />
          <ThemePaletteSelector compact />
          <ThemeModeToggle className="connection-theme-toggle" />
        </div>
      </div>
    </main>
  )
}
