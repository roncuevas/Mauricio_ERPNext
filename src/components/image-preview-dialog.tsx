import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'

export type ImagePreview = { source: string; name: string; code: string }

/** Full-size view of a product image; Esc, the backdrop or the close button dismiss it. */
export function ImagePreviewDialog({ preview, onClose }: { preview: ImagePreview | null; onClose: () => void }) {
  const { t } = useTranslation()
  return <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="image-preview-dialog">
      <div className="image-preview-heading">
        <div><DialogTitle>{preview?.name}</DialogTitle><DialogDescription>{preview?.code}</DialogDescription></div>
        <DialogClose className="image-preview-close" aria-label={t('common.close')}><X aria-hidden="true" /></DialogClose>
      </div>
      {preview && <div className="image-preview-frame"><img src={preview.source} alt={preview.name} referrerPolicy="no-referrer" /></div>}
    </DialogContent>
  </Dialog>
}
