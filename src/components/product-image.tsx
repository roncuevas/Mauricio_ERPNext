import { useEffect, useState } from 'react'
import { Image as ImageIcon, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { createErpNextClient } from '../lib/erpnext'
import { readProductImage, writeProductImage } from '../lib/product-image-cache'

type Client = ReturnType<typeof createErpNextClient>

export function ProductImage({ client, profileId, item, className = '' }: { client: Client; profileId: string; item: { name: string; item_name?: string; image?: string }; className?: string }) {
  const { t } = useTranslation()
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (source) return () => URL.revokeObjectURL(source) }, [source])

  useEffect(() => {
    let active = true
    setSource('')
    void readProductImage(profileId, item.name).then((cached) => {
      if (!active || !cached || (item.image && cached.url !== item.image)) return
      setSource(URL.createObjectURL(cached.blob))
    }).catch(() => undefined)
    return () => { active = false }
  }, [item.image, item.name, profileId])

  async function loadImage() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const imageUrl = item.image || (await client.getDocument<{ image?: string }>('Item', item.name)).image
      if (!imageUrl) throw new Error(t('productImages.missing'))
      const blob = await client.getImage(imageUrl)
      await writeProductImage({ profileId, itemName: item.name, url: imageUrl, blob })
    setSource(URL.createObjectURL(blob))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('productImages.loadError'))
    } finally { setBusy(false) }
  }

  if (source) return <img className={`product-image ${className}`} src={source} alt={item.item_name || item.name} loading="lazy" onError={() => { setSource(''); setError(t('productImages.loadError')) }} />
  return <div className={`product-image-placeholder ${className}`}>
    <button type="button" onClick={(event) => { event.stopPropagation(); void loadImage() }} disabled={busy} aria-label={busy ? t('productImages.loading') : t('productImages.loadFor', { name: item.name })} title={error || t('productImages.loadHint')}>
      {busy ? <RefreshCw className="size-5 animate-spin" aria-hidden="true" /> : <ImageIcon className="size-5" aria-hidden="true" />}
    </button>
    {error && <span role="status">{error}</span>}
  </div>
}
