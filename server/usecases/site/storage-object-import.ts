import { DirType } from '@shared/constants'
import { folderChain, objectKeyToMatterPath } from '../../domain/storage-object-import'
import { badRequest, type MatterRepo, notFound, type S3Gateway, type StorageRepo } from '../ports'

export type StorageObjectImportDeps = {
  storages: StorageRepo
  s3: S3Gateway
  matter: MatterRepo
}

export type ImportBucketObjectsInput = {
  storageId: string
  orgId: string
  actorRef: string
  prefix?: string
  stripPrefix?: string
  dryRun?: boolean
  limit?: number
}

export async function importBucketObjects(deps: StorageObjectImportDeps, input: ImportBucketObjectsInput) {
  const storage = await deps.storages.get(input.storageId)
  if (!storage) throw notFound('Storage not found')
  if (!storage.enabled) throw badRequest('Storage is disabled', 'STORAGE_DISABLED')

  const limit = Math.min(Math.max(input.limit ?? 500, 1), 2000)
  const dryRun = input.dryRun ?? true
  let continuationToken: string | undefined
  let scanned = 0
  let imported = 0
  let skipped = 0
  const samples: Array<{ key: string; parent: string; name: string; action: 'import' | 'skip' }> = []

  while (scanned < limit) {
    const page = await deps.s3.listObjects(storage, {
      prefix: input.prefix,
      continuationToken,
      maxKeys: Math.min(1000, limit - scanned),
    })
    for (const object of page.objects) {
      if (scanned >= limit) break
      scanned += 1
      const path = objectKeyToMatterPath(object.key, { stripPrefix: input.stripPrefix })
      if (!path) {
        skipped += 1
        continue
      }
      const existing = await deps.matter.findActiveConflict(input.orgId, path.parent, path.name)
      if (existing) {
        skipped += 1
        if (samples.length < 20) samples.push({ key: object.key, ...path, action: 'skip' })
        continue
      }
      if (samples.length < 20) samples.push({ key: object.key, ...path, action: 'import' })
      if (dryRun) {
        imported += 1
        continue
      }
      for (const folderPath of folderChain(path.parent)) {
        const parts = folderPath.split('/')
        const folderName = parts[parts.length - 1]
        const folderParent = parts.slice(0, -1).join('/')
        const folderExisting = await deps.matter.findActiveConflict(input.orgId, folderParent, folderName)
        if (!folderExisting) {
          await deps.matter.create({
            orgId: input.orgId,
            name: folderName,
            type: 'inode/directory',
            size: 0,
            dirtype: DirType.USER_FOLDER,
            parent: folderParent,
            object: '',
            storageId: storage.id,
            status: 'active',
            createdByActorType: 'user',
            createdByActorRef: input.actorRef,
          })
        }
      }
      await deps.matter.create({
        orgId: input.orgId,
        name: path.name,
        type: 'application/octet-stream',
        size: object.size,
        dirtype: DirType.FILE,
        parent: path.parent,
        object: object.key,
        storageId: storage.id,
        status: 'active',
        createdByActorType: 'user',
        createdByActorRef: input.actorRef,
      })
      imported += 1
    }
    if (!page.isTruncated || !page.nextContinuationToken) break
    continuationToken = page.nextContinuationToken
  }

  return {
    dryRun,
    scanned,
    imported,
    skipped,
    samples,
  }
}
