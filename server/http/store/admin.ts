import { OpenAPIHono, z } from '@hono/zod-openapi'
import { AuthorizationScope } from '@shared/authorization'
import {
  localStoreGiftCardCreateSchema,
  localStoreProductInputSchema,
  localStoreProductPatchSchema,
} from '@shared/schemas'
import type { Env } from '../../middleware/platform'
import { requireFeature } from '../../middleware/require-feature'
import { forbidden, unauthorized } from '../../usecases/ports'
import {
  createAdminGiftCards,
  createAdminStoreProduct,
  deleteAdminStoreProduct,
  disableAdminGiftCard,
  listAdminGiftCards,
  listAdminStoreProducts,
  updateAdminStoreProduct,
  usesLocalCommerce,
} from '../../usecases/store/local-commerce'
import { authRoute, errorResponse, jsonBody, jsonContent } from '../openapi'

const storeProductSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    kind: z.literal('plan'),
    storageBytes: z.number().int(),
    amountCents: z.number().int(),
    currency: z.string(),
    interval: z.enum(['month', 'year']).nullable(),
    active: z.boolean(),
    sortOrder: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('LocalStoreProduct')

const storeGiftCardSchema = z
  .object({
    id: z.string(),
    code: z.string().nullable(),
    codeLast4: z.string(),
    storageBytes: z.number().int(),
    status: z.string(),
    expiresAt: z.string().nullable(),
    redeemedOrgId: z.string().nullable(),
    redeemedAt: z.string().nullable(),
    note: z.string().nullable(),
    createdBy: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('LocalStoreGiftCard')

function requireLocalStore() {
  if (!usesLocalCommerce()) throw forbidden('local_commerce_required')
}

function toProductDTO(product: Awaited<ReturnType<typeof listAdminStoreProducts>>[number]) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    kind: product.kind,
    storageBytes: product.storageBytes,
    amountCents: product.amountCents,
    currency: product.currency,
    interval: product.interval,
    active: product.active,
    sortOrder: product.sortOrder,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  }
}

function toGiftCardDTO(card: Awaited<ReturnType<typeof listAdminGiftCards>>[number] & { code?: string | null }) {
  return {
    id: card.id,
    code: card.code ?? null,
    codeLast4: card.codeLast4,
    storageBytes: card.storageBytes,
    status: card.status,
    expiresAt: card.expiresAt ? card.expiresAt.toISOString() : null,
    redeemedOrgId: card.redeemedOrgId,
    redeemedAt: card.redeemedAt ? card.redeemedAt.toISOString() : null,
    note: card.note,
    createdBy: card.createdBy,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  }
}

const listProductsRoute = authRoute(
  { scopes: [AuthorizationScope.STORE_READ], siteRole: 'admin' },
  {
    operationId: 'listLocalStoreProducts',
    summary: 'List local store products',
    tags: ['Store Admin'],
    method: 'get',
    path: '/admin/products',
    middleware: [requireFeature('quota_store')] as const,
    responses: {
      200: jsonContent(z.object({ items: z.array(storeProductSchema), total: z.number().int() }), 'Products'),
      403: errorResponse('Forbidden'),
    },
  },
)

const createProductRoute = authRoute(
  { scopes: [AuthorizationScope.STORE_CREATE], siteRole: 'admin' },
  {
    operationId: 'createLocalStoreProduct',
    summary: 'Create a local store product',
    tags: ['Store Admin'],
    method: 'post',
    path: '/admin/products',
    middleware: [requireFeature('quota_store')] as const,
    request: jsonBody(localStoreProductInputSchema),
    responses: {
      201: jsonContent(storeProductSchema, 'Created product'),
      403: errorResponse('Forbidden'),
    },
  },
)

const updateProductRoute = authRoute(
  { scopes: [AuthorizationScope.STORE_UPDATE], siteRole: 'admin' },
  {
    operationId: 'updateLocalStoreProduct',
    summary: 'Update a local store product',
    tags: ['Store Admin'],
    method: 'patch',
    path: '/admin/products/{id}',
    middleware: [requireFeature('quota_store')] as const,
    request: { params: z.object({ id: z.string().min(1) }), ...jsonBody(localStoreProductPatchSchema) },
    responses: {
      200: jsonContent(storeProductSchema, 'Updated product'),
      403: errorResponse('Forbidden'),
      404: errorResponse('Product not found'),
    },
  },
)

const deleteProductRoute = authRoute(
  { scopes: [AuthorizationScope.STORE_UPDATE], siteRole: 'admin' },
  {
    operationId: 'deleteLocalStoreProduct',
    summary: 'Delete a local store product',
    tags: ['Store Admin'],
    method: 'delete',
    path: '/admin/products/{id}',
    middleware: [requireFeature('quota_store')] as const,
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: {
      204: { description: 'Deleted product' },
      403: errorResponse('Forbidden'),
      404: errorResponse('Product not found'),
    },
  },
)

const listGiftCardsRoute = authRoute(
  { scopes: [AuthorizationScope.STORE_READ], siteRole: 'admin' },
  {
    operationId: 'listLocalStoreGiftCards',
    summary: 'List local gift cards',
    tags: ['Store Admin'],
    method: 'get',
    path: '/admin/gift-cards',
    middleware: [requireFeature('quota_store')] as const,
    responses: {
      200: jsonContent(z.object({ items: z.array(storeGiftCardSchema), total: z.number().int() }), 'Gift cards'),
      403: errorResponse('Forbidden'),
    },
  },
)

const createGiftCardsRoute = authRoute(
  { scopes: [AuthorizationScope.STORE_CREATE], siteRole: 'admin' },
  {
    operationId: 'createLocalStoreGiftCards',
    summary: 'Create local gift cards',
    tags: ['Store Admin'],
    method: 'post',
    path: '/admin/gift-cards',
    middleware: [requireFeature('quota_store')] as const,
    request: jsonBody(localStoreGiftCardCreateSchema),
    responses: {
      201: jsonContent(z.object({ items: z.array(storeGiftCardSchema) }), 'Created gift cards'),
      403: errorResponse('Forbidden'),
    },
  },
)

const disableGiftCardRoute = authRoute(
  { scopes: [AuthorizationScope.STORE_UPDATE], siteRole: 'admin' },
  {
    operationId: 'disableLocalStoreGiftCard',
    summary: 'Disable a local gift card',
    tags: ['Store Admin'],
    method: 'post',
    path: '/admin/gift-cards/{id}/disable',
    middleware: [requireFeature('quota_store')] as const,
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: {
      200: jsonContent(storeGiftCardSchema, 'Disabled gift card'),
      403: errorResponse('Forbidden'),
      404: errorResponse('Gift card not found'),
    },
  },
)

export const localStoreAdmin = new OpenAPIHono<Env>()
  .openapi(listProductsRoute, async (c) => {
    requireLocalStore()
    const items = (await listAdminStoreProducts(c.get('deps'))).map(toProductDTO)
    return c.json({ items, total: items.length }, 200)
  })
  .openapi(createProductRoute, async (c) => {
    requireLocalStore()
    const product = await createAdminStoreProduct(c.get('deps'), c.req.valid('json'))
    return c.json(toProductDTO(product), 201)
  })
  .openapi(updateProductRoute, async (c) => {
    requireLocalStore()
    const product = await updateAdminStoreProduct(c.get('deps'), c.req.valid('param').id, c.req.valid('json'))
    return c.json(toProductDTO(product), 200)
  })
  .openapi(deleteProductRoute, async (c) => {
    requireLocalStore()
    await deleteAdminStoreProduct(c.get('deps'), c.req.valid('param').id)
    return c.body(null, 204)
  })
  .openapi(listGiftCardsRoute, async (c) => {
    requireLocalStore()
    const items = (await listAdminGiftCards(c.get('deps'))).map(toGiftCardDTO)
    return c.json({ items, total: items.length }, 200)
  })
  .openapi(createGiftCardsRoute, async (c) => {
    requireLocalStore()
    const userId = c.get('userId')
    if (!userId) throw unauthorized()
    const items = (await createAdminGiftCards(c.get('deps'), { ...c.req.valid('json'), createdBy: userId })).map(
      toGiftCardDTO,
    )
    return c.json({ items }, 201)
  })
  .openapi(disableGiftCardRoute, async (c) => {
    requireLocalStore()
    const card = await disableAdminGiftCard(c.get('deps'), c.req.valid('param').id)
    return c.json(toGiftCardDTO(card), 200)
  })
