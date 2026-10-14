import { Link } from 'react-router-dom'
import { Button, ButtonLink } from './ui'
import { calculateGrossMargin } from '../lib/pricing'
import type { CachedItem, ItemPrice, VariantItem } from '../lib/types'

function money(price: ItemPrice | null) {
  if (!price) return 'Sin precio'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: price.currency || 'MXN' }).format(Number(price.price_list_rate ?? 0))
}

function priceForItem(prices: ItemPrice[], item: CachedItem) {
  const codes = new Set([String(item.name), String(item.item_code ?? '')])
  const matching = prices.filter((price) => codes.has(String(price.item_code ?? '')))
  const purchases = matching.filter((price) => Boolean(price.buying)).sort((left, right) => Number(left.price_list_rate ?? 0) - Number(right.price_list_rate ?? 0))
  const sales = matching.filter((price) => Boolean(price.selling)).sort((left, right) => Number(right.price_list_rate ?? 0) - Number(left.price_list_rate ?? 0))
  return { purchase: purchases[0] ?? null, sale: sales[0] ?? null }
}

function productUoms(item: CachedItem, variant?: VariantItem) {
  return variant?.uoms?.length ? variant.uoms : item.uoms ?? []
}

export function ProductCard({ item, prices, variant, onOpen }: { item: CachedItem; prices: ItemPrice[]; variant?: VariantItem; onOpen: () => void }) {
  const { purchase, sale } = priceForItem(prices, item)
  const comparablePrices = purchase && sale && (purchase.uom || '') === (sale.uom || '')
  const margin = comparablePrices ? calculateGrossMargin(sale, purchase) : null
  const uoms = productUoms(item, variant)
  const stockUom = String(item.stock_uom ?? variant?.stock_uom ?? uoms[0]?.uom ?? '—')
  const conversions = uoms.filter((uom) => uom.uom && uom.uom !== stockUom)
  const sku = String(item.item_code ?? '—')
  const itemId = String(item.name)
  const barcodes = Array.isArray(item.barcodes) ? item.barcodes.map(String).filter(Boolean) : []

  return <article className="product-card" onDoubleClick={onOpen}>
    <div className="product-card-heading">
      <div className="min-w-0">
        <p className="product-card-eyebrow">{item.item_group || 'Sin clasificación'}</p>
        <h2 className="product-card-title"><Link to={`/items/${encodeURIComponent(itemId)}`}>{String(item.item_name ?? itemId)}</Link></h2>
      </div>
      <span className={`product-status ${item.disabled ? 'product-status-disabled' : 'product-status-active'}`}>{item.disabled ? 'Deshabilitado' : 'Activo'}</span>
    </div>

    <div className="product-card-identifiers">
      <span><b>SKU</b><code>{sku}</code></span>
      <span><b>ID</b><code>{itemId}</code></span>
      {barcodes[0] && <span><b>Barcode</b><code>{barcodes[0]}</code></span>}
    </div>

    <div className="product-card-metrics">
      <div className="product-metric product-metric-purchase"><span>Compra</span><strong>{money(purchase)}</strong>{purchase?.supplier && <small>{purchase.supplier}</small>}</div>
      <div className="product-metric product-metric-sale"><span>Venta</span><strong>{money(sale)}</strong>{sale?.price_list && <small>{sale.price_list}</small>}</div>
      <div className={`product-metric ${margin && margin.amount >= 0 ? 'product-metric-margin' : 'product-metric-loss'}`}><span>Ganancia aprox.</span><strong>{margin ? money({ ...sale, price_list_rate: margin.amount }) : 'Sin comparar'}</strong>{margin && <small>{margin.percentage.toFixed(1)}% · misma UOM</small>}</div>
    </div>

    <div className="product-card-details">
      <div><span className="product-detail-label">UOM stock</span><strong>{stockUom}</strong></div>
      <div><span className="product-detail-label">Venta predeterminada</span><strong>{item.sales_uom || '—'}</strong></div>
      <div><span className="product-detail-label">Compra predeterminada</span><strong>{item.purchase_uom || '—'}</strong></div>
    </div>

    <div className="product-card-conversions">
      <div className="product-section-heading"><span>Conversiones UOM</span><span className="product-count">{conversions.length}</span></div>
      {conversions.length ? <div className="conversion-chips">{conversions.map((uom) => <span className="conversion-chip" key={`${itemId}-${uom.uom}`}><b>1 {uom.uom}</b> = {uom.conversion_factor} {stockUom}</span>)}</div> : <span className="product-empty-detail">Sin conversiones registradas</span>}
    </div>

    <div className="product-card-actions"><Button type="button" variant="action" size="compact" onClick={onOpen}>Editar producto</Button><ButtonLink variant="action" size="compact" to={`/items/${encodeURIComponent(itemId)}/uoms`}>Configurar UOM</ButtonLink></div>
  </article>
}
