import { useState, type FormEvent } from 'react'
import { Button, Field, Input, Notice, Spinner } from './ui'
import { decryptProfile, encryptProfile, normalizeBaseUrl } from '../lib/crypto'
import { removeProfile, writeProfiles } from '../lib/storage'
import type { ConnectionProfile, StoredProfile } from '../lib/types'

export function ConnectionScreen({ profiles, onUnlock, onProfilesChange }: { profiles: StoredProfile[]; onUnlock: (p: ConnectionProfile) => Promise<void>; onProfilesChange: (p: StoredProfile[]) => void }) {
  const [selected, setSelected] = useState<StoredProfile | null>(null)
  const [form, setForm] = useState({ label: '', baseUrl: '', apiKey: '', apiSecret: '', passphrase: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'new' | 'unlock'>('new')

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      if (mode === 'unlock' && selected) { await onUnlock(await decryptProfile(selected, form.passphrase)); return }
      const profile: ConnectionProfile = { id: crypto.randomUUID(), label: form.label.trim() || new URL(form.baseUrl).hostname, baseUrl: normalizeBaseUrl(form.baseUrl), apiKey: form.apiKey.trim(), apiSecret: form.apiSecret.trim() }
      if (!profile.apiKey || !profile.apiSecret) throw new Error('La API Key y el API Secret son obligatorios.')
      const stored = await encryptProfile(profile, form.passphrase)
      const next = [...profiles.filter((p) => p.id !== stored.id), stored]
      writeProfiles(next); onProfilesChange(next); await onUnlock(profile)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar la conexión.') } finally { setBusy(false) }
  }

  function deleteProfile(profile: StoredProfile) {
    if (!confirm(`¿Eliminar el perfil local “${profile.label}”?`)) return
    removeProfile(profile.id)
    const next = profiles.filter((p) => p.id !== profile.id)
    onProfilesChange(next)
    if (selected?.id === profile.id) setSelected(null)
  }

  return <main className="flex min-h-screen items-center justify-center p-4"><section className="card w-full max-w-lg p-6 sm:p-8"><div className="mb-7"><p className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-600">ERPNext Local Admin</p><h1 className="text-2xl font-bold text-slate-900">Conecta tu instancia</h1><p className="mt-2 muted">Las credenciales se cifran y permanecen solo en este navegador.</p></div>{profiles.length > 0 && <div className="mb-6 grid gap-2"><p className="field-label">Perfiles guardados</p>{profiles.map((profile) => <div key={profile.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3"><button className="min-w-0 flex-1 text-left" onClick={() => { setSelected(profile); setMode('unlock'); setForm((f) => ({ ...f, passphrase: '' })) }}><strong className="block truncate text-sm">{profile.label}</strong><span className="block truncate text-xs text-slate-500">{profile.baseUrl}</span></button><Button variant="danger" onClick={() => deleteProfile(profile)}>Eliminar</Button></div>)}</div>}{error && <div className="mb-4"><Notice>{error}</Notice></div>}<form className="grid gap-4" onSubmit={submit}>{mode === 'unlock' && selected ? <><div className="rounded-lg bg-slate-50 p-3 text-sm"><strong>{selected.label}</strong><span className="ml-2 text-slate-500">{selected.baseUrl}</span></div><Field label="Contraseña local"><Input autoFocus type="password" value={form.passphrase} onChange={(e) => setForm({ ...form, passphrase: e.target.value })} required /></Field><div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? <Spinner /> : 'Desbloquear'}</Button><Button type="button" variant="secondary" onClick={() => { setMode('new'); setSelected(null); setError('') }}>Nueva conexión</Button></div></> : <><Field label="Nombre del perfil"><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Mi ERPNext" /></Field><Field label="URL de ERPNext"><Input type="url" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://erp.example.com" required /></Field><Field label="API Key"><Input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} required autoComplete="off" /></Field><Field label="API Secret"><Input type="password" value={form.apiSecret} onChange={(e) => setForm({ ...form, apiSecret: e.target.value })} required autoComplete="off" /></Field><Field label="Contraseña local"><Input type="password" value={form.passphrase} onChange={(e) => setForm({ ...form, passphrase: e.target.value })} minLength={8} required placeholder="Mínimo 8 caracteres" /></Field><Button type="submit" disabled={busy}>{busy ? <Spinner /> : 'Cifrar y conectar'}</Button></>}</form></section></main>
}
