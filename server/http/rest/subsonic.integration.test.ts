import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { adminHeaders, createTestApp } from '../../test/setup.js'

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

describe('Subsonic REST foundation', () => {
  it('creates a music credential and answers ping/getArtists with token auth', async () => {
    const { app, db } = await createTestApp()
    const headers = await adminHeaders(app)
    const orgId = await personalOrgId(db)

    const createRes = await app.request('/api/music/credentials', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, label: 'Phone', username: 'musicuser' }),
    })
    expect(createRes.status).toBe(201)
    const created = (await createRes.json()) as { username: string; token?: string }
    expect(created.username).toBe('musicuser')
    expect(created.token).toBeTruthy()

    const salt = 'xyz'
    const token = createHash('md5').update(`${created.token}${salt}`).digest('hex')
    const ping = await app.request(`/rest/ping.view?u=musicuser&t=${token}&s=${salt}&f=json&v=1.16.1&c=test`)
    expect(ping.status).toBe(200)
    const pingBody = (await ping.json()) as { 'subsonic-response': { status: string; type: string } }
    expect(pingBody['subsonic-response'].status).toBe('ok')
    expect(pingBody['subsonic-response'].type).toBe('ZPan')

    const artists = await app.request(`/rest/getArtists.view?u=musicuser&p=${created.token}&f=json&v=1.16.1&c=test`)
    expect(artists.status).toBe(200)
    const artistsBody = (await artists.json()) as {
      'subsonic-response': { status: string; artists: { index: unknown[] } }
    }
    expect(artistsBody['subsonic-response'].status).toBe('ok')
    expect(artistsBody['subsonic-response'].artists.index).toEqual([])

    const bad = await app.request('/rest/ping.view?u=musicuser&p=wrong&f=json&v=1.16.1&c=test')
    const badBody = (await bad.json()) as { 'subsonic-response': { status: string; error: { code: number } } }
    expect(badBody['subsonic-response'].status).toBe('failed')
    expect(badBody['subsonic-response'].error.code).toBe(40)
  })
})
