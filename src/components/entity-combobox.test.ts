import { describe, expect, it } from 'vitest'
import { filterEntityOptions } from './entity-combobox-utils'

describe('filterEntityOptions', () => {
  it('searches labels and alternate identifiers locally', () => {
    const options = [{ value: 'CUST-001', label: 'Cliente Demo', searchText: 'CUST-001' }, { value: 'CUST-002', label: 'Otra cuenta' }]
    expect(filterEntityOptions(options, 'cust-001')).toHaveLength(1)
    expect(filterEntityOptions(options, 'cliente')[0].value).toBe('CUST-001')
  })
})
