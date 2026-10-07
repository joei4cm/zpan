import { and, desc, eq } from 'drizzle-orm'
import { generateId } from '../../../shared/ids'
import {
  orgQuotaEntitlements,
  storeCustomers,
  storeGiftCards,
  storeOrders,
  storeProducts,
  webhookEvents,
} from '../../db/schema'
import type { Database } from '../../platform/interface'
import type {
  LocalStoreRepo,
  StoreBillingInterval,
  StoreGiftCard,
  StoreOrder,
  StoreProduct,
} from '../../usecases/ports'

function toProduct(row: typeof storeProducts.$inferSelect): StoreProduct {
  return {
    ...row,
    kind: 'plan',
    interval: (row.interval as StoreBillingInterval | null) ?? null,
  }
}

function toGiftCard(row: typeof storeGiftCards.$inferSelect): StoreGiftCard {
  return {
    ...row,
    status: row.status as StoreGiftCard['status'],
  }
}

function toOrder(row: typeof storeOrders.$inferSelect): StoreOrder {
  return {
    ...row,
    interval: (row.interval as StoreBillingInterval | null) ?? null,
    status: row.status as StoreOrder['status'],
  }
}

export function createLocalStoreRepo(db: Database): LocalStoreRepo {
  return {
    async listProducts(opts) {
      const rows = await db.select().from(storeProducts).orderBy(storeProducts.sortOrder, desc(storeProducts.createdAt))
      return rows.filter((row) => (opts?.activeOnly ? row.active : true)).map(toProduct)
    },
    async getProduct(id) {
      const rows = await db.select().from(storeProducts).where(eq(storeProducts.id, id)).limit(1)
      return rows[0] ? toProduct(rows[0]) : null
    },
    async createProduct(input) {
      const now = new Date()
      const rows = await db
        .insert(storeProducts)
        .values({
          id: generateId(),
          name: input.name,
          description: input.description,
          kind: 'plan',
          storageBytes: input.storageBytes,
          amountCents: input.amountCents,
          currency: input.currency,
          interval: input.interval,
          active: input.active,
          sortOrder: input.sortOrder,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      return toProduct(rows[0])
    },
    async updateProduct(id, patch) {
      const rows = await db
        .update(storeProducts)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(storeProducts.id, id))
        .returning()
      return rows[0] ? toProduct(rows[0]) : null
    },
    async deleteProduct(id) {
      const rows = await db.delete(storeProducts).where(eq(storeProducts.id, id)).returning({ id: storeProducts.id })
      return rows.length > 0
    },

    async createGiftCards(input) {
      const now = new Date()
      const rows = await db
        .insert(storeGiftCards)
        .values(
          input.codes.map((code) => ({
            id: generateId(),
            codeHash: code.codeHash,
            codeLast4: code.codeLast4,
            storageBytes: input.storageBytes,
            status: 'active',
            expiresAt: input.expiresAt,
            note: input.note,
            createdBy: input.createdBy,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .returning()
      return rows.map(toGiftCard)
    },
    async listGiftCards() {
      const rows = await db.select().from(storeGiftCards).orderBy(desc(storeGiftCards.createdAt))
      return rows.map(toGiftCard)
    },
    async findGiftCardByCodeHash(codeHash) {
      const rows = await db.select().from(storeGiftCards).where(eq(storeGiftCards.codeHash, codeHash)).limit(1)
      return rows[0] ? toGiftCard(rows[0]) : null
    },
    async redeemGiftCard(id, orgId) {
      const now = new Date()
      const rows = await db
        .update(storeGiftCards)
        .set({
          status: 'redeemed',
          redeemedOrgId: orgId,
          redeemedAt: now,
          updatedAt: now,
        })
        .where(and(eq(storeGiftCards.id, id), eq(storeGiftCards.status, 'active')))
        .returning()
      return rows[0] ? toGiftCard(rows[0]) : null
    },
    async disableGiftCard(id) {
      const rows = await db
        .update(storeGiftCards)
        .set({ status: 'disabled', updatedAt: new Date() })
        .where(and(eq(storeGiftCards.id, id), eq(storeGiftCards.status, 'active')))
        .returning()
      return rows[0] ? toGiftCard(rows[0]) : null
    },

    async createOrder(input) {
      const now = new Date()
      const rows = await db
        .insert(storeOrders)
        .values({
          id: generateId(),
          ...input,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      return toOrder(rows[0])
    },
    async listOrders(orgId) {
      const rows = await db
        .select()
        .from(storeOrders)
        .where(eq(storeOrders.orgId, orgId))
        .orderBy(desc(storeOrders.createdAt))
      return rows.map(toOrder)
    },
    async getOrder(id) {
      const rows = await db.select().from(storeOrders).where(eq(storeOrders.id, id)).limit(1)
      return rows[0] ? toOrder(rows[0]) : null
    },
    async getOrderByStripeSessionId(sessionId) {
      const rows = await db.select().from(storeOrders).where(eq(storeOrders.stripeSessionId, sessionId)).limit(1)
      return rows[0] ? toOrder(rows[0]) : null
    },
    async getOrderByStripeSubscriptionId(subscriptionId) {
      const rows = await db
        .select()
        .from(storeOrders)
        .where(eq(storeOrders.stripeSubscriptionId, subscriptionId))
        .limit(1)
      return rows[0] ? toOrder(rows[0]) : null
    },
    async updateOrder(id, patch) {
      const rows = await db
        .update(storeOrders)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(storeOrders.id, id))
        .returning()
      return rows[0] ? toOrder(rows[0]) : null
    },

    async getCustomer(orgId) {
      const rows = await db.select().from(storeCustomers).where(eq(storeCustomers.orgId, orgId)).limit(1)
      return rows[0] ?? null
    },
    async upsertCustomer(orgId, stripeCustomerId) {
      const now = new Date()
      const existing = await db
        .select({ orgId: storeCustomers.orgId })
        .from(storeCustomers)
        .where(eq(storeCustomers.orgId, orgId))
        .limit(1)
      if (existing[0]) {
        await db.update(storeCustomers).set({ stripeCustomerId, updatedAt: now }).where(eq(storeCustomers.orgId, orgId))
        return
      }
      await db.insert(storeCustomers).values({ orgId, stripeCustomerId, createdAt: now, updatedAt: now })
    },

    async grantStorage(input) {
      const now = new Date()
      const existing = await db
        .select({ id: orgQuotaEntitlements.id })
        .from(orgQuotaEntitlements)
        .where(
          and(
            eq(orgQuotaEntitlements.source, input.source),
            eq(orgQuotaEntitlements.sourceId, input.sourceId),
            eq(orgQuotaEntitlements.resourceType, 'storage'),
          ),
        )
        .limit(1)
      const metadata = JSON.stringify({ packageName: input.packageName, source: input.source })
      if (existing[0]) {
        await db
          .update(orgQuotaEntitlements)
          .set({
            bytes: input.bytes,
            entitlementType: input.entitlementType,
            status: 'active',
            expiresAt: input.expiresAt ?? null,
            metadata,
            updatedAt: now,
          })
          .where(eq(orgQuotaEntitlements.id, existing[0].id))
        return
      }
      await db.insert(orgQuotaEntitlements).values({
        id: generateId(),
        orgId: input.orgId,
        resourceType: 'storage',
        entitlementType: input.entitlementType,
        source: input.source,
        sourceId: input.sourceId,
        bytes: input.bytes,
        startsAt: now,
        expiresAt: input.expiresAt ?? null,
        status: 'active',
        metadata,
        createdAt: now,
        updatedAt: now,
      })
    },
    async revokeStorage(source, sourceId) {
      await db
        .update(orgQuotaEntitlements)
        .set({ status: 'revoked', updatedAt: new Date() })
        .where(
          and(
            eq(orgQuotaEntitlements.source, source),
            eq(orgQuotaEntitlements.sourceId, sourceId),
            eq(orgQuotaEntitlements.resourceType, 'storage'),
          ),
        )
    },

    async beginStripeWebhookEvent(input) {
      const id = generateId()
      const inserted = await db
        .insert(webhookEvents)
        .values({
          id,
          source: 'stripe',
          eventId: input.eventId,
          eventType: input.eventType,
          payloadHash: input.payloadHash,
          rawPayload: input.rawPayload,
          status: 'processing',
          createdAt: new Date(),
        })
        .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.eventId] })
        .returning({ id: webhookEvents.id })
      if (inserted[0]) return { id: inserted[0].id, duplicate: false }

      const existing = await db
        .select({
          id: webhookEvents.id,
          payloadHash: webhookEvents.payloadHash,
          status: webhookEvents.status,
        })
        .from(webhookEvents)
        .where(and(eq(webhookEvents.source, 'stripe'), eq(webhookEvents.eventId, input.eventId)))
        .limit(1)
      const row = existing[0]
      if (!row) throw new Error('webhook_event_conflict')
      if (row.payloadHash !== input.payloadHash) throw new Error('webhook_payload_conflict')
      if (row.status === 'processed' || row.status === 'duplicate') {
        return { id: row.id, duplicate: true }
      }
      // Resume failed or stuck processing events so Stripe retries can finish grant.
      await db
        .update(webhookEvents)
        .set({ rawPayload: input.rawPayload, status: 'processing', error: null, processedAt: null })
        .where(eq(webhookEvents.id, row.id))
      return { id: row.id, duplicate: false }
    },

    async markStripeWebhookEvent(id, status, error = null) {
      await db.update(webhookEvents).set({ status, error, processedAt: new Date() }).where(eq(webhookEvents.id, id))
    },
  }
}
