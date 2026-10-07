import type {
  OutboundWebhookEndpointInput,
  OutboundWebhookEndpointPatch,
  OutboundWebhookEventType,
} from '@shared/schemas'
import {
  buildOutboundWebhookEnvelope,
  generateOutboundWebhookSecret,
  maskWebhookSecret,
  nextWebhookAttemptAt,
  signOutboundWebhookPayload,
  webhookDeliveryTerminal,
} from '../domain/outbound-webhooks'
import type { OutboundWebhookDeliveryRecord, OutboundWebhookEndpointRecord, OutboundWebhookRepo } from './ports'
import { badRequest, notFound } from './ports'

export type OutboundWebhookDeps = {
  outboundWebhooks: OutboundWebhookRepo
}

export type OutboundWebhookEndpointView = Omit<OutboundWebhookEndpointRecord, 'secret'> & {
  secretMasked: string
  secret?: string
}

function toEndpointView(record: OutboundWebhookEndpointRecord, secret?: string): OutboundWebhookEndpointView {
  return {
    id: record.id,
    url: record.url,
    description: record.description,
    enabled: record.enabled,
    eventTypes: record.eventTypes,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    secretMasked: maskWebhookSecret(record.secret),
    ...(secret ? { secret } : {}),
  }
}

export async function listOutboundWebhookEndpoints(
  deps: OutboundWebhookDeps,
  opts: { page: number; pageSize: number },
) {
  const result = await deps.outboundWebhooks.listEndpoints(opts)
  return { ...result, items: result.items.map((item) => toEndpointView(item)) }
}

export async function createOutboundWebhookEndpoint(
  deps: OutboundWebhookDeps,
  input: OutboundWebhookEndpointInput,
  createdBy: string,
) {
  const secret = generateOutboundWebhookSecret()
  const created = await deps.outboundWebhooks.createEndpoint(input, createdBy, secret)
  return toEndpointView(created, secret)
}

export async function getOutboundWebhookEndpoint(deps: OutboundWebhookDeps, id: string) {
  const endpoint = await deps.outboundWebhooks.getEndpoint(id)
  return endpoint ? toEndpointView(endpoint) : null
}

export async function updateOutboundWebhookEndpoint(
  deps: OutboundWebhookDeps,
  id: string,
  patch: OutboundWebhookEndpointPatch,
) {
  if (patch.eventTypes && patch.eventTypes.length === 0) {
    throw badRequest('At least one event type is required', 'EVENT_TYPES_REQUIRED')
  }
  const updated = await deps.outboundWebhooks.updateEndpoint(id, patch)
  return updated ? toEndpointView(updated) : null
}

export async function rotateOutboundWebhookSecret(deps: OutboundWebhookDeps, id: string) {
  const secret = generateOutboundWebhookSecret()
  const updated = await deps.outboundWebhooks.rotateSecret(id, secret)
  return updated ? toEndpointView(updated, secret) : null
}

export async function deleteOutboundWebhookEndpoint(deps: OutboundWebhookDeps, id: string) {
  return deps.outboundWebhooks.deleteEndpoint(id)
}

export async function listOutboundWebhookDeliveries(
  deps: OutboundWebhookDeps,
  opts: {
    endpointId?: string
    status?: OutboundWebhookDeliveryRecord['status']
    page: number
    pageSize: number
  },
) {
  return deps.outboundWebhooks.listDeliveries(opts)
}

export async function enqueueOutboundEvent(
  deps: OutboundWebhookDeps,
  params: {
    eventType: OutboundWebhookEventType
    idempotencyKey: string
    data: Record<string, unknown>
  },
): Promise<OutboundWebhookDeliveryRecord[]> {
  const endpoints = await deps.outboundWebhooks.listEnabledForEvent(params.eventType)
  if (endpoints.length === 0) return []

  const now = new Date()
  const created: OutboundWebhookDeliveryRecord[] = []
  for (const endpoint of endpoints) {
    const placeholder = buildOutboundWebhookEnvelope({
      deliveryId: 'pending',
      eventType: params.eventType,
      createdAt: now,
      data: params.data,
    })
    const inserted = await deps.outboundWebhooks.insertDelivery({
      endpointId: endpoint.id,
      eventType: params.eventType,
      idempotencyKey: params.idempotencyKey,
      payloadJson: JSON.stringify(placeholder),
      nextAttemptAt: now,
    })
    if (!inserted) continue
    const payloadJson = JSON.stringify({ ...placeholder, id: inserted.id })
    await deps.outboundWebhooks.updateDeliveryPayload(inserted.id, payloadJson)
    created.push({ ...inserted, payloadJson })
  }
  return created
}

/** Enqueue matching deliveries and attempt immediate delivery (best-effort). */
export async function emitOutboundEvent(
  deps: OutboundWebhookDeps,
  params: {
    eventType: OutboundWebhookEventType
    idempotencyKey: string
    data: Record<string, unknown>
  },
): Promise<void> {
  const deliveries = await enqueueOutboundEvent(deps, params)
  if (deliveries.length === 0) return
  await deliverOutboundWebhooks(deps, deliveries)
}

export async function testOutboundWebhookEndpoint(deps: OutboundWebhookDeps, id: string) {
  const endpoint = await deps.outboundWebhooks.getEndpoint(id)
  if (!endpoint) throw notFound('Webhook endpoint not found')
  const now = new Date()
  const placeholder = buildOutboundWebhookEnvelope({
    deliveryId: 'pending',
    eventType: 'webhook.test',
    createdAt: now,
    data: { endpointId: id, url: endpoint.url },
  })
  const inserted = await deps.outboundWebhooks.insertDelivery({
    endpointId: endpoint.id,
    eventType: 'webhook.test',
    idempotencyKey: `webhook.test:${id}:${now.getTime()}`,
    payloadJson: JSON.stringify(placeholder),
    nextAttemptAt: now,
  })
  if (!inserted) return { ok: true as const }
  const payloadJson = JSON.stringify({ ...placeholder, id: inserted.id })
  await deps.outboundWebhooks.updateDeliveryPayload(inserted.id, payloadJson)
  await deliverOutboundWebhooks(deps, [{ ...inserted, payloadJson }])
  return { ok: true as const }
}

async function deliverOne(
  deps: OutboundWebhookDeps,
  delivery: OutboundWebhookDeliveryRecord,
  endpoint: OutboundWebhookEndpointRecord,
): Promise<void> {
  const attemptCount = delivery.attemptCount + 1
  let statusCode: number | null = null
  let error: string | null = null
  let succeeded = false
  try {
    const signature = await signOutboundWebhookPayload(endpoint.secret, delivery.payloadJson)
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ZPan-Webhooks/1.0',
        'X-ZPan-Event': delivery.eventType,
        'X-ZPan-Delivery': delivery.id,
        'X-ZPan-Signature': signature,
      },
      body: delivery.payloadJson,
    })
    statusCode = response.status
    succeeded = response.status >= 200 && response.status < 300
    if (!succeeded) {
      const body = await response.text().catch(() => '')
      error = body.slice(0, 500) || `HTTP ${response.status}`
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  if (succeeded) {
    await deps.outboundWebhooks.markDeliveryResult(delivery.id, {
      status: 'succeeded',
      attemptCount,
      nextAttemptAt: null,
      lastStatusCode: statusCode,
      lastError: null,
      deliveredAt: new Date(),
    })
    return
  }

  const terminal = webhookDeliveryTerminal(attemptCount)
  await deps.outboundWebhooks.markDeliveryResult(delivery.id, {
    status: terminal ? 'dead' : 'failed',
    attemptCount,
    nextAttemptAt: terminal ? null : nextWebhookAttemptAt(attemptCount),
    lastStatusCode: statusCode,
    lastError: error,
    deliveredAt: null,
  })
}

export async function deliverOutboundWebhooks(
  deps: OutboundWebhookDeps,
  deliveries: OutboundWebhookDeliveryRecord[],
): Promise<void> {
  for (const delivery of deliveries) {
    const endpoint = await deps.outboundWebhooks.getEndpoint(delivery.endpointId)
    if (!endpoint?.enabled) {
      await deps.outboundWebhooks.markDeliveryResult(delivery.id, {
        status: 'dead',
        attemptCount: delivery.attemptCount,
        nextAttemptAt: null,
        lastStatusCode: null,
        lastError: 'Endpoint missing or disabled',
        deliveredAt: null,
      })
      continue
    }
    await deliverOne(deps, delivery, endpoint)
  }
}

export async function processDueOutboundWebhooks(deps: OutboundWebhookDeps, limit = 50): Promise<number> {
  const due = await deps.outboundWebhooks.claimDueDeliveries(limit, new Date())
  if (due.length === 0) return 0
  await deliverOutboundWebhooks(deps, due)
  return due.length
}
