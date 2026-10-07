import { desc, eq } from 'drizzle-orm'
import { uploadPolicies } from '../../db/schema'
import {
  DEFAULT_UPLOAD_POLICY_ID,
  type UploadPolicyRecord,
  type UploadSelectionMode,
  type UploadSelector,
} from '../../domain/upload-policy'
import type { Database } from '../../platform/interface'
import type { UploadPolicyRepo } from '../../usecases/ports/upload-policy'

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function toRecord(row: typeof uploadPolicies.$inferSelect): UploadPolicyRecord {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    priority: row.priority,
    selector: parseJson<UploadSelector>(row.selectorJson, {}),
    storageIds: parseJson<string[]>(row.storageIdsJson, []),
    selectionMode: (row.selectionMode as UploadSelectionMode) ?? 'ordered',
  }
}

export function createUploadPolicyRepo(db: Database): UploadPolicyRepo {
  return {
    async list() {
      const rows = await db.select().from(uploadPolicies).orderBy(desc(uploadPolicies.priority), uploadPolicies.id)
      return rows.map(toRecord)
    },
    async get(id) {
      const rows = await db.select().from(uploadPolicies).where(eq(uploadPolicies.id, id)).limit(1)
      return rows[0] ? toRecord(rows[0]) : null
    },
    async ensureDefault(storageIds) {
      const existing = await this.get(DEFAULT_UPLOAD_POLICY_ID)
      if (existing) return existing
      const now = new Date()
      const rows = await db
        .insert(uploadPolicies)
        .values({
          id: DEFAULT_UPLOAD_POLICY_ID,
          name: 'Default',
          enabled: true,
          priority: 0,
          selectorJson: '{}',
          storageIdsJson: JSON.stringify(storageIds),
          selectionMode: 'ordered',
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning()
      if (rows[0]) return toRecord(rows[0])
      const again = await this.get(DEFAULT_UPLOAD_POLICY_ID)
      if (!again) throw new Error('default_upload_policy_missing')
      return again
    },
    async upsert(input) {
      const now = new Date()
      const values = {
        id: input.id,
        name: input.name,
        enabled: input.enabled,
        priority: input.priority,
        selectorJson: JSON.stringify(input.selector ?? {}),
        storageIdsJson: JSON.stringify(input.storageIds),
        selectionMode: input.selectionMode,
        createdAt: now,
        updatedAt: now,
      }
      const existing = await this.get(input.id)
      if (!existing) {
        const rows = await db.insert(uploadPolicies).values(values).returning()
        return toRecord(rows[0])
      }
      const rows = await db
        .update(uploadPolicies)
        .set({
          name: values.name,
          enabled: values.enabled,
          priority: values.priority,
          selectorJson: values.selectorJson,
          storageIdsJson: values.storageIdsJson,
          selectionMode: values.selectionMode,
          updatedAt: now,
        })
        .where(eq(uploadPolicies.id, input.id))
        .returning()
      return toRecord(rows[0])
    },
    async delete(id) {
      if (id === DEFAULT_UPLOAD_POLICY_ID) return false
      const rows = await db.delete(uploadPolicies).where(eq(uploadPolicies.id, id)).returning({ id: uploadPolicies.id })
      return rows.length > 0
    },
  }
}
