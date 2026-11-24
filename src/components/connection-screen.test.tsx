import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionScreen } from './connection-screen'
import { ThemeProvider } from './theme-provider'
import { encryptProfile } from '../lib/crypto'
import i18n from '../lib/i18n'
import type { ConnectionProfile, StoredProfile } from '../lib/types'

beforeAll(async () => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await i18n.changeLanguage('es')
})

const centro: ConnectionProfile = { id: 'centro', label: 'Tienda Centro', baseUrl: 'https://centro.example.com', apiKey: 'key-centro', apiSecret: 'secret-centro' }
const norte: ConnectionProfile = { id: 'norte', label: 'Sucursal Norte', baseUrl: 'https://norte.example.com', apiKey: 'key-norte', apiSecret: 'secret-norte' }
/** ERPNext answering the logged user and that user's record, as the login asks for both. */
const erpnext = (user: string, fullName?: string) => vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => String(input).includes('get_logged_user')
  ? new Response(JSON.stringify({ message: user }), { status: 200 })
  : new Response(JSON.stringify({ data: { name: user, ...(fullName ? { full_name: fullName } : {}) } }), { status: 200 }))
const t = (key: string, options: Record<string, unknown> = {}) => (i18n.t as (key: string, options: Record<string, unknown>) => string)(key, options)

let container: HTMLDivElement
let root: Root
let onUnlock: ReturnType<typeof vi.fn<(profile: ConnectionProfile) => Promise<void>>>
let onProfilesChange: ReturnType<typeof vi.fn<(profiles: StoredProfile[]) => void>>

async function render(profiles: StoredProfile[]) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(ThemeProvider, null, createElement(ConnectionScreen, { profiles, onUnlock, onProfilesChange }))))
  })
}

const byLabel = (text: string) => {
  const label = Array.from(document.querySelectorAll('label')).find((entry) => entry.textContent?.trim() === text)
  if (!label) throw new Error(`No label “${text}”`)
  return document.getElementById(label.htmlFor) as HTMLInputElement
}
const button = (name: string) => {
  const found = Array.from(document.querySelectorAll('button')).filter((entry) => (entry.getAttribute('aria-label') ?? entry.textContent?.trim()) === name)
  if (!found.length) throw new Error(`No button “${name}”`)
  return found
}
async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
}
async function click(element: Element) {
  await act(async () => { (element as HTMLElement).click() })
}
async function submit() {
  await act(async () => { container.querySelector('form')!.requestSubmit() })
}
/** Waits for async work (PBKDF2, fetch, the confirm dialog) to show its result. */
async function eventually(assertion: () => void) {
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
    assertion()
  }, { timeout: 15_000, interval: 20 })
}
const notices = () => Array.from(container.querySelectorAll('.connection-notice')).map((entry) => entry.textContent)
const checkedProfile = () => container.querySelector('[role=radio][data-state=checked]')?.getAttribute('value')

describe('ConnectionScreen', () => {
  let stored: StoredProfile[]

  beforeAll(async () => {
    stored = [await encryptProfile(centro, 'password-centro'), await encryptProfile(norte, 'password-norte')]
  }, 30_000)

  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/')
    onUnlock = vi.fn(async (_profile: ConnectionProfile) => {})
    onProfilesChange = vi.fn((_profiles: StoredProfile[]) => {})
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('opens on the last used profile and unlocks it with its password', async () => {
    localStorage.setItem('mauricio-erpnext:last-profile', 'norte')
    await render(stored)
    expect(checkedProfile()).toBe('norte')
    expect(document.activeElement).toBe(byLabel(t('connection.localPassword')))
    await type(byLabel(t('connection.localPassword')), 'password-norte')
    await submit()
    await eventually(() => expect(onUnlock).toHaveBeenCalledWith(norte))
    expect(localStorage.getItem('mauricio-erpnext:last-profile')).toBe('norte')
  }, 20_000)

  it('learns the ERPNext user of a profile saved without it when unlocking', async () => {
    vi.stubGlobal('fetch', erpnext('caja@example.com', 'Carlos Caja'))
    localStorage.setItem('mauricio-erpnext:profiles', JSON.stringify(stored))
    await render(stored)
    await type(byLabel(t('connection.localPassword')), 'password-centro')
    await submit()
    await eventually(() => expect(onProfilesChange).toHaveBeenCalled())
    expect(onProfilesChange.mock.calls[0][0].find((profile) => profile.id === 'centro')?.userName).toBe('Carlos Caja')
    expect(onUnlock).toHaveBeenCalledWith(centro)
  }, 20_000)

  it('shows the ERPNext user name, never the email, under the profile name', async () => {
    await render([{ ...stored[0], userName: 'Ana López' }, stored[1]])
    expect(container.querySelector('.connection-profile-user')?.textContent).toBe('Ana López')
    expect(container.querySelector('.connection-profile-user')?.parentElement?.textContent).toBe('Ana López · centro.example.com')
    expect(container.textContent).not.toContain('@')
  })

  it('switches profile from the radio group and rejects a wrong password', async () => {
    await render(stored)
    await click(container.querySelector('[role=radio][value=norte]')!)
    expect(checkedProfile()).toBe('norte')
    await type(byLabel(t('connection.localPassword')), 'password-centro')
    await submit()
    await eventually(() => expect(notices()).toContain(t('connection.errors.wrongPassword')))
    expect(onUnlock).not.toHaveBeenCalled()
  }, 20_000)

  it('copies a share link for the chosen profile after its password', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    await render(stored)
    await click(button(t('connection.shareProfile'))[1])
    expect(checkedProfile()).toBe('norte')
    expect(container.querySelector('h1')?.textContent).toBe(t('connection.share'))
    expect(button(t('connection.shareProfile'))[1].getAttribute('aria-pressed')).toBe('true')
    const password = byLabel(t('connection.localPassword'))
    expect(document.getElementById(password.getAttribute('aria-describedby')!)?.textContent).toContain(t('connection.shareHint', { label: norte.label }))
    await type(byLabel(t('connection.localPassword')), 'password-norte')
    await submit()
    await eventually(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0][0]).toContain('#share=')
    expect(notices()).toContain(t('connection.shareCopied'))
    expect(onUnlock).not.toHaveBeenCalled()
  }, 20_000)

  it('says the link was not copied when the clipboard refuses', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => { throw new Error('NotAllowedError') }) } })
    await render(stored)
    await click(button(t('connection.shareProfile'))[0])
    await type(byLabel(t('connection.localPassword')), 'password-centro')
    await submit()
    await eventually(() => expect(notices()).toContain(t('connection.clipboardError')))
  }, 20_000)

  it('returns from share to unlock with Cancelar', async () => {
    await render(stored)
    await click(button(t('connection.shareProfile'))[0])
    await click(button(t('common.cancel'))[0])
    expect(container.querySelector('h1')?.textContent).toBe(t('connection.unlock'))
  })

  it('verifies a new connection with ERPNext before saving it', async () => {
    const fetchMock = erpnext('ventas@example.com', 'Ana López')
    vi.stubGlobal('fetch', fetchMock)
    await render([])
    await type(byLabel(t('connection.profileName')), 'Nueva')
    await type(byLabel(t('connection.url')), 'https://nueva.example.com')
    await type(byLabel(t('connection.apiKey')), 'k')
    await type(byLabel(t('connection.apiSecret')), 's')
    await type(byLabel(t('connection.newLocalPassword')), 'password-nueva')
    await submit()
    await eventually(() => expect(onUnlock).toHaveBeenCalled())
    expect(String(fetchMock.mock.calls[0][0])).toContain('frappe.auth.get_logged_user')
    expect(onUnlock).toHaveBeenCalledWith(expect.objectContaining({ label: 'Nueva', baseUrl: 'https://nueva.example.com', apiKey: 'k', apiSecret: 's' }))
    const saved = JSON.parse(localStorage.getItem('mauricio-erpnext:profiles')!) as StoredProfile[]
    expect(saved).toHaveLength(1)
    expect(saved[0].userName).toBe('Ana López')
    expect(JSON.stringify(saved)).not.toContain('ventas@example.com')
  }, 20_000)

  it('keeps nothing when ERPNext rejects the new credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    await render([])
    await type(byLabel(t('connection.url')), 'https://nueva.example.com')
    await type(byLabel(t('connection.apiKey')), 'k')
    await type(byLabel(t('connection.apiSecret')), 's')
    await type(byLabel(t('connection.newLocalPassword')), 'password-nueva')
    await submit()
    await eventually(() => expect(notices()).toContain(t('connection.verify.credentials')))
    expect(localStorage.getItem('mauricio-erpnext:profiles')).toBeNull()
    expect(onUnlock).not.toHaveBeenCalled()
  }, 20_000)

  it('counts down to the minimum local password length', async () => {
    await render([])
    const input = byLabel(t('connection.newLocalPassword'))
    await type(input, 'abc')
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toContain(t('connection.password.remaining', { count: 5 }))
    await type(input, 'abcdefgh')
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toContain(t('connection.password.ready'))
  })

  it('imports a shared link into the new connection form', async () => {
    const link = `https://app.example.com/#share=${btoa(JSON.stringify({ baseUrl: centro.baseUrl, apiKey: centro.apiKey, apiSecret: centro.apiSecret, label: centro.label }))}`
    await render(stored)
    await click(button(t('connection.importLink'))[0])
    await type(byLabel(t('connection.linkLabel')), 'not a link')
    await click(button(t('connection.importButton'))[0])
    expect(notices()).toContain(t('connection.invalidLink'))
    await type(byLabel(t('connection.linkLabel')), link)
    await click(button(t('connection.importButton'))[0])
    expect(byLabel(t('connection.url')).value).toBe(centro.baseUrl)
    expect(notices()).toContain(t('connection.sharedLinkImported'))
  })

  it('opens a shared link from the address bar as a prefilled new connection', async () => {
    window.history.replaceState({}, '', `/#share=${btoa(JSON.stringify({ baseUrl: norte.baseUrl, apiKey: norte.apiKey, apiSecret: norte.apiSecret, label: norte.label }))}`)
    await render(stored)
    expect(container.querySelector('h1')?.textContent).toBe(t('connection.connect'))
    expect(byLabel(t('connection.apiKey')).value).toBe(norte.apiKey)
    expect(notices()).toContain(t('connection.sharedLinkWarning'))
    expect(window.location.hash).toBe('')
  })

  it('deletes a profile only after confirming in the dialog', { timeout: 20_000 }, async () => {
    await render(stored)
    await click(button(t('connection.deleteProfile'))[0])
    await eventually(() => expect(document.querySelector('[role=alertdialog]')).not.toBeNull())
    await click(button(t('common.cancel')).at(-1)!)
    await eventually(() => expect(document.querySelector('[role=alertdialog]')).toBeNull())
    expect(onProfilesChange).not.toHaveBeenCalled()
    await click(button(t('connection.deleteProfile'))[0])
    await eventually(() => expect(document.querySelector('[role=alertdialog]')).not.toBeNull())
    await click(Array.from(document.querySelectorAll('[role=alertdialog] button')).find((entry) => entry.textContent === t('connection.delete.action'))!)
    await eventually(() => expect(onProfilesChange).toHaveBeenCalledWith([stored[1]]))
    expect(checkedProfile()).toBe('norte')
  })

  it('toggles the API key help', async () => {
    await render([])
    const toggle = button(t('connection.apiHelp.toggle'))[0]
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain(t('connection.apiHelp.step1'))
  })
})
