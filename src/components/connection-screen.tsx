import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Field, IconButton, Input, Notice, Spinner } from './ui'
import { decryptProfile, encryptProfile, normalizeBaseUrl } from '../lib/crypto'
import { buildShareUrl, clearSharedConnectionParams, readSharedConnection, readSharedConnectionFromLink } from '../lib/share-link'
import { removeProfile, writeProfiles } from '../lib/storage'
import type { ConnectionProfile, StoredProfile } from '../lib/types'

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
  const [selected, setSelected] = useState<StoredProfile | null>(null)
  const [form, setForm] = useState<ConnectionFormState>({ label: shared?.label ?? '', baseUrl: shared?.baseUrl ?? '', apiKey: shared?.apiKey ?? '', apiSecret: shared?.apiSecret ?? '', passphrase: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'new' | 'unlock' | 'share'>('new')
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
      if (mode === 'unlock' && selected) { await onUnlock(await decryptProfile(selected, form.passphrase)); return }
      if (mode === 'share' && selected) {
        const profile = await decryptProfile(selected, form.passphrase)
        const url = buildShareUrl(profile, window.location.href)
        try { await navigator.clipboard.writeText(url); setShareNotice(t('connection.shareCopied')) } catch { setShareNotice(t('connection.clipboardError')) }
        return
      }
      const profile: ConnectionProfile = { id: crypto.randomUUID(), label: form.label.trim() || new URL(form.baseUrl).hostname, baseUrl: normalizeBaseUrl(form.baseUrl), apiKey: form.apiKey.trim(), apiSecret: form.apiSecret.trim() }
      if (!profile.apiKey || !profile.apiSecret) throw new Error(t('errors.apiRequired'))
      const stored = await encryptProfile(profile, form.passphrase)
      const next = [...profiles.filter((p) => p.id !== stored.id), stored]
      writeProfiles(next); onProfilesChange(next); await onUnlock(profile)
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
    if (selected?.id === profile.id) setSelected(null)
  }

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
          <div className="connection-import">
            <Button type="button" variant="secondary" onClick={() => { setShowImport((value) => !value); setError(''); setShareNotice('') }}>{showImport ? t('connection.cancelImport') : t('connection.importLink')}</Button>
            {showImport && <div className="connection-import-panel"><Field label={t('connection.linkLabel')}><Input type="url" value={importLink} onChange={(e) => setImportLink(e.target.value)} placeholder={t('connection.linkPlaceholder')} autoFocus /></Field><p>{t('connection.security')}</p><Button type="button" onClick={importFromLink}>{t('connection.importButton')}</Button></div>}
          </div>
          {profiles.length > 0 && <div className="connection-profiles"><div className="connection-section-heading"><p className="field-label">{t('connection.profiles')}</p><span>{profiles.length} {profiles.length === 1 ? t('connection.profile') : t('connection.profilesPlural')}</span></div>{profiles.map((profile) => <div key={profile.id} className="connection-profile-card flex items-center gap-2"><button type="button" className="connection-profile-details min-w-0 flex-1 text-left" onClick={() => { setSelected(profile); setMode('unlock'); setShareNotice(''); updateForm({ passphrase: '' }) }}><strong className="block text-sm">{profile.label}</strong><span className="block text-xs">{profile.baseUrl}</span></button><div className="connection-profile-actions flex shrink-0 gap-2"><IconButton type="button" label={t('connection.shareProfile')} icon={<ShareIcon />} onClick={() => { setSelected(profile); setMode('share'); setShareNotice(''); setError(''); updateForm({ passphrase: '' }) }} /><IconButton type="button" label={t('connection.deleteProfile')} variant="danger" icon={<TrashIcon />} onClick={() => deleteProfile(profile)} /></div></div>)}</div>}
          {error && <div className="connection-notice"><Notice>{error}</Notice></div>}
          {shareNotice && <div className="connection-notice"><Notice tone="warning">{shareNotice}</Notice></div>}
          <form className="connection-form" onSubmit={submit}>
            {(mode === 'unlock' || mode === 'share') && selected ? <><div className="connection-selected-profile"><strong>{selected.label}</strong><span>{selected.baseUrl}</span></div><Field label={t('connection.localPassword')}><Input autoFocus type="password" value={form.passphrase} onChange={(e) => updateForm({ passphrase: e.target.value })} minLength={8} required /></Field><div className="connection-form-actions"><Button type="submit" disabled={busy}>{busy ? <Spinner /> : mode === 'share' ? t('connection.copyShare') : t('connection.unlockButton')}</Button><Button type="button" variant="secondary" onClick={() => { setMode('new'); setSelected(null); setShareNotice(''); setError('') }}>{t('connection.new')}</Button></div></> : <><Field label={t('connection.profileName')}><Input value={form.label} onChange={(e) => updateForm({ label: e.target.value })} placeholder={t('connection.profilePlaceholder')} /></Field><Field label={t('connection.url')}><Input type="url" value={form.baseUrl} onChange={(e) => updateForm({ baseUrl: e.target.value })} placeholder={t('connection.urlPlaceholder')} required /></Field><Field label={t('connection.apiKey')}><Input value={form.apiKey} onChange={(e) => updateForm({ apiKey: e.target.value })} required autoComplete="off" /></Field><Field label={t('connection.apiSecret')}><Input type="password" value={form.apiSecret} onChange={(e) => updateForm({ apiSecret: e.target.value })} required autoComplete="off" /></Field><Field label={t('connection.localPassword')}><Input type="password" value={form.passphrase} onChange={(e) => updateForm({ passphrase: e.target.value })} minLength={8} required placeholder={t('connection.passwordPlaceholder')} /></Field><Button type="submit" disabled={busy}>{busy ? <Spinner /> : t('connection.encryptConnect')}</Button></>}
          </form>
          <p className="connection-security-note"><span aria-hidden="true">●</span> {t('connection.credentialsLocal')}</p>
        </Card>
      </div>
    </main>
  )
}
