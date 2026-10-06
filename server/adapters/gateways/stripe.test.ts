import { describe, expect, it, vi } from 'vitest'
import { verifyStripeSignature } from './stripe'

describe('verifyStripeSignature', () => {
  it('accepts a matching HMAC signature', async () => {
    const payload = '{"id":"evt_1"}'
    const secret = 'whsec_test'
    const timestamp = Math.floor(Date.now() / 1000)
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`))
    const hex = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    await expect(verifyStripeSignature(payload, `t=${timestamp},v1=${hex}`, secret)).resolves.toBe(true)
  })

  it('rejects a mismatched signature', async () => {
    await expect(
      verifyStripeSignature('{}', `t=${Math.floor(Date.now() / 1000)},v1=deadbeef`, 'whsec_test'),
    ).resolves.toBe(false)
  })
})

describe('createStripeGateway', () => {
  it('posts form-encoded Stripe API params', async () => {
    const { createStripeGateway } = await import('./stripe')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'cus_1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await createStripeGateway().createCustomer('sk_test', { name: 'Acme', metadata: { orgId: 'org-1' } })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/customers',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk_test' }),
      }),
    )
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    const body = String(calls[0]?.[1].body)
    expect(body).toContain('name=Acme')
    expect(body).toContain('metadata%5BorgId%5D=org-1')
    vi.unstubAllGlobals()
  })
})
