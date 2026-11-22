import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, CardContent, Input, Label } from './ui'
import { Alert, AlertDescription } from './ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { ErpNextImageUploadError, type createErpNextClient } from '../lib/erpnext'
import type { VariantItem } from '../lib/types'

type Client = ReturnType<typeof createErpNextClient>
type ImageSource = 'link' | 'upload'

function checkPublicImage(url: string) {
  return new Promise<void>((resolve, reject) => {
    let target: URL
    try { target = new URL(url) } catch { reject(new Error('invalid-url')); return }
    if (target.protocol !== 'https:' || target.username || target.password) { reject(new Error('invalid-url')); return }
    const image = new Image()
    const timeout = window.setTimeout(() => { image.onload = null; image.onerror = null; image.src = ''; reject(new Error('timeout')) }, 15_000)
    const finish = (callback: () => void) => { window.clearTimeout(timeout); image.onload = null; image.onerror = null; callback() }
    image.referrerPolicy = 'no-referrer'
    image.onload = () => finish(() => image.naturalWidth > 0 ? resolve() : reject(new Error('invalid-image')))
    image.onerror = () => finish(() => reject(new Error('invalid-image')))
    image.src = url
  })
}

export function PendingImageEditor({ client, item, onClose, onSaved }: { client: Client; item: VariantItem | null; onClose: () => void; onSaved: (imageUrl: string) => Promise<void> }) {
  const { t } = useTranslation()
  const [source, setSource] = useState<ImageSource>('link')
  const [imageUrl, setImageUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const saveLock = useRef(false)

  useEffect(() => {
    setSource('link')
    setImageUrl('')
    setFile(null)
    setBusy(false)
    setError('')
    saveLock.current = false
  }, [item?.name])

  useEffect(() => {
    if (!file) { setPreviewUrl(''); return }
    const nextUrl = URL.createObjectURL(file)
    setPreviewUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [file])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!item || saveLock.current) return
    if (source === 'upload' && (!file || !file.type.startsWith('image/') || file.size === 0)) {
      setError(t('pendingPage.imageFileInvalid'))
      return
    }
    if (source === 'link' && !imageUrl.trim()) {
      setError(t('pendingPage.imageLinkInvalid'))
      return
    }
    saveLock.current = true
    setBusy(true)
    setError('')
    try {
      let savedUrl = ''
      if (source === 'link') {
        const link = imageUrl.trim()
        if (client.isExternalImageUrl(link)) await checkPublicImage(link).catch((reason) => { throw new Error(reason instanceof Error && reason.message === 'timeout' ? t('pendingPage.imageLinkTimeout') : reason instanceof Error && reason.message === 'invalid-url' ? t('pendingPage.imageLinkInvalid') : t('pendingPage.imageLinkNotImage')) })
        else await client.getImage(link)
        savedUrl = await client.setItemImage(item.name, link)
      } else if (file) savedUrl = await client.uploadItemImage(item.name, file)
      if (!savedUrl) throw new Error(t('pendingPage.imageChooseFile'))
      await onSaved(savedUrl)
      onClose()
    } catch (reason) {
      if (reason instanceof ErpNextImageUploadError) {
        setSource('link')
        setImageUrl(reason.fileUrl)
      }
      setError(reason instanceof Error ? reason.message : t('pendingPage.imageSaveError'))
    } finally {
      saveLock.current = false
      setBusy(false)
    }
  }

  return <Dialog open={Boolean(item)} onOpenChange={(open) => { if (!open && !busy) onClose() }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('pendingPage.imageDialogTitle')}</DialogTitle>
        <DialogDescription>{t('pendingPage.imageDialogDescription', { item: item?.item_name || item?.name || '' })}</DialogDescription>
      </DialogHeader>
      <form className="grid gap-4" noValidate onSubmit={(event) => { void save(event) }}>
        <Tabs value={source} onValueChange={(value) => { setSource(value as ImageSource); setError('') }}>
          <TabsList aria-label={t('pendingPage.imageSource')}>
            <TabsTrigger value="link" disabled={busy}>{t('pendingPage.imageLinkTab')}</TabsTrigger>
            <TabsTrigger value="upload" disabled={busy}>{t('pendingPage.imageUploadTab')}</TabsTrigger>
          </TabsList>
          <TabsContent value="link" className="grid gap-2">
            <Label htmlFor="pending-image-link">{t('pendingPage.imageLink')}</Label>
            <Input id="pending-image-link" value={imageUrl} onChange={(event) => { setImageUrl(event.target.value); setError('') }} placeholder="/files/producto.jpg" autoFocus disabled={busy} />
            <Alert className="notice-info"><AlertDescription>{t('pendingPage.imageLinkHint')}</AlertDescription></Alert>
          </TabsContent>
          <TabsContent value="upload" className="grid gap-2">
            <Label htmlFor="pending-image-file">{t('pendingPage.imageFile')}</Label>
            <Input id="pending-image-file" type="file" accept="image/*" onChange={(event) => { const nextFile = event.target.files?.[0] ?? null; setError(nextFile && (!nextFile.type.startsWith('image/') || nextFile.size === 0) ? t('pendingPage.imageFileInvalid') : ''); setFile(nextFile) }} disabled={busy} />
            {file ? <Card className="flex items-center gap-3 p-3 shadow-none"><CardContent className="flex min-w-0 items-center gap-3"><img className="size-12 rounded-md border object-cover" src={previewUrl} alt="" /><span className="min-w-0"><strong className="block truncate text-sm">{file.name}</strong><span className="muted text-xs">{t('pendingPage.imageFileSize', { size: (file.size / 1024).toFixed(0) })}</span></span></CardContent></Card> : <p className="muted text-sm">{t('pendingPage.imageFileHint')}</p>}
          </TabsContent>
        </Tabs>
        {error && <Alert className="notice-warning" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button type="submit" loading={busy} disabled={busy || (source === 'link' ? !imageUrl.trim() : !file || !file.type.startsWith('image/') || file.size === 0)}>{busy ? t(source === 'link' ? 'pendingPage.imageVerifying' : 'pendingPage.imageUploading') : t('pendingPage.imageSave')}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
