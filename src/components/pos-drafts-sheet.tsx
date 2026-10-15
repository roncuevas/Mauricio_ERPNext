import { useState } from 'react'
import { Button, Spinner } from './ui'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet'
import type { PosDraftSummary } from '../lib/types'

export function PosDraftsSheet({ drafts, open, loading, error, currency, onOpenChange, onResume, onDelete }: { drafts: PosDraftSummary[]; open: boolean; loading?: boolean; error?: string; currency: string; onOpenChange: (open: boolean) => void; onResume: (draft: PosDraftSummary) => void; onDelete: (draft: PosDraftSummary) => void }) {
  const [pendingDelete, setPendingDelete] = useState<PosDraftSummary | null>(null)
  return <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="pos-drafts-sheet">
        <SheetHeader>
          <SheetTitle>Ventas retenidas</SheetTitle>
          <SheetDescription>Reanuda borradores POS guardados en ERPNext.</SheetDescription>
        </SheetHeader>
        {loading && <div className="pos-sheet-loading" role="status"><Spinner /> Cargando borradores</div>}
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        {!loading && !error && !drafts.length && <p className="muted">No hay ventas retenidas para este POS Profile.</p>}
        <div className="pos-drafts-list">
          {drafts.map((draft) => <article className="pos-draft-card" key={draft.name}>
            <div className="pos-draft-card-heading"><div><strong>{draft.name}</strong><span>{draft.customer || 'Sin cliente'}</span></div><b>{new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(Number(draft.grand_total ?? 0))}</b></div>
            <small>{draft.modified ? `Modificado ${new Date(draft.modified).toLocaleString('es-MX')}` : 'Borrador ERPNext'}</small>
            <div className="pos-draft-card-actions"><Button type="button" size="compact" onClick={() => onResume(draft)}>Continuar</Button><Button type="button" variant="danger" size="compact" onClick={() => setPendingDelete(draft)}>Descartar</Button></div>
          </article>)}
        </div>
      </SheetContent>
    </Sheet>
    <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(next) => { if (!next) setPendingDelete(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>¿Descartar venta retenida?</AlertDialogTitle><AlertDialogDescription>Se eliminará el borrador {pendingDelete?.name ?? ''} de ERPNext. Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingDelete) onDelete(pendingDelete); setPendingDelete(null) }}>Descartar borrador</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}
