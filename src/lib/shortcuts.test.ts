import { describe, expect, it } from 'vitest'
import { quickCashAmounts } from './shortcuts'

describe('quickCashAmounts', () => {
  it('offers the next bills above the total', () => {
    expect(quickCashAmounts(387.44)).toEqual([500, 1000])
    expect(quickCashAmounts(60.32)).toEqual([100, 200, 500])
  })
  it('skips bills equal to the total, which the exact button covers', () => {
    expect(quickCashAmounts(200)).toEqual([500, 1000])
  })
})
