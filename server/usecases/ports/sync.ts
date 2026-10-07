export type SyncDeviceStatus = 'active' | 'revoked'

export interface SyncDeviceRecord {
  id: string
  userId: string
  orgId: string
  name: string
  platform: string
  appVersion: string
  tokenHash: string
  status: SyncDeviceStatus
  lastSeenAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface SyncObjectChangeRecord {
  sequence: number
  orgId: string
  objectId: string
  parent: string
  name: string
  action: string
  changeType: 'upsert' | 'delete'
  actorDeviceId: string | null
  metadata: string | null
  occurredAt: Date
}

export interface SyncRepo {
  createDevice(input: {
    userId: string
    orgId: string
    name: string
    platform: string
    appVersion: string
    tokenHash: string
  }): Promise<SyncDeviceRecord>
  listDevices(userId: string): Promise<SyncDeviceRecord[]>
  getDevice(id: string): Promise<SyncDeviceRecord | null>
  findDeviceByTokenHash(tokenHash: string): Promise<SyncDeviceRecord | null>
  revokeDevice(id: string, userId: string): Promise<boolean>
  heartbeat(
    id: string,
    patch: { name?: string; platform?: string; appVersion?: string },
  ): Promise<SyncDeviceRecord | null>
  listChangesAfter(opts: { orgId: string; cursor: number; limit: number }): Promise<SyncObjectChangeRecord[]>
  oldestSequence(orgId: string): Promise<number | null>
}
