import { z } from 'zod'

export const OUTBOUND_WEBHOOK_EVENT_TYPES = [
  'share.created',
  'object.upload.confirmed',
  'store.order.paid',
  'webhook.test',
] as const

export const outboundWebhookEventTypeSchema = z.enum(OUTBOUND_WEBHOOK_EVENT_TYPES)

export const outboundWebhookEndpointInputSchema = z.object({
  url: z.string().url().max(2048),
  description: z.string().max(200).default(''),
  enabled: z.boolean().default(true),
  eventTypes: z.array(outboundWebhookEventTypeSchema).min(1).max(OUTBOUND_WEBHOOK_EVENT_TYPES.length),
})

export const outboundWebhookEndpointPatchSchema = outboundWebhookEndpointInputSchema.partial()

export const listOutboundWebhookDeliveriesQuerySchema = z.object({
  status: z.enum(['pending', 'delivering', 'succeeded', 'failed', 'dead']).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  pageSize: z.string().regex(/^\d+$/).optional(),
})

export type OutboundWebhookEventType = z.infer<typeof outboundWebhookEventTypeSchema>
export type OutboundWebhookEndpointInput = z.infer<typeof outboundWebhookEndpointInputSchema>
export type OutboundWebhookEndpointPatch = z.infer<typeof outboundWebhookEndpointPatchSchema>
export type ListOutboundWebhookDeliveriesQuery = z.infer<typeof listOutboundWebhookDeliveriesQuerySchema>
