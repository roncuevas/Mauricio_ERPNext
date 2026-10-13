import type { ConnectionProfile } from './types'

const credentialParams = ['api_key', 'api_secret', 'base_url', 'label']
const shareFragmentParam = 'share'

export type SharedConnection = {
  baseUrl: string
  label: string
  apiKey: string
  apiSecret: string
}

function encodePayload(value: SharedConnection) {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decodePayload(value: string): SharedConnection | null {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
    const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as SharedConnection
  } catch {
    return null
  }
}

export function readSharedConnection(search: string, hash = ''): SharedConnection | null {
  const fragmentParams = new URLSearchParams(hash.replace(/^#/, ''))
  const fragmentValue = fragmentParams.get(shareFragmentParam)
  const fromFragment = fragmentValue ? decodePayload(fragmentValue) : null
  if (fromFragment?.apiKey && fromFragment.apiSecret) return fromFragment

  const params = new URLSearchParams(search)
  const apiKey = params.get('api_key')?.trim() ?? ''
  const apiSecret = params.get('api_secret')?.trim() ?? ''
  if (!apiKey || !apiSecret) return null
  return {
    baseUrl: params.get('base_url')?.trim() ?? '',
    label: params.get('label')?.trim() ?? '',
    apiKey,
    apiSecret,
  }
}

export function buildShareUrl(profile: ConnectionProfile, currentUrl: string): string {
  const url = new URL(currentUrl)
  url.search = ''
  url.hash = `${shareFragmentParam}=${encodePayload({ baseUrl: profile.baseUrl, label: profile.label, apiKey: profile.apiKey, apiSecret: profile.apiSecret })}`
  return url.toString()
}

export function clearSharedConnectionParams(currentUrl: string): string {
  const url = new URL(currentUrl)
  credentialParams.forEach((param) => url.searchParams.delete(param))
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))
  hashParams.delete(shareFragmentParam)
  url.hash = hashParams.toString()
  return `${url.pathname}${url.search}${url.hash}`
}
