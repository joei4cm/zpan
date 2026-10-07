import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerFeatureUnlock } from '../../domain/licensing'
import type { LocalStoreRepo, QuotaRepo, StoreGiftCard, StoreOrder, StoreProduct, StripeGateway } from '../ports'
import { createLocalCheckout, listLocalPackages, processStripeWebhook, redeemLocalGiftCard } from './local-commerce'

function product(overrides: Partial<StoreProduct> = {}): StoreProduct {
  const now = new Date('2026-10-06T00:00:00.000Z')
  return {
    id: 'pkg-1',
    name: 'Pro',
    description: '',
    kind: 'plan',
    storageBytes: 10 * 1024 ** 3,
    trafficBytes: 0,
    amountCents: 999,
    currency: 'usd',
    interval: 'month',
    active: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function order(overrides: Partial<StoreOrder> = {}): StoreOrder {
  const now = new Date('2026-10-06T00:00:00.000Z')
  return {
    id: 'ord-1',
    orgId: 'org-1',
    userId: 'user-1',
    productId: 'pkg-1',
    productName: 'Pro',
    storageBytes: 10 * 1024 ** 3,
    trafficBytes: 0,
    amountCents: 999,
    currency: 'usd',
    interval: 'month',
    status: 'pending',
    stripeSessionId: 'cs_test_1',
    stripeSubscriptionId: null,
    stripeCustomerId: 'cus_1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeStore(options: { products?: StoreProduct[]; orders?: StoreOrder[]; giftCards?: StoreGiftCard[] } = {}) {
  const products = options.products ?? [product()]
  const orders = options.orders ?? []
  const giftCards = options.giftCards ?? []
  const grants: Array<{ orgId: string; bytes: number; source: string; sourceId: string; resource: string }> = []
  const revokes: Array<{ source: string; sourceId: string }> = []
  const webhookEvents = new Map<string, { id: string; status: string; payloadHash: string }>()
  const localStore: LocalStoreRepo = {
    listProducts: async ({ activeOnly } = {}) => products.filter((item) => (activeOnly ? item.active : true)),
    getProduct: async (id) => products.find((item) => item.id === id) ?? null,
    createProduct: async () => product(),
    updateProduct: async () => product(),
    deleteProduct: async () => true,
    createGiftCards: async () => giftCards,
    listGiftCards: async () => giftCards,
    findGiftCardByCodeHash: async (codeHash) => giftCards.find((item) => item.codeHash === codeHash) ?? null,
    redeemGiftCard: async (id, orgId) => {
      const card = giftCards.find((item) => item.id === id && item.status === 'active')
      if (!card) return null
      card.status = 'redeemed'
      card.redeemedOrgId = orgId
      card.redeemedAt = new Date()
      return card
    },
    disableGiftCard: async () => giftCards[0] ?? null,
    createOrder: async (input) => {
      const created = order({ ...input, id: 'ord-new', status: 'pending' })
      orders.push(created)
      return created
    },
    listOrders: async (orgId) => orders.filter((item) => item.orgId === orgId),
    getOrder: async (id) => orders.find((item) => item.id === id) ?? null,
    getOrderByStripeSessionId: async (sessionId) => orders.find((item) => item.stripeSessionId === sessionId) ?? null,
    getOrderByStripeSubscriptionId: async (subscriptionId) =>
      orders.find((item) => item.stripeSubscriptionId === subscriptionId) ?? null,
    updateOrder: async (id, patch) => {
      const current = orders.find((item) => item.id === id)
      if (!current) return null
      Object.assign(current, patch)
      return current
    },
    getCustomer: async () => ({ orgId: 'org-1', stripeCustomerId: 'cus_1' }),
    upsertCustomer: async () => undefined,
    grantStorage: async (input) => {
      grants.push({
        orgId: input.orgId,
        bytes: input.bytes,
        source: input.source,
        sourceId: input.sourceId,
        resource: 'storage',
      })
    },
    grantTraffic: async (input) => {
      grants.push({
        orgId: input.orgId,
        bytes: input.bytes,
        source: input.source,
        sourceId: input.sourceId,
        resource: 'traffic',
      })
    },
    revokeStorage: async (source, sourceId) => {
      revokes.push({ source, sourceId })
    },
    beginStripeWebhookEvent: async (input) => {
      const existing = webhookEvents.get(input.eventId)
      if (!existing) {
        const id = `wh_${webhookEvents.size + 1}`
        webhookEvents.set(input.eventId, { id, status: 'processing', payloadHash: input.payloadHash })
        return { id, duplicate: false }
      }
      if (existing.payloadHash !== input.payloadHash) throw new Error('webhook_payload_conflict')
      if (existing.status === 'processed' || existing.status === 'duplicate') {
        return { id: existing.id, duplicate: true }
      }
      existing.status = 'processing'
      return { id: existing.id, duplicate: false }
    },
    markStripeWebhookEvent: async (id, status) => {
      for (const event of webhookEvents.values()) {
        if (event.id === id) event.status = status
      }
    },
  }
  const quota = {
    getEffectiveQuota: async () => ({ currentPlan: null }),
  } as unknown as QuotaRepo
  const stripe = {
    createCustomer: vi.fn(),
    createCheckoutSession: vi.fn(async () => ({ id: 'cs_new', url: 'https://stripe.test/c' })),
    createPortalSession: vi.fn(),
    expireCheckoutSession: vi.fn(),
    verifySignature: vi.fn(async () => true),
  } as unknown as StripeGateway
  return { deps: { localStore, quota, stripe }, grants, revokes, orders, stripe, webhookEvents }
}

describe('local commerce', () => {
  beforeEach(() => {
    registerFeatureUnlock('true')
    vi.clearAllMocks()
  })

  it('lists active local packages [spec: local-commerce/packages-from-catalog]', async () => {
    const { deps } = makeStore()
    const result = await listLocalPackages(deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.total).toBe(1)
    expect((result.value.items[0] as { name: string }).name).toBe('Pro')
  })

  it('creates a Stripe checkout for a local package', async () => {
    const { deps } = makeStore()
    const result = await createLocalCheckout(deps, {
      userId: 'user-1',
      orgId: 'org-1',
      origin: 'https://files.example',
      packageId: 'pkg-1',
      customerLabel: 'buyer@example.com',
      stripe: { secretKey: 'sk_test' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({ orderId: 'ord-new', url: 'https://stripe.test/c', paymentId: 'cs_new' })
  })

  it('grants storage when a gift card is redeemed [spec: local-commerce/gift-card-grants-storage]', async () => {
    const code = 'ZS-ABCD-EFGH'
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
    const codeHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    const now = new Date()
    const { deps, grants } = makeStore({
      giftCards: [
        {
          id: 'gc-1',
          codeHash,
          codeLast4: 'EFGH',
          storageBytes: 5 * 1024 ** 3,
          trafficBytes: 0,
          status: 'active',
          expiresAt: null,
          redeemedOrgId: null,
          redeemedAt: null,
          note: null,
          createdBy: 'admin-1',
          createdAt: now,
          updatedAt: now,
        },
      ],
    })
    const result = await redeemLocalGiftCard(deps, { orgId: 'org-1', code })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({ redeemedStorageBytes: 5 * 1024 ** 3, failures: [] })
    expect(grants).toEqual([
      {
        orgId: 'org-1',
        bytes: 5 * 1024 ** 3,
        source: 'gift_card',
        sourceId: 'gift_card:gc-1',
        resource: 'storage',
      },
    ])
  })

  it('grants traffic when Stripe checkout completes for a traffic package', async () => {
    const pending = order({ storageBytes: 0, trafficBytes: 100 * 1024 ** 3 })
    const { deps, grants } = makeStore({ orders: [pending] })
    const payload = JSON.stringify({
      id: 'evt_traffic',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          payment_status: 'paid',
          customer: 'cus_1',
          metadata: { orderId: 'ord-1' },
        },
      },
    })
    const result = await processStripeWebhook(deps, {
      rawPayload: payload,
      signature: 't=1,v1=abc',
      webhookSecret: 'whsec_test',
    })
    expect(result).toEqual({ ok: true, duplicate: false, eventId: 'evt_traffic' })
    expect(grants).toEqual([
      {
        orgId: 'org-1',
        bytes: 100 * 1024 ** 3,
        source: 'stripe',
        sourceId: 'stripe:ord-1',
        resource: 'traffic',
      },
    ])
  })

  it('grants storage when Stripe checkout completes [spec: local-commerce/stripe-webhook-grants-storage]', async () => {
    const pending = order()
    const { deps, grants } = makeStore({ orders: [pending] })
    const payload = JSON.stringify({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          payment_status: 'paid',
          subscription: 'sub_1',
          customer: 'cus_1',
          metadata: { orderId: 'ord-1' },
        },
      },
    })
    const result = await processStripeWebhook(deps, {
      rawPayload: payload,
      signature: 't=1,v1=abc',
      webhookSecret: 'whsec_test',
    })
    expect(result).toEqual({ ok: true, duplicate: false, eventId: 'evt_1' })
    expect(pending.status).toBe('paid')
    expect(grants[0]).toMatchObject({
      orgId: 'org-1',
      source: 'stripe',
      sourceId: 'stripe_subscription:sub_1:org-1',
    })
  })

  it('does not grant storage when checkout.session.completed is unpaid', async () => {
    const pending = order()
    const { deps, grants } = makeStore({ orders: [pending] })
    const payload = JSON.stringify({
      id: 'evt_unpaid',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          payment_status: 'unpaid',
          subscription: 'sub_1',
          customer: 'cus_1',
          metadata: { orderId: 'ord-1' },
        },
      },
    })
    const result = await processStripeWebhook(deps, {
      rawPayload: payload,
      signature: 't=1,v1=abc',
      webhookSecret: 'whsec_test',
    })
    expect(result).toEqual({ ok: true, duplicate: true, eventId: 'evt_unpaid' })
    expect(pending.status).toBe('pending')
    expect(grants).toEqual([])
  })

  it('grants storage on async_payment_succeeded when payment_status is paid', async () => {
    const pending = order()
    const { deps, grants } = makeStore({ orders: [pending] })
    const payload = JSON.stringify({
      id: 'evt_async',
      type: 'checkout.session.async_payment_succeeded',
      data: {
        object: {
          id: 'cs_test_1',
          payment_status: 'paid',
          customer: 'cus_1',
          metadata: { orderId: 'ord-1' },
        },
      },
    })
    const result = await processStripeWebhook(deps, {
      rawPayload: payload,
      signature: 't=1,v1=abc',
      webhookSecret: 'whsec_test',
    })
    expect(result).toEqual({ ok: true, duplicate: false, eventId: 'evt_async' })
    expect(pending.status).toBe('paid')
    expect(grants).toHaveLength(1)
  })

  it('retries fulfillment after a failed grant using durable webhook event status', async () => {
    const pending = order()
    const { deps, grants } = makeStore({ orders: [pending] })
    let failOnce = true
    const originalGrant = deps.localStore.grantStorage.bind(deps.localStore)
    deps.localStore.grantStorage = async (input) => {
      if (failOnce) {
        failOnce = false
        throw new Error('grant_failed')
      }
      return originalGrant(input)
    }

    const payload = JSON.stringify({
      id: 'evt_retry',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          payment_status: 'paid',
          subscription: 'sub_1',
          customer: 'cus_1',
          metadata: { orderId: 'ord-1' },
        },
      },
    })
    const first = await processStripeWebhook(deps, {
      rawPayload: payload,
      signature: 't=1,v1=abc',
      webhookSecret: 'whsec_test',
    })
    expect(first.ok).toBe(false)
    expect(grants).toEqual([])

    const second = await processStripeWebhook(deps, {
      rawPayload: payload,
      signature: 't=1,v1=abc',
      webhookSecret: 'whsec_test',
    })
    expect(second).toEqual({ ok: true, duplicate: false, eventId: 'evt_retry' })
    expect(pending.status).toBe('paid')
    expect(grants).toHaveLength(1)

    const third = await processStripeWebhook(deps, {
      rawPayload: payload,
      signature: 't=1,v1=abc',
      webhookSecret: 'whsec_test',
    })
    expect(third).toEqual({ ok: true, duplicate: true, eventId: 'evt_retry' })
    expect(grants).toHaveLength(1)
  })

  it('revokes storage when subscription becomes past_due', async () => {
    const paid = order({
      status: 'paid',
      stripeSubscriptionId: 'sub_1',
    })
    const { deps, revokes } = makeStore({ orders: [paid] })
    const payload = JSON.stringify({
      id: 'evt_past_due',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'past_due',
        },
      },
    })
    const result = await processStripeWebhook(deps, {
      rawPayload: payload,
      signature: 't=1,v1=abc',
      webhookSecret: 'whsec_test',
    })
    expect(result).toEqual({ ok: true, duplicate: false, eventId: 'evt_past_due' })
    expect(revokes).toEqual([{ source: 'stripe', sourceId: 'stripe_subscription:sub_1:org-1' }])
    expect(paid.status).toBe('paid')
  })

  it('re-grants storage when a past_due subscription becomes active again', async () => {
    const paid = order({
      status: 'paid',
      stripeSubscriptionId: 'sub_1',
    })
    const { deps, grants, revokes } = makeStore({ orders: [paid] })
    const pastDue = JSON.stringify({
      id: 'evt_past_due_2',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', status: 'past_due' } },
    })
    const active = JSON.stringify({
      id: 'evt_active_again',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', status: 'active' } },
    })
    await processStripeWebhook(deps, {
      rawPayload: pastDue,
      signature: 't=1,v1=abc',
      webhookSecret: 'whsec_test',
    })
    const result = await processStripeWebhook(deps, {
      rawPayload: active,
      signature: 't=1,v1=abc',
      webhookSecret: 'whsec_test',
    })
    expect(result).toEqual({ ok: true, duplicate: false, eventId: 'evt_active_again' })
    expect(revokes).toHaveLength(1)
    expect(grants).toEqual([
      {
        orgId: 'org-1',
        bytes: paid.storageBytes,
        source: 'stripe',
        sourceId: 'stripe_subscription:sub_1:org-1',
        resource: 'storage',
      },
    ])
  })

  it('dedupes Stripe webhook redelivery by event.id', async () => {
    const pending = order()
    const { deps, grants } = makeStore({ orders: [pending] })
    const payload = JSON.stringify({
      id: 'evt_dupe',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          payment_status: 'paid',
          subscription: 'sub_1',
          customer: 'cus_1',
          metadata: { orderId: 'ord-1' },
        },
      },
    })
    const first = await processStripeWebhook(deps, {
      rawPayload: payload,
      signature: 't=1,v1=abc',
      webhookSecret: 'whsec_test',
    })
    const second = await processStripeWebhook(deps, {
      rawPayload: payload,
      signature: 't=1,v1=abc',
      webhookSecret: 'whsec_test',
    })
    expect(first).toEqual({ ok: true, duplicate: false, eventId: 'evt_dupe' })
    expect(second).toEqual({ ok: true, duplicate: true, eventId: 'evt_dupe' })
    expect(grants).toHaveLength(1)
  })
})
