import { useEffect, useState } from 'react'
import { Image as ImageIcon, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { createErpNextClient } from '../lib/erpnext'
import { readProductImage } from '../lib/product-image-cache'
import { loadProductImage } from '../lib/product-image-sync'

type Client = ReturnType<typeof createErpNextClient>

/** `onPreview` makes a shown image a button that opens it larger. */
export function ProductImage({ client, profileId, item, className = '', onPreview }: { client: Client; profileId: string; item: { name: string; item_name?: string; image?: string }; className?: string; onPreview?: (source: string) => void }) {
  const { t } = useTranslation()
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (source.startsWith('blob:')) return () => URL.revokeObjectURL(source) }, [source])

  useEffect(() => {
    let active = true
    setSource('')
    if (item.image && client.isExternalImageUrl(item.image)) {
      setSource(item.image)
      return () => { active = false }
    }
    void readProductImage(profileId, item.name).then((cached) => {
      if (!active || !cached || (item.image && cached.url !== item.image)) return
      setSource(URL.createObjectURL(cached.blob))
    }).catch(() => undefined)
    return () => { active = false }
  }, [client, item.image, item.name, profileId])

  async function loadImage() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const loaded = await loadProductImage(client, profileId, item)
      if (!loaded) throw new Error(t('productImages.missing'))
      setSource(loaded.blob ? URL.createObjectURL(loaded.blob) : loaded.url)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('productImages.loadError'))
    } finally { setBusy(false) }
  }

  if (source) {
    const image = <img className={`product-image ${onPreview ? '' : className}`} src={source} alt={item.item_name || item.name} loading="lazy" referrerPolicy="no-referrer" onError={() => { setSource(''); setError(t('productImages.loadError')) }} />
    if (!onPreview) return image
    return <button type="button" className={`product-image-preview ${className}`} onClick={(event) => { event.stopPropagation(); onPreview(source) }} aria-label={t('productImages.viewFor', { name: item.item_name || item.name })}>{image}</button>
  }
  return <div className={`product-image-placeholder ${className}`}>
    <button type="button" onClick={(event) => { event.stopPropagation(); void loadImage() }} disabled={busy} aria-label={busy ? t('productImages.loading') : t('productImages.loadFor', { name: item.name })} title={error || t('productImages.loadHint')}>
      {busy ? <RefreshCw className="size-5 animate-spin" aria-hidden="true" /> : <ImageIcon className="size-5" aria-hidden="true" />}
    </button>
    {error && <span role="status">{error}</span>}
  </div>
}
