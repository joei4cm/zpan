import type { UploadPolicyRecord, UploadSelectionMode, UploadSelector } from '../../domain/upload-policy'

export type { UploadPolicyRecord, UploadSelectionMode, UploadSelector }

export interface UploadPolicyRepo {
  list(): Promise<UploadPolicyRecord[]>
  get(id: string): Promise<UploadPolicyRecord | null>
  ensureDefault(storageIds: string[]): Promise<UploadPolicyRecord>
  upsert(input: {
    id: string
    name: string
    enabled: boolean
    priority: number
    selector: UploadSelector
    storageIds: string[]
    selectionMode: UploadSelectionMode
  }): Promise<UploadPolicyRecord>
  delete(id: string): Promise<boolean>
}
