import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, FilterButton } from './ui'
import { EntityCombobox } from './entity-combobox'
import { FilterSheet } from './filter-sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Switch } from './ui/switch'
import { countProductFilters, emptyProductFilters, type ProductFilters } from '../lib/product-list'

type Options = { groups: string[]; brands: string[]; salePrices: boolean }

/** Narrows the product list by catalog data; each change applies at once, so the sheet only needs closing. */
export function ProductFilterSheet({ open, onOpenChange, filters, options, onChange }: { open: boolean; onOpenChange: (open: boolean) => void; filters: ProductFilters; options: Options; onChange: (filters: ProductFilters) => void }) {
  const { t } = useTranslation()
  const switchId = useId()
  const update = (patch: Partial<ProductFilters>) => onChange({ ...filters, ...patch })
  const entities = [['group', t('common.itemGroup'), options.groups], ['brand', t('common.brand'), options.brands]] as const
  return <FilterSheet trigger={<FilterButton label={t('productsPage.filterButton')} activeCount={countProductFilters(filters)} expanded={open} onClick={() => onOpenChange(true)} />} title={t('productsPage.filterTitle')} description={t('productsPage.filterDescription')} open={open} onOpenChange={onOpenChange}>
    {entities.map(([key, label, values]) => <Field label={label} key={key}><EntityCombobox ariaLabel={label} value={filters[key]} onValueChange={(value) => update({ [key]: value })} placeholder={t('common.all')} searchPlaceholder={t('common.searchEntity', { entity: label.toLocaleLowerCase() })} allowClear options={values.map((value) => ({ value, label: value }))} /></Field>)}
    <Field label={t('common.type')}><Select value={filters.type || '__all__'} onValueChange={(value) => update({ type: value === '__all__' ? '' : value as ProductFilters['type'] })}><SelectTrigger aria-label={t('common.type')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">{t('productsPage.filters.allTypes')}</SelectItem><SelectItem value="template">{t('productsPage.filters.template')}</SelectItem><SelectItem value="variant">{t('productsPage.filters.variant')}</SelectItem><SelectItem value="single">{t('productsPage.filters.single')}</SelectItem></SelectContent></Select></Field>
    <Field label={t('common.status')}><Select value={filters.status || '__all__'} onValueChange={(value) => update({ status: value === '__all__' ? '' : value as ProductFilters['status'] })}><SelectTrigger aria-label={t('common.status')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">{t('productsPage.filters.allStatuses')}</SelectItem><SelectItem value="active">{t('common.active')}</SelectItem><SelectItem value="disabled">{t('common.disabled')}</SelectItem></SelectContent></Select></Field>
    {options.salePrices && <div className="product-filter-switch"><label htmlFor={switchId}><strong>{t('productsPage.filters.noSalePrice')}</strong><span>{t('productsPage.filters.noSalePriceHint')}</span></label><Switch id={switchId} checked={filters.noSalePrice} onCheckedChange={(checked) => update({ noSalePrice: checked })} /></div>}
    <div className="product-filter-actions"><Button type="button" variant="secondary" disabled={!countProductFilters(filters)} onClick={() => onChange(emptyProductFilters)}>{t('prices.clearFilters')}</Button><Button type="button" onClick={() => onOpenChange(false)}>{t('productsPage.filters.done')}</Button></div>
  </FilterSheet>
}
