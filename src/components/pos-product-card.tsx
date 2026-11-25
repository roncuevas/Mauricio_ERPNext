import { formatMoney } from '../lib/pos'
import { useTranslation } from 'react-i18next'
import type { CachedItem } from '../lib/types'
import { Link } from 'react-router-dom'
import { stockLevel } from '../lib/pos-catalog'
import { ProductImage } from './product-image'
import type { createErpNextClient } from '../lib/erpnext'

export function PosProductCard({ item, price, priceLabel, priceHref, currency, quantity, isTemplate, inCart, variantCount = 0, uomCount = 0, onAdd, onDecrease, onOpenTemplate, client, profileId, showImage }: { item: CachedItem; price: number | null; priceLabel?: string; priceHref?: string; currency: string; quantity: number; isTemplate: boolean; inCart?: boolean; variantCount?: number; uomCount?: number; onAdd: () => void; onDecrease: () => void; onOpenTemplate: () => void; client: ReturnType<typeof createErpNextClient>; profileId: string; showImage: boolean }) {
  const { t } = useTranslation()
  const title = item.item_name || item.name
  const weight = Number(item.weight_per_unit ?? 0) > 0 ? `${item.weight_per_unit} ${item.weight_uom || ''}`.trim() : ''
  const level = stockLevel(item)
  const otherUoms = !isTemplate && uomCount > 1
  const missingPrice = price === null && !priceLabel
  return <article className={`pos-product-card${isTemplate ? ' pos-product-card-template' : ''}${inCart ? ' is-in-cart' : ''}`}>
    {showImage && <ProductImage client={client} profileId={profileId} item={item} className="pos-product-image" previewable />}
    <button type="button" className="pos-product-card-main" onClick={isTemplate ? onOpenTemplate : onAdd} aria-label={isTemplate ? t('pos.product.chooseVariantOf', { title }) : t('pos.product.add', { title })}>
      <strong className="pos-product-title">{title}</strong>
      <span className="pos-product-meta">{item.brand || t('pos.product.noBrand')}{weight ? ` · ${weight}` : ''}</span>
      <span className="pos-product-stock" data-level={level}>{level === 'unknown' ? t('posExtra.stockUnknown') : level === 'out' ? t('pos.product.outOfStock', { qty: Number(item.available_qty ?? 0) }) : t('pos.product.inStock', { qty: Number(item.available_qty ?? 0) })}</span>
      <b className={missingPrice ? 'pos-product-price pos-product-price-missing' : 'pos-product-price'}>{priceLabel ?? (price === null ? t('pos.product.noPrice') : formatMoney(price, currency))}</b>
      {isTemplate && <span className="pos-product-template-label">{t('pos.product.chooseVariants', { count: variantCount })}</span>}
    </button>
    {!isTemplate && <div className="pos-product-stepper" aria-label={t('pos.product.quantity', { title })}><button type="button" onClick={onDecrease} disabled={quantity <= 0} aria-label={t('pos.product.remove', { title })}>−</button><span aria-live="polite">{quantity}</span><button type="button" onClick={onAdd} aria-label={t('pos.product.add', { title })}>+</button></div>}
    {(otherUoms || priceHref) && <div className="pos-product-links">
      {otherUoms && <button type="button" className="pos-product-price-link" onClick={onOpenTemplate} aria-label={t('pos.product.otherUomFor', { title })}>{t('pos.product.otherUom')}</button>}
      {priceHref && <Link className="pos-product-price-link" to={priceHref} onClick={(event) => event.stopPropagation()} aria-label={t('pos.product.viewPrices', { title })}>{t('pos.product.viewPricesShort')}</Link>}
    </div>}
  </article>
}
