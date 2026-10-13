import type { ConnectionProfile } from './types'

const credentialParams = ['api_key', 'api_secret', 'base_url', 'label']

export type SharedConnection = {
  baseUrl: string
  label: string
  apiKey: string
  apiSecret: string
}

export function readSharedConnection(search: string): SharedConnection | null {
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
  url.searchParams.set('base_url', profile.baseUrl)
  url.searchParams.set('label', profile.label)
  url.searchParams.set('api_key', profile.apiKey)
  url.searchParams.set('api_secret', profile.apiSecret)
  return url.toString()
}

export function clearSharedConnectionParams(currentUrl: string): string {
  const url = new URL(currentUrl)
  credentialParams.forEach((param) => url.searchParams.delete(param))
  return `${url.pathname}${url.search}${url.hash}`
}
