import { z } from 'zod'

export const syncDevicePlatformSchema = z.string().min(1).max(64)

export const createSyncDeviceSchema = z.object({
  name: z.string().min(1).max(120),
  platform: syncDevicePlatformSchema.default('unknown'),
  appVersion: z.string().min(1).max(64).default('unknown'),
  orgId: z.string().min(1).optional(),
})

export const syncDeviceHeartbeatSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  platform: syncDevicePlatformSchema.optional(),
  appVersion: z.string().min(1).max(64).optional(),
})

export const listSyncChangesQuerySchema = z.object({
  spaceId: z.string().min(1),
  cursor: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

export type CreateSyncDeviceInput = z.infer<typeof createSyncDeviceSchema>
export type SyncDeviceHeartbeatInput = z.infer<typeof syncDeviceHeartbeatSchema>
export type ListSyncChangesQuery = z.infer<typeof listSyncChangesQuerySchema>
