import { OpenAPIHono, z } from '@hono/zod-openapi'
import { AuthorizationScope } from '@shared/authorization'
import {
  createUploadPolicySchema,
  opaqueIdSchema,
  pageSchema,
  patchUploadPolicySchema,
  updateUploadPolicySchema,
  uploadSelectionModeSchema,
  uploadSelectorSchema,
} from '@shared/schemas'
import { DEFAULT_UPLOAD_POLICY_ID } from '../../domain/upload-policy'
import type { Env } from '../../middleware/platform'
import { notFound, type UploadPolicyRecord } from '../../usecases/ports'
import {
  createUploadPolicy,
  deleteUploadPolicy,
  getUploadPolicy,
  listUploadPolicies,
  patchUploadPolicy,
  updateUploadPolicy,
} from '../../usecases/site/upload-policy'
import { authRoute, errorResponse, jsonBody, jsonContent } from '../openapi'

const uploadPolicySchema = z
  .object({
    id: opaqueIdSchema,
    name: z.string(),
    enabled: z.boolean(),
    priority: z.number().int(),
    selector: uploadSelectorSchema,
    storageIds: z.array(opaqueIdSchema),
    selectionMode: uploadSelectionModeSchema,
    isDefault: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('UploadPolicy')

type UploadPolicyDTO = z.infer<typeof uploadPolicySchema>

function toUploadPolicyDTO(policy: UploadPolicyRecord): UploadPolicyDTO {
  return {
    id: policy.id,
    name: policy.name,
    enabled: policy.enabled,
    priority: policy.priority,
    selector: uploadSelectorSchema.parse(policy.selector ?? {}),
    storageIds: policy.storageIds,
    selectionMode: policy.selectionMode,
    isDefault: policy.id === DEFAULT_UPLOAD_POLICY_ID,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  }
}

const uploadPolicyListSchema = pageSchema(uploadPolicySchema, 'UploadPolicyList')

const listRoute = authRoute(
  { scopes: [AuthorizationScope.UPLOAD_POLICIES_READ], siteRole: 'admin' },
  {
    operationId: 'listUploadPolicies',
    summary: 'List upload policies',
    tags: ['Upload Policies'],
    method: 'get',
    path: '/',
    responses: { 200: jsonContent(uploadPolicyListSchema, 'Upload policies') },
  },
)

const createRoute = authRoute(
  { scopes: [AuthorizationScope.UPLOAD_POLICIES_CREATE], siteRole: 'admin' },
  {
    operationId: 'createUploadPolicy',
    summary: 'Create upload policy',
    tags: ['Upload Policies'],
    method: 'post',
    path: '/',
    request: jsonBody(createUploadPolicySchema),
    responses: {
      201: jsonContent(uploadPolicySchema, 'Created upload policy'),
      400: errorResponse('Invalid upload policy'),
      402: errorResponse('Feature not available'),
    },
  },
)

const getRoute = authRoute(
  { scopes: [AuthorizationScope.UPLOAD_POLICIES_READ], siteRole: 'admin' },
  {
    operationId: 'getUploadPolicy',
    summary: 'Get upload policy',
    tags: ['Upload Policies'],
    method: 'get',
    path: '/{id}',
    request: { params: z.object({ id: opaqueIdSchema }) },
    responses: {
      200: jsonContent(uploadPolicySchema, 'Upload policy'),
      404: errorResponse('Upload policy not found'),
    },
  },
)

const updateRoute = authRoute(
  { scopes: [AuthorizationScope.UPLOAD_POLICIES_UPDATE], siteRole: 'admin' },
  {
    operationId: 'updateUploadPolicy',
    summary: 'Replace upload policy',
    tags: ['Upload Policies'],
    method: 'put',
    path: '/{id}',
    request: { params: z.object({ id: opaqueIdSchema }), ...jsonBody(updateUploadPolicySchema) },
    responses: {
      200: jsonContent(uploadPolicySchema, 'Updated upload policy'),
      400: errorResponse('Invalid upload policy'),
      402: errorResponse('Feature not available'),
      404: errorResponse('Upload policy not found'),
    },
  },
)

const patchRoute = authRoute(
  { scopes: [AuthorizationScope.UPLOAD_POLICIES_UPDATE], siteRole: 'admin' },
  {
    operationId: 'patchUploadPolicy',
    summary: 'Patch upload policy',
    tags: ['Upload Policies'],
    method: 'patch',
    path: '/{id}',
    request: { params: z.object({ id: opaqueIdSchema }), ...jsonBody(patchUploadPolicySchema) },
    responses: {
      200: jsonContent(uploadPolicySchema, 'Patched upload policy'),
      400: errorResponse('Invalid upload policy'),
      402: errorResponse('Feature not available'),
      404: errorResponse('Upload policy not found'),
    },
  },
)

const deleteRoute = authRoute(
  { scopes: [AuthorizationScope.UPLOAD_POLICIES_DELETE], siteRole: 'admin' },
  {
    operationId: 'deleteUploadPolicy',
    summary: 'Delete upload policy',
    tags: ['Upload Policies'],
    method: 'delete',
    path: '/{id}',
    request: { params: z.object({ id: opaqueIdSchema }) },
    responses: {
      204: { description: 'Deleted upload policy' },
      402: errorResponse('Feature not available'),
      404: errorResponse('Upload policy not found'),
      409: errorResponse('Cannot delete the default upload policy'),
    },
  },
)

const uploadPolicies = new OpenAPIHono<Env>()
  .openapi(listRoute, async (c) => {
    const result = await listUploadPolicies(c.get('deps'))
    return c.json(
      {
        items: result.items.map(toUploadPolicyDTO),
        total: result.total,
        page: 1,
        pageSize: result.total,
      },
      200,
    )
  })
  .openapi(createRoute, async (c) => {
    const result = await createUploadPolicy(c.get('deps'), { input: c.req.valid('json') })
    if (!result.ok) throw result.error
    return c.json(toUploadPolicyDTO(result.policy), 201)
  })
  .openapi(getRoute, async (c) => {
    const policy = await getUploadPolicy(c.get('deps'), c.req.valid('param').id)
    if (!policy) throw notFound('Upload policy not found')
    return c.json(toUploadPolicyDTO(policy), 200)
  })
  .openapi(updateRoute, async (c) => {
    const result = await updateUploadPolicy(c.get('deps'), {
      id: c.req.valid('param').id,
      input: c.req.valid('json'),
    })
    if (!result.ok) throw result.error
    return c.json(toUploadPolicyDTO(result.policy), 200)
  })
  .openapi(patchRoute, async (c) => {
    const result = await patchUploadPolicy(c.get('deps'), {
      id: c.req.valid('param').id,
      input: c.req.valid('json'),
    })
    if (!result.ok) throw result.error
    return c.json(toUploadPolicyDTO(result.policy), 200)
  })
  .openapi(deleteRoute, async (c) => {
    const result = await deleteUploadPolicy(c.get('deps'), { id: c.req.valid('param').id })
    if (!result.ok) throw result.error
    return c.body(null, 204)
  })

export default uploadPolicies
