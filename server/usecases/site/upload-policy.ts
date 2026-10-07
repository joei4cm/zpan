import type { CreateUploadPolicyInput, PatchUploadPolicyInput, UpdateUploadPolicyInput } from '@shared/schemas'
import { generateId } from '../../../shared/ids'
import { hasFeature } from '../../domain/licensing'
import {
  DEFAULT_UPLOAD_POLICY_ID,
  isDefaultUploadPolicy,
  selectorIsEmpty,
  type UploadPolicyRecord,
  type UploadSelector,
} from '../../domain/upload-policy'
import {
  type AppError,
  badRequest,
  conflict,
  featureBlocked,
  type LicenseBindingRepo,
  notFound,
  type StorageRepo,
  type UploadPolicyRepo,
} from '../ports'
import { loadBindingState } from './licensing'

export type UploadPolicyDeps = {
  uploadPolicies: UploadPolicyRepo
  storages: StorageRepo
  licenseBinding: LicenseBindingRepo
}

export type UploadPolicyOutcome = { ok: true; policy: UploadPolicyRecord } | { ok: false; error: AppError }
export type DeleteUploadPolicyOutcome = { ok: true } | { ok: false; error: AppError }

function featureBlockError(): AppError {
  return featureBlocked('Feature not available', {
    metadata: { feature: 'upload_policies', upgradeUrl: '/settings/billing' },
  })
}

async function ensureSeeded(deps: UploadPolicyDeps): Promise<void> {
  const { items } = await deps.storages.list()
  const storageIds = items
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((item) => item.id)
  await deps.uploadPolicies.ensureDefault(storageIds)
}

async function assertStorageIds(
  deps: Pick<UploadPolicyDeps, 'storages'>,
  storageIds: string[],
  selectionMode: 'ordered' | 'balanced',
): Promise<AppError | null> {
  const unique = [...new Set(storageIds)]
  if (unique.length !== storageIds.length) {
    return badRequest('storageIds must be unique', 'duplicate_storage_ids')
  }
  const { items } = await deps.storages.list()
  const byId = new Map(items.map((item) => [item.id, item]))
  for (const id of storageIds) {
    if (!byId.has(id)) return badRequest(`Unknown storage id: ${id}`, 'unknown_storage_id')
  }
  if (selectionMode === 'balanced') {
    for (const id of storageIds) {
      const storage = byId.get(id)
      if (!storage || storage.capacity <= 0) {
        return badRequest(
          'Balanced policies require a non-zero capacity on every storage',
          'balanced_requires_capacity',
        )
      }
    }
  }
  return null
}

function validateDefaultPolicyConstraints(
  existing: UploadPolicyRecord,
  next: {
    name: string
    enabled: boolean
    priority: number
    selector: UploadSelector
  },
): AppError | null {
  if (!next.enabled) return badRequest('The default upload policy cannot be disabled', 'default_policy_immutable')
  if (next.priority !== 0)
    return badRequest('The default upload policy priority must remain 0', 'default_policy_immutable')
  if (next.name !== existing.name && next.name !== 'Default') {
    return badRequest('The default upload policy name cannot be changed', 'default_policy_immutable')
  }
  if (!selectorIsEmpty(next.selector)) {
    return badRequest('The default upload policy selector cannot be changed', 'default_policy_immutable')
  }
  return null
}

export async function listUploadPolicies(
  deps: UploadPolicyDeps,
): Promise<{ items: UploadPolicyRecord[]; total: number }> {
  await ensureSeeded(deps)
  const items = await deps.uploadPolicies.list()
  return { items, total: items.length }
}

export async function getUploadPolicy(deps: UploadPolicyDeps, id: string): Promise<UploadPolicyRecord | null> {
  await ensureSeeded(deps)
  return deps.uploadPolicies.get(id)
}

export async function createUploadPolicy(
  deps: UploadPolicyDeps,
  params: { input: CreateUploadPolicyInput },
): Promise<UploadPolicyOutcome> {
  const state = await loadBindingState({ licenseBinding: deps.licenseBinding })
  if (!hasFeature('upload_policies', state)) {
    return { ok: false, error: featureBlockError() }
  }
  await ensureSeeded(deps)
  const storageError = await assertStorageIds(deps, params.input.storageIds, params.input.selectionMode)
  if (storageError) return { ok: false, error: storageError }

  const policy = await deps.uploadPolicies.upsert({
    id: generateId(),
    name: params.input.name,
    enabled: params.input.enabled,
    priority: params.input.priority,
    selector: params.input.selector ?? {},
    storageIds: params.input.storageIds,
    selectionMode: params.input.selectionMode,
  })
  return { ok: true, policy }
}

export async function updateUploadPolicy(
  deps: UploadPolicyDeps,
  params: { id: string; input: UpdateUploadPolicyInput },
): Promise<UploadPolicyOutcome> {
  await ensureSeeded(deps)
  const existing = await deps.uploadPolicies.get(params.id)
  if (!existing) return { ok: false, error: notFound('Upload policy not found') }

  const state = await loadBindingState({ licenseBinding: deps.licenseBinding })
  const hasCustom = hasFeature('upload_policies', state)
  const isDefault = isDefaultUploadPolicy(params.id)

  if (!isDefault && !hasCustom) {
    return { ok: false, error: featureBlockError() }
  }

  const next = {
    name: params.input.name,
    enabled: params.input.enabled,
    priority: params.input.priority,
    selector: params.input.selector ?? {},
    storageIds: params.input.storageIds,
    selectionMode: params.input.selectionMode,
  }

  if (isDefault) {
    const constraintError = validateDefaultPolicyConstraints(existing, next)
    if (constraintError) return { ok: false, error: constraintError }
    // Community may only edit storage list + selection mode on the default policy.
    next.name = existing.name
    next.enabled = true
    next.priority = 0
    next.selector = {}
  }

  const storageError = await assertStorageIds(deps, next.storageIds, next.selectionMode)
  if (storageError) return { ok: false, error: storageError }

  const policy = await deps.uploadPolicies.upsert({
    id: params.id,
    ...next,
  })
  return { ok: true, policy }
}

export async function patchUploadPolicy(
  deps: UploadPolicyDeps,
  params: { id: string; input: PatchUploadPolicyInput },
): Promise<UploadPolicyOutcome> {
  await ensureSeeded(deps)
  const existing = await deps.uploadPolicies.get(params.id)
  if (!existing) return { ok: false, error: notFound('Upload policy not found') }

  return updateUploadPolicy(deps, {
    id: params.id,
    input: {
      name: params.input.name ?? existing.name,
      enabled: params.input.enabled ?? existing.enabled,
      priority: params.input.priority ?? existing.priority,
      selector: params.input.selector ?? existing.selector ?? {},
      storageIds: params.input.storageIds ?? existing.storageIds,
      selectionMode: params.input.selectionMode ?? existing.selectionMode,
    } as UpdateUploadPolicyInput,
  })
}

export async function deleteUploadPolicy(
  deps: UploadPolicyDeps,
  params: { id: string },
): Promise<DeleteUploadPolicyOutcome> {
  if (isDefaultUploadPolicy(params.id)) {
    return { ok: false, error: conflict('The default upload policy cannot be deleted', 'default_policy_immutable') }
  }
  const state = await loadBindingState({ licenseBinding: deps.licenseBinding })
  if (!hasFeature('upload_policies', state)) {
    return { ok: false, error: featureBlockError() }
  }
  const existing = await deps.uploadPolicies.get(params.id)
  if (!existing) return { ok: false, error: notFound('Upload policy not found') }
  const deleted = await deps.uploadPolicies.delete(params.id)
  if (!deleted) return { ok: false, error: notFound('Upload policy not found') }
  return { ok: true }
}

export async function policiesReferencingStorage(
  deps: Pick<UploadPolicyDeps, 'uploadPolicies' | 'storages'>,
  storageId: string,
): Promise<UploadPolicyRecord[]> {
  const { items } = await deps.storages.list()
  const storageIds = items
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((item) => item.id)
  await deps.uploadPolicies.ensureDefault(storageIds)
  const policies = await deps.uploadPolicies.list()
  return policies.filter((policy) => policy.storageIds.includes(storageId))
}

export async function appendStorageToDefaultPolicy(
  deps: Pick<UploadPolicyDeps, 'uploadPolicies' | 'storages'>,
  storageId: string,
): Promise<UploadPolicyRecord> {
  const { items } = await deps.storages.list()
  const storageIds = items
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((item) => item.id)
  const defaults = await deps.uploadPolicies.ensureDefault(storageIds)
  if (defaults.storageIds.includes(storageId)) return defaults
  return deps.uploadPolicies.upsert({
    id: DEFAULT_UPLOAD_POLICY_ID,
    name: defaults.name,
    enabled: defaults.enabled,
    priority: defaults.priority,
    selector: defaults.selector,
    storageIds: [...defaults.storageIds, storageId],
    selectionMode: defaults.selectionMode,
  })
}
