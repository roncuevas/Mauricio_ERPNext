export type FeatureFlagKey =
  | 'quotationsView'
  | 'quotationAutomaticTaxes'
  | 'quotationSubmittedRevision'

export type FeatureFlags = Record<FeatureFlagKey, boolean>

export type FeatureFlagEnvironment = Record<string, unknown>

export interface FeatureFlagProvider {
  getFlags(): FeatureFlags
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  quotationsView: true,
  quotationAutomaticTaxes: true,
  quotationSubmittedRevision: true,
}

const environmentKeys: Record<FeatureFlagKey, string> = {
  quotationsView: 'VITE_FF_QUOTATIONS_VIEW',
  quotationAutomaticTaxes: 'VITE_FF_QUOTATION_AUTOMATIC_TAXES',
  quotationSubmittedRevision: 'VITE_FF_QUOTATION_SUBMITTED_REVISION',
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return fallback
  if (['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase())) return true
  if (['false', '0', 'no', 'off'].includes(value.trim().toLowerCase())) return false
  return fallback
}

export function readFeatureFlags(environment: FeatureFlagEnvironment = import.meta.env, overrides: Partial<FeatureFlags> = {}): FeatureFlags {
  return Object.fromEntries(Object.entries(DEFAULT_FEATURE_FLAGS).map(([key, fallback]) => {
    const flag = key as FeatureFlagKey
    return [flag, overrides[flag] ?? parseBoolean(environment[environmentKeys[flag]], fallback)]
  })) as FeatureFlags
}

export function createEnvironmentFeatureFlagProvider(environment: FeatureFlagEnvironment = import.meta.env, overrides: Partial<FeatureFlags> = {}): FeatureFlagProvider {
  return { getFlags: () => readFeatureFlags(environment, overrides) }
}

export const featureFlags = createEnvironmentFeatureFlagProvider().getFlags()
