export const APP_PREFERENCES_KEY = 'mauricio-erpnext:app-preferences:v1'

export type LandingRoute = '/' | '/pos' | '/items' | '/prices'
export type Density = 'comfortable' | 'compact'

export type AppPreferences = {
  version: 1
  landingRoute: LandingRoute
  sidebarCollapsed: boolean
  density: Density
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  version: 1,
  landingRoute: '/',
  sidebarCollapsed: false,
  density: 'comfortable',
}

function isLandingRoute(value: unknown): value is LandingRoute {
  return value === '/' || value === '/pos' || value === '/items' || value === '/prices'
}

export function normalizeAppPreferences(value: unknown): AppPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_APP_PREFERENCES }
  const candidate = value as Partial<AppPreferences>
  return {
    version: 1,
    landingRoute: isLandingRoute(candidate.landingRoute) ? candidate.landingRoute : DEFAULT_APP_PREFERENCES.landingRoute,
    sidebarCollapsed: typeof candidate.sidebarCollapsed === 'boolean' ? candidate.sidebarCollapsed : DEFAULT_APP_PREFERENCES.sidebarCollapsed,
    density: candidate.density === 'compact' ? 'compact' : DEFAULT_APP_PREFERENCES.density,
  }
}

export function readAppPreferences(): AppPreferences {
  try {
    const stored = localStorage.getItem(APP_PREFERENCES_KEY)
    const legacyCollapsed = localStorage.getItem('mauricio-erpnext:sidebar-collapsed') === 'true'
    if (!stored) return normalizeAppPreferences({ sidebarCollapsed: legacyCollapsed })
    const parsed = JSON.parse(stored) as Partial<AppPreferences>
    return normalizeAppPreferences({ ...parsed, sidebarCollapsed: parsed.sidebarCollapsed ?? legacyCollapsed })
  } catch {
    return { ...DEFAULT_APP_PREFERENCES }
  }
}

export function writeAppPreferences(value: AppPreferences) {
  const normalized = normalizeAppPreferences(value)
  try {
    localStorage.setItem(APP_PREFERENCES_KEY, JSON.stringify(normalized))
    localStorage.setItem('mauricio-erpnext:sidebar-collapsed', String(normalized.sidebarCollapsed))
    window.dispatchEvent(new CustomEvent('mauricio-app-preferences-changed', { detail: normalized }))
  } catch {
    // Local preferences are optional. App behavior must continue if storage is blocked.
  }
  return normalized
}
