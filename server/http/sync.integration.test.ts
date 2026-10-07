import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { adminHeaders, createTestApp } from '../test/setup.js'

async function personalOrgId(db: Awaited<ReturnType<typeof createTestApp>>['db']) {
  const rows = await db.all<{ id: string }>(sql`
    SELECT organization.id AS id
    FROM organization
    INNER JOIN member ON member.organization_id = organization.id
    WHERE member.role = 'owner'
    LIMIT 1
  `)
  return rows[0]!.id
}

describe('Sync API', () => {
  it('registers, lists, heartbeats, and revokes a sync device', async () => {
    const { app } = await createTestApp()
    const headers = await adminHeaders(app)

    const createRes = await app.request('/api/sync/devices', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Laptop', platform: 'darwin', appVersion: '1.0.0' }),
    })
    expect(createRes.status).toBe(201)
    const created = (await createRes.json()) as { id: string; token?: string; status: string }
    expect(created.status).toBe('active')
    expect(created.token?.startsWith('sync_')).toBe(true)

    const listRes = await app.request('/api/sync/devices', { headers })
    expect(listRes.status).toBe(200)
    const list = (await listRes.json()) as { items: Array<{ id: string; token?: string }>; total: number }
    expect(list.total).toBe(1)
    expect(list.items[0]?.id).toBe(created.id)
    expect(list.items[0]?.token).toBeUndefined()

    const heartbeatRes = await app.request(`/api/sync/devices/${created.id}/heartbeats`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ appVersion: '1.0.1' }),
    })
    expect(heartbeatRes.status).toBe(200)
    const heartbeat = (await heartbeatRes.json()) as { appVersion: string }
    expect(heartbeat.appVersion).toBe('1.0.1')

    const revokeRes = await app.request(`/api/sync/devices/${created.id}`, { method: 'DELETE', headers })
    expect(revokeRes.status).toBe(204)
  })

  it('pulls object changes after a matter mutation', async () => {
    const { app, db } = await createTestApp()
    const headers = await adminHeaders(app)
    const orgId = await personalOrgId(db)
    const now = Date.now()
    await db.run(sql`
      INSERT INTO storages (
        id, bucket, endpoint, region, access_key, secret_key, file_path, custom_host,
        capacity, used, enabled, status, egress_credit_billing_enabled, egress_credit_unit_bytes,
        egress_credit_per_unit, created_at, updated_at
      )
      VALUES (
        'stor1', 'bucket', 'http://127.0.0.1:9000', 'auto', 'ak', 'sk',
        '', '', 0, 0, 1, 'untested', 0, ${100 * 1024 ** 2}, 1, ${now}, ${now}
      )
    `)

    const beforeRes = await app.request(`/api/sync/changes?spaceId=${orgId}&limit=50`, { headers })
    expect(beforeRes.status).toBe(200)
    const before = (await beforeRes.json()) as { changes: unknown[]; nextCursor: string; resetRequired: boolean }
    expect(before.changes).toEqual([])
    expect(before.resetRequired).toBe(false)

    // Create a folder through the public objects API so matterChanges dual-writes sync rows.
    const createFolder = await app.request('/api/objects', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'SyncFolder', type: 'folder', dirtype: 1 }),
    })
    expect(createFolder.status).toBe(201)
    const folder = (await createFolder.json()) as { id: string }

    const afterRes = await app.request(`/api/sync/changes?spaceId=${orgId}&cursor=${before.nextCursor}&limit=50`, {
      headers,
    })
    expect(afterRes.status).toBe(200)
    const after = (await afterRes.json()) as {
      changes: Array<{ objectId: string; action: string; changeType: string }>
      nextCursor: string
    }
    expect(after.changes.some((change) => change.objectId === folder.id && change.action === 'created')).toBe(true)
  })
})
