import type { StoredProfile } from './types'

const key = 'mauricio-erpnext:profiles'

export function readProfiles(): StoredProfile[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as StoredProfile[] } catch { return [] }
}

export function writeProfiles(profiles: StoredProfile[]) {
  localStorage.setItem(key, JSON.stringify(profiles))
}

export function removeProfile(id: string) {
  writeProfiles(readProfiles().filter((profile) => profile.id !== id))
}
