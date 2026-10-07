import { pickStorageIdFromPolicy, resolveMatchingUploadPolicy, type UploadContextLabels } from '../domain/upload-policy'
import type { StorageRecord, StorageRepo, UploadPolicyRepo } from './ports'

export type UploadPlacementDeps = {
  uploadPolicies: UploadPolicyRepo
  storages: StorageRepo
}

function isEligible(storage: StorageRecord, bytesNeeded = 0): boolean {
  if (storage.enabled === false) return false
  if (storage.status === 'unhealthy') return false
  const capacity = storage.capacity ?? 0
  const used = storage.used ?? 0
  if (capacity === 0) return true
  return used + bytesNeeded <= capacity
}

function utilization(storage: StorageRecord): number {
  if (storage.capacity <= 0) return 0
  return storage.used / storage.capacity
}

export async function resolveUploadStorage(
  deps: UploadPlacementDeps,
  params: {
    labels: UploadContextLabels
    bytesNeeded?: number
    /** Admin override: skip policies and use StorageRepo.select(id). */
    storageId?: string
  },
): Promise<StorageRecord> {
  if (params.storageId) {
    return deps.storages.select(params.storageId)
  }

  const { items: allStorages } = await deps.storages.list()
  const storageIds = allStorages
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((item) => item.id)
  await deps.uploadPolicies.ensureDefault(storageIds)

  const policies = await deps.uploadPolicies.list()
  const matched = resolveMatchingUploadPolicy(policies, params.labels)
  if (!matched) throw new Error('No available storage')

  const eligible = allStorages.filter((storage) => isEligible(storage, params.bytesNeeded ?? 0))
  const eligibleIds = eligible.map((storage) => storage.id)
  const pickedId = pickStorageIdFromPolicy(matched, eligibleIds, {
    utilizationById: Object.fromEntries(eligible.map((storage) => [storage.id, utilization(storage)])),
  })
  if (!pickedId) throw new Error('No available storage')
  const picked = eligible.find((storage) => storage.id === pickedId)
  if (!picked) throw new Error('No available storage')
  return picked
}
