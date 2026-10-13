export type ConnectionProfile = {
  id: string
  label: string
  baseUrl: string
  apiKey: string
  apiSecret: string
}

export type StoredProfile = {
  version: 1
  id: string
  label: string
  baseUrl: string
  salt: string
  iv: string
  ciphertext: string
}

export type ListOptions = {
  fields?: string[]
  filters?: Array<[string, string, unknown]>
  orderBy?: string
  start?: number
  pageLength?: number
}

export type ListResult<T> = { data: T[]; total?: number }

export type DocTypeField = {
  fieldname: string
  label?: string
  fieldtype?: string
  reqd?: boolean | number
  read_only?: boolean | number
  options?: string
  hidden?: boolean | number
}

export type DocTypeMeta = { name: string; fields: DocTypeField[] }
