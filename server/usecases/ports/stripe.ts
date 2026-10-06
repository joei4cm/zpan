export type StripeCheckoutSession = {
  id: string
  url: string | null
  customer: string | null
  subscription: string | null
  payment_status?: string
  metadata?: Record<string, string> | null
  client_reference_id?: string | null
}

export type StripeCustomer = { id: string }
export type StripePortalSession = { url: string }

export type StripeCheckoutParams = {
  mode: 'payment' | 'subscription'
  success_url: string
  cancel_url: string
  client_reference_id: string
  customer?: string
  line_items: Array<{
    quantity: number
    price_data: {
      currency: string
      unit_amount: number
      product_data: { name: string; metadata?: Record<string, string> }
      recurring?: { interval: 'month' | 'year' }
    }
  }>
  metadata: Record<string, string>
  subscription_data?: { metadata: Record<string, string> }
}

export interface StripeGateway {
  createCustomer(
    secretKey: string,
    params: { name?: string; metadata?: Record<string, string> },
  ): Promise<StripeCustomer>
  createCheckoutSession(secretKey: string, params: StripeCheckoutParams): Promise<StripeCheckoutSession>
  createPortalSession(secretKey: string, params: { customer: string; return_url: string }): Promise<StripePortalSession>
  expireCheckoutSession(secretKey: string, sessionId: string): Promise<StripeCheckoutSession>
  verifySignature(payload: string, header: string, secret: string): Promise<boolean>
}
