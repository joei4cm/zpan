import { isFeatureUnlockEnabled } from '../../domain/licensing'
import { emitOutboundEvent } from '../outbound-webhooks'
import {
  AppError,
  badGateway,
  badRequest,
  conflict,
  forbidden,
  type LocalStoreRepo,
  notFound,
  type OutboundWebhookRepo,
  type QuotaRepo,
  type StoreOrder,
  type StoreProduct,
  type StripeGateway,
} from '../ports'

export type LocalCommerceDeps = {
  localStore: LocalStoreRepo
  quota: QuotaRepo
  stripe: StripeGateway
  outboundWebhooks?: OutboundWebhookRepo
}

type StorefrontReadOutcome<T> = { ok: true; value: T } | { ok: false; error: AppError }

type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } }

export function usesLocalCommerce(): boolean {
  return isFeatureUnlockEnabled()
}

function priceIdFor(product: StoreProduct): string {
  return `price_${product.id}`
}

function toStoreProductDto(product: StoreProduct) {
  return {
    id: product.id,
    storeId: 'local',
    type: 'store_item',
    name: product.name,
    description: product.description,
    metadata: {
      deliverable: {
        type: 'zpan.plan' as const,
        storageBytes: product.storageBytes,
        trafficBytes: product.trafficBytes,
        includedCredits: product.creditAmount,
      },
    },
    prices: [
      {
        id: priceIdFor(product),
        currency: product.currency,
        amount: product.amountCents,
        recurring: product.interval ? { interval: product.interval, intervalCount: 1 } : undefined,
      },
    ],
    active: product.active,
    sortOrder: product.sortOrder,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  }
}

function toOrderDto(order: StoreOrder) {
  return {
    id: order.id,
    storeId: 'local',
    status: order.status === 'paid' ? 'paid' : order.status === 'canceled' ? 'canceled' : 'open',
    paymentStatus: order.status === 'paid' ? 'paid' : order.status === 'canceled' ? 'canceled' : 'unpaid',
    fulfillmentStatus: order.status === 'paid' ? 'fulfilled' : 'unfulfilled',
    subtotalAmount: order.amountCents,
    discountAmount: 0,
    totalAmount: order.amountCents,
    currency: order.currency,
    target: { orgId: order.orgId, customerId: order.orgId },
    items: [
      {
        id: order.id,
        orderId: order.id,
        productId: order.productId,
        productType: 'store_item',
        name: order.productName,
        quantity: 1,
        unitAmount: order.amountCents,
        totalAmount: order.amountCents,
        fulfillmentPayload: {
          deliverable: { type: 'zpan.plan', storageBytes: order.storageBytes, includedCredits: 0 },
        },
      },
    ],
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function giftCodeAlphabet(): string {
  return 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
}

function randomGiftCode(): string {
  const alphabet = giftCodeAlphabet()
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length])
  return `ZS-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`
}

function missingStripeSecret(): AppError {
  return new AppError(503, 'Stripe is not configured', { reason: 'STRIPE_NOT_CONFIGURED' })
}

async function grantOrderEntitlements(
  deps: LocalCommerceDeps,
  input: {
    orgId: string
    storageBytes: number
    trafficBytes: number
    creditAmount: number
    entitlementType: 'plan' | 'grant'
    source: string
    sourceId: string
    packageName: string
  },
): Promise<void> {
  if (input.storageBytes > 0) {
    await deps.localStore.grantStorage({
      orgId: input.orgId,
      bytes: input.storageBytes,
      entitlementType: input.entitlementType,
      source: input.source,
      sourceId: input.sourceId,
      packageName: input.packageName,
    })
  }
  if (input.trafficBytes > 0) {
    await deps.localStore.grantTraffic({
      orgId: input.orgId,
      bytes: input.trafficBytes,
      entitlementType: input.entitlementType,
      source: input.source,
      sourceId: input.sourceId,
      packageName: input.packageName,
    })
  }
  if (input.creditAmount > 0) {
    await deps.localStore.adjustCredits({
      orgId: input.orgId,
      delta: input.creditAmount,
      reason: 'purchase',
      source: input.source,
      sourceId: input.sourceId,
    })
  }
}

async function openStripeCheckout(
  deps: LocalCommerceDeps,
  params: {
    order: StoreOrder
    origin: string
    customerLabel: string | null
    secretKey: string
  },
): Promise<StorefrontReadOutcome<unknown>> {
  const { order } = params
  let customerId = order.stripeCustomerId ?? (await deps.localStore.getCustomer(order.orgId))?.stripeCustomerId ?? null
  if (!customerId) {
    try {
      const customer = await deps.stripe.createCustomer(params.secretKey, {
        name: params.customerLabel ?? order.orgId,
        metadata: { orgId: order.orgId },
      })
      customerId = customer.id
      await deps.localStore.upsertCustomer(order.orgId, customerId)
    } catch (error) {
      return { ok: false, error: badGateway((error as Error).message) }
    }
  }
  if (order.stripeSessionId) {
    await deps.stripe.expireCheckoutSession(params.secretKey, order.stripeSessionId).catch(() => undefined)
  }
  const metadata = {
    orgId: order.orgId,
    orderId: order.id,
    productId: order.productId,
    storageBytes: String(order.storageBytes),
    trafficBytes: String(order.trafficBytes),
    creditAmount: String(order.creditAmount),
  }
  try {
    const session = await deps.stripe.createCheckoutSession(params.secretKey, {
      mode: order.interval ? 'subscription' : 'payment',
      success_url: `${params.origin}/storage`,
      cancel_url: `${params.origin}/storage`,
      client_reference_id: order.orgId,
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: order.currency,
            unit_amount: order.amountCents,
            product_data: { name: order.productName, metadata },
            ...(order.interval ? { recurring: { interval: order.interval } } : {}),
          },
        },
      ],
      metadata,
      ...(order.interval ? { subscription_data: { metadata } } : {}),
    })
    if (!session.url) return { ok: false, error: badGateway('Stripe checkout URL missing') }
    await deps.localStore.updateOrder(order.id, { stripeSessionId: session.id, stripeCustomerId: customerId })
    return { ok: true, value: { orderId: order.id, url: session.url, paymentId: session.id } }
  } catch (error) {
    return { ok: false, error: badGateway((error as Error).message) }
  }
}

export async function listLocalPackages(
  deps: LocalCommerceDeps,
): Promise<StorefrontReadOutcome<{ items: unknown[]; total: number }>> {
  const items = (await deps.localStore.listProducts({ activeOnly: true }))
    .filter((product) => product.storageBytes > 0 || product.trafficBytes > 0)
    .map(toStoreProductDto)
  return { ok: true, value: { items, total: items.length } }
}

function toCreditProductDto(product: StoreProduct) {
  return {
    id: product.id,
    storeId: 'local',
    type: 'store_item',
    name: product.name,
    description: product.description,
    metadata: {
      deliverable: { type: 'zpan.credits' as const, includedCredits: product.creditAmount },
    },
    prices: [
      {
        id: priceIdFor(product),
        currency: product.currency,
        amount: product.amountCents,
      },
    ],
    active: product.active,
    sortOrder: product.sortOrder,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  }
}

export async function listLocalCreditProducts(
  deps: LocalCommerceDeps,
): Promise<StorefrontReadOutcome<{ items: unknown[]; total: number }>> {
  const items = (await deps.localStore.listProducts({ activeOnly: true }))
    .filter((product) => product.creditAmount > 0)
    .map(toCreditProductDto)
  return { ok: true, value: { items, total: items.length } }
}

export async function getLocalCredits(deps: Pick<LocalCommerceDeps, 'localStore'>, orgId: string) {
  const balance = await deps.localStore.getCreditBalance(orgId)
  return { ok: true as const, value: { balance } }
}

export async function getLocalCreditLedger(
  deps: Pick<LocalCommerceDeps, 'localStore'>,
  orgId: string,
  opts: { limit?: number; offset?: number } = {},
) {
  const page = await deps.localStore.listCreditLedger(orgId, opts)
  return {
    ok: true as const,
    value: {
      items: page.items.map((item) => ({
        id: item.id,
        delta: item.delta,
        balanceAfter: item.balanceAfter,
        reason: item.reason,
        source: item.source,
        sourceId: item.sourceId,
        createdAt: item.createdAt.toISOString(),
      })),
      total: page.total,
      limit: opts.limit ?? 50,
      offset: opts.offset ?? 0,
    },
  }
}

export async function listLocalOrders(
  deps: LocalCommerceDeps,
  orgId: string,
): Promise<StorefrontReadOutcome<{ items: unknown[]; total: number }>> {
  const items = (await deps.localStore.listOrders(orgId)).map(toOrderDto)
  return { ok: true, value: { items, total: items.length } }
}

export async function createLocalCheckout(
  deps: LocalCommerceDeps,
  params: {
    userId: string
    orgId: string
    origin: string
    packageId: string
    priceId?: string
    customerLabel: string | null
    stripe: { secretKey: string | null }
  },
): Promise<StorefrontReadOutcome<unknown>> {
  const product = await deps.localStore.getProduct(params.packageId)
  if (!product?.active) return { ok: false, error: notFound('Package not found') }
  if (params.priceId && params.priceId !== priceIdFor(product)) {
    return { ok: false, error: badRequest('Package price missing', 'PACKAGE_PRICE_MISSING') }
  }
  if (product.interval) {
    const quota = await deps.quota.getEffectiveQuota(params.orgId)
    if (quota.currentPlan?.subscription) {
      return { ok: false, error: conflict('Workspace plan already exists', 'WORKSPACE_PLAN_EXISTS') }
    }
  }
  if (!params.stripe.secretKey) return { ok: false, error: missingStripeSecret() }
  if (product.storageBytes <= 0 && product.trafficBytes <= 0 && product.creditAmount <= 0) {
    return { ok: false, error: badRequest('Package has no deliverable', 'PACKAGE_EMPTY') }
  }
  const order = await deps.localStore.createOrder({
    orgId: params.orgId,
    userId: params.userId,
    productId: product.id,
    productName: product.name,
    storageBytes: product.storageBytes,
    trafficBytes: product.trafficBytes,
    creditAmount: product.creditAmount,
    amountCents: product.amountCents,
    currency: product.currency,
    interval: product.interval,
    stripeSessionId: null,
    stripeCustomerId: (await deps.localStore.getCustomer(params.orgId))?.stripeCustomerId ?? null,
  })
  return openStripeCheckout(deps, {
    order,
    origin: params.origin,
    customerLabel: params.customerLabel,
    secretKey: params.stripe.secretKey,
  })
}

export async function continueLocalOrderPayment(
  deps: LocalCommerceDeps,
  params: {
    orgId: string
    orderId: string
    origin: string
    customerLabel: string | null
    stripe: { secretKey: string | null }
  },
): Promise<StorefrontReadOutcome<unknown>> {
  const order = await deps.localStore.getOrder(params.orderId)
  if (!order) return { ok: false, error: notFound('Order not found') }
  if (order.orgId !== params.orgId) return { ok: false, error: forbidden() }
  if (order.status !== 'pending') return { ok: false, error: conflict('Order is not payable', 'ORDER_NOT_PAYABLE') }
  if (!params.stripe.secretKey) return { ok: false, error: missingStripeSecret() }
  return openStripeCheckout(deps, {
    order,
    origin: params.origin,
    customerLabel: params.customerLabel,
    secretKey: params.stripe.secretKey,
  })
}

export async function cancelLocalOrder(
  deps: LocalCommerceDeps,
  params: { orgId: string; orderId: string; stripe: { secretKey: string | null } },
): Promise<StorefrontReadOutcome<unknown>> {
  const order = await deps.localStore.getOrder(params.orderId)
  if (!order) return { ok: false, error: notFound('Order not found') }
  if (order.orgId !== params.orgId) return { ok: false, error: forbidden() }
  if (order.status !== 'pending')
    return { ok: false, error: conflict('Order cannot be canceled', 'ORDER_NOT_CANCELABLE') }
  if (order.stripeSessionId && params.stripe.secretKey) {
    await deps.stripe.expireCheckoutSession(params.stripe.secretKey, order.stripeSessionId).catch(() => undefined)
  }
  const updated = await deps.localStore.updateOrder(order.id, { status: 'canceled' })
  return { ok: true, value: updated ? toOrderDto(updated) : toOrderDto(order) }
}

export async function createLocalBillingPortalSession(
  deps: LocalCommerceDeps,
  params: { orgId: string; origin: string; stripe: { secretKey: string | null } },
): Promise<StorefrontReadOutcome<unknown>> {
  const customer = await deps.localStore.getCustomer(params.orgId)
  if (!customer) return { ok: false, error: notFound('No Stripe customer for this workspace') }
  if (!params.stripe.secretKey) return { ok: false, error: missingStripeSecret() }
  try {
    const session = await deps.stripe.createPortalSession(params.stripe.secretKey, {
      customer: customer.stripeCustomerId,
      return_url: `${params.origin}/storage`,
    })
    return { ok: true, value: { url: session.url, stripeSubscriptionId: '' } }
  } catch (error) {
    return { ok: false, error: badGateway((error as Error).message) }
  }
}

export async function redeemLocalGiftCard(
  deps: LocalCommerceDeps,
  params: { orgId: string; code: string },
): Promise<StorefrontReadOutcome<unknown>> {
  const normalized = params.code.trim().toUpperCase()
  const codeHash = await sha256Hex(normalized)
  const card = await deps.localStore.findGiftCardByCodeHash(codeHash)
  if (!card) {
    return {
      ok: true,
      value: {
        redeemedCredits: 0,
        redeemedStorageBytes: 0,
        entries: [],
        failures: [{ code: params.code, error: 'invalid_code' }],
      },
    }
  }
  if (card.status !== 'active' || (card.expiresAt && card.expiresAt.getTime() <= Date.now())) {
    return {
      ok: true,
      value: {
        redeemedCredits: 0,
        redeemedStorageBytes: 0,
        entries: [],
        failures: [{ code: params.code, error: card.status === 'redeemed' ? 'already_redeemed' : 'inactive' }],
      },
    }
  }
  const redeemed = await deps.localStore.redeemGiftCard(card.id, params.orgId)
  if (!redeemed) {
    return {
      ok: true,
      value: {
        redeemedCredits: 0,
        redeemedStorageBytes: 0,
        entries: [],
        failures: [{ code: params.code, error: 'already_redeemed' }],
      },
    }
  }
  await grantOrderEntitlements(deps, {
    orgId: params.orgId,
    storageBytes: card.storageBytes,
    trafficBytes: card.trafficBytes,
    creditAmount: card.creditAmount,
    entitlementType: 'grant',
    source: 'gift_card',
    sourceId: `gift_card:${card.id}`,
    packageName: 'Gift card',
  })
  return {
    ok: true,
    value: {
      redeemedCredits: card.creditAmount,
      redeemedStorageBytes: card.storageBytes,
      redeemedTrafficBytes: card.trafficBytes,
      entries: [],
      failures: [],
    },
  }
}

export async function processStripeWebhook(
  deps: LocalCommerceDeps,
  params: { rawPayload: string; signature: string; webhookSecret: string | null },
): Promise<{ ok: true; duplicate: boolean; eventId: string } | { ok: false; error: AppError }> {
  if (!params.webhookSecret) {
    return {
      ok: false,
      error: new AppError(503, 'Stripe webhook secret is not configured', { reason: 'STRIPE_NOT_CONFIGURED' }),
    }
  }
  const valid = await deps.stripe.verifySignature(params.rawPayload, params.signature, params.webhookSecret)
  if (!valid) return { ok: false, error: forbidden('Invalid Stripe signature') }
  let event: StripeEvent
  try {
    event = JSON.parse(params.rawPayload) as StripeEvent
  } catch {
    return { ok: false, error: badRequest('Invalid payload', 'INVALID_PAYLOAD') }
  }

  const payloadHash = await sha256Hex(params.rawPayload)
  let claim: { id: string; duplicate: boolean }
  try {
    claim = await deps.localStore.beginStripeWebhookEvent({
      eventId: event.id,
      eventType: event.type,
      rawPayload: params.rawPayload,
      payloadHash,
    })
  } catch (error) {
    return { ok: false, error: badRequest((error as Error).message, 'WEBHOOK_CONFLICT') }
  }
  if (claim.duplicate) return { ok: true, duplicate: true, eventId: event.id }

  try {
    // Only fulfill when Stripe reports the session paid. `checkout.session.completed`
    // can fire for async methods while payment_status is still unpaid; those wait for
    // `checkout.session.async_payment_succeeded`.
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object
      const paymentStatus = String(session.payment_status ?? '')
      if (paymentStatus !== 'paid') {
        await deps.localStore.markStripeWebhookEvent(claim.id, 'processed')
        return { ok: true, duplicate: true, eventId: event.id }
      }
      const sessionId = String(session.id ?? '')
      const metadata = (session.metadata ?? {}) as Record<string, string>
      const order =
        (await deps.localStore.getOrderByStripeSessionId(sessionId)) ??
        (metadata.orderId ? await deps.localStore.getOrder(metadata.orderId) : null)
      if (!order) {
        await deps.localStore.markStripeWebhookEvent(claim.id, 'processed')
        return { ok: true, duplicate: true, eventId: event.id }
      }
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null
      // Always upsert the grant even when the order row is already paid, so a retry
      // after a crashed grant can finish fulfillment.
      await deps.localStore.updateOrder(order.id, {
        status: 'paid',
        stripeSessionId: sessionId,
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : order.stripeCustomerId,
      })
      const sourceId = subscriptionId ? `stripe_subscription:${subscriptionId}:${order.orgId}` : `stripe:${order.id}`
      await grantOrderEntitlements(deps, {
        orgId: order.orgId,
        storageBytes: order.storageBytes,
        trafficBytes: order.trafficBytes,
        creditAmount: order.creditAmount,
        entitlementType: subscriptionId ? 'plan' : 'grant',
        source: 'stripe',
        sourceId,
        packageName: order.productName,
      })
      if (deps.outboundWebhooks) {
        emitOutboundEvent(
          { outboundWebhooks: deps.outboundWebhooks },
          {
            eventType: 'store.order.paid',
            idempotencyKey: `store.order.paid:${order.id}:${event.id}`,
            data: {
              orderId: order.id,
              orgId: order.orgId,
              productId: order.productId,
              productName: order.productName,
              storageBytes: order.storageBytes,
              stripeSessionId: sessionId || null,
              subscriptionId: subscriptionId || null,
            },
          },
        ).catch((err) => console.error('[webhooks] store.order.paid emit failed:', err))
      }
      await deps.localStore.markStripeWebhookEvent(claim.id, 'processed')
      return { ok: true, duplicate: false, eventId: event.id }
    }
    if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
      const subscription = event.data.object
      const subscriptionId = String(subscription.id ?? '')
      const order = await deps.localStore.getOrderByStripeSubscriptionId(subscriptionId)
      if (!order) {
        await deps.localStore.markStripeWebhookEvent(claim.id, 'processed')
        return { ok: true, duplicate: true, eventId: event.id }
      }
      const sourceId = `stripe_subscription:${subscriptionId}:${order.orgId}`
      const status = String(subscription.status ?? '')
      const shouldRevoke =
        event.type === 'customer.subscription.deleted' ||
        status === 'canceled' ||
        status === 'unpaid' ||
        status === 'past_due' ||
        status === 'incomplete_expired'
      if (shouldRevoke) {
        await deps.localStore.revokeStorage('stripe', sourceId)
        if (status === 'canceled' || event.type === 'customer.subscription.deleted') {
          await deps.localStore.updateOrder(order.id, { status: 'canceled' })
        }
      } else if (status === 'active' || status === 'trialing') {
        // Re-grant after recovery from past_due / incomplete so temporary delinquency is not permanent.
        await deps.localStore.updateOrder(order.id, { status: 'paid', stripeSubscriptionId: subscriptionId })
        await grantOrderEntitlements(deps, {
          orgId: order.orgId,
          storageBytes: order.storageBytes,
          trafficBytes: order.trafficBytes,
          creditAmount: order.creditAmount,
          entitlementType: 'plan',
          source: 'stripe',
          sourceId,
          packageName: order.productName,
        })
      }
      await deps.localStore.markStripeWebhookEvent(claim.id, 'processed')
      return { ok: true, duplicate: false, eventId: event.id }
    }
    await deps.localStore.markStripeWebhookEvent(claim.id, 'processed')
    return { ok: true, duplicate: true, eventId: event.id }
  } catch (error) {
    await deps.localStore.markStripeWebhookEvent(claim.id, 'failed', (error as Error).message).catch(() => undefined)
    return { ok: false, error: badGateway((error as Error).message) }
  }
}

export async function listAdminStoreProducts(deps: LocalCommerceDeps) {
  return deps.localStore.listProducts()
}

export async function createAdminStoreProduct(
  deps: LocalCommerceDeps,
  input: {
    name: string
    description?: string
    storageBytes: number
    trafficBytes?: number
    creditAmount?: number
    amountCents: number
    currency?: string
    interval?: 'month' | 'year' | null
    active?: boolean
  },
) {
  const storageBytes = input.storageBytes
  const trafficBytes = input.trafficBytes ?? 0
  const creditAmount = input.creditAmount ?? 0
  if (storageBytes <= 0 && trafficBytes <= 0 && creditAmount <= 0) {
    throw badRequest('At least one deliverable must be greater than zero', 'PACKAGE_EMPTY')
  }
  return deps.localStore.createProduct({
    name: input.name,
    description: input.description ?? '',
    storageBytes,
    trafficBytes,
    creditAmount,
    amountCents: input.amountCents,
    currency: input.currency ?? 'usd',
    interval: input.interval ?? null,
    active: input.active ?? true,
    sortOrder: 0,
  })
}

export async function updateAdminStoreProduct(
  deps: LocalCommerceDeps,
  id: string,
  patch: Partial<{
    name: string
    description: string
    storageBytes: number
    trafficBytes: number
    creditAmount: number
    amountCents: number
    interval: 'month' | 'year' | null
    active: boolean
  }>,
) {
  const updated = await deps.localStore.updateProduct(id, patch)
  if (!updated) throw notFound('Product not found')
  return updated
}

export async function deleteAdminStoreProduct(deps: LocalCommerceDeps, id: string) {
  const deleted = await deps.localStore.deleteProduct(id)
  if (!deleted) throw notFound('Product not found')
}

export async function listAdminGiftCards(deps: LocalCommerceDeps) {
  return deps.localStore.listGiftCards()
}

export async function createAdminGiftCards(
  deps: LocalCommerceDeps,
  input: {
    storageBytes: number
    trafficBytes?: number
    creditAmount?: number
    count: number
    expiresAt?: string | null
    note?: string | null
    createdBy: string
  },
) {
  const storageBytes = input.storageBytes
  const trafficBytes = input.trafficBytes ?? 0
  const creditAmount = input.creditAmount ?? 0
  if (storageBytes <= 0 && trafficBytes <= 0 && creditAmount <= 0) {
    throw badRequest('At least one deliverable must be greater than zero', 'PACKAGE_EMPTY')
  }
  const count = Math.min(Math.max(input.count, 1), 100)
  const codes = Array.from({ length: count }, () => randomGiftCode())
  const hashed = await Promise.all(
    codes.map(async (code) => ({
      code,
      codeHash: await sha256Hex(code),
      codeLast4: code.slice(-4),
    })),
  )
  const cards = await deps.localStore.createGiftCards({
    storageBytes,
    trafficBytes,
    creditAmount,
    count,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    note: input.note ?? null,
    createdBy: input.createdBy,
    codes: hashed.map(({ codeHash, codeLast4 }) => ({ codeHash, codeLast4 })),
  })
  return cards.map((card, index) => ({ ...card, code: hashed[index]?.code ?? null }))
}

export async function disableAdminGiftCard(deps: LocalCommerceDeps, id: string) {
  const card = await deps.localStore.disableGiftCard(id)
  if (!card) throw notFound('Gift card not found')
  return card
}

export function emptyLocalCredits() {
  return { ok: true as const, value: { balance: 0 } }
}

export function emptyLocalCreditLedger() {
  return { ok: true as const, value: { items: [], total: 0, limit: 50, offset: 0 } }
}

export function emptyLocalCreditProducts() {
  return { ok: true as const, value: { items: [], total: 0 } }
}
