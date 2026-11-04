import { cloneElement, isValidElement, useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/utils'
export { Button, buttonVariants, type ButtonProps } from './ui/button'
export { ButtonLink, IconButton, RefreshButton, SearchButton, FilterButton } from './ui/button'
export { Input } from './ui/input'
export { Textarea } from './ui/textarea'
export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card'
export { Alert, AlertDescription, AlertTitle } from './ui/alert'
export { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from './ui/empty'
export { Label } from './ui/label'
export { Separator } from './ui/separator'
export { Skeleton } from './ui/skeleton'
export { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
export { Badge } from './ui/badge'
export { Spinner } from './ui/spinner'
export { Checkbox } from './ui/checkbox'
export { RadioGroup, RadioGroupItem } from './ui/radio-group'
export { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
export { EntityCombobox } from './entity-combobox'
import { Alert } from './ui/alert'
import { Label } from './ui/label'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const generatedId = useId()
  const control = isValidElement<{ id?: string }>(children) ? children : null
  const id = control?.props.id ?? generatedId
  return <div className="field"><Label htmlFor={control ? id : undefined}>{label}</Label>{control && !control.props.id ? cloneElement(control, { id }) : children}</div>
}

export function Notice({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' | 'warning' }) {
  return <Alert className={`notice-${tone}`} role={tone === 'error' ? 'alert' : undefined}>{children}</Alert>
}

export function PageHeader({ title, description, action, mobileAction, toolbar, status, sticky = false, visible = true }: { title: string; description?: string; action?: ReactNode; mobileAction?: ReactNode; toolbar?: ReactNode; status?: ReactNode; sticky?: boolean; visible?: boolean }) {
  const { t } = useTranslation()
  if (!visible) return null
  return <header className={cn('page-header', sticky && 'page-header-sticky')}><div className="page-header-main"><div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>{description && <p className="mt-1 muted">{description}</p>}</div>{action && <><div className="page-header-actions desktop-actions">{action}</div>{mobileAction && <div className="page-header-mobile-primary">{mobileAction}</div>}<details className="mobile-actions"><summary>{t('common.actions')}</summary><div className="mobile-actions-content">{action}</div></details></>}</div>{toolbar && <div className="page-header-toolbar">{toolbar}</div>}{status && <div className="page-header-status">{status}</div>}</header>
}

export function SegmentedControl<T extends string>({ label, value, options, onChange, className = '' }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; className?: string }) {
  return <div className={cn('segmented-control', className)} aria-label={label}><span className="segmented-control-label">{label}</span><ToggleGroup type="single" value={value} onValueChange={(next) => { if (next) onChange(next as T) }}><div className="inline-flex items-center gap-[.15rem]">{options.map((option) => <ToggleGroupItem key={option.value} value={option.value}>{option.label}</ToggleGroupItem>)}</div></ToggleGroup></div>
}

export function SyncStatus({ children }: { children?: ReactNode }) {
  return children ? <span className="font-medium text-blue-700">{children}</span> : null
}
