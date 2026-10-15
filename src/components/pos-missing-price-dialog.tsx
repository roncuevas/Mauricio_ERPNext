import { Button } from './ui'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog'

export function PosMissingPriceDialog({ itemName, uom, open, onOpenChange, onAddPrice }: { itemName: string; uom: string; open: boolean; onOpenChange: (open: boolean) => void; onAddPrice: () => void }) {
  return <AlertDialog open={open} onOpenChange={onOpenChange}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Producto sin precio de venta</AlertDialogTitle><AlertDialogDescription>{itemName} no tiene un precio válido para la UOM {uom || 'seleccionada'}. El producto no se agregó al carrito. Puedes capturar el precio ahora; tu carrito actual quedará guardado.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel asChild><Button variant="secondary">Cancelar</Button></AlertDialogCancel><AlertDialogAction asChild><Button onClick={onAddPrice}>Agregar precio ahora</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
}
