import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog'
import { Button } from './ui'

type ConfirmOptions = { title: string; description?: string; confirmLabel: string; tone?: 'danger' | 'primary' }

export function useConfirmDialog() {
  const { t } = useTranslation()
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((next: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current?.(false)
    resolver.current = resolve
    setOptions(next)
  }), [])

  function settle(value: boolean) {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }

  const dialog = <AlertDialog open={Boolean(options)} onOpenChange={(open) => { if (!open) settle(false) }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{options?.title}</AlertDialogTitle>{options?.description && <AlertDialogDescription>{options.description}</AlertDialogDescription>}</AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel asChild><Button variant="secondary">{t('common.cancel')}</Button></AlertDialogCancel>
        <AlertDialogAction asChild><Button variant={options?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => settle(true)}>{options?.confirmLabel}</Button></AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  return { confirm, dialog }
}
