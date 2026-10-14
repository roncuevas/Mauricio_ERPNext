import { Link, type LinkProps } from 'react-router-dom'
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'action' | 'danger'
type ButtonSize = 'default' | 'compact' | 'icon'

function classes(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(' ')
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'default', fullWidth = false, loading = false, className = '', disabled = false, children, ...props }: ButtonProps) {
  return <button className={classes('button', `button-${variant}`, size !== 'default' && `button-${size}`, fullWidth && 'button-full-width', className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>{loading ? <Spinner /> : null}{children}</button>
}

export function RefreshButton({ label, loading = false, ...props }: Omit<ButtonProps, 'children' | 'size' | 'variant' | 'loading'> & { label: string; loading?: boolean }) {
  return <Button {...props} type="button" variant="secondary" size="icon" loading={loading} aria-label={label} title={label}>↻</Button>
}

export function ButtonLink({ variant = 'primary', size = 'default', fullWidth = false, className = '', children, ...props }: LinkProps & { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean }) {
  return <Link className={classes('button', `button-${variant}`, size !== 'default' && `button-${size}`, fullWidth && 'button-full-width', className)} {...props}>{children}</Link>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}</label>
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="control w-full" {...props} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="control w-full" {...props} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="control w-full" {...props} />
}

export function Notice({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' | 'warning' }) {
  return <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : undefined}>{children}</div>
}

export function Spinner() { return <span className="spinner" aria-label="Cargando" /> }

export function Card({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('card', className)} {...props}>{children}</div>
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="page-header mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1><p className="mt-1 muted">{description}</p></div>{action && <><div className="page-header-actions desktop-actions">{action}</div><details className="mobile-actions"><summary>Acciones</summary><div className="mobile-actions-content">{action}</div></details></>}</header>
}

export function SyncStatus({ children }: { children?: ReactNode }) {
  return children ? <span className="font-medium text-blue-700">{children}</span> : null
}
