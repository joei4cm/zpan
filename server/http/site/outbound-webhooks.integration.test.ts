import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminHeaders, authedHeaders, createTestApp, seedBusinessLicense } from '../../test/setup.js'
import { emitOutboundEvent, processDueOutboundWebhooks } from '../../usecases/outbound-webhooks'

const endpointInput = {
  url: 'https://hooks.example.com/zpan',
  description: 'CI notifier',
  enabled: true,
  eventTypes: ['share.created', 'object.upload.confirmed', 'store.order.paid'],
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Outbound Webhooks Admin API', () => {
  it('returns 401 without auth', async () => {
    const { app } = await createTestApp()
    const res = await app.request('/api/site/outbound-webhooks')
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin users', async () => {
    const { app, db } = await createTestApp()
    await adminHeaders(app)
    await seedBusinessLicense(db)
    const headers = await authedHeaders(app, 'user@example.com')
    const res = await app.request('/api/site/outbound-webhooks', { headers })
    expect(res.status).toBe(403)
  })

  it('returns 402 when outbound webhooks are not available', async () => {
    const { app } = await createTestApp()
    const headers = await adminHeaders(app)
    const res = await app.request('/api/site/outbound-webhooks', { headers })
    expect(res.status).toBe(402)
    const body = (await res.json()) as { error: { details: { reason: string; metadata?: { feature?: string } }[] } }
    expect(body.error.details[0]?.reason).toBe('FEATURE_NOT_AVAILABLE')
    expect(body.error.details[0]?.metadata?.feature).toBe('outbound_webhooks')
  })

  it('creates, lists, updates, rotates, and deletes an endpoint', async () => {
    const { app, db } = await createTestApp()
    const headers = await adminHeaders(app)
    await seedBusinessLicense(db)

    const createRes = await app.request('/api/site/outbound-webhooks', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(endpointInput),
    })
    expect(createRes.status).toBe(201)
    const created = (await createRes.json()) as {
      id: string
      secret?: string
      secretMasked: string
      url: string
    }
    expect(created.url).toBe(endpointInput.url)
    expect(created.secret?.startsWith('whsec_')).toBe(true)
    expect(created.secretMasked.startsWith('****')).toBe(true)

    const listRes = await app.request('/api/site/outbound-webhooks', { headers })
    expect(listRes.status).toBe(200)
    const list = (await listRes.json()) as { items: Array<{ id: string; secret?: string }>; total: number }
    expect(list.total).toBe(1)
    expect(list.items[0]?.id).toBe(created.id)
    expect(list.items[0]?.secret).toBeUndefined()

    const patchRes = await app.request(`/api/site/outbound-webhooks/${created.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Updated', enabled: false }),
    })
    expect(patchRes.status).toBe(200)
    const patched = (await patchRes.json()) as { description: string; enabled: boolean }
    expect(patched.description).toBe('Updated')
    expect(patched.enabled).toBe(false)

    const rotateRes = await app.request(`/api/site/outbound-webhooks/${created.id}/secret-rotations`, {
      method: 'POST',
      headers,
    })
    expect(rotateRes.status).toBe(200)
    const rotated = (await rotateRes.json()) as { secret?: string }
    expect(rotated.secret?.startsWith('whsec_')).toBe(true)
    expect(rotated.secret).not.toBe(created.secret)

    const deleteRes = await app.request(`/api/site/outbound-webhooks/${created.id}`, {
      method: 'DELETE',
      headers,
    })
    expect(deleteRes.status).toBe(204)
  })

  it('delivers signed events and records delivery history', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const ctx = await createTestApp()
    const { app, db, deps } = ctx
    const headers = await adminHeaders(app)
    await seedBusinessLicense(db)

    const createRes = await app.request('/api/site/outbound-webhooks', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(endpointInput),
    })
    const created = (await createRes.json()) as { id: string }

    await emitOutboundEvent(deps, {
      eventType: 'share.created',
      idempotencyKey: 'share.created:share-1',
      data: { shareId: 'share-1', orgId: 'org-1' },
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('POST')
    const body = JSON.parse(String(init.body)) as { type: string; data: { shareId: string } }
    expect(body.type).toBe('share.created')
    expect(body.data.shareId).toBe('share-1')
    const headersInit = init.headers as Record<string, string>
    expect(headersInit['X-ZPan-Signature']?.startsWith('sha256=')).toBe(true)
    expect(headersInit['X-ZPan-Event']).toBe('share.created')

    // Idempotent re-emit must not create a second delivery.
    await emitOutboundEvent(deps, {
      eventType: 'share.created',
      idempotencyKey: 'share.created:share-1',
      data: { shareId: 'share-1', orgId: 'org-1' },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const deliveriesRes = await app.request(`/api/site/outbound-webhooks/${created.id}/deliveries`, { headers })
    expect(deliveriesRes.status).toBe(200)
    const deliveries = (await deliveriesRes.json()) as {
      items: Array<{ status: string; eventType: string }>
      total: number
    }
    expect(deliveries.total).toBe(1)
    expect(deliveries.items[0]?.status).toBe('succeeded')
    expect(deliveries.items[0]?.eventType).toBe('share.created')
  })

  it('retries failed deliveries on the scheduled processor', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const ctx = await createTestApp()
    const { app, db, deps } = ctx
    const headers = await adminHeaders(app)
    await seedBusinessLicense(db)

    await app.request('/api/site/outbound-webhooks', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(endpointInput),
    })

    await emitOutboundEvent(deps, {
      eventType: 'object.upload.confirmed',
      idempotencyKey: 'object.upload.confirmed:obj-1',
      data: { objectId: 'obj-1' },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Force the failed delivery due immediately.
    await db.run(
      sql`UPDATE outbound_webhook_deliveries SET next_attempt_at = 0, status = 'failed' WHERE event_type = 'object.upload.confirmed'`,
    )

    const processed = await processDueOutboundWebhooks(deps)
    expect(processed).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
