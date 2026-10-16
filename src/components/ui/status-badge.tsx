import { Badge, type BadgeTone } from './badge'

const toneByStatus: Record<string, BadgeTone> = {
  active: 'success',
  enabled: 'success',
  open: 'info',
  draft: 'warning',
  submitted: 'success',
  cancelled: 'danger',
  disabled: 'danger',
}

export function StatusBadge({ status }: { status?: string | null }) {
  const label = status || '—'
  return <Badge tone={toneByStatus[label.toLowerCase()] ?? 'neutral'}>{label}</Badge>
}
