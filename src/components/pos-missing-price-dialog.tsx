import { Button } from './ui'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog'

export function PosMissingPriceDialog({ itemName, uom, open, onOpenChange, onAddPrice }: { itemName: string; uom: string; open: boolean; onOpenChange: (open: boolean) => void; onAddPrice: () => void }) {
  const { t } = useTranslation()
  return <AlertDialog open={open} onOpenChange={onOpenChange}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('pos.missingPrice.title')}</AlertDialogTitle><AlertDialogDescription>{t('pos.missingPrice.description', { itemName, uom: uom || t('pos.missingPrice.selectedUom') })}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel asChild><Button variant="secondary">{t('common.cancel')}</Button></AlertDialogCancel><AlertDialogAction asChild><Button onClick={onAddPrice}>{t('pos.missingPrice.add')}</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
}
import { useTranslation } from 'react-i18next'
