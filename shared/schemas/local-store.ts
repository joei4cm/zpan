import { z } from 'zod'

export const localStoreBillingIntervalSchema = z.enum(['month', 'year'])

export const localStoreProductInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(1000).optional().default(''),
    storageBytes: z.number().int().positive(),
    amountCents: z.number().int().positive(),
    currency: z.literal('usd').optional().default('usd'),
    interval: localStoreBillingIntervalSchema.nullable().optional(),
    active: z.boolean().optional().default(true),
  })
  .strict()

export const localStoreProductPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(1000).optional(),
    storageBytes: z.number().int().positive().optional(),
    amountCents: z.number().int().positive().optional(),
    interval: localStoreBillingIntervalSchema.nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict()

export const localStoreGiftCardCreateSchema = z
  .object({
    storageBytes: z.number().int().positive(),
    count: z.number().int().min(1).max(100),
    expiresAt: z.string().datetime().nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .strict()

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
