import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ErpNextError } from '../lib/erpnext'
import { Button, ButtonLink, Notice } from './ui'

export function catalogErrorMessage(error: unknown, t: TFunction) {
  if (error instanceof ErpNextError) {
    if (error.status === 401) return t('catalogGuidance.unauthorized')
    if (error.status === 403) return t('catalogGuidance.forbidden')
    if (error.status === 404) return t('catalogGuidance.missing')
    if (error.status >= 500) return t('catalogGuidance.server')
  }
  return error instanceof Error ? error.message : t('errors.unknown')
}

export function CatalogErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation()
  if (!error) return null
  return <Notice tone="warning"><div role="alert" aria-live="assertive" className="flex flex-wrap items-center justify-between gap-3"><span>{catalogErrorMessage(error, t)}</span>{onRetry && <Button type="button" size="compact" variant="secondary" onClick={onRetry}>{t('common.retry')}</Button>}</div></Notice>
}

export function CatalogReadinessNotice({ title, description, action, to, onAction, disabled, dismiss }: { title: string; description: string; action: string; to?: string; onAction?: () => void; disabled?: boolean; dismiss?: { label: string; onClick: () => void } }) {
  return <Notice tone="info"><div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><strong className="block">{title}</strong><p className="mt-1">{description}</p></div><div className="flex flex-wrap gap-2">{dismiss && <Button type="button" size="compact" variant="secondary" onClick={dismiss.onClick}>{dismiss.label}</Button>}{to ? <ButtonLink size="compact" variant="secondary" to={to}>{action}</ButtonLink> : onAction ? <Button type="button" size="compact" variant="secondary" onClick={onAction} disabled={disabled}>{action}</Button> : null}</div></div></Notice>
}

export function CatalogSearchShortcutHint() {
  const { t } = useTranslation()
  return <p className="catalog-search-hint"><kbd>Ctrl/Cmd K</kbd><span className="sr-only sm:not-sr-only">{t('catalogGuidance.globalSearch')}</span></p>
}
