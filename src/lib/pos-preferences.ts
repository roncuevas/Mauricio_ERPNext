export type PosPreferences = {
  version: 1
  profileName: string
  defaultCustomer: string
  rememberCustomer: boolean
  autoFocusProductSearch: boolean
}

export const DEFAULT_POS_PREFERENCES: PosPreferences = {
  version: 1,
  profileName: '',
  defaultCustomer: '',
  rememberCustomer: true,
  autoFocusProductSearch: true,
}

function storageKey(profileId: string) {
  return `mauricio-erpnext:pos-preferences:${profileId}`
}

function normalize(value: unknown): PosPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_POS_PREFERENCES }
  const candidate = value as Partial<PosPreferences>
  if (candidate.version !== 1) return { ...DEFAULT_POS_PREFERENCES }
  return {
    version: 1,
    profileName: typeof candidate.profileName === 'string' ? candidate.profileName : '',
    defaultCustomer: typeof candidate.defaultCustomer === 'string' ? candidate.defaultCustomer : '',
    rememberCustomer: typeof candidate.rememberCustomer === 'boolean' ? candidate.rememberCustomer : true,
    autoFocusProductSearch: typeof candidate.autoFocusProductSearch === 'boolean' ? candidate.autoFocusProductSearch : true,
  }
}

export function readPosPreferences(profileId: string): PosPreferences {
  try {
    return normalize(JSON.parse(localStorage.getItem(storageKey(profileId)) ?? 'null'))
  } catch {
    return { ...DEFAULT_POS_PREFERENCES }
  }
}

export function writePosPreferences(profileId: string, preferences: PosPreferences) {
  const next = normalize(preferences)
  localStorage.setItem(storageKey(profileId), JSON.stringify(next))
  return next
}

export function clearPosPreferences(profileId: string) {
  localStorage.removeItem(storageKey(profileId))
}
