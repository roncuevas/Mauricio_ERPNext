import { type ReactNode } from 'react'
import { cn } from '../lib/utils'
export { Button, buttonVariants, type ButtonProps } from './ui/button'
export { ButtonLink } from './ui/button'
export { Input } from './ui/input'
export { Textarea } from './ui/textarea'
export { Card } from './ui/card'
export { Badge } from './ui/badge'
export { Spinner } from './ui/spinner'
export { Checkbox } from './ui/checkbox'
export { RadioGroup, RadioGroupItem } from './ui/radio-group'
import { Button, type ButtonProps } from './ui/button'

export function IconButton({ label, icon, loading = false, variant = 'secondary', ...props }: Omit<ButtonProps, 'children' | 'size' | 'variant' | 'loading'> & { label: string; icon: ReactNode; loading?: boolean; variant?: NonNullable<ButtonProps['variant']> }) {
  return <Button {...props} variant={variant} size="icon" loading={loading} aria-label={label} title={props.title ?? label}>{icon}</Button>
}

export function RefreshButton({ label, loading = false, ...props }: Omit<ButtonProps, 'children' | 'size' | 'variant' | 'loading'> & { label: string; loading?: boolean }) {
  return <IconButton {...props} type="button" label={label} loading={loading} icon="↻" />
}

export function SearchButton({ label = 'Buscar', loading = false, ...props }: Omit<ButtonProps, 'children' | 'size' | 'variant' | 'loading'> & { label?: string; loading?: boolean }) {
  return <IconButton {...props} className={cn('toolbar-search-button', props.className)} type="submit" label={label} loading={loading} title={`${label} (Enter)`} icon={<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><circle cx="10.8" cy="10.8" r="6.8" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m16 16 5 5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>} />
}

export function FilterButton({ label = 'Filtros', activeCount = 0, expanded = false, ...props }: Omit<ButtonProps, 'children' | 'size' | 'variant'> & { label?: string; activeCount?: number; expanded?: boolean }) {
  return <IconButton {...props} className={cn('toolbar-filter-button', props.className)} type="button" label={label} aria-expanded={expanded} icon={<><svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>{activeCount > 0 && <span className="filter-button-count">{activeCount}</span>}</>} />
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}</label>
}

export function Notice({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' | 'warning' }) {
  return <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : undefined}>{children}</div>
}

export function PageHeader({ title, description, action, toolbar, status, sticky = false, visible = true }: { title: string; description?: string; action?: ReactNode; toolbar?: ReactNode; status?: ReactNode; sticky?: boolean; visible?: boolean }) {
  if (!visible) return null
  return <header className={cn('page-header', sticky && 'page-header-sticky')}><div className="page-header-main"><div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>{description && <p className="mt-1 muted">{description}</p>}</div>{action && <><div className="page-header-actions desktop-actions">{action}</div><details className="mobile-actions"><summary>Acciones</summary><div className="mobile-actions-content">{action}</div></details></>}</div>{toolbar && <div className="page-header-toolbar">{toolbar}</div>}{status && <div className="page-header-status">{status}</div>}</header>
}

export function SegmentedControl<T extends string>({ label, value, options, onChange, className = '' }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; className?: string }) {
  return <div className={cn('segmented-control', className)} role="group" aria-label={label}><span className="segmented-control-label">{label}</span>{options.map((option) => <button key={option.value} type="button" className={value === option.value ? 'segmented-control-active' : ''} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>
}

export function SyncStatus({ children }: { children?: ReactNode }) {
  return children ? <span className="font-medium text-blue-700">{children}</span> : null
}
