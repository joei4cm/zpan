import type {
  StripeCheckoutParams,
  StripeCheckoutSession,
  StripeCustomer,
  StripeGateway,
  StripePortalSession,
} from '../../usecases/ports'

const STRIPE_API = 'https://api.stripe.com/v1'

function encode(value: unknown, path = ''): Array<[string, string]> {
  if (value == null) return []
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
      encode(nested, path ? `${path}[${key}]` : key),
    )
  }
  if (Array.isArray(value)) {
    return value.flatMap((nested, index) => encode(nested, `${path}[${index}]`))
  }
  return [[path, String(value)]]
}

async function stripeRequest<T>(
  secretKey: string,
  method: string,
  path: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const body = params ? new URLSearchParams(encode(params)) : undefined
  const response = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body,
  })
  const data = (await response.json()) as T & { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(data.error?.message ?? `stripe_request_failed_${response.status}`)
  }
  return data
}

export function createStripeGateway(): StripeGateway {
  return {
    createCustomer(secretKey, params) {
      return stripeRequest<StripeCustomer>(secretKey, 'POST', '/customers', params)
    },
    createCheckoutSession(secretKey, params: StripeCheckoutParams) {
      return stripeRequest<StripeCheckoutSession>(secretKey, 'POST', '/checkout/sessions', params)
    },
    createPortalSession(secretKey, params) {
      return stripeRequest<StripePortalSession>(secretKey, 'POST', '/billing_portal/sessions', params)
    },
    expireCheckoutSession(secretKey, sessionId) {
      return stripeRequest<StripeCheckoutSession>(secretKey, 'POST', `/checkout/sessions/${sessionId}/expire`)
    },
    verifySignature(payload, header, secret) {
      return verifyStripeSignature(payload, header, secret)
    },
  }
}

export async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  const parts = Object.fromEntries(
    header.split(',').map((item) => {
      const [key, ...rest] = item.split('=')
      return [key.trim(), rest.join('=')]
    }),
  )
  const timestamp = Number(parts.t)
  if (!Number.isFinite(timestamp) || !parts.v1) return false
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`))
  const expected = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  if (expected.length !== parts.v1.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i += 1) mismatch |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i)
  return mismatch === 0
}
