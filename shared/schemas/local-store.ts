import { z } from 'zod'

export const localStoreBillingIntervalSchema = z.enum(['month', 'year'])

export const localStoreProductInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(1000).optional().default(''),
    storageBytes: z.number().int().min(0).default(0),
    trafficBytes: z.number().int().min(0).optional().default(0),
    amountCents: z.number().int().positive(),
    currency: z.literal('usd').optional().default('usd'),
    interval: localStoreBillingIntervalSchema.nullable().optional(),
    active: z.boolean().optional().default(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.storageBytes ?? 0) <= 0 && (value.trafficBytes ?? 0) <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['storageBytes'],
        message: 'At least one of storageBytes or trafficBytes must be greater than 0',
      })
    }
  })

export const localStoreProductPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(1000).optional(),
    storageBytes: z.number().int().min(0).optional(),
    trafficBytes: z.number().int().min(0).optional(),
    amountCents: z.number().int().positive().optional(),
    interval: localStoreBillingIntervalSchema.nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict()

export const localStoreGiftCardCreateSchema = z
  .object({
    storageBytes: z.number().int().min(0).default(0),
    trafficBytes: z.number().int().min(0).optional().default(0),
    count: z.number().int().min(1).max(100),
    expiresAt: z.string().datetime().nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.storageBytes ?? 0) <= 0 && (value.trafficBytes ?? 0) <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['storageBytes'],
        message: 'At least one of storageBytes or trafficBytes must be greater than 0',
      })
    }
  })

export const stripeConfigSourceSchema = z.enum(['env', 'database', 'none']).openapi('StripeConfigSource')

export const stripeConfigSettingsSchema = z
  .object({
    secretKey: z.string(),
    webhookSecret: z.string(),
    secretKeyConfigured: z.boolean(),
    webhookSecretConfigured: z.boolean(),
    secretKeySource: stripeConfigSourceSchema,
    webhookSecretSource: stripeConfigSourceSchema,
  })
  .openapi('StripeConfigSettings')

export const updateStripeConfigSchema = z
  .object({
    secretKey: z.string().trim().min(1).max(256),
    webhookSecret: z.string().trim().min(1).max(256),
  })
  .strict()
  .openapi('UpdateStripeConfig')

export type LocalStoreProductInput = z.input<typeof localStoreProductInputSchema>
export type LocalStoreProductPatch = z.input<typeof localStoreProductPatchSchema>
export type LocalStoreGiftCardCreate = z.input<typeof localStoreGiftCardCreateSchema>
export type StripeConfigSettings = z.infer<typeof stripeConfigSettingsSchema>
export type UpdateStripeConfigInput = z.input<typeof updateStripeConfigSchema>
