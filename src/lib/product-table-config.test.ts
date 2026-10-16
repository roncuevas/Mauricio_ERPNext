import { describe, expect, it } from 'vitest'
import { defaultProductTableConfig, normalizeProductTableConfig, readProductTableConfig, writeProductTableConfig } from './product-table-config'

describe('product table configuration', () => {
  it('uses the required default columns and initial widths', () => {
    const config = defaultProductTableConfig()
    expect(config.visibleIds).toEqual(['product', 'group', 'stockUom', 'status', 'actions'])
    expect(config.widths.product).toBe(280)
  })

  it('persists independently by ERPNext profile', () => {
    writeProductTableConfig('profile-a', { ...defaultProductTableConfig(), visibleIds: ['product', 'brand', 'actions'] })
    expect(readProductTableConfig('profile-a').visibleIds).toEqual(['product', 'brand', 'actions'])
    expect(readProductTableConfig('profile-b').visibleIds).toContain('group')
  })

  it('normalizes unknown, duplicate, required and invalid width values', () => {
    const config = normalizeProductTableConfig({ version: 1, visibleIds: ['brand', 'brand', 'unknown'], widths: { brand: 9999, product: 2 } })
    expect(config.visibleIds).toEqual(['brand', 'product', 'actions'])
    expect(config.widths.brand).toBe(240)
    expect(config.widths.product).toBe(220)
  })

  it('rejects an unsupported version and restores the complete default', () => {
    expect(normalizeProductTableConfig({ version: 99, visibleIds: ['brand'], widths: {} })).toEqual(defaultProductTableConfig())
  })
})
