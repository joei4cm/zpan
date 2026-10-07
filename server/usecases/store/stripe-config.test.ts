import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Platform } from '../../platform/interface'
import type { SystemOptionsRepo } from '../ports'
import {
  getStripeConfigSettings,
  resolveStripeSecrets,
  STRIPE_SECRET_KEY_OPTION,
  STRIPE_WEBHOOK_SECRET_OPTION,
  saveStripeConfig,
} from './stripe-config'

function makePlatform(env: Record<string, string | undefined> = {}): Platform {
  return {
    getEnv: (key: string) => env[key],
  } as Platform
}

function makeDeps(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  const setMany = vi.fn(async (entries: Array<{ key: string; value: string }>) => {
    for (const entry of entries) values.set(entry.key, entry.value)
  })
  const systemOptions: SystemOptionsRepo = {
    get: async () => null,
    getValue: async (key) => values.get(key) ?? null,
    getMany: async () => [],
    listByPrefix: async () => [],
    set: async () => {},
    setMany,
    delete: async () => {},
  }
  return { deps: { systemOptions }, setMany, values }
}

beforeEach(() => vi.clearAllMocks())

describe('stripe-config usecase', () => {
  it('prefers env secrets over database values at runtime', async () => {
    const { deps } = makeDeps({
      [STRIPE_SECRET_KEY_OPTION]: 'sk_db_secret',
      [STRIPE_WEBHOOK_SECRET_OPTION]: 'whsec_db',
    })
    const resolved = await resolveStripeSecrets(
      deps,
      makePlatform({ STRIPE_SECRET_KEY: 'sk_env_secret', STRIPE_WEBHOOK_SECRET: 'whsec_env' }),
    )
    expect(resolved).toEqual({ secretKey: 'sk_env_secret', webhookSecret: 'whsec_env' })
  })

  it('falls back to database secrets when env is empty', async () => {
    const { deps } = makeDeps({
      [STRIPE_SECRET_KEY_OPTION]: 'sk_db_secret',
      [STRIPE_WEBHOOK_SECRET_OPTION]: 'whsec_db',
    })
    expect(await resolveStripeSecrets(deps, makePlatform())).toEqual({
      secretKey: 'sk_db_secret',
      webhookSecret: 'whsec_db',
    })
  })

  it('masks database secrets and reports env as the active source', async () => {
    const { deps } = makeDeps({
      [STRIPE_SECRET_KEY_OPTION]: 'sk_live_abcdefgh',
      [STRIPE_WEBHOOK_SECRET_OPTION]: 'whsec_1234',
    })
    const settings = await getStripeConfigSettings(
      deps,
      makePlatform({ STRIPE_SECRET_KEY: 'sk_env_zzzz', STRIPE_WEBHOOK_SECRET: undefined }),
    )
    expect(settings).toEqual({
      secretKey: '****efgh',
      webhookSecret: '****1234',
      secretKeyConfigured: true,
      webhookSecretConfigured: true,
      secretKeySource: 'env',
      webhookSecretSource: 'database',
    })
  })

  it('preserves masked secrets on save', async () => {
    const { deps, setMany } = makeDeps({
      [STRIPE_SECRET_KEY_OPTION]: 'sk_live_abcdefgh',
      [STRIPE_WEBHOOK_SECRET_OPTION]: 'whsec_abcd',
    })
    await saveStripeConfig(deps, {
      secretKey: '****efgh',
      webhookSecret: 'whsec_newvalue',
    })
    expect(setMany).toHaveBeenCalledWith([
      { key: STRIPE_SECRET_KEY_OPTION, value: 'sk_live_abcdefgh' },
      { key: STRIPE_WEBHOOK_SECRET_OPTION, value: 'whsec_newvalue' },
    ])
  })
})
