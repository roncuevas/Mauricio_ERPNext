import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, PackageSearch } from 'lucide-react'
import { Button, ButtonLink, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from './ui'
import { Alert, AlertDescription } from './ui/alert'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from './ui/empty'
import { Field, FieldContent, FieldDescription, FieldLabel } from './ui/field'
import { Switch } from './ui/switch'
import { localPostingNow } from '../lib/stock'

/** Collapsed card for options most documents never need. The heading wraps the trigger, so it stays a heading for assistive tech. */
export function AdvancedOptionsCard({ open, onOpenChange, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; description: string; children: ReactNode }) {
  const { t } = useTranslation()
  return <Collapsible open={open} onOpenChange={onOpenChange} asChild>
    <Card className="settings-card stock-advanced">
      <CardHeader>
        <CardTitle as="h2" className="stock-advanced-title"><CollapsibleTrigger className="stock-advanced-trigger"><span>{t('stockPage.advancedTitle')}</span><ChevronDown aria-hidden="true" /></CollapsibleTrigger></CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CollapsibleContent><CardContent>{children}</CardContent></CollapsibleContent>
    </Card>
  </Collapsible>
}

export type Posting = { date: string; time: string }

/** Optional custom posting date and time; when off, ERPNext posts at the server's current date and time. */
export function PostingDateFields({ id, enabled, onEnabledChange, posting, onPostingChange }: { id: string; enabled: boolean; onEnabledChange: (enabled: boolean) => void; posting: Posting; onPostingChange: (posting: Posting) => void }) {
  const { t } = useTranslation()
  return <>
    <Field orientation="horizontal">
      <FieldContent><FieldLabel htmlFor={`${id}-posting`}>{t('stockPage.customPosting')}</FieldLabel><FieldDescription>{t('stockPage.customPostingDescription')}</FieldDescription></FieldContent>
      <Switch id={`${id}-posting`} checked={enabled} onCheckedChange={(checked) => { onEnabledChange(checked); if (checked) onPostingChange(localPostingNow()) }} />
    </Field>
    {enabled && <div className="stock-posting">
      <Field><FieldLabel htmlFor={`${id}-date`}>{t('stockPage.date')}</FieldLabel><Input id={`${id}-date`} type="date" value={posting.date} max={localPostingNow().date} onChange={(event) => onPostingChange({ ...posting, date: event.target.value })} required /></Field>
      <Field><FieldLabel htmlFor={`${id}-time`}>{t('stockPage.time')}</FieldLabel><Input id={`${id}-time`} type="time" value={posting.time.slice(0, 5)} onChange={(event) => onPostingChange({ ...posting, time: `${event.target.value}:00` })} required /></Field>
    </div>}
  </>
}

/** Empty state for a document without lines yet. */
export function LinesEmpty({ title, description }: { title: string; description: string }) {
  return <Empty className="stock-lines-empty">
    <PackageSearch aria-hidden="true" className="stock-lines-empty-icon" />
    <EmptyHeader><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>
  </Empty>
}

/** Action bar that stays reachable at the bottom of the viewport on phones. The submit button only opens the confirmation. */
export function StockSubmitBar({ backPath, label, busy, disabled, onSubmit }: { backPath: string; label: string; busy: boolean; disabled: boolean; onSubmit: () => void }) {
  const { t } = useTranslation()
  return <div className="stock-submit-bar">
    <ButtonLink to={backPath} variant="secondary">{t('stockPage.cancel')}</ButtonLink>
    <Button type="button" loading={busy} disabled={busy || disabled} onClick={onSubmit}>{busy ? t('stockPage.sending') : label}</Button>
  </div>
}

/** Summary rows shown inside the confirmation before a stock document is posted. */
export function ConfirmSummary({ rows, total }: { rows: Array<{ key: string; label: string; value: ReactNode }>; total?: ReactNode }) {
  const { t } = useTranslation()
  const visible = rows.slice(0, 6)
  return <div className="stock-confirm-summary">
    <ul>{visible.map((row) => <li key={row.key}><span>{row.label}</span><strong>{row.value}</strong></li>)}</ul>
    {rows.length > visible.length && <p>{t('stockPage.confirmMore', { count: rows.length - visible.length })}</p>}
    {total && <p className="stock-confirm-total">{total}</p>}
  </div>
}

export function DraftRestoredNotice({ onDiscard, onDismiss }: { onDiscard: () => void; onDismiss: () => void }) {
  const { t } = useTranslation()
  return <Alert className="notice-info stock-draft-notice" role="status">
    <AlertDescription>{t('stockPage.draftRestored')}</AlertDescription>
    <div className="stock-draft-actions">
      <Button type="button" variant="secondary" size="compact" onClick={onDiscard}>{t('stockPage.discardDraft')}</Button>
      <Button type="button" variant="secondary" size="compact" onClick={onDismiss}>{t('stockPage.keepDraft')}</Button>
    </div>
  </Alert>
}
