import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'

export type ImagePreview = { source: string; name: string; code: string }

/**
 * Full-size view of a product image; Esc, the backdrop or the close button dismiss it. React bubbles portal clicks
 * through the component tree, so the wrapper keeps them from reaching a clickable row or card that hosts the viewer.
 */
export function ImagePreviewDialog({ preview, onClose }: { preview: ImagePreview | null; onClose: () => void }) {
  const { t } = useTranslation()
  return <span className="contents" onClick={(event) => event.stopPropagation()}><Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="image-preview-dialog">
      <div className="image-preview-heading">
        <div><DialogTitle>{preview?.name}</DialogTitle><DialogDescription>{preview?.code}</DialogDescription></div>
        <DialogClose className="image-preview-close" aria-label={t('common.close')}><X aria-hidden="true" /></DialogClose>
      </div>
      {preview && <div className="image-preview-frame"><img src={preview.source} alt={preview.name} referrerPolicy="no-referrer" /></div>}
    </DialogContent>
  </Dialog></span>
}
