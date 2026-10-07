import { OpenAPIHono, z } from '@hono/zod-openapi'
import { AuthorizationScope } from '@shared/authorization'
import {
  listOutboundWebhookDeliveriesQuerySchema,
  opaqueIdSchema,
  outboundWebhookEndpointInputSchema,
  outboundWebhookEndpointPatchSchema,
  pageQuerySchema,
  pageSchema,
} from '@shared/schemas'
import type { Env } from '../../middleware/platform'
import { requireFeature } from '../../middleware/require-feature'
import {
  createOutboundWebhookEndpoint,
  deleteOutboundWebhookEndpoint,
  getOutboundWebhookEndpoint,
  listOutboundWebhookDeliveries,
  listOutboundWebhookEndpoints,
  type OutboundWebhookEndpointView,
  rotateOutboundWebhookSecret,
  testOutboundWebhookEndpoint,
  updateOutboundWebhookEndpoint,
} from '../../usecases/outbound-webhooks'
import type { OutboundWebhookDeliveryRecord } from '../../usecases/ports'
import { notFound } from '../../usecases/ports'
import { authRoute, errorResponse, jsonBody, jsonContent } from '../openapi'

const endpointSchema = z
  .object({
    id: opaqueIdSchema,
    url: z.string().url(),
    description: z.string(),
    enabled: z.boolean(),
    eventTypes: z.array(z.string()),
    secretMasked: z.string(),
    secret: z.string().optional(),
    createdBy: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('OutboundWebhookEndpoint')

const deliverySchema = z
  .object({
    id: opaqueIdSchema,
    endpointId: opaqueIdSchema,
    eventType: z.string(),
    idempotencyKey: z.string(),
    status: z.enum(['pending', 'delivering', 'succeeded', 'failed', 'dead']),
    attemptCount: z.number().int(),
    nextAttemptAt: z.string().nullable(),
    lastStatusCode: z.number().int().nullable(),
    lastError: z.string().nullable(),
    createdAt: z.string(),
    deliveredAt: z.string().nullable(),
  })
  .openapi('OutboundWebhookDelivery')

type EndpointDTO = z.infer<typeof endpointSchema>
type DeliveryDTO = z.infer<typeof deliverySchema>

function toEndpointDTO(endpoint: OutboundWebhookEndpointView): EndpointDTO {
  return {
    id: endpoint.id,
    url: endpoint.url,
    description: endpoint.description,
    enabled: endpoint.enabled,
    eventTypes: endpoint.eventTypes,
    secretMasked: endpoint.secretMasked,
    ...(endpoint.secret ? { secret: endpoint.secret } : {}),
    createdBy: endpoint.createdBy,
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString(),
  }
}

function toDeliveryDTO(delivery: OutboundWebhookDeliveryRecord): DeliveryDTO {
  return {
    id: delivery.id,
    endpointId: delivery.endpointId,
    eventType: delivery.eventType,
    idempotencyKey: delivery.idempotencyKey,
    status: delivery.status,
    attemptCount: delivery.attemptCount,
    nextAttemptAt: delivery.nextAttemptAt ? delivery.nextAttemptAt.toISOString() : null,
    lastStatusCode: delivery.lastStatusCode,
    lastError: delivery.lastError,
    createdAt: delivery.createdAt.toISOString(),
    deliveredAt: delivery.deliveredAt ? delivery.deliveredAt.toISOString() : null,
  }
}

const endpointListSchema = pageSchema(endpointSchema, 'OutboundWebhookEndpointList')
const deliveryListSchema = pageSchema(deliverySchema, 'OutboundWebhookDeliveryList')

const listRoute = authRoute(
  { scopes: [AuthorizationScope.OUTBOUND_WEBHOOKS_READ], siteRole: 'admin' },
  {
    operationId: 'listOutboundWebhookEndpoints',
    summary: 'List outbound webhook endpoints',
    tags: ['Outbound Webhooks'],
    method: 'get',
    path: '/',
    middleware: [requireFeature('outbound_webhooks')] as const,
    request: { query: pageQuerySchema },
    responses: {
      200: jsonContent(endpointListSchema, 'Outbound webhook endpoints'),
      403: errorResponse('Forbidden'),
    },
  },
)

const createRoute = authRoute(
  { scopes: [AuthorizationScope.OUTBOUND_WEBHOOKS_CREATE], siteRole: 'admin' },
  {
    operationId: 'createOutboundWebhookEndpoint',
    summary: 'Create outbound webhook endpoint',
    tags: ['Outbound Webhooks'],
    method: 'post',
    path: '/',
    middleware: [requireFeature('outbound_webhooks')] as const,
    request: jsonBody(outboundWebhookEndpointInputSchema),
    responses: { 201: jsonContent(endpointSchema, 'Created webhook endpoint') },
  },
)

const getRoute = authRoute(
  { scopes: [AuthorizationScope.OUTBOUND_WEBHOOKS_READ], siteRole: 'admin' },
  {
    operationId: 'getOutboundWebhookEndpoint',
    summary: 'Get outbound webhook endpoint',
    tags: ['Outbound Webhooks'],
    method: 'get',
    path: '/{id}',
    middleware: [requireFeature('outbound_webhooks')] as const,
    request: { params: z.object({ id: opaqueIdSchema }) },
    responses: {
      200: jsonContent(endpointSchema, 'Webhook endpoint'),
      404: errorResponse('Not found'),
    },
  },
)

const updateRoute = authRoute(
  { scopes: [AuthorizationScope.OUTBOUND_WEBHOOKS_UPDATE], siteRole: 'admin' },
  {
    operationId: 'updateOutboundWebhookEndpoint',
    summary: 'Update outbound webhook endpoint',
    tags: ['Outbound Webhooks'],
    method: 'patch',
    path: '/{id}',
    middleware: [requireFeature('outbound_webhooks')] as const,
    request: { params: z.object({ id: opaqueIdSchema }), ...jsonBody(outboundWebhookEndpointPatchSchema) },
    responses: {
      200: jsonContent(endpointSchema, 'Updated webhook endpoint'),
      404: errorResponse('Not found'),
    },
  },
)

const rotateRoute = authRoute(
  { scopes: [AuthorizationScope.OUTBOUND_WEBHOOKS_UPDATE], siteRole: 'admin' },
  {
    operationId: 'rotateOutboundWebhookSecret',
    summary: 'Rotate outbound webhook signing secret',
    tags: ['Outbound Webhooks'],
    method: 'post',
    path: '/{id}/secret-rotations',
    middleware: [requireFeature('outbound_webhooks')] as const,
    request: { params: z.object({ id: opaqueIdSchema }) },
    responses: {
      200: jsonContent(endpointSchema, 'Rotated webhook endpoint'),
      404: errorResponse('Not found'),
    },
  },
)

const testRoute = authRoute(
  { scopes: [AuthorizationScope.OUTBOUND_WEBHOOKS_UPDATE], siteRole: 'admin' },
  {
    operationId: 'testOutboundWebhookEndpoint',
    summary: 'Send a test event to an outbound webhook endpoint',
    tags: ['Outbound Webhooks'],
    method: 'post',
    path: '/{id}/tests',
    middleware: [requireFeature('outbound_webhooks')] as const,
    request: { params: z.object({ id: opaqueIdSchema }) },
    responses: {
      200: jsonContent(z.object({ ok: z.literal(true) }).openapi('OutboundWebhookTestResult'), 'Test enqueued'),
      404: errorResponse('Not found'),
    },
  },
)

const deleteRoute = authRoute(
  { scopes: [AuthorizationScope.OUTBOUND_WEBHOOKS_DELETE], siteRole: 'admin' },
  {
    operationId: 'deleteOutboundWebhookEndpoint',
    summary: 'Delete outbound webhook endpoint',
    tags: ['Outbound Webhooks'],
    method: 'delete',
    path: '/{id}',
    middleware: [requireFeature('outbound_webhooks')] as const,
    request: { params: z.object({ id: opaqueIdSchema }) },
    responses: {
      204: { description: 'Deleted webhook endpoint' },
      404: errorResponse('Not found'),
    },
  },
)

const listDeliveriesRoute = authRoute(
  { scopes: [AuthorizationScope.OUTBOUND_WEBHOOKS_READ], siteRole: 'admin' },
  {
    operationId: 'listOutboundWebhookDeliveries',
    summary: 'List outbound webhook deliveries',
    tags: ['Outbound Webhooks'],
    method: 'get',
    path: '/{id}/deliveries',
    middleware: [requireFeature('outbound_webhooks')] as const,
    request: {
      params: z.object({ id: opaqueIdSchema }),
      query: listOutboundWebhookDeliveriesQuerySchema,
    },
    responses: {
      200: jsonContent(deliveryListSchema, 'Webhook deliveries'),
      404: errorResponse('Not found'),
    },
  },
)

const app = new OpenAPIHono<Env>()

export const outboundWebhooks = app
  .openapi(listRoute, async (c) => {
    const query = c.req.valid('query')
    const result = await listOutboundWebhookEndpoints(c.get('deps'), {
      page: query.page,
      pageSize: query.pageSize,
    })
    return c.json({ ...result, items: result.items.map(toEndpointDTO) }, 200)
  })
  .openapi(createRoute, async (c) =>
    c.json(
      toEndpointDTO(await createOutboundWebhookEndpoint(c.get('deps'), c.req.valid('json'), c.get('userId')!)),
      201,
    ),
  )
  .openapi(getRoute, async (c) => {
    const endpoint = await getOutboundWebhookEndpoint(c.get('deps'), c.req.valid('param').id)
    if (!endpoint) throw notFound('Webhook endpoint not found')
    return c.json(toEndpointDTO(endpoint), 200)
  })
  .openapi(updateRoute, async (c) => {
    const endpoint = await updateOutboundWebhookEndpoint(c.get('deps'), c.req.valid('param').id, c.req.valid('json'))
    if (!endpoint) throw notFound('Webhook endpoint not found')
    return c.json(toEndpointDTO(endpoint), 200)
  })
  .openapi(rotateRoute, async (c) => {
    const endpoint = await rotateOutboundWebhookSecret(c.get('deps'), c.req.valid('param').id)
    if (!endpoint) throw notFound('Webhook endpoint not found')
    return c.json(toEndpointDTO(endpoint), 200)
  })
  .openapi(testRoute, async (c) => {
    const result = await testOutboundWebhookEndpoint(c.get('deps'), c.req.valid('param').id)
    return c.json(result, 200)
  })
  .openapi(deleteRoute, async (c) => {
    const deleted = await deleteOutboundWebhookEndpoint(c.get('deps'), c.req.valid('param').id)
    if (!deleted) throw notFound('Webhook endpoint not found')
    return c.body(null, 204)
  })
  .openapi(listDeliveriesRoute, async (c) => {
    const { id } = c.req.valid('param')
    const endpoint = await getOutboundWebhookEndpoint(c.get('deps'), id)
    if (!endpoint) throw notFound('Webhook endpoint not found')
    const query = c.req.valid('query')
    const page = query.page ? Number(query.page) : 1
    const pageSize = query.pageSize ? Number(query.pageSize) : 20
    const result = await listOutboundWebhookDeliveries(c.get('deps'), {
      endpointId: id,
      status: query.status,
      page,
      pageSize,
    })
    return c.json({ ...result, items: result.items.map(toDeliveryDTO) }, 200)
  })
