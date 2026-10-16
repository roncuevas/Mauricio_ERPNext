import { formatMoney } from '../lib/pos'
import type { CachedItem } from '../lib/types'

export function PosProductCard({ item, price, priceLabel, currency, quantity, isTemplate, inCart, variantCount = 0, uomCount = 0, onAdd, onDecrease, onOpenTemplate }: { item: CachedItem; price: number | null; priceLabel?: string; currency: string; quantity: number; isTemplate: boolean; inCart?: boolean; variantCount?: number; uomCount?: number; onAdd: () => void; onDecrease: () => void; onOpenTemplate: () => void }) {
  const title = item.item_name || item.name
  const weight = Number(item.weight_per_unit ?? 0) > 0 ? `${item.weight_per_unit} ${item.weight_uom || ''}`.trim() : ''
  const configurable = isTemplate || uomCount > 1
  return <article className={`pos-product-card${configurable ? ' pos-product-card-template' : ''}${inCart ? ' is-in-cart' : ''}`}>
    <button type="button" className="pos-product-card-main" onClick={onOpenTemplate} aria-label={`Configurar venta de ${title}`}>
      <strong className="pos-product-title">{title}</strong>
      <span className="pos-product-meta">{item.brand || 'Sin marca'}{weight ? ` · ${weight}` : ''}</span>
      <b className={price === null && !priceLabel ? 'pos-product-price pos-product-price-missing' : 'pos-product-price'}>{priceLabel ?? (price === null ? 'Sin precio' : formatMoney(price, currency))}</b>
      {isTemplate && <span className="pos-product-template-label">Plantilla · {variantCount} variantes</span>}
      {!isTemplate && uomCount > 1 && <span className="pos-product-template-label">Varias UOM · configurar</span>}
    </button>
    {configurable ? <button type="button" className="button button-secondary button-compact pos-product-choose" onClick={onOpenTemplate}>{isTemplate ? 'Elegir variante' : 'Elegir UOM'}</button> : <div className="pos-product-stepper" aria-label={`Cantidad de ${title}`}><button type="button" onClick={onDecrease} disabled={quantity <= 0} aria-label={`Quitar ${title}`}>−</button><span aria-live="polite">{quantity}</span><button type="button" onClick={onAdd} aria-label={`Agregar ${title}`}>+</button></div>}
  </article>
}
