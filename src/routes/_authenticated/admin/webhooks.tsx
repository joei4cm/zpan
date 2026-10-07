import { OUTBOUND_WEBHOOK_EVENT_TYPES } from '@shared/schemas'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Plus, Trash2, Webhook } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { ProBadge } from '@/components/ProBadge'
import { UpgradeHint } from '@/components/UpgradeHint'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useEntitlement } from '@/hooks/useEntitlement'
import type { OutboundWebhookEndpoint, OutboundWebhookEndpointInput } from '@/lib/api'
import {
  createOutboundWebhookEndpoint,
  deleteOutboundWebhookEndpoint,
  listOutboundWebhookEndpoints,
  testOutboundWebhookEndpoint,
  updateOutboundWebhookEndpoint,
} from '@/lib/api'

export const Route = createFileRoute('/_authenticated/admin/webhooks')({
  component: WebhooksPage,
})

const DEFAULT_EVENTS = [
  'share.created',
  'object.upload.confirmed',
  'store.order.paid',
] as OutboundWebhookEndpointInput['eventTypes']

function WebhooksPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<OutboundWebhookEndpoint | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OutboundWebhookEndpoint | null>(null)
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)
  const { hasFeature, isLoading: entitlementLoading } = useEntitlement()
  const webhooksEnabled = hasFeature('outbound_webhooks')

  const endpointsQuery = useQuery({
    queryKey: ['admin', 'outbound-webhooks'],
    queryFn: () => listOutboundWebhookEndpoints(1, 50),
    enabled: webhooksEnabled,
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'outbound-webhooks'] })
  }

  const createMutation = useMutation({
    mutationFn: createOutboundWebhookEndpoint,
    onSuccess: (endpoint) => {
      invalidate()
      setFormOpen(false)
      setRevealedSecret(endpoint.secret ?? null)
      toast.success(t('admin.webhooks.created'))
    },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<OutboundWebhookEndpointInput> }) =>
      updateOutboundWebhookEndpoint(id, input),
    onSuccess: () => {
      invalidate()
      setFormOpen(false)
      setEditing(null)
      toast.success(t('admin.webhooks.updated'))
    },
    onError: (err) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteOutboundWebhookEndpoint,
    onSuccess: () => {
      invalidate()
      setDeleteTarget(null)
      toast.success(t('admin.webhooks.deleted'))
    },
    onError: (err) => toast.error(err.message),
  })

  const testMutation = useMutation({
    mutationFn: testOutboundWebhookEndpoint,
    onSuccess: () => toast.success(t('admin.webhooks.testSent')),
    onError: (err) => toast.error(err.message),
  })

  const endpoints = endpointsQuery.data?.items ?? []

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t('admin.webhooks.title')}
        description={t('admin.webhooks.description')}
        badge={<ProBadge />}
        action={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
            disabled={!webhooksEnabled}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('admin.webhooks.create')}
          </Button>
        }
      />

      {!entitlementLoading && !webhooksEnabled && <UpgradeHint feature="outbound_webhooks" />}

      {webhooksEnabled && (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">{t('admin.webhooks.fieldUrl')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('admin.webhooks.fieldEvents')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('admin.webhooks.fieldStatus')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('admin.storages.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((endpoint) => (
                  <tr key={endpoint.id} className="border-b">
                    <td className="px-4 py-3">
                      <div className="break-all font-medium">{endpoint.url}</div>
                      {endpoint.description ? (
                        <div className="text-xs text-muted-foreground">{endpoint.description}</div>
                      ) : null}
                      <div className="mt-1 font-mono text-xs text-muted-foreground">{endpoint.secretMasked}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {endpoint.eventTypes.map((eventType) => (
                          <Badge key={eventType} variant="secondary">
                            {eventType}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={endpoint.enabled ? 'default' : 'outline'}>
                        {endpoint.enabled ? t('admin.webhooks.enabled') : t('admin.webhooks.disabled')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => testMutation.mutate(endpoint.id)}
                          disabled={testMutation.isPending}
                        >
                          {t('admin.webhooks.test')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(endpoint)
                            setFormOpen(true)
                          }}
                        >
                          {t('common.edit')}
                        </Button>
                        <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(endpoint)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {endpoints.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-3">
                        <Webhook className="h-10 w-10" />
                        <p>{t('admin.webhooks.empty')}</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <WebhookFormDialog
            key={editing?.id ?? 'create'}
            open={formOpen}
            endpoint={editing}
            saving={createMutation.isPending || updateMutation.isPending}
            onOpenChange={(open) => {
              setFormOpen(open)
              if (!open) setEditing(null)
            }}
            onSubmit={(input) => {
              if (editing) {
                updateMutation.mutate({ id: editing.id, input })
                return
              }
              createMutation.mutate(input)
            }}
          />

          <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('common.delete')}</DialogTitle>
                <DialogDescription>{t('admin.webhooks.deleteConfirm')}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? t('common.loading') : t('common.delete')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={revealedSecret !== null} onOpenChange={(open) => !open && setRevealedSecret(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('admin.webhooks.secretTitle')}</DialogTitle>
                <DialogDescription>{t('admin.webhooks.secretDescription')}</DialogDescription>
              </DialogHeader>
              <code className="block break-all rounded-md bg-muted p-3 text-sm">{revealedSecret}</code>
              <DialogFooter>
                <Button
                  onClick={async () => {
                    if (revealedSecret) await navigator.clipboard.writeText(revealedSecret)
                    toast.success(t('common.copied'))
                  }}
                >
                  {t('common.copy')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}

function WebhookFormDialog({
  open,
  endpoint,
  saving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  endpoint: OutboundWebhookEndpoint | null
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: OutboundWebhookEndpointInput) => void
}) {
  const { t } = useTranslation()
  const [url, setUrl] = useState(endpoint?.url ?? '')
  const [description, setDescription] = useState(endpoint?.description ?? '')
  const [enabled, setEnabled] = useState(endpoint?.enabled ?? true)
  const [eventTypes, setEventTypes] = useState<OutboundWebhookEndpointInput['eventTypes']>(
    (endpoint?.eventTypes as OutboundWebhookEndpointInput['eventTypes'] | undefined) ?? DEFAULT_EVENTS,
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{endpoint ? t('admin.webhooks.edit') : t('admin.webhooks.create')}</DialogTitle>
          <DialogDescription>{t('admin.webhooks.formDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook-url">{t('admin.webhooks.fieldUrl')}</Label>
            <Input
              id="webhook-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/hooks/zpan"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhook-description">{t('admin.webhooks.fieldDescription')}</Label>
            <Input
              id="webhook-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('admin.webhooks.descriptionPlaceholder')}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="webhook-enabled">{t('admin.webhooks.fieldEnabled')}</Label>
            <Switch id="webhook-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="space-y-2">
            <Label>{t('admin.webhooks.fieldEvents')}</Label>
            <div className="space-y-2">
              {OUTBOUND_WEBHOOK_EVENT_TYPES.filter((eventType) => eventType !== 'webhook.test').map((eventType) => {
                const checked = eventTypes.includes(eventType)
                const inputId = `webhook-event-${eventType}`
                return (
                  <div key={eventType} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      onCheckedChange={(value) => {
                        setEventTypes((current) => {
                          if (value) return [...new Set([...current, eventType])] as typeof current
                          return current.filter((item) => item !== eventType) as typeof current
                        })
                      }}
                    />
                    <Label htmlFor={inputId} className="font-mono font-normal">
                      {eventType}
                    </Label>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={saving || !url || eventTypes.length === 0}
            onClick={() =>
              onSubmit({
                url,
                description,
                enabled,
                eventTypes,
              })
            }
          >
            {saving ? t('common.loading') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
