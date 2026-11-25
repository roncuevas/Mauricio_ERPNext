import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { createErpNextClient } from '../lib/erpnext'
import { readProductImage } from '../lib/product-image-cache'
import { loadProductImage, loadProductImageQueued } from '../lib/product-image-sync'
import { ImagePreviewDialog } from './image-preview-dialog'

type Client = ReturnType<typeof createErpNextClient>

/**
 * `previewable` makes a shown image a button that opens it larger in the shared image viewer. `autoLoad` downloads an image that is not cached
 * once it scrolls into view; otherwise it loads only when tapped.
 */
export function ProductImage({ client, profileId, item, className = '', previewable = false, autoLoad = false }: { client: Client; profileId: string; item: { name: string; item_name?: string; image?: string }; className?: string; previewable?: boolean; autoLoad?: boolean }) {
  const { t } = useTranslation()
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cacheChecked, setCacheChecked] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const placeholderRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (source.startsWith('blob:')) return () => URL.revokeObjectURL(source) }, [source])

  useEffect(() => {
    let active = true
    setSource('')
    setCacheChecked(false)
    if (item.image && client.isExternalImageUrl(item.image)) {
      setSource(item.image)
      return () => { active = false }
    }
    void readProductImage(profileId, item.name).then((cached) => {
      if (!active) return
      setCacheChecked(true)
      if (!cached || (item.image && cached.url !== item.image)) return
      setSource(URL.createObjectURL(cached.blob))
    }).catch(() => { if (active) setCacheChecked(true) })
    return () => { active = false }
  }, [client, item.image, item.name, profileId])

  useEffect(() => {
    const element = placeholderRef.current
    if (!autoLoad || !cacheChecked || source || !item.image || !element) return
    let active = true
    const load = () => {
      setBusy(true)
      loadProductImageQueued(client, profileId, item)
        .then((loaded) => { if (active && loaded) setSource(loaded.blob ? URL.createObjectURL(loaded.blob) : loaded.url) })
        .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : t('productImages.loadError')) })
        .finally(() => { if (active) setBusy(false) })
    }
    if (typeof IntersectionObserver === 'undefined') { load(); return () => { active = false } }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      load()
    }, { rootMargin: '200px' })
    observer.observe(element)
    return () => { active = false; observer.disconnect() }
  // The item object is recreated by callers; its name and image identify it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, cacheChecked, client, item.image, item.name, profileId, source, t])

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
    const name = item.item_name || item.name
    const image = <img className={`product-image ${previewable ? '' : className}`} src={source} alt={name} loading="lazy" referrerPolicy="no-referrer" onError={() => { setSource(''); setError(t('productImages.loadError')) }} />
    if (!previewable) return image
    return <>
      <button type="button" className={`product-image-preview ${className}`} onClick={(event) => { event.stopPropagation(); setPreviewOpen(true) }} aria-label={t('productImages.viewFor', { name })}>{image}</button>
      <ImagePreviewDialog preview={previewOpen ? { source, name, code: item.name } : null} onClose={() => setPreviewOpen(false)} />
    </>
  }
  return <div ref={placeholderRef} className={`product-image-placeholder ${className}`}>
    <button type="button" onClick={(event) => { event.stopPropagation(); void loadImage() }} disabled={busy} aria-label={busy ? t('productImages.loading') : t('productImages.loadFor', { name: item.name })} title={error || t('productImages.loadHint')}>
      {busy ? <RefreshCw className="size-5 animate-spin" aria-hidden="true" /> : <ImageIcon className="size-5" aria-hidden="true" />}
    </button>
    {error && !autoLoad && <span role="status">{error}</span>}
  </div>
}
