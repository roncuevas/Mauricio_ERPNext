import type { ConnectionProfile, StoredProfile } from './types'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const iterations = 310_000

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
}

function encode(value: ArrayBuffer | Uint8Array) {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
}

function decode(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptProfile(profile: ConnectionProfile, passphrase: string): Promise<StoredProfile> {
  if (passphrase.length < 8) throw new Error('La contraseña local debe tener al menos 8 caracteres.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(encoder.encode(JSON.stringify(profile))))
  return { version: 1, id: profile.id, label: profile.label, baseUrl: profile.baseUrl, salt: encode(salt), iv: encode(iv), ciphertext: encode(ciphertext) }
}

export async function decryptProfile(stored: StoredProfile, passphrase: string): Promise<ConnectionProfile> {
  try {
    const key = await deriveKey(passphrase, decode(stored.salt))
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(decode(stored.iv)) }, key, toArrayBuffer(decode(stored.ciphertext)))
    return JSON.parse(decoder.decode(plaintext)) as ConnectionProfile
  } catch {
    throw new Error('No se pudo desbloquear la conexión. Revisa la contraseña.')
  }
}

export function normalizeBaseUrl(value: string) {
  const url = value.trim().replace(/\/+$/, '')
  if (!/^https:\/\//i.test(url) && !/^http:\/\/localhost(?::\d+)?$/i.test(url)) {
    throw new Error('La URL debe usar HTTPS. Solo localhost puede usar HTTP.')
  }
  return url
}
