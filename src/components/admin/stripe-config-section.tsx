import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AdminFormDrawer, AdminFormField } from '@/components/admin/admin-form-drawer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getLocalStoreStripeConfig, saveLocalStoreStripeConfig } from '@/lib/api'

const stripeConfigQueryKey = ['admin', 'store', 'stripe-config'] as const

export function StripeConfigSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [secretKey, setSecretKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')

  const configQuery = useQuery({ queryKey: stripeConfigQueryKey, queryFn: getLocalStoreStripeConfig })
  const config = configQuery.data

  useEffect(() => {
    if (!open || !config) return
    setSecretKey(config.secretKey)
    setWebhookSecret(config.webhookSecret)
  }, [open, config])

  const saveMutation = useMutation({
    mutationFn: () => saveLocalStoreStripeConfig({ secretKey, webhookSecret }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: stripeConfigQueryKey })
      toast.success(t('admin.store.stripeSaved'))
      setOpen(false)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const ready = Boolean(config?.secretKeyConfigured && config?.webhookSecretConfigured)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{t('admin.store.stripeTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('admin.store.stripeHelp')}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <CreditCard className="mr-2 h-4 w-4" />
          {t('admin.store.configureStripe')}
        </Button>
      </div>

      {configQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={ready ? 'default' : 'secondary'}>
            {ready ? t('admin.store.stripeReady') : t('admin.store.stripeMissing')}
          </Badge>
          <span className="text-muted-foreground">
            {t('admin.store.stripeSecretSource', {
              source: t(`admin.store.stripeSource.${config?.secretKeySource ?? 'none'}`),
            })}
          </span>
          <span className="text-muted-foreground">
            {t('admin.store.stripeWebhookSource', {
              source: t(`admin.store.stripeSource.${config?.webhookSecretSource ?? 'none'}`),
            })}
          </span>
        </div>
      )}

      <AdminFormDrawer
        open={open}
        onOpenChange={setOpen}
        title={t('admin.store.stripeTitle')}
        description={t('admin.store.stripeDrawerHelp')}
        footer={
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !secretKey || !webhookSecret}
          >
            {t('common.save')}
          </Button>
        }
      >
        <AdminFormField label={t('admin.store.fieldStripeSecretKey')} id="stripe-secret-key" required>
          <Input
            type="password"
            autoComplete="off"
            value={secretKey}
            onChange={(event) => setSecretKey(event.target.value)}
            placeholder="sk_live_..."
          />
        </AdminFormField>
        <AdminFormField label={t('admin.store.fieldStripeWebhookSecret')} id="stripe-webhook-secret" required>
          <Input
            type="password"
            autoComplete="off"
            value={webhookSecret}
            onChange={(event) => setWebhookSecret(event.target.value)}
            placeholder="whsec_..."
          />
        </AdminFormField>
        <p className="text-xs text-muted-foreground">{t('admin.store.stripeEnvOverrideHelp')}</p>
      </AdminFormDrawer>
    </section>
  )
}
