import { formatMoney } from '../lib/pos'
import { useTranslation } from 'react-i18next'
import type { CachedItem } from '../lib/types'
import { Link } from 'react-router-dom'
import { Button } from './ui'

export function PosProductCard({ item, price, priceLabel, priceHref, currency, quantity, isTemplate, inCart, variantCount = 0, uomCount = 0, onAdd, onDecrease, onOpenTemplate }: { item: CachedItem; price: number | null; priceLabel?: string; priceHref: string; currency: string; quantity: number; isTemplate: boolean; inCart?: boolean; variantCount?: number; uomCount?: number; onAdd: () => void; onDecrease: () => void; onOpenTemplate: () => void }) {
  const { t } = useTranslation()
  const title = item.item_name || item.name
  const weight = Number(item.weight_per_unit ?? 0) > 0 ? `${item.weight_per_unit} ${item.weight_uom || ''}`.trim() : ''
  const configurable = isTemplate || uomCount > 1
  return <article className={`pos-product-card${configurable ? ' pos-product-card-template' : ''}${inCart ? ' is-in-cart' : ''}`}>
    <button type="button" className="pos-product-card-main" onClick={onOpenTemplate} aria-label={t('pos.product.configureSale', { title })}>
      <strong className="pos-product-title">{title}</strong>
      <span className="pos-product-meta">{item.brand || t('pos.product.noBrand')}{weight ? ` · ${weight}` : ''}</span>
      <span className="pos-product-stock">{item.stock_known ? t('posExtra.availableStock', { qty: Number(item.available_qty ?? 0) }) : t('posExtra.stockUnknown')}</span>
      <b className={price === null && !priceLabel ? 'pos-product-price pos-product-price-missing' : 'pos-product-price'}>{priceLabel ?? (price === null ? t('pos.product.noPrice') : formatMoney(price, currency))}</b>
      {isTemplate && <span className="pos-product-template-label">{t('pos.product.templateVariants', { count: variantCount })}</span>}
      {!isTemplate && uomCount > 1 && <span className="pos-product-template-label">{t('pos.product.multipleUom')}</span>}
    </button>
    {configurable ? <Button type="button" variant="secondary" size="compact" className="pos-product-choose" onClick={onOpenTemplate}>{isTemplate ? t('pos.product.chooseVariant') : t('pos.product.chooseUom')}</Button> : <div className="pos-product-stepper" aria-label={t('pos.product.quantity', { title })}><button type="button" onClick={onDecrease} disabled={quantity <= 0} aria-label={t('pos.product.remove', { title })}>−</button><span aria-live="polite">{quantity}</span><button type="button" onClick={onAdd} aria-label={t('pos.product.add', { title })}>+</button></div>}
    <Link className="pos-product-price-link" to={priceHref} onClick={(event) => event.stopPropagation()} aria-label={t('pos.product.viewPrices', { title })}>{t('pos.product.viewPricesShort')}</Link>
  </article>
}
