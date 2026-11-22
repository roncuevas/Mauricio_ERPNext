import { describe, expect, it } from 'vitest'
import { productMatcher, rankGlobalSearch, textMatcher, type GlobalSearchEntry } from './global-search'

describe('global search', () => {
  const collar = { name: 'ITEM-010', item_name: 'Nupec Lata Adulto', item_code: 'NUP-LATA', brand: 'Nupec', tags: ['Verde'] }
  const product: GlobalSearchEntry = { id: 'item-ITEM-010', title: collar.item_name, detail: 'NUP-LATA · Productos', kind: 'product', href: '/items/ITEM-010', match: productMatcher(collar) }
  const price: GlobalSearchEntry = { id: 'price-P-1', title: collar.item_name, detail: 'ITEM-010 · Standard Selling · Precios', kind: 'price', href: '/prices/manage/ITEM-010', match: productMatcher(collar) }
  const supplier: GlobalSearchEntry = { id: 'supplier-S-1', title: 'Distribuidora Verde', detail: 'S-1 · Proveedores', kind: 'supplier', href: '/suppliers', match: textMatcher('Distribuidora Verde', 'S-1 · Proveedores') }

  it('finds products by name plus tag, like the product search', () => {
    expect(rankGlobalSearch([supplier, product, price], 'nupec verde')).toEqual([product, price])
  })

  it('finds products by brand and tag alone', () => {
    expect(rankGlobalSearch([product], 'nupec')).toEqual([product])
    expect(rankGlobalSearch([product, supplier], 'verde')).toHaveLength(2)
  })

  it('keeps text matching for non-product entries and caps the list', () => {
    expect(rankGlobalSearch([product, supplier], 'distribuidora')).toEqual([supplier])
    expect(rankGlobalSearch(Array.from({ length: 30 }, () => supplier), '')).toHaveLength(20)
  })
})
