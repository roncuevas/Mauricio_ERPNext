import { createCacheStore } from './indexed-db'
import type { LocalPosCart, LocalPosCartsCache, PosCartLine } from './types'

const store = createCacheStore<LocalPosCartsCache>({ databaseName: 'mauricio-erpnext-pos-local', storeName: 'carts' })

export function localCartsScope(profileId: string, posProfileName: string) {
  return `${profileId}::${posProfileName}`
}

export function emptyLocalCarts(profileId: string, posProfileName: string): LocalPosCartsCache {
  return { profileId: localCartsScope(profileId, posProfileName), schemaVersion: 1, activeCartId: null, current: { lines: [], customer: '' }, carts: [] }
}

function validLines(value: unknown): PosCartLine[] {
  if (!Array.isArray(value)) return []
  return value.filter((line): line is PosCartLine => Boolean(line && typeof line === 'object' && typeof (line as PosCartLine).itemCode === 'string' && typeof (line as PosCartLine).itemName === 'string' && Number.isFinite(Number((line as PosCartLine).qty)) && Number.isFinite(Number((line as PosCartLine).rate)))).map((line) => ({ ...line, qty: Number(line.qty), rate: Number(line.rate) }))
}

function normalizeCart(cart: LocalPosCart): LocalPosCart | null {
  if (!cart || typeof cart.id !== 'string' || typeof cart.name !== 'string') return null
  return { ...cart, lines: validLines(cart.lines), customer: typeof cart.customer === 'string' ? cart.customer : '', createdAt: typeof cart.createdAt === 'string' ? cart.createdAt : new Date().toISOString(), updatedAt: typeof cart.updatedAt === 'string' ? cart.updatedAt : new Date().toISOString() }
}

export async function readLocalPosCarts(profileId: string, posProfileName: string) {
  const scope = localCartsScope(profileId, posProfileName)
  const saved = await store.read(scope)
  if (!saved) return emptyLocalCarts(profileId, posProfileName)
  return { ...emptyLocalCarts(profileId, posProfileName), ...saved, profileId: scope, schemaVersion: 1 as const, current: { lines: validLines(saved.current?.lines), customer: typeof saved.current?.customer === 'string' ? saved.current.customer : '' }, carts: (saved.carts ?? []).map(normalizeCart).filter((cart): cart is LocalPosCart => Boolean(cart)), activeCartId: typeof saved.activeCartId === 'string' ? saved.activeCartId : null }
}

export function writeLocalPosCarts(cache: LocalPosCartsCache) { return store.write(cache) }
