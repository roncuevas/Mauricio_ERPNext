import { Button, Field, FilterButton, Input } from './ui'
import { EntityCombobox } from './entity-combobox'
import { FilterSheet } from './filter-sheet'
import type { Company, Warehouse } from '../lib/types'

export function StockFilterSheet({ open, onOpenChange, company, warehouse, search, companies, warehouses, onCompany, onWarehouse, onSearch, onApply }: { open: boolean; onOpenChange: (open: boolean) => void; company: string; warehouse: string; search: string; companies: Company[]; warehouses: Warehouse[]; onCompany: (value: string) => void; onWarehouse: (value: string) => void; onSearch: (value: string) => void; onApply: () => void }) {
  const { t } = useTranslation()
  return <FilterSheet trigger={<FilterButton label={t('stock.filters')} expanded={open} onClick={() => onOpenChange(true)} />} title={t('stock.filtersTitle')} description={t('stock.filtersDescription')} open={open} onOpenChange={onOpenChange}>
    <Field label={t('common.company')}><EntityCombobox ariaLabel={t('common.company')} value={company} onValueChange={onCompany} placeholder={t('stock.allCompanies')} searchPlaceholder={t('common.searchEntity', { entity: t('common.company').toLocaleLowerCase() })} allowClear options={companies.map((item) => ({ value: item.name, label: item.company_name || item.name, searchText: item.name }))} /></Field>
    <Field label={t('stock.warehouse')}><EntityCombobox ariaLabel={t('stock.warehouse')} value={warehouse} onValueChange={onWarehouse} placeholder={t('stock.allWarehouses')} searchPlaceholder={t('common.searchEntity', { entity: t('stock.warehouse').toLocaleLowerCase() })} allowClear options={warehouses.map((item) => ({ value: item.name, label: item.warehouse_name || item.name, searchText: `${item.name} ${item.company ?? ''}` }))} /></Field>
    <Field label={t('common.product')}><Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t('stock.codeOrName')} /></Field>
    <Button type="button" onClick={onApply}>{t('stock.applyFilters')}</Button>
  </FilterSheet>
}
import { useTranslation } from 'react-i18next'
