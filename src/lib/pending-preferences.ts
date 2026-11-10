export type PendingPreferences = { version: 1; buyingPriceList: string; sellingPriceList: string; lowMarginThreshold: number }
export const DEFAULT_PENDING_PREFERENCES: PendingPreferences = { version: 1, buyingPriceList: 'Standard Buying', sellingPriceList: 'Standard Selling', lowMarginThreshold: 10 }

function key(profileId: string) { return `mauricio-erpnext:pending-preferences:${profileId}` }

export function readPendingPreferences(profileId: string): PendingPreferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(profileId)) ?? 'null') as Partial<PendingPreferences> | null
    const threshold = Number(parsed?.lowMarginThreshold)
    return { version: 1, buyingPriceList: typeof parsed?.buyingPriceList === 'string' ? parsed.buyingPriceList : DEFAULT_PENDING_PREFERENCES.buyingPriceList, sellingPriceList: typeof parsed?.sellingPriceList === 'string' ? parsed.sellingPriceList : DEFAULT_PENDING_PREFERENCES.sellingPriceList, lowMarginThreshold: Number.isFinite(threshold) ? Math.max(0, Math.min(100, threshold)) : DEFAULT_PENDING_PREFERENCES.lowMarginThreshold }
  } catch { return { ...DEFAULT_PENDING_PREFERENCES } }
}

export function writePendingPreferences(profileId: string, value: PendingPreferences) {
  const normalized = { version: 1 as const, buyingPriceList: value.buyingPriceList.trim(), sellingPriceList: value.sellingPriceList.trim(), lowMarginThreshold: Number.isFinite(value.lowMarginThreshold) ? Math.max(0, Math.min(100, value.lowMarginThreshold)) : DEFAULT_PENDING_PREFERENCES.lowMarginThreshold }
  try { localStorage.setItem(key(profileId), JSON.stringify(normalized)) } catch { /* Local preferences are optional. */ }
  return normalized
}
