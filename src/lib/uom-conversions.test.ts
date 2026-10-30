import { describe, expect, it } from 'vitest'
import { buildItemUomRows, itemUomRowsMatch, rebaseUomConversions } from './uom-conversions'

describe('rebaseUomConversions', () => {
  it('recalculates alternatives against the new stock UOM', () => {
    expect(rebaseUomConversions('Kg', 'Unit', [
      { uom: 'Unit', conversion_factor: 25 },
      { uom: 'Nos', conversion_factor: 25 },
    ])).toEqual([
      { uom: 'Kg', conversion_factor: 0.04 },
      { uom: 'Nos', conversion_factor: 1 },
    ])
  })

  it('returns current conversion factors when the stock UOM is unchanged', () => {
    const conversions = [{ uom: 'Bulto', conversion_factor: 20 }]
    expect(rebaseUomConversions('Kg', 'Kg', conversions)).toEqual(conversions)
  })

  it('does not infer factors when the new stock UOM has no known conversion', () => {
    expect(rebaseUomConversions('Kg', 'Unit', [{ uom: 'Bulto', conversion_factor: 20 }])).toBeNull()
  })
})

describe('item UOM persistence verification', () => {
  const rows = buildItemUomRows('Unit', [
    { uom: 'Kg', conversion_factor: 0.04 },
    { uom: 'Nos', conversion_factor: 1 },
  ])

  it('includes the stock UOM with a factor of one', () => {
    expect(rows).toEqual([
      { uom: 'Unit', conversion_factor: 1 },
      { uom: 'Kg', conversion_factor: 0.04 },
      { uom: 'Nos', conversion_factor: 1 },
    ])
  })

  it('verifies the persisted table independent of row order and tiny float differences', () => {
    expect(itemUomRowsMatch({ uoms: [
      { uom: 'Nos', conversion_factor: 1 },
      { uom: 'Unit', conversion_factor: 1 },
      { uom: 'Kg', conversion_factor: 0.04000000000001 },
    ] }, rows)).toBe(true)
  })

  it('rejects missing, duplicate, or unexpected conversion rows', () => {
    expect(itemUomRowsMatch({ uoms: rows.slice(0, 2) }, rows)).toBe(false)
    expect(itemUomRowsMatch({ uoms: [...rows, rows[0]] }, rows)).toBe(false)
    expect(itemUomRowsMatch({ uoms: [...rows.slice(0, 2), { uom: 'Pack', conversion_factor: 2 }] }, rows)).toBe(false)
  })
})
