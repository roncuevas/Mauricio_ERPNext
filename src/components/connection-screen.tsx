import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button, Field, Input, Notice, Spinner } from './ui'
import { decryptProfile, encryptProfile, normalizeBaseUrl } from '../lib/crypto'
import { buildShareUrl, clearSharedConnectionParams, readSharedConnection, readSharedConnectionFromLink } from '../lib/share-link'
import { removeProfile, writeProfiles } from '../lib/storage'
import type { ConnectionProfile, StoredProfile } from '../lib/types'

export function ConnectionScreen({ profiles, onUnlock, onProfilesChange }: { profiles: StoredProfile[]; onUnlock: (p: ConnectionProfile) => Promise<void>; onProfilesChange: (p: StoredProfile[]) => void }) {
  const shared = useMemo(() => readSharedConnection(window.location.search, window.location.hash), [])
  const [selected, setSelected] = useState<StoredProfile | null>(null)
  const [form, setForm] = useState({ label: shared?.label ?? '', baseUrl: shared?.baseUrl ?? '', apiKey: shared?.apiKey ?? '', apiSecret: shared?.apiSecret ?? '', passphrase: '' })
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
        try { await navigator.clipboard.writeText(url); setShareNotice('Enlace copiado. Contiene credenciales: compártelo solo por un canal seguro.') } catch { setShareNotice('No se pudo copiar automáticamente. Revisa los permisos del portapapeles e inténtalo de nuevo.') }
        return
      }
      const profile: ConnectionProfile = { id: crypto.randomUUID(), label: form.label.trim() || new URL(form.baseUrl).hostname, baseUrl: normalizeBaseUrl(form.baseUrl), apiKey: form.apiKey.trim(), apiSecret: form.apiSecret.trim() }
      if (!profile.apiKey || !profile.apiSecret) throw new Error('La API Key y el API Secret son obligatorios.')
      const stored = await encryptProfile(profile, form.passphrase)
      const next = [...profiles.filter((p) => p.id !== stored.id), stored]
      writeProfiles(next); onProfilesChange(next); await onUnlock(profile)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar la conexión.') } finally { setBusy(false) }
  }

  function importFromLink() {
    setError('')
    setShareNotice('')
    const imported = readSharedConnectionFromLink(importLink)
    if (!imported) {
      setError('Pega un enlace de credenciales válido.')
      return
    }
    setSelected(null)
    setMode('new')
    setForm({ label: imported.label, baseUrl: imported.baseUrl, apiKey: imported.apiKey, apiSecret: imported.apiSecret, passphrase: '' })
    setShowImport(false)
    setShareNotice('Link importado. Solo falta la contraseña local para cifrar y conectar.')
  }

  function deleteProfile(profile: StoredProfile) {
    if (!confirm(`¿Eliminar el perfil local “${profile.label}”?`)) return
    removeProfile(profile.id)
    const next = profiles.filter((p) => p.id !== profile.id)
    onProfilesChange(next)
    if (selected?.id === profile.id) setSelected(null)
  }

  return <main className="flex min-h-screen items-center justify-center p-4"><section className="card w-full max-w-lg p-6 sm:p-8"><div className="mb-7"><img className="connection-brand-logo mb-3" src="/mauricio-logo-cropped.png" alt="Mauricio" /><h1 className="text-2xl font-bold text-slate-900">Conecta tu instancia</h1><p className="mt-2 muted">Las credenciales se cifran y permanecen solo en este navegador.</p></div>{shared && <div className="mb-4"><Notice tone="warning">Este enlace contiene credenciales en el fragmento local del navegador. Confirma la contraseña para cifrarlas; después el enlace se limpia.</Notice></div>}<div className="mb-6"><Button type="button" variant="secondary" onClick={() => { setShowImport((value) => !value); setError(''); setShareNotice('') }}>{showImport ? 'Cancelar importar desde link' : 'Importar desde link'}</Button>{showImport && <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><Field label="Link de credenciales"><Input type="url" value={importLink} onChange={(e) => setImportLink(e.target.value)} placeholder="Pega aquí el link completo" autoFocus /></Field><p className="text-xs text-slate-500">Se importarán la instancia y las credenciales. Solo tendrás que definir la contraseña local.</p><Button type="button" onClick={importFromLink}>Importar link</Button></div>}</div>{profiles.length > 0 && <div className="connection-profiles mb-6 grid gap-2"><p className="field-label">Perfiles guardados</p>{profiles.map((profile) => <div key={profile.id} className="connection-profile-card flex items-center gap-2 rounded-lg border border-slate-200 p-3"><button className="connection-profile-details min-w-0 flex-1 text-left" onClick={() => { setSelected(profile); setMode('unlock'); setShareNotice(''); setForm((f) => ({ ...f, passphrase: '' })) }}><strong className="block text-sm">{profile.label}</strong><span className="block text-xs text-slate-500">{profile.baseUrl}</span></button><div className="connection-profile-actions flex shrink-0 gap-2"><Button type="button" variant="secondary" onClick={() => { setSelected(profile); setMode('share'); setShareNotice(''); setError(''); setForm((f) => ({ ...f, passphrase: '' })) }}>Compartir</Button><Button type="button" variant="danger" onClick={() => deleteProfile(profile)}>Eliminar</Button></div></div>)}</div>}{error && <div className="mb-4"><Notice>{error}</Notice></div>}{shareNotice && <div className="mb-4"><Notice tone="warning">{shareNotice}</Notice></div>}<form className="grid gap-4" onSubmit={submit}>{(mode === 'unlock' || mode === 'share') && selected ? <><div className="connection-selected-profile rounded-lg bg-slate-50 p-3 text-sm"><strong>{selected.label}</strong><span>{selected.baseUrl}</span></div><Field label="Contraseña local"><Input autoFocus type="password" value={form.passphrase} onChange={(e) => setForm({ ...form, passphrase: e.target.value })} minLength={8} required /></Field><div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? <Spinner /> : mode === 'share' ? 'Desencriptar y copiar enlace' : 'Desbloquear'}</Button><Button type="button" variant="secondary" onClick={() => { setMode('new'); setSelected(null); setShareNotice(''); setError('') }}>Nueva conexión</Button></div></> : <><Field label="Nombre del perfil"><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Mi ERPNext" /></Field><Field label="URL de ERPNext"><Input type="url" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://erp.example.com" required /></Field><Field label="API Key"><Input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} required autoComplete="off" /></Field><Field label="API Secret"><Input type="password" value={form.apiSecret} onChange={(e) => setForm({ ...form, apiSecret: e.target.value })} required autoComplete="off" /></Field><Field label="Contraseña local"><Input type="password" value={form.passphrase} onChange={(e) => setForm({ ...form, passphrase: e.target.value })} minLength={8} required placeholder="Mínimo 8 caracteres" /></Field><Button type="submit" disabled={busy}>{busy ? <Spinner /> : 'Cifrar y conectar'}</Button></>}</form></section></main>
}
