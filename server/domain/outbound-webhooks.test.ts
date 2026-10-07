import { describe, expect, it } from 'vitest'
import {
  buildOutboundWebhookEnvelope,
  maskWebhookSecret,
  nextWebhookAttemptAt,
  OUTBOUND_WEBHOOK_MAX_ATTEMPTS,
  signOutboundWebhookPayload,
  webhookDeliveryTerminal,
} from './outbound-webhooks'

describe('outbound webhook domain helpers', () => {
  it('masks secrets keeping the last four characters', () => {
    expect(maskWebhookSecret('whsec_abcdefghijklmnop')).toBe('****mnop')
    expect(maskWebhookSecret('ab')).toBe('****')
  })

  it('builds a stable event envelope', () => {
    const createdAt = new Date('2026-01-02T03:04:05.000Z')
    expect(
      buildOutboundWebhookEnvelope({
        deliveryId: 'del_1',
        eventType: 'share.created',
        createdAt,
        data: { shareId: 's1' },
      }),
    ).toEqual({
      id: 'del_1',
      type: 'share.created',
      created_at: '2026-01-02T03:04:05.000Z',
      data: { shareId: 's1' },
    })
  })

  it('computes exponential backoff until the terminal attempt', () => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    expect(nextWebhookAttemptAt(0, from)?.getTime()).toBe(from.getTime() + 60_000)
    expect(nextWebhookAttemptAt(OUTBOUND_WEBHOOK_MAX_ATTEMPTS, from)).toBeNull()
    expect(webhookDeliveryTerminal(OUTBOUND_WEBHOOK_MAX_ATTEMPTS)).toBe(true)
  })

  it('signs payloads with HMAC-SHA256', async () => {
    const signature = await signOutboundWebhookPayload('secret', '{"ok":true}')
    expect(signature.startsWith('sha256=')).toBe(true)
    expect(signature.length).toBeGreaterThan(20)
    const again = await signOutboundWebhookPayload('secret', '{"ok":true}')
    expect(again).toBe(signature)
    const other = await signOutboundWebhookPayload('other', '{"ok":true}')
    expect(other).not.toBe(signature)
  })
})
