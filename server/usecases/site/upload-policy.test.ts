import type { CreateUploadPolicyInput, UpdateUploadPolicyInput } from '@shared/schemas'
import type { BindingState } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LicenseBindingRepo, StorageRecord, StorageRepo, UploadPolicyRecord, UploadPolicyRepo } from '../ports'
import { AppError } from '../ports'
import { loadBindingState } from './licensing'
import {
  createUploadPolicy,
  deleteUploadPolicy,
  listUploadPolicies,
  patchUploadPolicy,
  type UploadPolicyDeps,
  updateUploadPolicy,
} from './upload-policy'

vi.mock('./licensing', () => ({ loadBindingState: vi.fn() }))

const COMMUNITY: BindingState = { bound: false }
const PRO: BindingState = { bound: true, active: true, edition: 'pro' }

const edition = (state: BindingState) => vi.mocked(loadBindingState).mockResolvedValue(state)

const now = new Date('2026-01-01T00:00:00.000Z')

const storageA = {
  id: 'st-a',
  bucket: 'a',
  capacity: 100,
  createdAt: now,
} as StorageRecord
const storageB = {
  id: 'st-b',
  bucket: 'b',
  capacity: 200,
  createdAt: new Date(now.getTime() + 1000),
} as StorageRecord

const defaultPolicy: UploadPolicyRecord = {
  id: 'default',
  name: 'Default',
  enabled: true,
  priority: 0,
  selector: {},
  storageIds: [storageA.id],
  selectionMode: 'ordered',
  createdAt: now,
  updatedAt: now,
}

function makeDeps(overrides: { uploadPolicies?: Partial<UploadPolicyRepo>; storages?: Partial<StorageRepo> } = {}) {
  const policies = new Map<string, UploadPolicyRecord>([[defaultPolicy.id, { ...defaultPolicy }]])
  const repo: UploadPolicyRepo = {
    list: async () => [...policies.values()],
    get: async (id) => policies.get(id) ?? null,
    ensureDefault: async () => {
      const existing = policies.get('default')
      if (existing) return existing
      policies.set('default', { ...defaultPolicy })
      return defaultPolicy
    },
    upsert: async (input) => {
      const existing = policies.get(input.id)
      const next: UploadPolicyRecord = {
        ...input,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      policies.set(input.id, next)
      return next
    },
    delete: async (id) => policies.delete(id),
    ...overrides.uploadPolicies,
  }
  const storages: StorageRepo = {
    list: async () => ({ items: [storageA, storageB], total: 2 }),
    get: async () => null,
    create: async () => storageA,
    count: async () => 2,
    replace: async () => null,
    patch: async () => null,
    delete: async () => 'ok',
    select: async () => storageA,
    ...overrides.storages,
  }
  const deps: UploadPolicyDeps = {
    uploadPolicies: repo,
    storages,
    licenseBinding: {} as LicenseBindingRepo,
  }
  return { deps, policies }
}

beforeEach(() => vi.clearAllMocks())

describe('upload policy usecase', () => {
  it('lists policies after ensuring the default exists', async () => {
    edition(COMMUNITY)
    const { deps } = makeDeps()
    const result = await listUploadPolicies(deps)
    expect(result.total).toBe(1)
    expect(result.items[0]?.id).toBe('default')
  })

  it('blocks custom policy creation on Community', async () => {
    edition(COMMUNITY)
    const { deps } = makeDeps()
    const input = {
      name: 'Images',
      enabled: true,
      priority: 50,
      selector: { matchLabels: { 'file.category': 'image' } },
      storageIds: [storageA.id],
      selectionMode: 'ordered',
    } as CreateUploadPolicyInput
    const out = await createUploadPolicy(deps, { input })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.error).toBeInstanceOf(AppError)
      expect(out.error.httpStatus).toBe(402)
    }
  })

  it('creates a custom policy on Pro', async () => {
    edition(PRO)
    const { deps } = makeDeps()
    const input = {
      name: 'Images',
      enabled: true,
      priority: 50,
      selector: { matchLabels: { 'file.category': 'image' } },
      storageIds: [storageA.id, storageB.id],
      selectionMode: 'ordered',
    } as CreateUploadPolicyInput
    const out = await createUploadPolicy(deps, { input })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.policy.name).toBe('Images')
      expect(out.policy.storageIds).toEqual([storageA.id, storageB.id])
    }
  })

  it('allows Community to edit default storage list and mode', async () => {
    edition(COMMUNITY)
    const { deps } = makeDeps()
    const input = {
      name: 'Default',
      enabled: true,
      priority: 0,
      selector: {},
      storageIds: [storageA.id, storageB.id],
      selectionMode: 'balanced',
    } as UpdateUploadPolicyInput
    const out = await updateUploadPolicy(deps, { id: 'default', input })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.policy.storageIds).toEqual([storageA.id, storageB.id])
      expect(out.policy.selectionMode).toBe('balanced')
    }
  })

  it('rejects changing the default selector', async () => {
    edition(PRO)
    const { deps } = makeDeps()
    const input = {
      name: 'Default',
      enabled: true,
      priority: 0,
      selector: { matchLabels: { 'space.type': 'team' } },
      storageIds: [storageA.id],
      selectionMode: 'ordered',
    } as UpdateUploadPolicyInput
    const out = await updateUploadPolicy(deps, { id: 'default', input })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error.httpStatus).toBe(400)
  })

  it('rejects balanced mode when a storage has zero capacity', async () => {
    edition(PRO)
    const zeroCap = { ...storageA, capacity: 0 } as StorageRecord
    const { deps } = makeDeps({
      storages: { list: async () => ({ items: [zeroCap, storageB], total: 2 }) },
    })
    const out = await patchUploadPolicy(deps, {
      id: 'default',
      input: { selectionMode: 'balanced', storageIds: [zeroCap.id] },
    })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error.message).toContain('non-zero capacity')
  })

  it('cannot delete the default policy', async () => {
    edition(PRO)
    const { deps } = makeDeps()
    const out = await deleteUploadPolicy(deps, { id: 'default' })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error.httpStatus).toBe(409)
  })

  it('deletes a custom policy on Pro', async () => {
    edition(PRO)
    const custom: UploadPolicyRecord = {
      id: 'custom-1',
      name: 'Custom',
      enabled: true,
      priority: 20,
      selector: { matchLabels: { 'file.category': 'image' } },
      storageIds: [storageA.id],
      selectionMode: 'ordered',
      createdAt: now,
      updatedAt: now,
    }
    const { deps, policies } = makeDeps()
    policies.set(custom.id, custom)
    const out = await deleteUploadPolicy(deps, { id: custom.id })
    expect(out).toEqual({ ok: true })
    expect(policies.has(custom.id)).toBe(false)
  })
})
