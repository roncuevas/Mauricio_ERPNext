import type { ReactNode } from 'react'
import { Button, Card, Empty, EmptyDescription, EmptyHeader, EmptyTitle, Notice, Spinner } from '../ui'

export function LoadingState({ label = 'Cargando…', compact = false }: { label?: string; compact?: boolean }) {
  return <div className={compact ? 'flex items-center gap-2 muted' : 'flex justify-center gap-2 p-12 muted'} role="status" aria-live="polite"><Spinner /> <span>{label}</span></div>
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <Card className="p-0"><Empty className="border-0"><EmptyHeader><EmptyTitle>{title}</EmptyTitle>{description && <EmptyDescription>{description}</EmptyDescription>}</EmptyHeader>{action && <div className="mt-2 flex justify-center">{action}</div>}</Empty></Card>
}

export function ErrorState({ message, onRetry, onBack }: { message: string; onRetry?: () => void; onBack?: () => void }) {
  return <Notice><div className="flex flex-wrap items-center justify-between gap-3"><span>{message}</span><div className="flex gap-2">{onRetry && <Button type="button" size="compact" variant="secondary" onClick={onRetry}>Reintentar</Button>}{onBack && <Button type="button" size="compact" variant="secondary" onClick={onBack}>Volver</Button>}</div></div></Notice>
}
