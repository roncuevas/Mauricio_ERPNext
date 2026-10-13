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

export function Notice({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' | 'warning' }) {
  const styles = tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-700'
  return <div className={`rounded-lg border p-3 text-sm ${styles}`}>{children}</div>
}

export function Spinner() { return <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-label="Cargando" /> }

export function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="page-header mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1><p className="mt-1 muted">{description}</p></div>{action && <><div className="page-header-actions desktop-actions">{action}</div><details className="mobile-actions"><summary>Acciones</summary><div className="mobile-actions-content">{action}</div></details></>}</header>
}

export function SyncStatus({ children }: { children?: ReactNode }) {
  return children ? <span className="font-medium text-blue-700">{children}</span> : null
}
