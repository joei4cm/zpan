import { and, asc, eq } from 'drizzle-orm'
import { generateId } from '../../../shared/ids'
import { musicAppCredentials } from '../../db/schema'
import type { Database } from '../../platform/interface'
import type { MusicAppCredentialRecord, MusicAppCredentialRepo } from '../../usecases/ports'

type Row = typeof musicAppCredentials.$inferSelect

function toRecord(row: Row): MusicAppCredentialRecord {
  return {
    id: row.id,
    userId: row.userId,
    orgId: row.orgId,
    username: row.username,
    token: row.token,
    label: row.label,
    status: row.status as MusicAppCredentialRecord['status'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastUsedAt: row.lastUsedAt,
  }
}

export function createMusicAppCredentialRepo(db: Database): MusicAppCredentialRepo {
  return {
    async create(input) {
      const now = new Date()
      const row: Row = {
        id: generateId(),
        userId: input.userId,
        orgId: input.orgId,
        username: input.username,
        token: input.token,
        label: input.label,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        lastUsedAt: null,
      }
      await db.insert(musicAppCredentials).values(row)
      return toRecord(row)
    },

    async listByUser(userId) {
      const rows = await db
        .select()
        .from(musicAppCredentials)
        .where(eq(musicAppCredentials.userId, userId))
        .orderBy(asc(musicAppCredentials.createdAt))
      return rows.map(toRecord)
    },

    async findByUsername(username) {
      const rows = await db
        .select()
        .from(musicAppCredentials)
        .where(and(eq(musicAppCredentials.username, username), eq(musicAppCredentials.status, 'active')))
        .limit(1)
      return rows[0] ? toRecord(rows[0]) : null
    },

    async revoke(id, userId) {
      const now = new Date()
      const updated = await db
        .update(musicAppCredentials)
        .set({ status: 'revoked', updatedAt: now, token: `revoked:${id}:${now.getTime()}` })
        .where(
          and(
            eq(musicAppCredentials.id, id),
            eq(musicAppCredentials.userId, userId),
            eq(musicAppCredentials.status, 'active'),
          ),
        )
        .returning({ id: musicAppCredentials.id })
      return updated.length > 0
    },

    async touchLastUsed(id) {
      const now = new Date()
      await db
        .update(musicAppCredentials)
        .set({ lastUsedAt: now, updatedAt: now })
        .where(eq(musicAppCredentials.id, id))
    },
  }
}
