import { describe, expect, it } from 'vitest'
import { resources, supportedLanguages } from './i18n'

function keyPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return prefix ? [prefix] : []
  return Object.entries(value).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key))
}

describe('i18n resources', () => {
  it('keeps Spanish and English translation keys synchronized', () => {
    expect(keyPaths(resources.es.translation).sort()).toEqual(keyPaths(resources.en.translation).sort())
  })

  it('exposes the supported languages explicitly', () => {
    expect(supportedLanguages).toEqual(['es', 'en'])
  })
})
