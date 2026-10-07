import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { generateId } from '../../../shared/ids'
import { syncDevices, syncObjectChanges } from '../../db/schema'
import type { Database } from '../../platform/interface'
import type { SyncDeviceRecord, SyncObjectChangeRecord, SyncRepo } from '../../usecases/ports'

type DeviceRow = typeof syncDevices.$inferSelect
type ChangeRow = typeof syncObjectChanges.$inferSelect

function toDevice(row: DeviceRow): SyncDeviceRecord {
  return {
    id: row.id,
    userId: row.userId,
    orgId: row.orgId,
    name: row.name,
    platform: row.platform,
    appVersion: row.appVersion,
    tokenHash: row.tokenHash,
    status: row.status as SyncDeviceRecord['status'],
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toChange(row: ChangeRow): SyncObjectChangeRecord {
  return {
    sequence: row.sequence,
    orgId: row.orgId,
    objectId: row.objectId,
    parent: row.parent,
    name: row.name,
    action: row.action,
    changeType: row.changeType as SyncObjectChangeRecord['changeType'],
    actorDeviceId: row.actorDeviceId,
    metadata: row.metadata,
    occurredAt: row.occurredAt,
  }
}

export function syncObjectChangeQuery(
  db: Database,
  input: {
    orgId: string
    objectId: string
    parent?: string
    name?: string
    action: string
    changeType: 'upsert' | 'delete'
    actorDeviceId?: string | null
    occurredAt: Date
  },
) {
  return db.insert(syncObjectChanges).values({
    orgId: input.orgId,
    objectId: input.objectId,
    parent: input.parent ?? '',
    name: input.name ?? '',
    action: input.action,
    changeType: input.changeType,
    actorDeviceId: input.actorDeviceId ?? null,
    metadata: null,
    occurredAt: input.occurredAt,
  })
}

export function createSyncRepo(db: Database): SyncRepo {
  return {
    async createDevice(input) {
      const now = new Date()
      const row: DeviceRow = {
        id: generateId(),
        userId: input.userId,
        orgId: input.orgId,
        name: input.name,
        platform: input.platform,
        appVersion: input.appVersion,
        tokenHash: input.tokenHash,
        status: 'active',
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      }
      await db.insert(syncDevices).values(row)
      return toDevice(row)
    },

    async listDevices(userId) {
      const rows = await db
        .select()
        .from(syncDevices)
        .where(eq(syncDevices.userId, userId))
        .orderBy(asc(syncDevices.createdAt))
      return rows.map(toDevice)
    },

    async getDevice(id) {
      const rows = await db.select().from(syncDevices).where(eq(syncDevices.id, id)).limit(1)
      return rows[0] ? toDevice(rows[0]) : null
    },

    async findDeviceByTokenHash(tokenHash) {
      const rows = await db
        .select()
        .from(syncDevices)
        .where(and(eq(syncDevices.tokenHash, tokenHash), eq(syncDevices.status, 'active')))
        .limit(1)
      return rows[0] ? toDevice(rows[0]) : null
    },

    async revokeDevice(id, userId) {
      const now = new Date()
      const updated = await db
        .update(syncDevices)
        .set({ status: 'revoked', updatedAt: now, tokenHash: `revoked:${id}:${now.getTime()}` })
        .where(and(eq(syncDevices.id, id), eq(syncDevices.userId, userId), eq(syncDevices.status, 'active')))
        .returning({ id: syncDevices.id })
      return updated.length > 0
    },

    async heartbeat(id, patch) {
      const existing = await this.getDevice(id)
      if (!existing || existing.status !== 'active') return null
      const now = new Date()
      const next = {
        name: patch.name ?? existing.name,
        platform: patch.platform ?? existing.platform,
        appVersion: patch.appVersion ?? existing.appVersion,
        lastSeenAt: now,
        updatedAt: now,
      }
      await db.update(syncDevices).set(next).where(eq(syncDevices.id, id))
      return { ...existing, ...next }
    },

    async listChangesAfter(opts) {
      const rows = await db
        .select()
        .from(syncObjectChanges)
        .where(and(eq(syncObjectChanges.orgId, opts.orgId), gt(syncObjectChanges.sequence, opts.cursor)))
        .orderBy(asc(syncObjectChanges.sequence))
        .limit(opts.limit)
      return rows.map(toChange)
    },

    async oldestSequence(orgId) {
      const rows = await db
        .select({ sequence: sql<number>`MIN(${syncObjectChanges.sequence})` })
        .from(syncObjectChanges)
        .where(eq(syncObjectChanges.orgId, orgId))
      const value = rows[0]?.sequence
      return value == null ? null : Number(value)
    },
  }
}
