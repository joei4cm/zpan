export type StoreProductKind = 'plan'
export type StoreBillingInterval = 'month' | 'year'
export type StoreGiftCardStatus = 'active' | 'redeemed' | 'disabled' | 'expired' | 'revoked'
export type StoreOrderStatus = 'pending' | 'paid' | 'canceled' | 'refunded'

export interface StoreProduct {
  id: string
  name: string
  description: string
  kind: StoreProductKind
  storageBytes: number
  amountCents: number
  currency: string
  interval: StoreBillingInterval | null
  active: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export interface StoreGiftCard {
  id: string
  codeHash: string
  codeLast4: string
  storageBytes: number
  status: StoreGiftCardStatus
  expiresAt: Date | null
  redeemedOrgId: string | null
  redeemedAt: Date | null
  note: string | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface StoreOrder {
  id: string
  orgId: string
  userId: string
  productId: string
  productName: string
  storageBytes: number
  amountCents: number
  currency: string
  interval: StoreBillingInterval | null
  status: StoreOrderStatus
  stripeSessionId: string | null
  stripeSubscriptionId: string | null
  stripeCustomerId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface LocalStoreRepo {
  listProducts(opts?: { activeOnly?: boolean }): Promise<StoreProduct[]>
  getProduct(id: string): Promise<StoreProduct | null>
  createProduct(input: {
    name: string
    description: string
    storageBytes: number
    amountCents: number
    currency: string
    interval: StoreBillingInterval | null
    active: boolean
    sortOrder: number
  }): Promise<StoreProduct>
  updateProduct(
    id: string,
    patch: Partial<{
      name: string
      description: string
      storageBytes: number
      amountCents: number
      currency: string
      interval: StoreBillingInterval | null
      active: boolean
      sortOrder: number
    }>,
  ): Promise<StoreProduct | null>
  deleteProduct(id: string): Promise<boolean>

  createGiftCards(input: {
    storageBytes: number
    count: number
    expiresAt: Date | null
    note: string | null
    createdBy: string
    codes: { codeHash: string; codeLast4: string }[]
  }): Promise<StoreGiftCard[]>
  listGiftCards(): Promise<StoreGiftCard[]>
  findGiftCardByCodeHash(codeHash: string): Promise<StoreGiftCard | null>
  redeemGiftCard(id: string, orgId: string): Promise<StoreGiftCard | null>
  disableGiftCard(id: string): Promise<StoreGiftCard | null>

  createOrder(input: {
    orgId: string
    userId: string
    productId: string
    productName: string
    storageBytes: number
    amountCents: number
    currency: string
    interval: StoreBillingInterval | null
    stripeSessionId: string | null
    stripeCustomerId: string | null
  }): Promise<StoreOrder>
  listOrders(orgId: string): Promise<StoreOrder[]>
  getOrder(id: string): Promise<StoreOrder | null>
  getOrderByStripeSessionId(sessionId: string): Promise<StoreOrder | null>
  getOrderByStripeSubscriptionId(subscriptionId: string): Promise<StoreOrder | null>
  updateOrder(
    id: string,
    patch: Partial<{
      status: StoreOrderStatus
      stripeSessionId: string | null
      stripeSubscriptionId: string | null
      stripeCustomerId: string | null
    }>,
  ): Promise<StoreOrder | null>

  getCustomer(orgId: string): Promise<{ orgId: string; stripeCustomerId: string } | null>
  upsertCustomer(orgId: string, stripeCustomerId: string): Promise<void>

  grantStorage(input: {
    orgId: string
    bytes: number
    entitlementType: 'plan' | 'grant'
    source: string
    sourceId: string
    packageName: string
    expiresAt?: Date | null
  }): Promise<void>
  revokeStorage(source: string, sourceId: string): Promise<void>
}
