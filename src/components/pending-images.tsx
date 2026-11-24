import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, ImageOff, ImagePlus } from 'lucide-react'
import { Badge, Button } from './ui'
import { ProductImage } from './product-image'
import { ImagePreviewDialog, type ImagePreview } from './image-preview-dialog'
import { VirtualizedCollection } from './virtualized-collection'
import { useConfirmDialog } from './confirm-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from './ui/dropdown-menu'
import type { createErpNextClient } from '../lib/erpnext'
import type { MissingImageGroup, MissingImageRow, MissingImageView } from '../lib/pending-items'
import { shareCachedProductImage } from '../lib/product-image-sync'
import type { VariantItem } from '../lib/types'

type Client = ReturnType<typeof createErpNextClient>
type Family = Extract<MissingImageGroup, { kind: 'family' }>
type Busy = { key: string; done: number; total: number }

const groupKey = (group: MissingImageGroup) => group.kind === 'item' ? group.item.name : group.template.name

/**
 * "Sin imagen" tab: products without an image, and template families where an image can be inherited
 * from the template by its variants or by the template from a variant. `view` shows the families as a
 * hierarchy or, in the flat views, only `rows`: every item without an image, or just templates or variants.
 */
export function PendingImages({ client, profileId, view, groups, rows, search, empty, onAssignImage, onImagesSaved, onMessage }: {
  client: Client
  profileId: string
  view: MissingImageView
  groups: MissingImageGroup[]
  rows: MissingImageRow[]
  search: string
  empty: ReactNode
  onAssignImage: (item: VariantItem) => void
  /** Saves the new image of these items in the local catalogs; resolves true when the cache write failed. */
  onImagesSaved: (items: VariantItem[], imageUrl: string) => Promise<boolean>
  onMessage: (message: string) => void
}) {
  const { t } = useTranslation()
  const { confirm, dialog } = useConfirmDialog()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  // Searching expands the matching families; clearing the search collapses them again.
  const [expandedSearch, setExpandedSearch] = useState(search)
  if (expandedSearch !== search) {
    setExpandedSearch(search)
    setExpanded(new Set(search ? groups.filter((group) => group.kind === 'family').map(groupKey) : []))
  }
  const [busy, setBusy] = useState<Busy | null>(null)
  const [preview, setPreview] = useState<ImagePreview | null>(null)

  const families = groups.filter((group): group is Family => group.kind === 'family')
  const allExpanded = families.length > 0 && families.every((family) => expanded.has(family.template.name))
  const toggle = (name: string) => setExpanded((current) => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next })

  /** Saves `imageUrl` on each target, one request at a time, and reports which ones failed. */
  async function applyImage(key: string, source: VariantItem, targets: VariantItem[], successMessage: string) {
    const imageUrl = source.image?.trim()
    if (!imageUrl || busy || !targets.length) return
    setBusy({ key, done: 0, total: targets.length })
    onMessage('')
    const saved: VariantItem[] = []
    const failed: string[] = []
    let savedUrl = imageUrl
    for (const target of targets) {
      try {
        savedUrl = await client.setItemImage(target.name, imageUrl)
        saved.push(target)
      } catch {
        failed.push(target.item_name || target.name)
      }
      setBusy({ key, done: saved.length + failed.length, total: targets.length })
    }
    const cacheFailed = saved.length ? await onImagesSaved(saved, savedUrl) : false
    if (saved.length) await shareCachedProductImage(profileId, source.name, savedUrl, saved.map((item) => item.name)).catch(() => undefined)
    setBusy(null)
    if (failed.length) onMessage(t('pendingPage.images.partial', { done: saved.length, total: targets.length, names: failed.join(', ') }))
    else onMessage(cacheFailed ? t('pendingPage.imageSavedCacheWarning') : successMessage)
  }

  async function applyTemplateToVariants(family: Family) {
    const count = family.missingVariants.length
    const accepted = await confirm({ title: t('pendingPage.images.applyTitle', { count }), description: t('pendingPage.images.applyDescription', { name: family.template.item_name || family.template.name }), confirmLabel: t('pendingPage.images.applyConfirm') })
    if (accepted) await applyImage(`apply:${family.template.name}`, family.template, family.missingVariants, t('pendingPage.images.applied', { count }))
  }

  async function useVariantForTemplate(family: Family, variant: VariantItem) {
    const accepted = await confirm({ title: t('pendingPage.images.useForTemplateTitle'), description: t('pendingPage.images.useForTemplateDescription', { template: family.template.item_name || family.template.name, variant: variant.item_name || variant.name }), confirmLabel: t('pendingPage.images.useForTemplate') })
    if (accepted) await applyImage(`template:${family.template.name}`, variant, [family.template], t('pendingPage.images.templateUpdated'))
  }

  const progress = (key: string) => busy?.key === key ? t('pendingPage.images.applying', { done: busy.done, total: busy.total }) : null
  const thumb = (item: VariantItem) => item.image?.trim()
    ? <ProductImage key={`${item.name}:${item.image}`} client={client} profileId={profileId} item={item} className="pending-thumb" autoLoad onPreview={(source) => setPreview({ source, name: item.item_name || item.name, code: item.name })} />
    : <span className="pending-thumb pending-thumb-empty" role="img" aria-label={t('pendingPage.images.noImage')}><ImageOff aria-hidden="true" /></span>
  /** The template takes a variant's image: directly when only one has an image, otherwise picked from a menu. */
  const useVariantImageAction = (family: Family) => {
    const key = `template:${family.template.name}`
    const label = t('pendingPage.images.useVariantImage')
    if (family.variantsWithImage.length === 1) return <Button type="button" variant="secondary" size="compact" disabled={busy !== null} loading={busy?.key === key} onClick={() => { void useVariantForTemplate(family, family.variantsWithImage[0]) }}>{label}</Button>
    return <DropdownMenu>
      <DropdownMenuTrigger asChild><Button type="button" variant="secondary" size="compact" disabled={busy !== null} loading={busy?.key === key}>{label}<ChevronDown className="size-4" aria-hidden="true" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="pending-menu">
        <DropdownMenuLabel>{t('pendingPage.images.chooseVariant')}</DropdownMenuLabel>
        {family.variantsWithImage.map((variant) => <DropdownMenuItem key={variant.name} onSelect={() => { void useVariantForTemplate(family, variant) }}>{variant.item_name || variant.name}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  }
  const assignButton = (item: VariantItem) => <Button type="button" variant="secondary" size="compact" disabled={busy !== null} onClick={() => onAssignImage(item)}><ImagePlus className="size-4" aria-hidden="true" />{t('pendingPage.assignImage')}</Button>

  if (view !== 'tree') {
    if (!rows.length) return <>{empty}{dialog}</>
    return <>
      <div role="list">
        <VirtualizedCollection className="pending-list" items={rows} getKey={(row) => row.item.name} estimateSize={76} renderItem={({ item, role, family }) => {
          const details = role === 'variant' && family ? `${item.name} · ${t('pendingPage.variantOf', { name: family.template.item_name || family.template.name })}` : item.name
          const templateImage = role === 'variant' && family && !family.templateMissing ? family.template : undefined
          return <article className="pending-row pending-image-row" role="listitem">
            {thumb(item)}
            <div className="pending-item-main"><h2>{item.item_name || item.name}</h2><p>{details}</p></div>
            {role === 'template' && <div className="pending-item-tags"><Badge tone="neutral">{t('pendingPage.kind.template')}</Badge></div>}
            <div className="pending-item-actions">
              {templateImage && <Button type="button" variant="secondary" size="compact" disabled={busy !== null} loading={busy?.key === `variant:${item.name}`} onClick={() => { void applyImage(`variant:${item.name}`, templateImage, [item], t('pendingPage.imageSaved')) }}>{t('pendingPage.assignTemplateImage')}</Button>}
              {role === 'template' && family && family.variantsWithImage.length > 0 && useVariantImageAction(family)}
              {assignButton(item)}
            </div>
          </article>
        }} />
      </div>
      <ImagePreviewDialog preview={preview} onClose={() => setPreview(null)} />
      {dialog}
    </>
  }

  if (!groups.length) return <>{empty}{dialog}</>

  return <>
    {families.length > 0 && <div className="pending-images-bar">
      <Button type="button" variant="secondary" size="compact" aria-expanded={allExpanded} onClick={() => setExpanded(allExpanded ? new Set() : new Set(families.map((family) => family.template.name)))}>
        {allExpanded ? <ChevronsDownUp className="size-4" aria-hidden="true" /> : <ChevronsUpDown className="size-4" aria-hidden="true" />}{allExpanded ? t('pendingPage.images.collapseAll') : t('pendingPage.images.expandAll')}
      </Button>
    </div>}
    <div role="list">
      <VirtualizedCollection className="pending-list" items={groups} getKey={groupKey} estimateSize={76} renderItem={(group) => {
        if (group.kind === 'item') {
          const { item } = group
          return <article className="pending-row pending-image-row" role="listitem">
            {thumb(item)}
            <div className="pending-item-main"><h2>{item.item_name || item.name}</h2><p>{item.name}</p></div>
            <div className="pending-item-actions">{assignButton(item)}</div>
          </article>
        }
        const { template, variants, missingVariants, variantsWithImage, templateMissing } = group
        const isOpen = expanded.has(template.name)
        const templateName = template.item_name || template.name
        return <article className="pending-family" role="listitem">
          <div className="pending-row pending-image-row pending-family-head">
            <button type="button" className="pending-family-toggle" aria-expanded={isOpen} aria-label={t(isOpen ? 'pendingPage.images.hideVariants' : 'pendingPage.images.showVariants', { name: templateName })} onClick={() => toggle(template.name)}><ChevronRight aria-hidden="true" /></button>
            {thumb(template)}
            <div className="pending-item-main">
              <h2>{templateName}</h2>
              <p>{template.name} · {missingVariants.length ? t('pendingPage.images.variantsMissing', { missing: missingVariants.length, count: variants.length }) : t('pendingPage.images.variantsComplete', { count: variants.length })}</p>
            </div>
            <div className="pending-item-tags"><Badge tone="neutral">{t('pendingPage.kind.template')}</Badge>{templateMissing && <Badge tone="warning">{t('pendingPage.images.noImage')}</Badge>}</div>
            <div className="pending-item-actions">
              {!templateMissing && missingVariants.length > 0 && <Button type="button" variant="secondary" size="compact" disabled={busy !== null} loading={busy?.key === `apply:${template.name}`} onClick={() => { void applyTemplateToVariants(group) }}>{progress(`apply:${template.name}`) ?? t('pendingPage.images.applyToVariants', { count: missingVariants.length })}</Button>}
              {templateMissing && variantsWithImage.length > 0 && useVariantImageAction(group)}
              {templateMissing && assignButton(template)}
            </div>
          </div>
          {isOpen && <div className="pending-family-variants" role="list" aria-label={t('pendingPage.images.variantsOf', { name: templateName })}>
            {variants.map((variant) => {
              const missing = !variant.image?.trim()
              return <div key={variant.name} className="pending-row pending-image-row pending-variant-row" role="listitem">
                {thumb(variant)}
                <div className="pending-item-main"><h3>{variant.item_name || variant.name}</h3><p>{variant.name}</p></div>
                {missing && <div className="pending-item-tags"><Badge tone="warning">{t('pendingPage.images.noImage')}</Badge></div>}
                <div className="pending-item-actions">
                  {missing && !templateMissing && <Button type="button" variant="secondary" size="compact" disabled={busy !== null} loading={busy?.key === `variant:${variant.name}`} onClick={() => { void applyImage(`variant:${variant.name}`, template, [variant], t('pendingPage.imageSaved')) }}>{t('pendingPage.assignTemplateImage')}</Button>}
                  {missing && assignButton(variant)}
                  {!missing && templateMissing && <Button type="button" variant="secondary" size="compact" disabled={busy !== null} onClick={() => { void useVariantForTemplate(group, variant) }}>{t('pendingPage.images.useForTemplate')}</Button>}
                </div>
              </div>
            })}
          </div>}
        </article>
      }} />
    </div>
    <ImagePreviewDialog preview={preview} onClose={() => setPreview(null)} />
    {dialog}
  </>
}
