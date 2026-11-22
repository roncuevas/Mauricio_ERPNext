import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type RefObject } from 'react'
import { findExactItem } from '../lib/stock'
import type { VariantItem } from '../lib/types'

function readDraft<T>(key: string): T | null {
  try { const raw = window.sessionStorage.getItem(key); return raw ? JSON.parse(raw) as T : null } catch { return null }
}

/**
 * Form state that survives leaving the page within this tab (sessionStorage, scoped by profile), so moving between
 * tabs never throws away a half-finished count. Closing the tab with pending lines asks the browser to confirm.
 */
export function useStockDraft<T extends { lines: unknown[] }>(key: string, initial: () => T, restoreIf: (draft: T) => boolean = () => true) {
  const [restored, setRestored] = useState(() => { const draft = readDraft<T>(key); return Boolean(draft?.lines.length && restoreIf(draft)) })
  const [state, setState] = useState<T>(() => { const draft = readDraft<T>(key); return draft?.lines.length && restoreIf(draft) ? draft : initial() })

  useEffect(() => {
    try { if (state.lines.length) window.sessionStorage.setItem(key, JSON.stringify(state)); else window.sessionStorage.removeItem(key) } catch { /* storage unavailable: the form still works */ }
  }, [key, state])

  useEffect(() => {
    if (!state.lines.length) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state.lines.length])

  const clear = useCallback(() => { try { window.sessionStorage.removeItem(key) } catch { /* ignore */ } setRestored(false); setState({ ...initial(), lines: [] }) }, [initial, key])
  const update = useCallback((patch: Partial<T> | ((current: T) => Partial<T>)) => setState((current) => ({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) })), [])
  return { draft: state, update, clear, restored, dismissRestored: () => setRestored(false) }
}

/**
 * Keyboard contract for quantity inputs in a stock document: Enter never submits the form, it returns to the picker.
 * When a scanner fires into a quantity field (the value is an exact barcode/code), the previous value is restored
 * and the scanned product is added instead.
 */
export function useLineEntryKeys({ items, pickerRef, onScan }: { items: VariantItem[]; pickerRef: RefObject<HTMLInputElement | null>; onScan: (itemCode: string) => void }) {
  const previous = useRef('')
  return (restore: (value: string) => void) => ({
    onFocus: (event: FocusEvent<HTMLInputElement>) => { previous.current = event.currentTarget.value },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      const value = event.currentTarget.value.trim()
      const scanned = value.length >= 6 ? findExactItem(items, value) : undefined
      if (scanned) { restore(previous.current); onScan(scanned.name); return }
      pickerRef.current?.focus()
    },
  })
}
