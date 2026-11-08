import type { ConnectionProfile } from './types'

const databaseName = 'mauricio-erpnext-session'
const storeName = 'session-keys'
const databaseVersion = 1
export const localSessionStorageKey = 'mauricio-erpnext:active-session'
const sessionDuration = 8 * 60 * 60 * 1000

type SessionEnvelope = { profileId: string; expiresAt: number; iv: string; ciphertext: string }

function encode(value: ArrayBuffer | Uint8Array<ArrayBufferLike>) {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value
  return btoa(String.fromCharCode(...bytes))
}
function decode(value: string) { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)) }

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'profileId' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('No se pudo preparar la sesión local.'))
  })
}

async function getKey(profileId: string): Promise<CryptoKey | undefined> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(profileId)
    request.onsuccess = () => resolve(request.result?.key as CryptoKey | undefined)
    request.onerror = () => reject(request.error ?? new Error('No se pudo leer la sesión local.'))
  })
}

export async function startLocalSession(profile: ConnectionProfile) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const iv = new Uint8Array(new ArrayBuffer(12))
  crypto.getRandomValues(iv)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(profile)))
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(storeName, 'readwrite').objectStore(storeName).put({ profileId: profile.id, key })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('No se pudo guardar la sesión local.'))
  })
  const envelope: SessionEnvelope = { profileId: profile.id, expiresAt: Date.now() + sessionDuration, iv: encode(iv), ciphertext: encode(ciphertext) }
  localStorage.setItem(localSessionStorageKey, JSON.stringify(envelope))
  sessionStorage.removeItem(localSessionStorageKey)
}

export async function restoreLocalSession(): Promise<ConnectionProfile | null> {
  const raw = localStorage.getItem(localSessionStorageKey) ?? sessionStorage.getItem(localSessionStorageKey)
  if (!raw) return null
  try {
    if (!localStorage.getItem(localSessionStorageKey)) {
      localStorage.setItem(localSessionStorageKey, raw)
      sessionStorage.removeItem(localSessionStorageKey)
    }
    const envelope = JSON.parse(raw) as SessionEnvelope
    if (envelope.expiresAt <= Date.now()) { await clearLocalSession(); return null }
    const key = await getKey(envelope.profileId)
    if (!key) { await clearLocalSession(); return null }
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(envelope.iv) }, key, decode(envelope.ciphertext))
    return JSON.parse(new TextDecoder().decode(plaintext)) as ConnectionProfile
  } catch {
    await clearLocalSession()
    return null
  }
}

export async function clearLocalSession() {
  const raw = localStorage.getItem(localSessionStorageKey) ?? sessionStorage.getItem(localSessionStorageKey)
  localStorage.removeItem(localSessionStorageKey)
  sessionStorage.removeItem(localSessionStorageKey)
  if (!raw) return
  try {
    const profileId = (JSON.parse(raw) as SessionEnvelope).profileId
    const database = await openDatabase()
    await new Promise<void>((resolve) => {
      const request = database.transaction(storeName, 'readwrite').objectStore(storeName).delete(profileId)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
    })
  } catch { /* The local session is already removed from sessionStorage. */ }
}
