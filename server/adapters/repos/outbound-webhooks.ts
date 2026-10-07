import type { OutboundWebhookEndpointPatch } from '@shared/schemas'
import { and, asc, count, desc, eq, getTableColumns, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { generateId } from '../../../shared/ids'
import { outboundWebhookDeliveries, outboundWebhookEndpoints } from '../../db/schema'
import type { Database } from '../../platform/interface'
import type {
  OutboundWebhookDeliveryRecord,
  OutboundWebhookDeliveryStatus,
  OutboundWebhookEndpointRecord,
  OutboundWebhookRepo,
} from '../../usecases/ports'

type EndpointRow = typeof outboundWebhookEndpoints.$inferSelect
type DeliveryRow = typeof outboundWebhookDeliveries.$inferSelect

function parseEventTypes(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function toEndpoint(row: EndpointRow): OutboundWebhookEndpointRecord {
  return {
    id: row.id,
    url: row.url,
    description: row.description,
    secret: row.secret,
    enabled: row.enabled,
    eventTypes: parseEventTypes(row.eventTypes),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toDelivery(row: DeliveryRow): OutboundWebhookDeliveryRecord {
  return {
    id: row.id,
    endpointId: row.endpointId,
    eventType: row.eventType,
    idempotencyKey: row.idempotencyKey,
    payloadJson: row.payloadJson,
    status: row.status as OutboundWebhookDeliveryStatus,
    attemptCount: row.attemptCount,
    nextAttemptAt: row.nextAttemptAt,
    lastStatusCode: row.lastStatusCode,
    lastError: row.lastError,
    createdAt: row.createdAt,
    deliveredAt: row.deliveredAt,
  }
}

function pageParams(page: number, pageSize: number) {
  return { limit: pageSize, offset: (page - 1) * pageSize }
}

export function createOutboundWebhookRepo(db: Database): OutboundWebhookRepo {
  return {
    async createEndpoint(input, createdBy, secret) {
      const now = new Date()
      const row: EndpointRow = {
        id: generateId(),
        url: input.url,
        description: input.description ?? '',
        secret,
        enabled: input.enabled ?? true,
        eventTypes: JSON.stringify(input.eventTypes),
        createdBy,
        createdAt: now,
        updatedAt: now,
      }
      await db.insert(outboundWebhookEndpoints).values(row)
      return toEndpoint(row)
    },

    async listEndpoints(opts) {
      const { limit, offset } = pageParams(opts.page, opts.pageSize)
      const rows = await db
        .select({
          ...getTableColumns(outboundWebhookEndpoints),
          pageTotal: sql<number>`COUNT(*) OVER()`.as('page_total'),
        })
        .from(outboundWebhookEndpoints)
        .orderBy(desc(outboundWebhookEndpoints.createdAt))
        .limit(limit)
        .offset(offset)
      let total = Number(rows[0]?.pageTotal ?? 0)
      if (rows.length === 0 && opts.page > 1) {
        const totalRows = await db.select({ count: count() }).from(outboundWebhookEndpoints)
        total = totalRows[0]?.count ?? 0
      }
      return {
        items: rows.map(({ pageTotal: _, ...row }) => toEndpoint(row)),
        total,
        page: opts.page,
        pageSize: opts.pageSize,
      }
    },

    async getEndpoint(id) {
      const rows = await db.select().from(outboundWebhookEndpoints).where(eq(outboundWebhookEndpoints.id, id)).limit(1)
      return rows[0] ? toEndpoint(rows[0]) : null
    },

    async updateEndpoint(id, patch: OutboundWebhookEndpointPatch) {
      const existing = await this.getEndpoint(id)
      if (!existing) return null
      const now = new Date()
      const next: EndpointRow = {
        id: existing.id,
        url: patch.url ?? existing.url,
        description: patch.description ?? existing.description,
        secret: existing.secret,
        enabled: patch.enabled ?? existing.enabled,
        eventTypes: JSON.stringify(patch.eventTypes ?? existing.eventTypes),
        createdBy: existing.createdBy,
        createdAt: existing.createdAt,
        updatedAt: now,
      }
      await db.update(outboundWebhookEndpoints).set(next).where(eq(outboundWebhookEndpoints.id, id))
      return toEndpoint(next)
    },

    async rotateSecret(id, secret) {
      const existing = await this.getEndpoint(id)
      if (!existing) return null
      const now = new Date()
      await db
        .update(outboundWebhookEndpoints)
        .set({ secret, updatedAt: now })
        .where(eq(outboundWebhookEndpoints.id, id))
      return { ...existing, secret, updatedAt: now }
    },

    async deleteEndpoint(id) {
      const deleted = await db.delete(outboundWebhookEndpoints).where(eq(outboundWebhookEndpoints.id, id)).returning({
        id: outboundWebhookEndpoints.id,
      })
      if (deleted.length === 0) return false
      await db.delete(outboundWebhookDeliveries).where(eq(outboundWebhookDeliveries.endpointId, id))
      return true
    },

    async listEnabledForEvent(eventType) {
      const rows = await db.select().from(outboundWebhookEndpoints).where(eq(outboundWebhookEndpoints.enabled, true))
      return rows.map(toEndpoint).filter((endpoint) => endpoint.eventTypes.includes(eventType))
    },

    async insertDelivery(input) {
      const now = new Date()
      const row: DeliveryRow = {
        id: generateId(),
        endpointId: input.endpointId,
        eventType: input.eventType,
        idempotencyKey: input.idempotencyKey,
        payloadJson: input.payloadJson,
        status: 'pending',
        attemptCount: 0,
        nextAttemptAt: input.nextAttemptAt,
        lastStatusCode: null,
        lastError: null,
        createdAt: now,
        deliveredAt: null,
      }
      try {
        await db.insert(outboundWebhookDeliveries).values(row)
        return toDelivery(row)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/unique|UNIQUE/i.test(message)) return null
        throw error
      }
    },

    async updateDeliveryPayload(id, payloadJson) {
      await db.update(outboundWebhookDeliveries).set({ payloadJson }).where(eq(outboundWebhookDeliveries.id, id))
    },

    async listDeliveries(opts) {
      const { limit, offset } = pageParams(opts.page, opts.pageSize)
      const filters = []
      if (opts.endpointId) filters.push(eq(outboundWebhookDeliveries.endpointId, opts.endpointId))
      if (opts.status) filters.push(eq(outboundWebhookDeliveries.status, opts.status))
      const where = filters.length > 0 ? and(...filters) : undefined
      const rows = await db
        .select({
          ...getTableColumns(outboundWebhookDeliveries),
          pageTotal: sql<number>`COUNT(*) OVER()`.as('page_total'),
        })
        .from(outboundWebhookDeliveries)
        .where(where)
        .orderBy(desc(outboundWebhookDeliveries.createdAt))
        .limit(limit)
        .offset(offset)
      let total = Number(rows[0]?.pageTotal ?? 0)
      if (rows.length === 0 && opts.page > 1) {
        const totalRows = await db.select({ count: count() }).from(outboundWebhookDeliveries).where(where)
        total = totalRows[0]?.count ?? 0
      }
      return {
        items: rows.map(({ pageTotal: _, ...row }) => toDelivery(row)),
        total,
        page: opts.page,
        pageSize: opts.pageSize,
      }
    },

    async claimDueDeliveries(limit, now) {
      const due = await db
        .select()
        .from(outboundWebhookDeliveries)
        .where(
          and(
            inArray(outboundWebhookDeliveries.status, ['pending', 'failed']),
            or(lte(outboundWebhookDeliveries.nextAttemptAt, now), isNull(outboundWebhookDeliveries.nextAttemptAt)),
          ),
        )
        .orderBy(asc(outboundWebhookDeliveries.nextAttemptAt), asc(outboundWebhookDeliveries.createdAt))
        .limit(limit)

      const claimed: OutboundWebhookDeliveryRecord[] = []
      for (const row of due) {
        await db
          .update(outboundWebhookDeliveries)
          .set({ status: 'delivering' })
          .where(
            and(
              eq(outboundWebhookDeliveries.id, row.id),
              inArray(outboundWebhookDeliveries.status, ['pending', 'failed']),
            ),
          )
        claimed.push(toDelivery({ ...row, status: 'delivering' }))
      }
      return claimed
    },

    async markDeliveryResult(id, result) {
      await db
        .update(outboundWebhookDeliveries)
        .set({
          status: result.status,
          attemptCount: result.attemptCount,
          nextAttemptAt: result.nextAttemptAt,
          lastStatusCode: result.lastStatusCode,
          lastError: result.lastError,
          deliveredAt: result.deliveredAt,
        })
        .where(eq(outboundWebhookDeliveries.id, id))
    },
  }
}
