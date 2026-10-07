import { OpenAPIHono, z } from '@hono/zod-openapi'
import { AuthorizationScope } from '@shared/authorization'
import {
  createSyncDeviceSchema,
  listSyncChangesQuerySchema,
  opaqueIdSchema,
  syncDeviceHeartbeatSchema,
} from '@shared/schemas'
import type { Env } from '../middleware/platform'
import {
  heartbeatSyncDevice,
  listSyncChanges,
  listSyncDevices,
  personalOrgIdForUser,
  registerSyncDevice,
  revokeSyncDevice,
} from '../usecases/sync'
import { authRoute, errorResponse, jsonBody, jsonContent } from './openapi'

const syncDeviceSchema = z
  .object({
    id: opaqueIdSchema,
    userId: z.string(),
    orgId: z.string(),
    name: z.string(),
    platform: z.string(),
    appVersion: z.string(),
    status: z.enum(['active', 'revoked']),
    lastSeenAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    token: z.string().optional(),
  })
  .openapi('SyncDevice')

const syncChangeSchema = z
  .object({
    cursor: z.string(),
    orgId: z.string(),
    objectId: z.string(),
    parent: z.string(),
    name: z.string(),
    action: z.string(),
    changeType: z.enum(['upsert', 'delete']),
    actorDeviceId: z.string().nullable(),
    occurredAt: z.string(),
  })
  .openapi('SyncObjectChange')

const deviceListSchema = z
  .object({
    items: z.array(syncDeviceSchema),
    total: z.number().int(),
  })
  .openapi('SyncDeviceList')

const changesSchema = z
  .object({
    changes: z.array(syncChangeSchema),
    nextCursor: z.string(),
    resetRequired: z.boolean(),
  })
  .openapi('SyncChangesPage')

const listDevicesRoute = authRoute(
  { scopes: [AuthorizationScope.SYNC_DEVICES_READ] },
  {
    operationId: 'listSyncDevices',
    summary: 'List sync devices for the current user',
    tags: ['Sync'],
    method: 'get',
    path: '/devices',
    responses: { 200: jsonContent(deviceListSchema, 'Sync devices') },
  },
)

const createDeviceRoute = authRoute(
  { scopes: [AuthorizationScope.SYNC_DEVICES_CREATE] },
  {
    operationId: 'registerSyncDevice',
    summary: 'Register a sync device',
    tags: ['Sync'],
    method: 'post',
    path: '/devices',
    request: jsonBody(createSyncDeviceSchema),
    responses: { 201: jsonContent(syncDeviceSchema, 'Registered sync device') },
  },
)

const revokeDeviceRoute = authRoute(
  { scopes: [AuthorizationScope.SYNC_DEVICES_DELETE] },
  {
    operationId: 'revokeSyncDevice',
    summary: 'Revoke a sync device',
    tags: ['Sync'],
    method: 'delete',
    path: '/devices/{id}',
    request: { params: z.object({ id: opaqueIdSchema }) },
    responses: {
      204: { description: 'Revoked' },
      404: errorResponse('Not found'),
    },
  },
)

const heartbeatRoute = authRoute(
  { scopes: [AuthorizationScope.SYNC_DEVICES_CREATE] },
  {
    operationId: 'heartbeatSyncDevice',
    summary: 'Update sync device last-seen metadata',
    tags: ['Sync'],
    method: 'post',
    path: '/devices/{id}/heartbeats',
    request: { params: z.object({ id: opaqueIdSchema }), ...jsonBody(syncDeviceHeartbeatSchema) },
    responses: {
      200: jsonContent(syncDeviceSchema, 'Updated sync device'),
      404: errorResponse('Not found'),
    },
  },
)

const listChangesRoute = authRoute(
  { scopes: [AuthorizationScope.SYNC_CHANGES_READ] },
  {
    operationId: 'listSyncChanges',
    summary: 'Pull object changes since a cursor',
    tags: ['Sync'],
    method: 'get',
    path: '/changes',
    request: { query: listSyncChangesQuerySchema },
    responses: {
      200: jsonContent(changesSchema, 'Sync changes'),
      401: errorResponse('Unauthorized'),
      403: errorResponse('Forbidden'),
    },
  },
)

const app = new OpenAPIHono<Env>()

export const syncApi = app
  .openapi(listDevicesRoute, async (c) => c.json(await listSyncDevices(c.get('deps'), c.get('userId')!), 200))
  .openapi(createDeviceRoute, async (c) => {
    const userId = c.get('userId')!
    const personalOrgId = await personalOrgIdForUser(c.get('deps'), userId)
    const device = await registerSyncDevice(c.get('deps'), {
      userId,
      personalOrgId,
      input: c.req.valid('json'),
    })
    return c.json(device, 201)
  })
  .openapi(revokeDeviceRoute, async (c) => {
    await revokeSyncDevice(c.get('deps'), { userId: c.get('userId')!, deviceId: c.req.valid('param').id })
    return c.body(null, 204)
  })
  .openapi(heartbeatRoute, async (c) =>
    c.json(
      await heartbeatSyncDevice(c.get('deps'), {
        deviceId: c.req.valid('param').id,
        userId: c.get('userId')!,
        input: c.req.valid('json'),
      }),
      200,
    ),
  )
  .openapi(listChangesRoute, async (c) => {
    const query = c.req.valid('query')
    return c.json(
      await listSyncChanges(c.get('deps'), {
        userId: c.get('userId')!,
        spaceId: query.spaceId,
        cursor: query.cursor,
        limit: query.limit,
      }),
      200,
    )
  })
