import { OpenAPIHono, z } from '@hono/zod-openapi'
import { AuthorizationScope } from '@shared/authorization'
import { opaqueIdSchema } from '@shared/schemas'
import type { Env } from '../middleware/platform'
import { createMusicAppCredential, listMusicAppCredentials, revokeMusicAppCredential } from '../usecases/music'
import { authRoute, errorResponse, jsonBody, jsonContent } from './openapi'

const credentialSchema = z
  .object({
    id: opaqueIdSchema,
    userId: z.string(),
    orgId: z.string(),
    username: z.string(),
    label: z.string(),
    status: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    lastUsedAt: z.string().nullable(),
    token: z.string().optional(),
  })
  .openapi('MusicAppCredential')

const createInputSchema = z.object({
  orgId: z.string().min(1),
  label: z.string().max(120).optional(),
  username: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional(),
})

const listRoute = authRoute(
  { scopes: [AuthorizationScope.MUSIC_CREDENTIALS_READ] },
  {
    operationId: 'listMusicAppCredentials',
    summary: 'List music app credentials',
    tags: ['Music'],
    method: 'get',
    path: '/',
    responses: {
      200: jsonContent(
        z.object({ items: z.array(credentialSchema), total: z.number().int() }).openapi('MusicAppCredentialList'),
        'Credentials',
      ),
    },
  },
)

const createRoute = authRoute(
  { scopes: [AuthorizationScope.MUSIC_CREDENTIALS_CREATE] },
  {
    operationId: 'createMusicAppCredential',
    summary: 'Create a music app credential for Subsonic clients',
    tags: ['Music'],
    method: 'post',
    path: '/',
    request: jsonBody(createInputSchema),
    responses: {
      201: jsonContent(credentialSchema, 'Created credential'),
      409: errorResponse('Username taken'),
    },
  },
)

const revokeRoute = authRoute(
  { scopes: [AuthorizationScope.MUSIC_CREDENTIALS_DELETE] },
  {
    operationId: 'revokeMusicAppCredential',
    summary: 'Revoke a music app credential',
    tags: ['Music'],
    method: 'delete',
    path: '/{id}',
    request: { params: z.object({ id: opaqueIdSchema }) },
    responses: {
      204: { description: 'Revoked' },
      404: errorResponse('Not found'),
    },
  },
)

const app = new OpenAPIHono<Env>()

export const musicCredentialsApi = app
  .openapi(listRoute, async (c) => c.json(await listMusicAppCredentials(c.get('deps'), c.get('userId')!), 200))
  .openapi(createRoute, async (c) => {
    const input = c.req.valid('json')
    const created = await createMusicAppCredential(c.get('deps'), {
      userId: c.get('userId')!,
      orgId: input.orgId,
      label: input.label,
      username: input.username,
    })
    return c.json(created, 201)
  })
  .openapi(revokeRoute, async (c) => {
    await revokeMusicAppCredential(c.get('deps'), { userId: c.get('userId')!, id: c.req.valid('param').id })
    return c.body(null, 204)
  })
