import type { OutboundWebhookEndpointInput, OutboundWebhookEndpointPatch } from '@shared/schemas'

export type OutboundWebhookDeliveryStatus = 'pending' | 'delivering' | 'succeeded' | 'failed' | 'dead'

export interface OutboundWebhookEndpointRecord {
  id: string
  url: string
  description: string
  secret: string
  enabled: boolean
  eventTypes: string[]
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface OutboundWebhookDeliveryRecord {
  id: string
  endpointId: string
  eventType: string
  idempotencyKey: string
  payloadJson: string
  status: OutboundWebhookDeliveryStatus
  attemptCount: number
  nextAttemptAt: Date | null
  lastStatusCode: number | null
  lastError: string | null
  createdAt: Date
  deliveredAt: Date | null
}

export interface ListOutboundWebhookEndpointsResult {
  items: OutboundWebhookEndpointRecord[]
  total: number
  page: number
  pageSize: number
}

export interface ListOutboundWebhookDeliveriesResult {
  items: OutboundWebhookDeliveryRecord[]
  total: number
  page: number
  pageSize: number
}

export interface OutboundWebhookRepo {
  createEndpoint(
    input: OutboundWebhookEndpointInput,
    createdBy: string,
    secret: string,
  ): Promise<OutboundWebhookEndpointRecord>
  listEndpoints(opts: { page: number; pageSize: number }): Promise<ListOutboundWebhookEndpointsResult>
  getEndpoint(id: string): Promise<OutboundWebhookEndpointRecord | null>
  updateEndpoint(id: string, patch: OutboundWebhookEndpointPatch): Promise<OutboundWebhookEndpointRecord | null>
  rotateSecret(id: string, secret: string): Promise<OutboundWebhookEndpointRecord | null>
  deleteEndpoint(id: string): Promise<boolean>
  listEnabledForEvent(eventType: string): Promise<OutboundWebhookEndpointRecord[]>

  insertDelivery(input: {
    endpointId: string
    eventType: string
    idempotencyKey: string
    payloadJson: string
    nextAttemptAt: Date
  }): Promise<OutboundWebhookDeliveryRecord | null>
  updateDeliveryPayload(id: string, payloadJson: string): Promise<void>
  listDeliveries(opts: {
    endpointId?: string
    status?: OutboundWebhookDeliveryStatus
    page: number
    pageSize: number
  }): Promise<ListOutboundWebhookDeliveriesResult>
  claimDueDeliveries(limit: number, now: Date): Promise<OutboundWebhookDeliveryRecord[]>
  markDeliveryResult(
    id: string,
    result: {
      status: OutboundWebhookDeliveryStatus
      attemptCount: number
      nextAttemptAt: Date | null
      lastStatusCode: number | null
      lastError: string | null
      deliveredAt: Date | null
    },
  ): Promise<void>
}
