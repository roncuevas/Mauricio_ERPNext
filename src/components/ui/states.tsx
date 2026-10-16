import type { ReactNode } from 'react'
import { Button, Card, Notice, Spinner } from '../ui'

export function LoadingState({ label = 'Cargando…', compact = false }: { label?: string; compact?: boolean }) {
  return <div className={compact ? 'flex items-center gap-2 muted' : 'flex justify-center gap-2 p-12 muted'} role="status" aria-live="polite"><Spinner /> <span>{label}</span></div>
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <Card className="p-10 text-center"><p className="font-medium text-slate-700">{title}</p>{description && <p className="mt-1 muted">{description}</p>}{action && <div className="mt-4 flex justify-center">{action}</div>}</Card>
}

export function ErrorState({ message, onRetry, onBack }: { message: string; onRetry?: () => void; onBack?: () => void }) {
  return <Notice><div className="flex flex-wrap items-center justify-between gap-3"><span>{message}</span><div className="flex gap-2">{onRetry && <Button type="button" size="compact" variant="secondary" onClick={onRetry}>Reintentar</Button>}{onBack && <Button type="button" size="compact" variant="secondary" onClick={onBack}>Volver</Button>}</div></div></Notice>
}
