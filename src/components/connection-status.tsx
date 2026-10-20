import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Badge } from './ui'
import type { createErpNextClient } from '../lib/erpnext'

type Client = ReturnType<typeof createErpNextClient>

export function ConnectionStatus({ client }: { client: Client }) {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: ['connection-status', client.profileId], queryFn: () => client.getCurrentUser(), staleTime: 15_000, refetchInterval: 30_000, retry: 0 })
  const tone = query.isPending ? 'neutral' : query.isSuccess ? 'success' : 'danger'
  const label = query.isPending ? t('connectionStatus.checking') : query.isSuccess ? t('connectionStatus.online') : t('connectionStatus.offline')
  return <Badge className="connection-status" tone={tone} title={query.error instanceof Error ? query.error.message : undefined}><span aria-hidden="true" className="connection-status-dot" />{label}</Badge>
}
