import { describe, expect, it } from 'vitest'
import { decryptProfile, encryptProfile, normalizeBaseUrl } from './crypto'

describe('local connection security', () => {
  const profile = { id: '1', label: 'Demo', baseUrl: 'https://erp.example.com', apiKey: 'key', apiSecret: 'secret' }
  it('encrypts and decrypts without storing credentials in plaintext', async () => {
    const stored = await encryptProfile(profile, 'correct horse battery')
    expect(JSON.stringify(stored)).not.toContain(profile.apiSecret)
    await expect(decryptProfile(stored, 'correct horse battery')).resolves.toEqual(profile)
  })
  it('rejects an incorrect passphrase', async () => { const stored = await encryptProfile(profile, 'correct horse battery'); await expect(decryptProfile(stored, 'wrong password')).rejects.toThrow() })
  it('accepts HTTPS and local HTTP only', () => { expect(normalizeBaseUrl('https://erp.example.com/')).toBe('https://erp.example.com'); expect(() => normalizeBaseUrl('http://erp.example.com')).toThrow(); expect(normalizeBaseUrl('http://localhost:8000/')).toBe('http://localhost:8000') })
})
