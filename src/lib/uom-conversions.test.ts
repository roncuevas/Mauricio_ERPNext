import { describe, expect, it } from 'vitest'
import { rebaseUomConversions } from './uom-conversions'

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
