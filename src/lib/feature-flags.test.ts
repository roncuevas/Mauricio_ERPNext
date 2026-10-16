import { describe, expect, it } from 'vitest'
import { DEFAULT_FEATURE_FLAGS, createEnvironmentFeatureFlagProvider, readFeatureFlags } from './feature-flags'

describe('feature flags', () => {
  it('uses safe defaults when the environment has no overrides', () => {
    expect(readFeatureFlags({})).toEqual(DEFAULT_FEATURE_FLAGS)
  })

  it('parses common environment boolean values', () => {
    expect(readFeatureFlags({ VITE_FF_QUOTATION_AUTOMATIC_TAXES: 'off', VITE_FF_QUOTATIONS_VIEW: '1' })).toMatchObject({ quotationAutomaticTaxes: false, quotationsView: true })
  })

  it('supports an explicit provider override for future remote services', () => {
    const provider = createEnvironmentFeatureFlagProvider({}, { quotationAutomaticTaxes: false })
    expect(provider.getFlags().quotationAutomaticTaxes).toBe(false)
  })
})
