import type { ConnectionProfile, DocTypeMeta, ErpNextUserProfile, ListOptions, ListResult } from './types'
import i18n from './i18n'

export class ErpNextError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message) }
}

export function createErpNextClient(connection: ConnectionProfile) {
  const baseUrl = connection.baseUrl.replace(/\/+$/, '')

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `token ${connection.apiKey}:${connection.apiSecret}`, ...init.headers },
      })
      const raw = await response.text()
      let body: { data?: T; message?: string; exc_type?: string; exception?: string; _server_messages?: string } = {}
      try { body = raw ? JSON.parse(raw) : {} } catch { body = {} }
      if (!response.ok) {
        let serverMessage = body.message
        try {
          const messages = JSON.parse(body._server_messages ?? '[]') as Array<{ message?: string; title?: string }>
          serverMessage = messages.map((item) => item.message || item.title).filter(Boolean).join(' ') || serverMessage
        } catch { /* Frappe may return non-JSON server messages. */ }
        throw new ErpNextError(response.status, serverMessage ?? body.exception ?? body.exc_type ?? `ERPNext respondió ${response.status}.`, body)
      }
      return (body.data ?? body.message ?? body) as T
    } catch (error) {
      if (error instanceof ErpNextError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') throw new Error(i18n.t('errors.timeout'), { cause: error })
      throw new Error(i18n.t('errors.connection'), { cause: error })
    } finally { window.clearTimeout(timeout) }
  }

  async function requestImage(url: string): Promise<Blob> {
    const origin = new URL(baseUrl).origin
    const target = new URL(url, `${baseUrl}/`)
    if (target.origin !== origin || target.username || target.password || !['http:', 'https:'].includes(target.protocol)) throw new Error('La URL de imagen no pertenece al servidor ERPNext configurado.')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 20_000)
    try {
      const downloadUrl = new URL('/api/method/frappe.core.doctype.file.file.download_file', origin)
      downloadUrl.searchParams.set('file_url', target.pathname)
      const response = await fetch(downloadUrl.href, { signal: controller.signal, headers: { Authorization: `token ${connection.apiKey}:${connection.apiSecret}`, Accept: 'image/*' } })
      if (!response.ok) throw new ErpNextError(response.status, `No se pudo obtener la imagen (${response.status}).`)
      const blob = await response.blob()
      if (!blob.type.startsWith('image/') || blob.size === 0) throw new Error('ERPNext no devolvió una imagen válida.')
      return blob
    } catch (error) {
      if (error instanceof ErpNextError || error instanceof Error && error.message === 'ERPNext no devolvió una imagen válida.') throw error
      if (error instanceof DOMException && error.name === 'AbortError') throw new Error(i18n.t('errors.timeout'), { cause: error })
      throw new Error(i18n.t('errors.connection'), { cause: error })
    } finally { window.clearTimeout(timeout) }
  }

  return {
    profileId: connection.id,
    async getImage(url: string) { return requestImage(url) },
    async getCurrentUser() { return request<string>('/api/method/frappe.auth.get_logged_user') },
    async getUserProfile(user: string) { return request<ErpNextUserProfile>(`/api/resource/User/${encodeURIComponent(user)}`) },
    async callMethod<T>(method: string, args: Record<string, unknown> = {}) { return request<T>(`/api/method/${method}`, { method: 'POST', body: JSON.stringify(args) }) },
    async listDocuments<T>(doctype: string, options: ListOptions = {}): Promise<ListResult<T>> {
      const params = new URLSearchParams({ fields: JSON.stringify(options.fields ?? ['name']), limit_start: String(options.start ?? 0), limit_page_length: String(options.pageLength ?? 25) })
      if (options.filters?.length) params.set('filters', JSON.stringify(options.filters))
      if (options.orderBy) params.set('order_by', options.orderBy)
      const data = await request<T[]>(`/api/resource/${encodeURIComponent(doctype)}?${params}`)
      return { data }
    },
    async getDocument<T>(doctype: string, name: string) { return request<T>(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`) },
    async createDocument<T>(doctype: string, data: Record<string, unknown>) { return request<T>(`/api/resource/${encodeURIComponent(doctype)}`, { method: 'POST', body: JSON.stringify(data) }) },
    async updateDocument<T>(doctype: string, name: string, data: Record<string, unknown>) { return request<T>(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(data) }) },
    async submitDocument<T>(doctype: string, name: string) {
      const latest = await request<Record<string, unknown>>(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`)
      return request<T>('/api/method/frappe.client.submit', { method: 'POST', body: JSON.stringify({ doc: JSON.stringify({ ...latest, doctype, name }) }) })
    },
    async cancelDocument<T>(doctype: string, name: string) {
      return request<T>('/api/method/frappe.client.cancel', { method: 'POST', body: JSON.stringify({ doctype, name }) })
    },
    async deleteDocument(doctype: string, name: string) { await request(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, { method: 'DELETE' }) },
    async getDocTypeMeta(doctype: string): Promise<DocTypeMeta> {
      return request<DocTypeMeta>(`/api/v2/doctype/${encodeURIComponent(doctype)}/meta`)
    },
  }
}

export type ErpNextClient = ReturnType<typeof createErpNextClient>
