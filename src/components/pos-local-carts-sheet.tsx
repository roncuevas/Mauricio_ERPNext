import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Input } from './ui'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet'
import type { LocalPosCart } from '../lib/types'

export function PosLocalCartsSheet({ carts, activeCartId, open, currency, onOpenChange, onSave, onResume, onRename, onDelete }: { carts: LocalPosCart[]; activeCartId: string | null; open: boolean; currency: string; onOpenChange: (open: boolean) => void; onSave: (name: string) => void; onResume: (cart: LocalPosCart) => void; onRename: (cart: LocalPosCart, name: string) => void; onDelete: (cart: LocalPosCart) => void }) {
  const { t, i18n } = useTranslation()
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<LocalPosCart | null>(null)
  const [pendingDelete, setPendingDelete] = useState<LocalPosCart | null>(null)
  const locale = i18n.language === 'en' ? 'en-US' : 'es-MX'
  return <>
    <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="right" className="pos-drafts-sheet"><SheetHeader><SheetTitle>{t('pos.localCarts.title')}</SheetTitle><SheetDescription>{t('pos.localCarts.description')}</SheetDescription></SheetHeader>
      <div className="pos-local-cart-save"><Field label={t('pos.localCarts.nameLabel')}><Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('pos.localCarts.namePlaceholder')} maxLength={80} /></Field><Button type="button" onClick={() => { const next = name.trim(); if (!next) return; onSave(next); setName('') }}>{t('pos.localCarts.save')}</Button></div>
      {!carts.length ? <p className="muted">{t('pos.localCarts.empty')}</p> : <div className="pos-drafts-list">{carts.map((cart) => <article className={`pos-draft-card${cart.id === activeCartId ? ' is-active' : ''}`} key={cart.id}><div className="pos-draft-card-heading"><div><strong>{cart.name}</strong><span>{cart.lines.length} {t('pos.localCarts.lines')}{cart.customer ? ` · ${cart.customer}` : ''}</span></div><b>{new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cart.lines.reduce((sum, line) => sum + line.qty * line.rate, 0))}</b></div><small>{t('pos.localCarts.updated', { date: new Date(cart.updatedAt).toLocaleString(locale) })}</small><div className="pos-draft-card-actions"><Button type="button" size="compact" onClick={() => onResume(cart)}>{t('pos.localCarts.resume')}</Button><Button type="button" variant="secondary" size="compact" onClick={() => setRenaming(cart)}>{t('pos.localCarts.rename')}</Button><Button type="button" variant="danger" size="compact" onClick={() => setPendingDelete(cart)}>{t('pos.localCarts.delete')}</Button></div></article>)}</div>}
    </SheetContent></Sheet>
    <AlertDialog open={Boolean(renaming)} onOpenChange={(next) => { if (!next) setRenaming(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('pos.localCarts.renameTitle')}</AlertDialogTitle><AlertDialogDescription><Input autoFocus value={renaming?.name ?? ''} onChange={(event) => renaming && setRenaming({ ...renaming, name: event.target.value })} /></AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => { if (renaming?.name.trim()) onRename(renaming, renaming.name.trim()); setRenaming(null) }}>{t('common.save')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(next) => { if (!next) setPendingDelete(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('pos.localCarts.deleteTitle')}</AlertDialogTitle><AlertDialogDescription>{t('pos.localCarts.deleteDescription', { name: pendingDelete?.name ?? '' })}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingDelete) onDelete(pendingDelete); setPendingDelete(null) }}>{t('pos.localCarts.delete')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>
}
