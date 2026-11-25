import { describe, expect, it } from 'vitest'
import { countProductFilters, emptyProductFilters, filterProducts, groupProductFamilies, productFamilyIndex, readProductFilters, salePriceCodes, writeProductFilters } from './product-list'
import type { CachedItem, VariantItem } from './types'

const item = (name: string, extra: Partial<CachedItem> = {}): CachedItem => ({ name, item_name: name, item_group: 'Mascotas', brand: 'Nupec', disabled: 0, ...extra })
// The Items catalog carries no hierarchy; the variants catalog does.
const catalog = [item('T'), item('T-1'), item('T-2'), item('S', { item_group: 'Limpieza', brand: 'Fabuloso' }), item('O', { disabled: 1 })]
const variants = [
  { name: 'T', has_variants: 1 },
  { name: 'T-1', variant_of: 'T' },
  { name: 'T-2', variant_of: 'T' },
  { name: 'O', variant_of: 'Missing' },
] as VariantItem[]
const index = productFamilyIndex(variants)

describe('product filters', () => {
  it('round-trips through the URL and ignores unknown values', () => {
    const params = new URLSearchParams('search=x&status=nope&type=variant')
    expect(readProductFilters(params)).toEqual({ ...emptyProductFilters, type: 'variant' })
    writeProductFilters(params, { group: 'Mascotas', brand: '', status: 'disabled', type: '', noSalePrice: true })
    expect(params.toString()).toBe('search=x&status=disabled&group=Mascotas&noSalePrice=1')
    expect(countProductFilters(readProductFilters(params))).toBe(3)
  })

  it('filters by group, brand, status, kind and missing sale price', () => {
    const names = (filters: Partial<typeof emptyProductFilters>, sold = new Set<string>()) => filterProducts(catalog, { ...emptyProductFilters, ...filters }, index, sold).map((entry) => entry.name)
    expect(names({ group: 'Limpieza' })).toEqual(['S'])
    expect(names({ brand: 'Nupec', status: 'active' })).toEqual(['T', 'T-1', 'T-2'])
    expect(names({ status: 'disabled' })).toEqual(['O'])
    expect(names({ type: 'template' })).toEqual(['T'])
    expect(names({ type: 'variant' })).toEqual(['T-1', 'T-2', 'O'])
    expect(names({ type: 'single' })).toEqual(['S'])
    expect(names({ noSalePrice: true }, salePriceCodes([{ name: 'p', item_code: 'T-1', selling: 1 }, { name: 'q', item_code: 'S', buying: 1 }]))).toEqual(['T', 'T-2', 'S', 'O'])
  })
})

describe('groupProductFamilies', () => {
  it('puts variants under their template and counts every variant', () => {
    const families = groupProductFamilies(catalog, catalog, index)
    expect(families.map((family) => [family.item.name, family.children.map((child) => child.name), family.variantCount, family.matched])).toEqual([
      ['T', ['T-1', 'T-2'], 2, true],
      ['S', [], 0, true],
      ['O', [], 0, true],
    ])
  })

  it('shows the template as context when only a variant matched, where that variant ranked', () => {
    const families = groupProductFamilies(catalog, [catalog[3], catalog[2]], index)
    expect(families.map((family) => [family.item.name, family.children.map((child) => child.name), family.variantCount, family.matched])).toEqual([
      ['S', [], 0, true],
      ['T', ['T-2'], 2, false],
    ])
  })
})
