import type { CreateSyncDeviceInput, SyncDeviceHeartbeatInput } from '@shared/schemas'
import { generateToken } from '../../shared/ids'
import type { OrgRepo, SyncDeviceRecord, SyncRepo } from './ports'
import { badRequest, forbidden, notFound, unauthorized } from './ports'

export type SyncDeps = {
  sync: SyncRepo
  org: OrgRepo
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function toDeviceView(record: SyncDeviceRecord, token?: string) {
  return {
    id: record.id,
    userId: record.userId,
    orgId: record.orgId,
    name: record.name,
    platform: record.platform,
    appVersion: record.appVersion,
    status: record.status,
    lastSeenAt: record.lastSeenAt ? record.lastSeenAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    ...(token ? { token } : {}),
  }
}

export async function registerSyncDevice(
  deps: SyncDeps,
  params: { userId: string; personalOrgId: string; input: CreateSyncDeviceInput },
) {
  const orgId = params.input.orgId ?? params.personalOrgId
  const canWrite = await deps.org.canWriteToOrg(params.userId, orgId)
  if (!canWrite) throw forbidden('Not allowed to sync this space')

  const token = `sync_${generateToken(40)}`
  const tokenHash = await sha256Hex(token)
  const device = await deps.sync.createDevice({
    userId: params.userId,
    orgId,
    name: params.input.name,
    platform: params.input.platform,
    appVersion: params.input.appVersion,
    tokenHash,
  })
  return toDeviceView(device, token)
}

export async function listSyncDevices(deps: SyncDeps, userId: string) {
  const devices = await deps.sync.listDevices(userId)
  return { items: devices.map((device) => toDeviceView(device)), total: devices.length }
}

export async function revokeSyncDevice(deps: SyncDeps, params: { userId: string; deviceId: string }) {
  const revoked = await deps.sync.revokeDevice(params.deviceId, params.userId)
  if (!revoked) throw notFound('Sync device not found')
}

export async function heartbeatSyncDevice(
  deps: SyncDeps,
  params: { deviceId: string; userId: string; input: SyncDeviceHeartbeatInput },
) {
  const existing = await deps.sync.getDevice(params.deviceId)
  if (!existing || existing.userId !== params.userId) throw notFound('Sync device not found')
  if (existing.status !== 'active') throw badRequest('Sync device is revoked', 'DEVICE_REVOKED')
  const updated = await deps.sync.heartbeat(params.deviceId, params.input)
  if (!updated) throw notFound('Sync device not found')
  return toDeviceView(updated)
}

export async function resolveSyncDeviceFromBearer(deps: SyncDeps, authorizationHeader: string | undefined) {
  if (!authorizationHeader?.startsWith('Bearer ')) return null
  const token = authorizationHeader.slice('Bearer '.length).trim()
  if (!token.startsWith('sync_')) return null
  const tokenHash = await sha256Hex(token)
  const device = await deps.sync.findDeviceByTokenHash(tokenHash)
  if (!device || device.status !== 'active') return null
  await deps.sync.heartbeat(device.id, {})
  return device
}

export async function listSyncChanges(
  deps: SyncDeps,
  params: {
    userId?: string
    device?: SyncDeviceRecord | null
    spaceId: string
    cursor?: string
    limit: number
  },
) {
  const orgId = params.spaceId
  if (params.device) {
    if (params.device.orgId !== orgId) throw forbidden('Device is not authorized for this space')
  } else if (params.userId) {
    const canRead = await deps.org.canReadOrg(params.userId, orgId)
    if (!canRead) throw forbidden()
  } else {
    throw unauthorized()
  }

  const cursor = params.cursor ? Number(params.cursor) : 0
  if (!Number.isFinite(cursor) || cursor < 0) throw badRequest('Invalid cursor', 'INVALID_CURSOR')

  const oldest = await deps.sync.oldestSequence(orgId)
  if (oldest != null && cursor > 0 && cursor < oldest - 1) {
    return {
      changes: [],
      nextCursor: String(cursor),
      resetRequired: true as const,
    }
  }

  const rows = await deps.sync.listChangesAfter({ orgId, cursor, limit: params.limit })
  const nextCursor = rows.length > 0 ? String(rows[rows.length - 1]!.sequence) : String(cursor)
  return {
    changes: rows.map((row) => ({
      cursor: String(row.sequence),
      orgId: row.orgId,
      objectId: row.objectId,
      parent: row.parent,
      name: row.name,
      action: row.action,
      changeType: row.changeType,
      actorDeviceId: row.actorDeviceId,
      occurredAt: row.occurredAt.toISOString(),
    })),
    nextCursor,
    resetRequired: false as const,
  }
}

export async function personalOrgIdForUser(deps: SyncDeps, userId: string): Promise<string> {
  const orgId = await deps.org.findPersonalOrg(userId)
  if (!orgId) throw badRequest('Personal space not found', 'PERSONAL_ORG_MISSING')
  return orgId
}
