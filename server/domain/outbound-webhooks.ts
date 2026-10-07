import type { OutboundWebhookEventType } from '@shared/schemas'
import { generateToken } from '../../shared/ids'

const MAX_ATTEMPTS = 5
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000] as const

export function generateOutboundWebhookSecret(): string {
  return `whsec_${generateToken(32)}`
}

export function maskWebhookSecret(secret: string): string {
  if (secret.length <= 4) return '****'
  return `****${secret.slice(-4)}`
}

export function nextWebhookAttemptAt(attemptCount: number, from = new Date()): Date | null {
  if (attemptCount >= MAX_ATTEMPTS) return null
  const delay = BACKOFF_MS[Math.min(attemptCount, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[BACKOFF_MS.length - 1]
  return new Date(from.getTime() + delay)
}

export function webhookDeliveryTerminal(attemptCount: number): boolean {
  return attemptCount >= MAX_ATTEMPTS
}

export function buildOutboundWebhookEnvelope(params: {
  deliveryId: string
  eventType: OutboundWebhookEventType | string
  createdAt: Date
  data: Record<string, unknown>
}): { id: string; type: string; created_at: string; data: Record<string, unknown> } {
  return {
    id: params.deliveryId,
    type: params.eventType,
    created_at: params.createdAt.toISOString(),
    data: params.data,
  }
}

export async function signOutboundWebhookPayload(secret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const hex = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `sha256=${hex}`
}

export { MAX_ATTEMPTS as OUTBOUND_WEBHOOK_MAX_ATTEMPTS }
