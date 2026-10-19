import { Button, Field, FilterButton, Input } from './ui'
import { EntityCombobox } from './entity-combobox'
import { FilterSheet } from './filter-sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

export type PriceFilterValues = { minPrice: string; maxPrice: string; brand: string; itemGroup: string; supplier: string; priceList: string; uom: string; priceType: '' | 'buying' | 'selling'; status: '' | 'active' | 'disabled' }
type Options = { brands: string[]; itemGroups: string[]; suppliers: string[]; priceLists: string[]; uoms: string[] }

export function PriceFilterSheet({ open, onOpenChange, filters, options, activeCount, onChange, onClear }: { open: boolean; onOpenChange: (open: boolean) => void; filters: PriceFilterValues; options: Options; activeCount: number; onChange: (patch: Partial<PriceFilterValues>) => void; onClear: () => void }) {
  const { t } = useTranslation()
  const entityFilters: Array<[keyof Pick<PriceFilterValues, 'brand' | 'itemGroup' | 'supplier' | 'priceList' | 'uom'>, string[]]> = [['brand', options.brands], ['itemGroup', options.itemGroups], ['supplier', options.suppliers], ['priceList', options.priceLists], ['uom', options.uoms]]
  const labels: Record<string, string> = { brand: t('common.brand'), itemGroup: t('common.itemGroup'), supplier: t('common.supplier'), priceList: t('common.priceList'), uom: t('common.uom') }
  return <FilterSheet trigger={<FilterButton label={t('prices.filters')} activeCount={activeCount} expanded={open} aria-controls="price-filters-sheet" onClick={() => onOpenChange(true)} />} title={t('prices.filtersTitle')} description={t('prices.filtersDescription')} open={open} onOpenChange={onOpenChange}>
    <Field label={t('prices.minPrice')}><Input type="number" min="0" step="any" value={filters.minPrice} onChange={(event) => onChange({ minPrice: event.target.value })} aria-label={t('prices.minPrice')} /></Field>
    <Field label={t('prices.maxPrice')}><Input type="number" min="0" step="any" value={filters.maxPrice} onChange={(event) => onChange({ maxPrice: event.target.value })} aria-label={t('prices.maxPrice')} /></Field>
    {entityFilters.map(([key, values]) => { const label = labels[key]; return <Field label={label} key={key}><EntityCombobox ariaLabel={label} value={filters[key]} onValueChange={(value) => onChange({ [key]: value })} placeholder={t('common.all')} searchPlaceholder={t('common.searchEntity', { entity: label.toLocaleLowerCase() })} allowClear options={values.map((option) => ({ value: option, label: option }))} /></Field> })}
    <Field label={t('common.type')}><Select value={filters.priceType || '__all__'} onValueChange={(value) => onChange({ priceType: (value === '__all__' ? '' : value) as PriceFilterValues['priceType'] })}><SelectTrigger aria-label={t('common.type')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">{t('prices.buyingAndSelling')}</SelectItem><SelectItem value="buying">{t('prices.buying')}</SelectItem><SelectItem value="selling">{t('prices.selling')}</SelectItem></SelectContent></Select></Field>
    <Field label={t('common.status')}><Select value={filters.status || '__all__'} onValueChange={(value) => onChange({ status: (value === '__all__' ? '' : value) as PriceFilterValues['status'] })}><SelectTrigger aria-label={t('common.status')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">{t('prices.activeAndDisabled')}</SelectItem><SelectItem value="active">{t('common.active')}</SelectItem><SelectItem value="disabled">{t('common.disabled')}</SelectItem></SelectContent></Select></Field>
    <Button type="button" variant="secondary" onClick={onClear}>{t('prices.clearFilters')}</Button>
  </FilterSheet>
}
import { useTranslation } from 'react-i18next'
