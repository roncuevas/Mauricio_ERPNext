import type { StoredProfile } from './types'

const key = 'mauricio-erpnext:profiles'
const lastProfileKey = 'mauricio-erpnext:last-profile'

export function readProfiles(): StoredProfile[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as StoredProfile[] } catch { return [] }
}

export function writeProfiles(profiles: StoredProfile[]) {
  localStorage.setItem(key, JSON.stringify(profiles))
}

export function removeProfile(id: string) {
  writeProfiles(readProfiles().filter((profile) => profile.id !== id))
}

/** The profile unlocked most recently in this browser, offered first on the login screen. */
export function readLastProfileId() {
  try { return localStorage.getItem(lastProfileKey) } catch { return null }
}

export function writeLastProfileId(id: string) {
  try { localStorage.setItem(lastProfileKey, id) } catch { /* Remembering the profile is a convenience. */ }
}
