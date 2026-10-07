import type { StripeConfigSettings, UpdateStripeConfigInput } from '@shared/schemas'
import type { Platform } from '../../platform/interface'
import type { SystemOptionsRepo } from '../ports'

export const STRIPE_SECRET_KEY_OPTION = 'stripe_secret_key'
export const STRIPE_WEBHOOK_SECRET_OPTION = 'stripe_webhook_secret'

export type StripeConfigDeps = {
  systemOptions: SystemOptionsRepo
}

function maskSecret(value: string): string {
  if (value.length === 0) return ''
  return `****${value.slice(-4)}`
}

function preserveMaskedSecret(input: string, existing: string | null): string {
  return existing !== null && input === maskSecret(existing) ? existing : input
}

function resolveSource(envValue: string | null, dbValue: string | null): StripeConfigSettings['secretKeySource'] {
  if (envValue) return 'env'
  if (dbValue) return 'database'
  return 'none'
}

export async function resolveStripeSecrets(
  deps: StripeConfigDeps,
  platform: Platform,
): Promise<{ secretKey: string | null; webhookSecret: string | null }> {
  const [dbSecretKey, dbWebhookSecret] = await Promise.all([
    deps.systemOptions.getValue(STRIPE_SECRET_KEY_OPTION),
    deps.systemOptions.getValue(STRIPE_WEBHOOK_SECRET_OPTION),
  ])
  const envSecretKey = platform.getEnv('STRIPE_SECRET_KEY')?.trim() || null
  const envWebhookSecret = platform.getEnv('STRIPE_WEBHOOK_SECRET')?.trim() || null
  return {
    secretKey: envSecretKey || dbSecretKey?.trim() || null,
    webhookSecret: envWebhookSecret || dbWebhookSecret?.trim() || null,
  }
}

export async function getStripeConfigSettings(
  deps: StripeConfigDeps,
  platform: Platform,
): Promise<StripeConfigSettings> {
  const [dbSecretKeyRaw, dbWebhookSecretRaw] = await Promise.all([
    deps.systemOptions.getValue(STRIPE_SECRET_KEY_OPTION),
    deps.systemOptions.getValue(STRIPE_WEBHOOK_SECRET_OPTION),
  ])
  const dbSecretKey = dbSecretKeyRaw?.trim() || null
  const dbWebhookSecret = dbWebhookSecretRaw?.trim() || null
  const envSecretKey = platform.getEnv('STRIPE_SECRET_KEY')?.trim() || null
  const envWebhookSecret = platform.getEnv('STRIPE_WEBHOOK_SECRET')?.trim() || null
  // Form fields expose DB values only so a masked env secret is never written back.
  return {
    secretKey: dbSecretKey ? maskSecret(dbSecretKey) : '',
    webhookSecret: dbWebhookSecret ? maskSecret(dbWebhookSecret) : '',
    secretKeyConfigured: Boolean(envSecretKey || dbSecretKey),
    webhookSecretConfigured: Boolean(envWebhookSecret || dbWebhookSecret),
    secretKeySource: resolveSource(envSecretKey, dbSecretKey),
    webhookSecretSource: resolveSource(envWebhookSecret, dbWebhookSecret),
  }
}

export async function saveStripeConfig(deps: StripeConfigDeps, input: UpdateStripeConfigInput): Promise<void> {
  const [existingSecret, existingWebhook] = await Promise.all([
    deps.systemOptions.getValue(STRIPE_SECRET_KEY_OPTION),
    deps.systemOptions.getValue(STRIPE_WEBHOOK_SECRET_OPTION),
  ])
  await deps.systemOptions.setMany([
    {
      key: STRIPE_SECRET_KEY_OPTION,
      value: preserveMaskedSecret(input.secretKey.trim(), existingSecret),
    },
    {
      key: STRIPE_WEBHOOK_SECRET_OPTION,
      value: preserveMaskedSecret(input.webhookSecret.trim(), existingWebhook),
    },
  ])
}
