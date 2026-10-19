import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Spinner } from './ui'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet'
import type { PosDraftSummary } from '../lib/types'

export function PosDraftsSheet({ drafts, open, loading, error, currency, onOpenChange, onResume, onDelete }: { drafts: PosDraftSummary[]; open: boolean; loading?: boolean; error?: string; currency: string; onOpenChange: (open: boolean) => void; onResume: (draft: PosDraftSummary) => void; onDelete: (draft: PosDraftSummary) => void }) {
  const { t, i18n } = useTranslation()
  const [pendingDelete, setPendingDelete] = useState<PosDraftSummary | null>(null)
  return <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="pos-drafts-sheet">
        <SheetHeader>
          <SheetTitle>{t('pos.drafts.title')}</SheetTitle>
          <SheetDescription>{t('pos.drafts.description')}</SheetDescription>
        </SheetHeader>
        {loading && <div className="pos-sheet-loading" role="status"><Spinner /> {t('pos.drafts.loading')}</div>}
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        {!loading && !error && !drafts.length && <p className="muted">{t('pos.drafts.empty')}</p>}
        <div className="pos-drafts-list">
          {drafts.map((draft) => <article className="pos-draft-card" key={draft.name}>
            <div className="pos-draft-card-heading"><div><strong>{draft.name}</strong><span>{draft.customer || t('pos.drafts.noCustomer')}</span></div><b>{new Intl.NumberFormat(i18n.language === 'en' ? 'en-US' : 'es-MX', { style: 'currency', currency }).format(Number(draft.grand_total ?? 0))}</b></div>
            <small>{draft.modified ? t('pos.drafts.modified', { date: new Date(draft.modified).toLocaleString(i18n.language === 'en' ? 'en-US' : 'es-MX') }) : t('pos.drafts.erpnextDraft')}</small>
            <div className="pos-draft-card-actions"><Button type="button" size="compact" onClick={() => onResume(draft)}>{t('pos.drafts.resume')}</Button><Button type="button" variant="danger" size="compact" onClick={() => setPendingDelete(draft)}>{t('pos.drafts.discard')}</Button></div>
          </article>)}
        </div>
      </SheetContent>
    </Sheet>
    <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(next) => { if (!next) setPendingDelete(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t('pos.drafts.confirmTitle')}</AlertDialogTitle><AlertDialogDescription>{t('pos.drafts.confirmDescription', { name: pendingDelete?.name ?? '' })}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingDelete) onDelete(pendingDelete); setPendingDelete(null) }}>{t('pos.drafts.discardDraft')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}
