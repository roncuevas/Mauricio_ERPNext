import type { ErpNextUserProfile } from './types'

export type UserProfileSummary = {
  name: string
  displayName: string
  email?: string
  username?: string
  userType?: string
  enabled?: boolean
  mobile?: string
  phone?: string
  language?: string
  timeZone?: string
  lastLogin?: string
  creation?: string
  roles: string[]
}

export function normalizeUserProfile(profile: ErpNextUserProfile, fallbackName = profile.name): UserProfileSummary {
  const displayName = profile.full_name?.trim() || [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || fallbackName
  const email = profile.email?.trim() || (profile.name.includes('@') ? profile.name : undefined)
  const roles = [...new Set((profile.roles ?? []).map((entry) => entry.role?.trim()).filter((role): role is string => Boolean(role)))]

  return {
    name: profile.name || fallbackName,
    displayName,
    email,
    username: profile.username?.trim() || undefined,
    userType: profile.user_type?.trim() || undefined,
    enabled: profile.enabled === undefined ? undefined : Boolean(profile.enabled),
    mobile: profile.mobile_no?.trim() || undefined,
    phone: profile.phone?.trim() || undefined,
    language: profile.language?.trim() || undefined,
    timeZone: profile.time_zone?.trim() || undefined,
    lastLogin: profile.last_login,
    creation: profile.creation,
    roles,
  }
}
