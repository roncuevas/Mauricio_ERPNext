import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button className={`button button-${variant} ${className}`} {...props} />
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}</label>
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="control w-full" {...props} />
}

export function Notice({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' }) {
  return <div className={`rounded-lg border p-3 text-sm ${tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>{children}</div>
}

export function Spinner() { return <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-label="Cargando" /> }
