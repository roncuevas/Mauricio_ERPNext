import { forwardRef, type ComponentProps, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from './input'

/**
 * The × inside a search field. It keeps focus in the input (mousedown does not blur it), so popovers anchored to the
 * input stay open and the user can type the next search right away.
 */
export function SearchClearButton({ onClear, label }: { onClear: () => void; label?: string }) {
  const { t } = useTranslation()
  const text = label ?? t('common.clearSearch')
  function clear(event: MouseEvent<HTMLButtonElement>) {
    onClear()
    event.currentTarget.closest('.search-field, [data-slot="input-group"]')?.querySelector('input')?.focus()
  }
  return <button type="button" className="search-clear" aria-label={text} title={text} onMouseDown={(event) => event.preventDefault()} onClick={clear}><X aria-hidden="true" /></button>
}

type SearchInputProps = ComponentProps<typeof Input> & {
  onClear: () => void
  /** Show the × even when the field is empty, e.g. while an applied search is still filtering the list. */
  clearable?: boolean
  clearLabel?: string
}

/** Text input with a clear button; `className` styles the input, the wrapper only positions the button. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput({ onClear, clearable, clearLabel, ...props }, ref) {
  const show = (clearable || Boolean(props.value)) && !props.disabled
  return <div className={cn('search-field', show && 'has-clear')}>
    <Input ref={ref} {...props} />
    {show && <SearchClearButton onClear={onClear} label={clearLabel} />}
  </div>
})
SearchInput.displayName = 'SearchInput'
