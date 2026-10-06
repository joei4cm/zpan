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
  const grants: Array<{ orgId: string; bytes: number; source: string; sourceId: string }> = []
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
      grants.push({ orgId: input.orgId, bytes: input.bytes, source: input.source, sourceId: input.sourceId })
    },
    revokeStorage: async () => undefined,
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
  return { deps: { localStore, quota, stripe }, grants, orders, stripe }
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
    expect(grants).toEqual([{ orgId: 'org-1', bytes: 5 * 1024 ** 3, source: 'gift_card', sourceId: 'gift_card:gc-1' }])
  })

  it('grants storage when Stripe checkout completes [spec: local-commerce/stripe-webhook-grants-storage]', async () => {
    const pending = order()
    const { deps, grants } = makeStore({ orders: [pending] })
    const payload = JSON.stringify({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_1', subscription: 'sub_1', customer: 'cus_1', metadata: { orderId: 'ord-1' } } },
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
})
