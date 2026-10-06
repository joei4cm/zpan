import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerFeatureUnlock } from '../../domain/licensing'
import { adminHeaders, createTestApp } from '../../test/setup.js'

async function personalOrgId(db: Awaited<ReturnType<typeof createTestApp>>['db']) {
  const rows = await db.all<{ id: string }>(
    sql`SELECT id FROM organization WHERE metadata LIKE '%"type":"personal"%' LIMIT 1`,
  )
  return rows[0]?.id
}

describe('local commerce HTTP', () => {
  beforeEach(() => registerFeatureUnlock('true'))
  afterEach(() => registerFeatureUnlock(undefined))

  it('lists locally created packages without calling Cloud [spec: local-commerce/packages-from-catalog]', async () => {
    const { app } = await createTestApp()
    const headers = await adminHeaders(app)
    const created = await app.request('/api/store/admin/products', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Pro',
        storageBytes: 10 * 1024 ** 3,
        amountCents: 999,
        interval: 'month',
      }),
    })
    expect(created.status).toBe(201)

    const listed = await app.request('/api/store/packages', { headers })
    expect(listed.status).toBe(200)
    const body = (await listed.json()) as {
      items: Array<{ name: string; metadata: { deliverable: { storageBytes: number } } }>
    }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]?.name).toBe('Pro')
    expect(body.items[0]?.metadata.deliverable.storageBytes).toBe(10 * 1024 ** 3)
  })

  it('redeems a gift card into storage quota [spec: local-commerce/gift-card-grants-storage]', async () => {
    const { app, db } = await createTestApp()
    const headers = await adminHeaders(app)
    const issued = await app.request('/api/store/admin/gift-cards', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ storageBytes: 5 * 1024 ** 3, count: 1 }),
    })
    expect(issued.status).toBe(201)
    const { items } = (await issued.json()) as { items: Array<{ code: string }> }
    const code = items[0]?.code
    expect(code).toMatch(/^ZS-/)

    const redeemed = await app.request('/api/store/credits/redemptions', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    expect(redeemed.status).toBe(200)
    await expect(redeemed.json()).resolves.toMatchObject({
      redeemedStorageBytes: 5 * 1024 ** 3,
      failures: [],
    })

    const orgId = await personalOrgId(db)
    const entitlements = await db.all<{ bytes: number; source: string }>(
      sql`SELECT bytes, source FROM org_quota_entitlements WHERE org_id = ${orgId} AND source = 'gift_card'`,
    )
    expect(entitlements).toEqual([{ bytes: 5 * 1024 ** 3, source: 'gift_card' }])
  })
})
