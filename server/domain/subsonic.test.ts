import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { subsonicErrorBody, subsonicSuccessBody, verifySubsonicPassword } from './subsonic'

function md5Hex(value: string): string {
  return createHash('md5').update(value).digest('hex')
}

describe('subsonic auth helpers', () => {
  it('verifies plaintext and enc: passwords', () => {
    expect(verifySubsonicPassword({ storedToken: 'secret', password: 'secret', md5Hex })).toBe(true)
    expect(verifySubsonicPassword({ storedToken: 'secret', password: 'wrong', md5Hex })).toBe(false)
    const enc = `enc:${Buffer.from('secret', 'utf8').toString('hex')}`
    expect(verifySubsonicPassword({ storedToken: 'secret', password: enc, md5Hex })).toBe(true)
  })

  it('verifies legacy token+salt auth', () => {
    const token = md5Hex('secretabc')
    expect(verifySubsonicPassword({ storedToken: 'secret', token, salt: 'abc', md5Hex })).toBe(true)
    expect(verifySubsonicPassword({ storedToken: 'secret', token: 'nope', salt: 'abc', md5Hex })).toBe(false)
  })

  it('builds success and error envelopes', () => {
    expect(subsonicSuccessBody('1.0.0')['subsonic-response']).toMatchObject({
      status: 'ok',
      type: 'ZPan',
      serverVersion: '1.0.0',
    })
    expect(subsonicErrorBody('1.0.0', 40, 'nope')['subsonic-response']).toMatchObject({
      status: 'failed',
      error: { code: 40, message: 'nope' },
    })
  })
})
